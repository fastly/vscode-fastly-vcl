import { DefinitionParams, Location, Range } from "vscode-languageserver/node";

import { documentCache } from "../shared/documentCache";
import { findSymbolByName } from "../symbol-provider";

export function resolve(params: DefinitionParams): Location | null {
  const doc = documentCache.get(params.textDocument.uri);
  if (!doc) return null;

  const word = doc.getWord(params.position);
  if (!word) return null;

  console.debug("definition:resolve", { word, position: params.position });

  // Find matching symbol definition (ACL, TABLE, BACKEND, DIRECTOR, SUBROUTINE)
  const symbol = findSymbolByName(params.textDocument.uri, word);

  if (symbol) {
    return {
      uri: params.textDocument.uri,
      range: symbol.selectionRange,
    };
  }

  return null;
}
