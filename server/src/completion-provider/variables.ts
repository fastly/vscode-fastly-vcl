import {
  CompletionItem,
  CompletionItemKind,
  CompletionItemTag,
  MarkupKind,
  TextDocumentPositionParams,
} from "vscode-languageserver/node";

import { slugify, DOCS_URL, HEADER_RX, ensureFullStop } from "../shared/utils";

import * as vclHeaders from "./headers";

import vclVariables from "../metadata/variables.json";
import vclSubroutines from "../metadata/subroutines.json";

function formatScope(methods: string[] | undefined): string | undefined {
  if (!methods?.length) return undefined;

  if (methods.includes("all")) {
    return "Available in all subroutines.";
  }

  const validMethods = methods.filter(
    (m) => !!(vclSubroutines as Record<string, unknown>)[m],
  );
  if (!validMethods.length) return undefined;

  const formatted = validMethods.map((m) => `\`vcl_${m}\``).join(", ");
  return `Available in ${formatted}.`;
}

const VARIABLES: CompletionItem[] = [];

const VARIABLE_COMPLETIONS: Map<string, CompletionItem> = new Map();

for (const vName of Object.keys(vclVariables)) {
  const token = (vclVariables as Record<string, unknown>)[vName] as any;
  const originalMethods: string[] | undefined = token.methods;
  const filteredMethods = token.methods?.filter(
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
        methods: filteredMethods,
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
          formatScope(originalMethods),
          token.access == `RO`
            ? `**Read-only:** ${ensureFullStop(token.desc)}`
            : ensureFullStop(token.desc),
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
