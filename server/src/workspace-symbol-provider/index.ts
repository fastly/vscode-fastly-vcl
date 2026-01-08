/**
 * Workspace Symbol Provider
 *
 * This module provides workspace-wide symbol search functionality for VCL files,
 * enabling the "Go to Symbol in Workspace" feature (Cmd+T / Ctrl+T).
 *
 * **Feature Overview:**
 * Workspace symbols allow users to search for subroutines, backends, ACLs, tables,
 * and other VCL constructs across all open VCL files. Unlike document symbols which
 * are scoped to a single file, workspace symbols search across the entire workspace.
 *
 * **Implementation:**
 * 1. When a workspace symbol query is received, iterate over all cached VCL documents.
 * 2. For each document, retrieve the DocumentSymbols and convert them to SymbolInformation
 *    (which includes the file URI for cross-file navigation).
 * 3. Filter symbols by query string using case-insensitive substring matching.
 * 4. Flatten nested symbols (e.g., variables inside subroutines) to make them searchable.
 *
 * **Scope:**
 * Currently searches only open documents (those in documentCache). Future enhancements
 * could scan the workspace for all .vcl files.
 */
import {
  WorkspaceSymbolParams,
  SymbolInformation,
  Location,
  DocumentSymbol,
} from "vscode-languageserver/node";

import { documentCache } from "../shared/documentCache";
import { getSymbolInformation } from "../symbol-provider";

/**
 * Converts a DocumentSymbol to SymbolInformation, adding the file URI.
 * DocumentSymbol is hierarchical (used for document outline), while
 * SymbolInformation is flat (used for workspace search results).
 */
function toSymbolInformation(
  symbol: DocumentSymbol,
  uri: string,
  containerName?: string,
): SymbolInformation {
  return {
    name: symbol.name,
    kind: symbol.kind,
    location: Location.create(uri, symbol.selectionRange),
    containerName: containerName || symbol.detail,
  };
}

/**
 * Flattens a DocumentSymbol and its children into an array of SymbolInformation.
 * Children use the parent symbol name as their containerName for context.
 */
function flattenSymbols(
  symbol: DocumentSymbol,
  uri: string,
): SymbolInformation[] {
  const results: SymbolInformation[] = [toSymbolInformation(symbol, uri)];

  if (symbol.children) {
    for (const child of symbol.children) {
      results.push(toSymbolInformation(child, uri, symbol.name));
      // Recursively flatten deeper nested symbols if any
      if (child.children) {
        for (const grandchild of child.children) {
          results.push(...flattenSymbols(grandchild, uri));
        }
      }
    }
  }

  return results;
}

/**
 * Resolves workspace symbol queries by searching all cached VCL documents.
 *
 * @param params - Contains the query string typed by the user
 * @returns Array of matching SymbolInformation objects from all open VCL files
 */
export function resolve(params: WorkspaceSymbolParams): SymbolInformation[] {
  const query = params.query.toLowerCase();
  const results: SymbolInformation[] = [];

  // Search all cached (open) documents
  for (const doc of documentCache.all()) {
    const symbols = getSymbolInformation(doc);

    for (const symbol of symbols) {
      // Flatten the symbol and its children
      const flatSymbols = flattenSymbols(symbol, doc.uri);

      for (const flatSymbol of flatSymbols) {
        // Case-insensitive substring match on symbol name
        if (flatSymbol.name.toLowerCase().includes(query)) {
          results.push(flatSymbol);
        }
      }
    }
  }

  return results;
}
