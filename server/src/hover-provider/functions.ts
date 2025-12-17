import { Hover, MarkupKind } from "vscode-languageserver/node";

import { slugify, DOCS_URL, ensureFullStop } from "../shared/utils";
import vclFunctions from "../metadata/functions.json";
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

for (const fnName of Object.keys(vclFunctions)) {
  const token = (vclFunctions as Record<string, unknown>)[fnName] as any;
  HOVER.set(fnName, {
    contents: {
      kind: MarkupKind.Markdown,
      value: [
        `\`${token.type} ${fnName}(${
          token.args
            ?.map(
              (arg: { type: string; name: string }) =>
                `${arg.type} ${arg.name}`,
            )
            .join(", ") || ``
        })\``,
        formatScope(token.methods),
        ensureFullStop(token.desc),
        `[Documentation](${DOCS_URL}/functions/${token.category}/${slugify(fnName)}/)`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  });
}
