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

// Context-aware token completion based on the enclosing builtin subroutine.

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
