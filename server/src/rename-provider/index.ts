/**
 * Provides "Rename Symbol" functionality for VCL documents.
 *
 * This provider enables users to safely rename symbols throughout a document,
 * updating all references automatically. It handles two categories of symbols:
 *
 * **Global Symbols (document-wide)**
 * - ACLs: Renames definition and all `~ acl_name` or `!~ acl_name` usages
 * - Tables: Renames definition and all `table.lookup/contains(table_name, ...)` usages
 * - Backends: Renames definition and all `req.backend = name` or `bereq.backend = name` usages
 * - Subroutines: Renames definition and all `call subroutine_name;` invocations
 * - HTTP Headers: Renames all occurrences of headers like `req.http.X-Custom` across set/unset/add/if
 *
 * **Local Symbols (subroutine-scoped)**
 * - Variables declared with `declare local`
 * - Subroutine parameters
 *
 * The provider implements two handlers:
 * - `prepare`: Validates that the symbol can be renamed and returns its range
 * - `resolve`: Returns a WorkspaceEdit with all text changes needed for the rename
 */
import {
  RenameParams,
  PrepareRenameParams,
  WorkspaceEdit,
  TextEdit,
  Range,
  Position,
} from "vscode-languageserver/node";

import { documentCache } from "../shared/documentCache";
import { getSymbolInformation, findSymbolByName } from "../symbol-provider";
import { VclDocument } from "../shared/vclDocument";
import { walkAST, ASTNode } from "../shared/ast";

// Built-in VCL subroutines that should not be renamed
const BUILTIN_SUBROUTINES = new Set([
  "vcl_recv",
  "vcl_hash",
  "vcl_hit",
  "vcl_miss",
  "vcl_pass",
  "vcl_fetch",
  "vcl_error",
  "vcl_deliver",
  "vcl_log",
]);

// Pattern to match HTTP header names (req.http.*, resp.http.*, bereq.http.*, beresp.http.*)
const HTTP_HEADER_PATTERN =
  /^(req|resp|bereq|beresp|obj)\.http\.[a-zA-Z0-9_-]+(:[a-zA-Z0-9_-]+)?$/;

interface SymbolLocation {
  name: string;
  line: number;
  position: number;
  length: number;
}

/**
 * Prepares a rename operation by validating the target and returning its range.
 * Returns null if the symbol cannot be renamed (e.g., built-in subroutine or unknown symbol).
 */
export function prepare(
  params: PrepareRenameParams,
): { range: Range; placeholder: string } | null {
  const doc = documentCache.get(params.textDocument.uri);
  if (!doc) {
    return null;
  }

  const word = doc.getWord(params.position);
  if (!word) {
    return null;
  }

  // Reject built-in subroutine names
  if (BUILTIN_SUBROUTINES.has(word)) {
    return null;
  }

  // Check if it's an HTTP header (use full word from line for headers)
  if (doc.AST) {
    const headerName = getHttpHeaderAtPosition(doc, params.position);
    if (headerName && HTTP_HEADER_PATTERN.test(headerName)) {
      const wordRange = getHeaderRange(doc, params.position, headerName);
      return { range: wordRange, placeholder: headerName };
    }
  }

  // Check if it's a local variable or parameter
  if (doc.AST) {
    const containingSub = findContainingSubroutine(doc.AST, params.position);
    if (containingSub && isLocalVariableOrParameter(containingSub, word)) {
      const wordRange = getWordRange(doc, params.position, word);
      return { range: wordRange, placeholder: word };
    }
  }

  // Check if it's a global symbol
  const symbol = findSymbolByName(doc.uri, word);
  if (symbol) {
    const wordRange = getWordRange(doc, params.position, word);
    return { range: wordRange, placeholder: word };
  }

  // Check if cursor is on a usage of a known symbol type
  const symbolType = detectSymbolTypeFromUsage(doc, params.position, word);
  if (symbolType) {
    const symbols = getSymbolInformation(doc);
    const foundSymbol = symbols.find(
      (s) => s.name === word && s.detail === symbolType,
    );
    if (foundSymbol) {
      const wordRange = getWordRange(doc, params.position, word);
      return { range: wordRange, placeholder: word };
    }
  }

  // Allow rename for any valid identifier (resolve will validate further)
  const wordRange = getWordRange(doc, params.position, word);
  return { range: wordRange, placeholder: word };
}

/**
 * Resolves a rename operation by returning all text edits needed.
 */
