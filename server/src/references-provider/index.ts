/**
 * Provides "Find All References" functionality for VCL documents.
 *
 * This provider locates all occurrences of a symbol throughout a document,
 * enabling users to see everywhere a particular name is used. It handles
 * two distinct categories of symbols:
 *
 * **Global Symbols (document-wide)**
 * - ACLs: Matches `~ acl_name` or `!~ acl_name` patterns
 * - Tables: Matches `table.lookup(table_name, ...)` and `table.contains(table_name, ...)`
 * - Backends: Matches `req.backend = name` or `bereq.backend = name`
 * - Subroutines: Matches `call subroutine_name;` invocations
 *
 * **Local Symbols (subroutine-scoped)**
 * - Variables declared with `declare local`
 * - Subroutine parameters
 *
 * The provider works by:
 * 1. Determining what word is at the cursor position
 * 2. First checking if it's a local variable/parameter within a subroutine scope
 * 3. If not local, querying the document's symbol table to identify the symbol type
 * 4. Using type-specific regex patterns to find all usages in the document
 * 5. Optionally including the definition location based on request parameters
 *
 * Local variable references are scoped to their containing subroutine, while
 * global symbol references span the entire document.
 */
import {
  ReferenceParams,
  Location,
  Range,
  Position,
} from "vscode-languageserver/node";

import { documentCache } from "../shared/documentCache";
import { getSymbolInformation } from "../symbol-provider";
import { VclDocument } from "../shared/vclDocument";
import { walkAST, ASTNode } from "../shared/ast";

interface VariableLocation {
  name: string;
  line: number;
  position: number;
  length: number;
}

/**
 * Resolves references for VCL symbols (ACLs, tables, backends, subroutines)
 * and local variables/parameters within subroutine scopes.
 * Returns all locations where the symbol is used, optionally including the definition.
 */
export function resolve(params: ReferenceParams): Location[] {
  const doc = documentCache.get(params.textDocument.uri);
  if (!doc) return [];

  const word = doc.getWord(params.position);
  if (!word) return [];

  // Check for local variable or parameter references first
  if (doc.AST) {
    const localReferences = findLocalVariableReferences(
      doc,
      word,
      params.position,
      params.context.includeDeclaration,
    );
    if (localReferences.length > 0) {
      return localReferences;
    }
  }

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

  // If not on a definition, try to find the symbol by name from a usage location
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

  if (!symbol) return [];

  const references: Location[] = [];

  // Include definition if requested
  if (params.context.includeDeclaration) {
    references.push({
      uri: params.textDocument.uri,
      range: symbol.selectionRange,
    });
  }

  // Find all usages based on symbol type
  const usages = findUsages(doc, word, symbol.detail);
  references.push(...usages);

  return references;
}

/**
 * Detects the symbol type based on usage context at the cursor position.
 */
function detectSymbolTypeFromUsage(
  doc: VclDocument,
  position: { line: number; character: number },
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
 * Finds all usages of a symbol in the document based on its type.
 */
function findUsages(
  doc: VclDocument,
  name: string,
  symbolType: string | undefined,
): Location[] {
  const text = doc.getText();
  const locations: Location[] = [];

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
  if (!pattern) return locations;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    // Find the capturing group that contains the symbol name
    const nameIndex = findNameIndex(match, name);
    if (nameIndex === -1) continue;

    const startOffset = match.index + nameIndex;
    const endOffset = startOffset + name.length;

    const range: Range = {
      start: doc.doc.positionAt(startOffset),
      end: doc.doc.positionAt(endOffset),
    };

    locations.push({
      uri: doc.uri,
      range,
    });
  }

  return locations;
}

/**
 * Finds the index of the symbol name within the match string.
 */
function findNameIndex(match: RegExpExecArray, name: string): number {
  // Find where in the full match the name appears
  // We look for the last occurrence since the name is typically at the end of the pattern
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
  // Check for parameter declarations in the subroutine signature
  if (containingSub.Parameters && Array.isArray(containingSub.Parameters)) {
    for (const param of containingSub.Parameters) {
      if (param.Name?.Value === name) {
        return true;
      }
    }
  }

  // Check for declare local statements within this subroutine's block
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
 * Finds the declaration location for a local variable or parameter.
 */
function findDeclarationLocation(
  containingSub: ASTNode,
  name: string,
): VariableLocation | null {
  // Check for parameter declarations in the subroutine signature
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

  // Search for declare local statements within this subroutine's block
  let result: VariableLocation | null = null;
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
  doc: VclDocument,
  containingSub: ASTNode,
  name: string,
): VariableLocation[] {
  const locations: VariableLocation[] = [];

  if (!containingSub.Block) return locations;

  walkAST(containingSub.Block, (node: ASTNode) => {
    // Check for IDENT nodes that match the variable name
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
 * Finds all references to a local variable or parameter within its scope.
 * Returns empty array if the word is not a local variable or parameter.
 */
function findLocalVariableReferences(
  doc: VclDocument,
  name: string,
  position: Position,
  includeDeclaration: boolean,
): Location[] {
  if (!doc.AST) return [];

  // Find which subroutine contains the cursor
  const containingSub = findContainingSubroutine(doc.AST, position);
  if (!containingSub) return [];

  // Check if this is actually a local variable or parameter
  if (!isLocalVariableOrParameter(containingSub, name)) return [];

  const references: Location[] = [];

  // Include declaration if requested
  if (includeDeclaration) {
    const declaration = findDeclarationLocation(containingSub, name);
    if (declaration) {
      references.push({
        uri: doc.uri,
        range: {
          start: { line: declaration.line, character: declaration.position },
          end: {
            line: declaration.line,
            character: declaration.position + declaration.length,
          },
        },
      });
    }
  }

  // Find all usages in the subroutine block
  const usages = findVariableUsagesInBlock(doc, containingSub, name);
  for (const usage of usages) {
    references.push({
      uri: doc.uri,
      range: {
        start: { line: usage.line, character: usage.position },
        end: { line: usage.line, character: usage.position + usage.length },
      },
    });
  }

  return references;
}
