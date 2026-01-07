/**
 * Context-Aware Completion Provider for Fastly VCL
 *
 * This module provides intelligent code completions that adapt based on the
 * user's current position within VCL source code.
 *
 * ## Aim
 *
 * VCL has many functions, variables, and headers that are only valid within
 * specific subroutines (e.g., `vcl_recv`, `vcl_fetch`, `vcl_deliver`). Rather
 * than showing all possible completions regardless of context, this provider
 * filters suggestions to only show items that are valid in the current scope,
 * reducing noise and preventing invalid code.
 *
 * ## Implementation
 *
 * 1. **Scope Detection**: When a completion is requested, we determine which
 *    VCL subroutine contains the cursor position using the document's AST.
 *
 * 2. **Contextual Filtering**: Each completion source (functions, variables,
 *    headers) maintains metadata about which subroutines each item is valid in.
 *    The `query()` functions filter their items based on the detected scope.
 *
 * 3. **Aggregation**: Completions from all sources are combined and returned.
 *    Special cases (like `#FASTLY` macro completions) are handled separately.
 *
 * 4. **Resolution**: When a user selects an item, `resolve()` fetches full
 *    documentation including description, type signature, and links to docs.
 */

import {
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
} from "vscode-languageserver/node";

import { documentCache } from "../shared/documentCache";

import * as vclFunctions from "./functions";
import * as vclVariables from "./variables";
import * as vclSubroutines from "./subroutines";
import * as vclHeaders from "./headers";

// Returns a list of completion items for the given position.
export function query(params: TextDocumentPositionParams): CompletionItem[] {
  const activeDoc = documentCache.get(params.textDocument.uri);
  if (!activeDoc) return [];

  const textOnCurrentLine = activeDoc.getLineTo(params.position);
  const scope = activeDoc.getSubroutine(params.position);

  if (!scope) {
    // Fastly subroutine autocomplete, for now.
    return vclSubroutines.query(params);
    // TODO: Add support for other snippets: backend, table, etc.
  }

  const builtinSubroutine = scope?.replace(`vcl_`, ``);

  if (
    textOnCurrentLine.trim() === "#" &&
    vclSubroutines.SUBROUTINE_COMPLETIONS.has(`sub ${scope}`)
  ) {
    return [
      {
        label: `FASTLY ${builtinSubroutine}`,
        kind: CompletionItemKind.Text,
      },
    ];
  }

  if (/^\s+(#|\/\/)/.test(textOnCurrentLine)) {
    return [];
  }

  const currentWord = activeDoc.getWord(params.position);

  console.debug("completion:query", {
    in: params.textDocument.uri,
    scope,
    builtinSubroutine,
  });

  return [
    ...vclFunctions.query(params, currentWord, builtinSubroutine),
    ...vclVariables.query(params, currentWord, builtinSubroutine),
    ...vclHeaders.query(params, currentWord, builtinSubroutine),
  ];
}

// Resolves additional information for the item selected in the completion list.
export function resolve(completionItem: CompletionItem): CompletionItem {
  console.debug("completion:resolve");
  if (completionItem.kind === CompletionItemKind.EnumMember) {
    return vclHeaders.resolve(completionItem);
  }
  if (completionItem.kind === CompletionItemKind.Snippet) {
    return vclSubroutines.resolve(completionItem);
  }
  if (completionItem.kind === CompletionItemKind.Method) {
    return vclFunctions.resolve(completionItem);
  }
  if (completionItem.kind === CompletionItemKind.Variable) {
    return vclVariables.resolve(completionItem);
  }
  return completionItem;
}
