import { ReferenceParams, Location, Range } from "vscode-languageserver/node";

import { documentCache } from "../shared/documentCache";
import { getSymbolInformation } from "../symbol-provider";
import { VclDocument } from "../shared/vclDocument";

/**
 * Resolves references for VCL symbols (ACLs, tables, backends, subroutines).
 * Returns all locations where the symbol is used, optionally including the definition.
 */
export function resolve(params: ReferenceParams): Location[] {
  const doc = documentCache.get(params.textDocument.uri);
  if (!doc) return [];

  const word = doc.getWord(params.position);
  if (!word) return [];

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
