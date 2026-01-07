/**
 * Hover Provider
 *
 * Provides hover documentation for VCL language elements when the user hovers
 * over code in the editor. This feature displays inline documentation for
 * functions, variables, subroutines, and HTTP headers.
 *
 * Implementation:
 * - Extracts the word under the cursor from the cached document
 * - Checks if the word matches an HTTP header pattern (e.g., req.http.*, resp.http.*)
 * - Falls back to looking up the word in VCL functions, variables, and subroutines
 * - Returns Markdown-formatted documentation from the metadata files
 *
 * The hover data is sourced from JSON metadata files in server/src/metadata/,
 * which are generated from Fastly's official VCL documentation.
 */

import { Hover, HoverParams } from "vscode-languageserver/node";

import { documentCache } from "../shared/documentCache";
import { HEADER_RX } from "../shared/utils";

import * as vclFunctions from "./functions";
import * as vclVariables from "./variables";
import * as vclSubroutines from "./subroutines";
import * as vclHeaders from "./headers";

export function resolve(params: HoverParams): Hover | undefined {
  const activeDoc = documentCache.get(params.textDocument.uri);
  if (!activeDoc) return undefined;

  const hoverWord = activeDoc.getWord(params.position);
  console.debug("hover:resolve", { hoverWord, position: params.position });
  if (HEADER_RX.test(hoverWord)) {
    return vclHeaders.HOVER.get(hoverWord.replace(HEADER_RX, "").toLowerCase());
  }
  const hoverMd =
    vclFunctions.HOVER.get(hoverWord) ||
    vclVariables.HOVER.get(hoverWord) ||
    vclSubroutines.HOVER.get(hoverWord);
  return hoverMd;
}
