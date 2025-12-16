import { Hover, MarkupKind } from "vscode-languageserver/node";

import { slugify, DOCS_URL } from "../shared/utils";
import vclVariables from "../metadata/variables.json";

export const HOVER: Map<string, Hover> = new Map();

for (const vName of Object.keys(vclVariables)) {
  const token = (vclVariables as Record<string, unknown>)[vName] as any;
  HOVER.set(vName, {
    contents: {
      kind: MarkupKind.Markdown,
      value: [
        `## ${token.type} ${vName}`,
        token.desc,
        `[Documentation](${DOCS_URL}/variables/${token.category}/${slugify(vName)}/)`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
  });
}
