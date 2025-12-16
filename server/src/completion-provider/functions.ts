import {
  CompletionItem,
  CompletionItemKind,
  CompletionItemTag,
  MarkupKind,
  TextDocumentPositionParams,
} from "vscode-languageserver/node";

import { slugify, DOCS_URL } from "../shared/utils";

import vclFunctions from "../metadata/functions.json";
import vclSubroutines from "../metadata/subroutines.json";

const FUNCTIONS: CompletionItem[] = [];

const FUNCTION_COMPLETIONS: Map<string, CompletionItem> = new Map();

for (const fnName of Object.keys(vclFunctions)) {
  const token = (vclFunctions as Record<string, unknown>)[fnName] as any;
  token.methods = token.methods?.filter(
    (m: string) => !!(vclSubroutines as Record<string, unknown>)[m],
  );

  FUNCTIONS.push({
    label: fnName,
    labelDetails: {
      detail: ` ${token.type}`,
    },
    data: {
      methods: token.methods,
    },
    tags: token.deprecated ? [CompletionItemTag.Deprecated] : [],
    kind: CompletionItemKind.Method,
  });

  FUNCTION_COMPLETIONS.set(fnName, {
    label: fnName,
    detail: `${token.type} ${fnName}(${
      token.args?.map((arg: { name: string }) => arg.name).join(", ") || ``
    })`,
    documentation: {
      kind: MarkupKind.Markdown,
      value: [
        token.desc,
        token.methods?.length &&
          "**Scope:** `" + token.methods.join("`, `") + "`",
        `[Documentation](${DOCS_URL}/functions/${slugify(fnName)}/)`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  });
}

export function query(
  _params: TextDocumentPositionParams,
  currentWord: string,
  scope?: string,
): CompletionItem[] {
  console.debug("completion:query:functions");
  const F = scope
    ? FUNCTIONS.filter(
        (f) => !f.data.methods.length || f.data.methods.includes(scope),
      )
    : FUNCTIONS;
  if (currentWord.indexOf(".") === -1) {
    return F;
  }
  return F.filter((fn) => fn.label.startsWith(currentWord));
}

export function resolve(completionItem: CompletionItem): CompletionItem {
  console.debug("completion:resolve:functions", completionItem.label);
  if (FUNCTION_COMPLETIONS.has(completionItem.label)) {
    return FUNCTION_COMPLETIONS.get(completionItem.label)!;
  }
  return completionItem;
}
