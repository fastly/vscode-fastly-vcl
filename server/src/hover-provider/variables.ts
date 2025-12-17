import { Hover, MarkupKind } from "vscode-languageserver/node";

import { slugify, DOCS_URL, ensureFullStop } from "../shared/utils";
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

export const HOVER: Map<string, Hover> = new Map();

for (const vName of Object.keys(vclVariables)) {
  const token = (vclVariables as Record<string, unknown>)[vName] as any;
  HOVER.set(vName, {
    contents: {
      kind: MarkupKind.Markdown,
      value: [
        `\`${token.type} ${vName}\``,
        formatScope(token.methods),
        ensureFullStop(token.desc),
        `[Documentation](${DOCS_URL}/variables/${token.category}/${slugify(vName)}/)`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  });
}
