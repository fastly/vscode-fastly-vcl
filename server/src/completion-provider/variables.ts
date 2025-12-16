import {
  CompletionItem,
  CompletionItemKind,
  CompletionItemTag,
  MarkupKind,
  TextDocumentPositionParams,
} from "vscode-languageserver/node";

import { slugify, DOCS_URL, HEADER_RX } from "../shared/utils";

import * as vclHeaders from "./headers";

import vclVariables from "../metadata/variables.json";
import vclSubroutines from "../metadata/subroutines.json";

const VARIABLES: CompletionItem[] = [];

const VARIABLE_COMPLETIONS: Map<string, CompletionItem> = new Map();

for (const vName of Object.keys(vclVariables)) {
  const token = (vclVariables as Record<string, unknown>)[vName] as any;
  token.methods = token.methods?.filter(
    (m: string) => !!(vclSubroutines as Record<string, unknown>)[m],
  );

  // Everything except headers.
  if (!HEADER_RX.test(vName)) {
    VARIABLES.push({
      label: vName,
      labelDetails: {
        detail: ` ${token.type}`,
      },
      data: {
        methods: token.methods,
      },
      tags: token.deprecated ? [CompletionItemTag.Deprecated] : [],
      kind: CompletionItemKind.Variable,
    });

    VARIABLE_COMPLETIONS.set(vName, {
      label: vName,
      detail: `${vName} ${token.type}`,
      documentation: {
        kind: MarkupKind.Markdown,
        value: [
          token.access == `RO` ? `**Read-only:** ${token.desc}` : token.desc,
          token.methods?.length &&
            "**Scope:** `" + token.methods.join("`, `") + "`",
          `[Documentation](${DOCS_URL}/variables/${token.category}/${slugify(vName)}/)`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    });
  }
}

export function query(
  _params: TextDocumentPositionParams,
  currentWord: string,
  scope?: string,
): CompletionItem[] {
  console.debug("completion:query:variables");
  const V = scope
    ? VARIABLES.filter(
        (f) => !f.data.methods.length || f.data.methods.includes(scope),
      )
    : VARIABLES;
  if (currentWord.indexOf(".") === -1) {
    return V;
  }
  return V.filter((v) => v.label.startsWith(currentWord));
}

export function resolve(completionItem: CompletionItem): CompletionItem {
  console.debug("completion:resolve:variables", completionItem.label);
  if (VARIABLE_COMPLETIONS.has(completionItem.label)) {
    return VARIABLE_COMPLETIONS.get(completionItem.label)!;
  }
  return vclHeaders.resolve(completionItem);
}