export function resolve(params: RenameParams): WorkspaceEdit | null {
  const doc = documentCache.get(params.textDocument.uri);
  if (!doc) return null;

  const word = doc.getWord(params.position);
  if (!word) return null;

  // Reject built-in subroutine names
  if (BUILTIN_SUBROUTINES.has(word)) {
    return null;
  }

  const newName = params.newName;
  const edits: TextEdit[] = [];

  // Check for HTTP header rename first
  if (doc.AST) {
    const headerName = getHttpHeaderAtPosition(doc, params.position);
    if (headerName && HTTP_HEADER_PATTERN.test(headerName)) {
      const headerEdits = getHttpHeaderRenameEdits(doc, headerName, newName);
      if (headerEdits.length > 0) {
        return {
          changes: {
            [params.textDocument.uri]: headerEdits,
          },
        };
      }
    }
  }

  // Check for local variable or parameter references first
  if (doc.AST) {
    const localEdits = getLocalVariableRenameEdits(
      doc,
      word,
      params.position,
      newName,
    );
    if (localEdits.length > 0) {
      return {
        changes: {
          [params.textDocument.uri]: localEdits,
        },
      };
    }
  }

  // Handle global symbols
  const symbols = getSymbolInformation(doc);

  // First check if we're on a definition
  let symbol = symbols.find((s) => {
    const inRange =
      params.position.line >= s.selectionRange.start.line &&
      params.position.line <= s.selectionRange.end.line &&
      params.position.character >= s.selectionRange.start.character &&
      params.position.character <= s.selectionRange.end.character;
    return s.name === word && inRange;
  });

  // If not on a definition, try to find the symbol from a usage
  if (!symbol) {
    const symbolType = detectSymbolTypeFromUsage(doc, params.position, word);
    if (symbolType) {
      symbol = symbols.find((s) => s.name === word && s.detail === symbolType);
    }
  }

  // Still no symbol? Try matching by name alone
  if (!symbol) {
    symbol = symbols.find((s) => s.name === word);
  }

  if (!symbol) return null;

  // Add edit for the definition
  edits.push({
    range: symbol.selectionRange,
    newText: newName,
  });

  // Find and add edits for all usages
  const usageEdits = getUsageRenameEdits(doc, word, symbol.detail, newName);
  edits.push(...usageEdits);

  return {
    changes: {
      [params.textDocument.uri]: edits,
    },
  };
}

/**
 * Gets the range of a word at the given position.
 */
function getWordRange(
  doc: VclDocument,
  position: Position,
  word: string,
): Range {
  const line = doc.getLine(position);
  const wordIndex = findWordIndexInLine(line, word, position.character);

  return {
    start: { line: position.line, character: wordIndex },
    end: { line: position.line, character: wordIndex + word.length },
  };
}

/**
 * Finds the starting index of a word in a line, given a character position within the word.
 */
function findWordIndexInLine(
  line: string,
  word: string,
  charPos: number,
): number {
  // Find the word that contains the character position
  const wordRegex = /[a-zA-Z_][a-zA-Z0-9_-]*/g;
  let match;
  while ((match = wordRegex.exec(line)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (charPos >= start && charPos <= end && match[0] === word) {
      return start;
    }
  }
  // Fallback: search for the word near the position
  const searchStart = Math.max(0, charPos - word.length);
  const idx = line.indexOf(word, searchStart);
  return idx >= 0 ? idx : charPos;
}

/**
 * Detects the symbol type based on usage context at the cursor position.
 */
function detectSymbolTypeFromUsage(
  doc: VclDocument,
  position: Position,
  word: string,
): string | undefined {
  const lineText = doc.getLine(position);

  // ACL usage: ~ acl_name or !~ acl_name
  if (new RegExp(`!?~\\s*${escapeRegex(word)}\\b`).test(lineText)) {
    return "ACL";
  }

  // Table usage: table.lookup(table_name, ...) or table.contains(table_name, ...)
  if (
    new RegExp(
      `table\\.(lookup|contains)\\s*\\(\\s*${escapeRegex(word)}\\b`,
    ).test(lineText)
  ) {
    return "TABLE";
  }

  // Backend usage: req.backend = name or bereq.backend = name
  if (
    new RegExp(`(req|bereq)\\.backend\\s*=\\s*${escapeRegex(word)}\\b`).test(
      lineText,
    )
  ) {
    return "BACKEND";
  }

  // Subroutine usage: call name;
  if (new RegExp(`call\\s+${escapeRegex(word)}\\s*;`).test(lineText)) {
    return "SUBROUTINE";
  }

  return undefined;
}

/**
 * Gets TextEdits for renaming all usages of a global symbol.
 */
function getUsageRenameEdits(
  doc: VclDocument,
  name: string,
  symbolType: string | undefined,
  newName: string,
): TextEdit[] {
  const text = doc.getText();
  const edits: TextEdit[] = [];

  const patterns: Record<string, RegExp> = {
    ACL: new RegExp(`!?~\\s*(${escapeRegex(name)})\\b`, "g"),
    TABLE: new RegExp(
      `table\\.(lookup|contains)\\s*\\(\\s*(${escapeRegex(name)})\\b`,
      "g",
    ),
    BACKEND: new RegExp(
      `(req|bereq)\\.backend\\s*=\\s*(${escapeRegex(name)})\\b`,
      "g",
    ),
    SUBROUTINE: new RegExp(`call\\s+(${escapeRegex(name)})\\s*;`, "g"),
  };

  const pattern = patterns[symbolType || ""];
  if (!pattern) return edits;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const nameIndex = findNameIndex(match, name);
    if (nameIndex === -1) continue;

    const startOffset = match.index + nameIndex;
    const endOffset = startOffset + name.length;

    edits.push({
      range: {
        start: doc.doc.positionAt(startOffset),
        end: doc.doc.positionAt(endOffset),
      },
      newText: newName,
    });
  }

  return edits;
}

