import { Hover, MarkupKind } from "vscode-languageserver/node";

import { slugify, DOCS_URL } from "../shared/utils";
import vclFunctions from "../metadata/functions.json";

export const HOVER: Map<string, Hover> = new Map();

for (const fnName of Object.keys(vclFunctions)) {
  const token = (vclFunctions as Record<string, unknown>)[fnName] as any;
  HOVER.set(fnName, {
    contents: {
      kind: MarkupKind.Markdown,
      value: [
        `## ${token.type} ${fnName}(${
          token.args?.map((arg: { name: string }) => arg.name).join(", ") || ``
        })`,
        token.desc,
        `[Documentation](${DOCS_URL}/functions/${slugify(fnName)}/)`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  });
}