/**
 * Finds the index of the symbol name within the match string.
 */
function findNameIndex(match: RegExpExecArray, name: string): number {
  const fullMatch = match[0];
  return fullMatch.lastIndexOf(name);
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds the subroutine node that contains the given position.
 */
function findContainingSubroutine(
  ast: ASTNode,
  position: Position,
): ASTNode | null {
  let containingSub: ASTNode | null = null;

  walkAST(ast, (node: ASTNode) => {
    if (node.Token?.Type === "SUBROUTINE" && node.Block) {
      const startLine = node.Token.Line - 1;
      const endLine = node.Block.EndLine ? node.Block.EndLine - 1 : startLine;

      if (position.line >= startLine && position.line <= endLine) {
        containingSub = node;
      }
    }
  });

  return containingSub;
}

/**
 * Checks if the given variable name is a local variable or parameter
 * within the containing subroutine.
 */
function isLocalVariableOrParameter(
  containingSub: ASTNode,
  name: string,
): boolean {
  // Check for parameter declarations
  if (containingSub.Parameters && Array.isArray(containingSub.Parameters)) {
    for (const param of containingSub.Parameters) {
      if (param.Name?.Value === name) {
        return true;
      }
    }
  }

  // Check for declare local statements
  let found = false;
  if (containingSub.Block) {
    walkAST(containingSub.Block, (node: ASTNode) => {
      if (found) return;
      if (node.Token?.Type === "DECLARE" && node.Name?.Value === name) {
        found = true;
      }
    });
  }

  return found;
}

/**
 * Gets TextEdits for renaming a local variable or parameter within its scope.
 */
function getLocalVariableRenameEdits(
  doc: VclDocument,
  name: string,
  position: Position,
  newName: string,
): TextEdit[] {
  if (!doc.AST) return [];

  const containingSub = findContainingSubroutine(doc.AST, position);
  if (!containingSub) return [];

  if (!isLocalVariableOrParameter(containingSub, name)) return [];

  const edits: TextEdit[] = [];

  // Add edit for declaration
  const declaration = findDeclarationLocation(containingSub, name);
  if (declaration) {
    edits.push({
      range: {
        start: { line: declaration.line, character: declaration.position },
        end: {
          line: declaration.line,
          character: declaration.position + declaration.length,
        },
      },
      newText: newName,
    });
  }

  // Add edits for all usages in the subroutine block
  // Filter out the declaration to avoid duplicates
  const usages = findVariableUsagesInBlock(containingSub, name);
  for (const usage of usages) {
    // Skip if this is the same location as the declaration
    if (
      declaration &&
      usage.line === declaration.line &&
      usage.position === declaration.position
    ) {
      continue;
    }
    edits.push({
      range: {
        start: { line: usage.line, character: usage.position },
        end: { line: usage.line, character: usage.position + usage.length },
      },
      newText: newName,
    });
  }

  return edits;
}

/**
 * Finds the declaration location for a local variable or parameter.
 */
function findDeclarationLocation(
  containingSub: ASTNode,
  name: string,
): SymbolLocation | null {
  // Check for parameter declarations
  if (containingSub.Parameters && Array.isArray(containingSub.Parameters)) {
    for (const param of containingSub.Parameters) {
      if (param.Name?.Value === name) {
        return {
          name: param.Name.Value,
          line: param.Name.Token.Line - 1,
          position: param.Name.Token.Position - 1,
          length: param.Name.Token.Literal.length,
        };
      }
    }
  }

  // Search for declare local statements
  let result: SymbolLocation | null = null;
  if (containingSub.Block) {
    walkAST(containingSub.Block, (node: ASTNode) => {
      if (result) return;
      if (node.Token?.Type === "DECLARE" && node.Name?.Value === name) {
        result = {
          name: node.Name.Value,
          line: node.Name.Token.Line - 1,
          position: node.Name.Token.Position - 1,
          length: node.Name.Token.Literal.length,
        };
      }
    });
  }

  return result;
}

/**
 * Finds all usages of a local variable or parameter within a subroutine block.
 */
function findVariableUsagesInBlock(
  containingSub: ASTNode,
  name: string,
): SymbolLocation[] {
  const locations: SymbolLocation[] = [];

  if (!containingSub.Block) return locations;

  walkAST(containingSub.Block, (node: ASTNode) => {
    if (node.Token?.Type === "IDENT" && node.Value === name) {
      locations.push({
        name: node.Value,
        line: node.Token.Line - 1,
        position: node.Token.Position - 1,
        length: node.Token.Literal.length,
      });
    }
  });

  return locations;
}

/**
 * Gets the full HTTP header name at the given position by checking AST nodes.
 * Returns the header name if the cursor is on a header, or null otherwise.
 */
function getHttpHeaderAtPosition(
  doc: VclDocument,
  position: Position,
): string | null {
  if (!doc.AST) return null;

  let headerName: string | null = null;

  walkAST(doc.AST, (node: ASTNode) => {
    if (headerName) return;

    // Check SET, UNSET, ADD statements which use node.Ident for the target
    if (
      (node.Token?.Type === "SET" ||
        node.Token?.Type === "UNSET" ||
        node.Token?.Type === "ADD") &&
      node.Ident?.Value &&
      HTTP_HEADER_PATTERN.test(node.Ident.Value)
    ) {
      const line = node.Ident.Token.Line - 1;
      const start = node.Ident.Token.Position - 1;
      const end = start + node.Ident.Token.Literal.length;

      if (
        position.line === line &&
        position.character >= start &&
        position.character <= end
      ) {
        headerName = node.Ident.Value;
      }
    }

    // Check IDENT nodes in expressions (e.g., in if conditions)
    if (
      node.Token?.Type === "IDENT" &&
      node.Value &&
      HTTP_HEADER_PATTERN.test(node.Value)
    ) {
      const line = node.Token.Line - 1;
      const start = node.Token.Position - 1;
      const end = start + node.Token.Literal.length;

      if (
        position.line === line &&
        position.character >= start &&
        position.character <= end
      ) {
        headerName = node.Value;
      }
    }
  });

  return headerName;
}

/**
 * Gets the range of an HTTP header at the given position.
 */
function getHeaderRange(
  doc: VclDocument,
  position: Position,
  headerName: string,
): Range {
  const line = doc.getLine(position);
  const headerIndex = line.indexOf(headerName);

  if (headerIndex >= 0) {
    return {
      start: { line: position.line, character: headerIndex },
      end: { line: position.line, character: headerIndex + headerName.length },
    };
  }

  // Fallback
  return {
    start: { line: position.line, character: position.character },
    end: {
      line: position.line,
      character: position.character + headerName.length,
    },
  };
}

/**
 * Gets TextEdits for renaming all occurrences of an HTTP header in the document.
 * Uses AST walking to find all header references accurately.
 */
function getHttpHeaderRenameEdits(
  doc: VclDocument,
  headerName: string,
  newName: string,
): TextEdit[] {
  if (!doc.AST) return [];

  const locations: SymbolLocation[] = [];

  walkAST(doc.AST, (node: ASTNode) => {
    // Check SET, UNSET, ADD statements
    if (
      (node.Token?.Type === "SET" ||
        node.Token?.Type === "UNSET" ||
        node.Token?.Type === "ADD") &&
      node.Ident?.Value === headerName
    ) {
      locations.push({
        name: node.Ident.Value,
        line: node.Ident.Token.Line - 1,
        position: node.Ident.Token.Position - 1,
        length: node.Ident.Token.Literal.length,
      });
    }

    // Check IDENT nodes in expressions (e.g., if conditions, right side of assignments)
    if (node.Token?.Type === "IDENT" && node.Value === headerName) {
      // Avoid duplicates from SET/UNSET/ADD (those are handled separately)
      const alreadyAdded = locations.some(
        (loc) =>
          loc.line === node.Token.Line - 1 &&
          loc.position === node.Token.Position - 1,
      );
      if (!alreadyAdded) {
        locations.push({
          name: node.Value,
          line: node.Token.Line - 1,
          position: node.Token.Position - 1,
          length: node.Token.Literal.length,
        });
      }
    }
  });

  // Deduplicate and convert to TextEdits
  const seen = new Set<string>();
  const edits: TextEdit[] = [];

  for (const loc of locations) {
    const key = `${loc.line}:${loc.position}`;
    if (seen.has(key)) continue;
    seen.add(key);

    edits.push({
      range: {
        start: { line: loc.line, character: loc.position },
        end: { line: loc.line, character: loc.position + loc.length },
      },
      newText: newName,
    });
  }

  return edits;
}
