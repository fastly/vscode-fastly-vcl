/**
 * VCL Document Formatting Provider
 *
 * This module provides document formatting for Fastly VCL files by integrating
 * with the falco fmt command (https://github.com/ysugimoto/falco).
 *
 * ## Implementation
 *
 * 1. When the user triggers "Format Document" (Shift+Alt+F), this provider is called.
 *
 * 2. The function invokes `falco fmt` via the `falco-js` wrapper, which runs the
 *    platform-specific falco binary and returns the formatted VCL text.
 *
 * 3. The formatted text is returned as a single TextEdit that replaces the entire
 *    document content.
 *
 * ## Configuration
 *
 * - `fastly.vcl.formattingEnabled` - Enable/disable formatting
 */

import {
  DocumentFormattingParams,
  TextEdit,
  Range,
  Position,
} from "vscode-languageserver/node";

import { documentCache } from "../shared/documentCache";
import { getDocumentSettings, connection } from "../server";
import { importESM } from "../shared/esmImport";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { FormatResult } from "../../../falco-js/src/wasm.mjs";

type FormatTextFn = (
  text: string,
  options?: { config?: Record<string, unknown> },
) => Promise<FormatResult>;

/**
 * Handle document formatting request.
 * Returns a TextEdit that replaces the entire document with formatted content.
 */
export async function resolve(
  params: DocumentFormattingParams,
): Promise<TextEdit[] | null> {
  const vclDoc = documentCache.get(params.textDocument.uri);
  if (!vclDoc) return null;

  const settings = await getDocumentSettings(params.textDocument.uri);

  // Check if formatting is enabled
  if (!settings.formattingEnabled) {
    return null;
  }

  // Load the WASI component backend (ESM) via a real import() so require()
  // does not try to load an async ES module.
  let formatText: FormatTextFn | null = null;
  try {
    const wasmUrl = pathToFileURL(
      join(__dirname, "../../../falco-js/src/wasm.mjs"),
    ).href;
    const falcoJs = await importESM(wasmUrl);
    formatText = falcoJs.formatText;
  } catch (e) {
    connection.console.error(
      `Formatting service unavailable: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }

  if (!formatText) {
    return null;
  }

  const text = vclDoc.getText();

  try {
    const result = await formatText(text, {});

    if (result.error) {
      connection.console.warn(`Formatting failed: ${result.error}`);
      return null;
    }

    if (!result.formatted || result.formatted === text) {
      // No changes needed
      return [];
    }

    // Get the underlying TextDocument for position calculations
    const doc = vclDoc.doc;
    const lastLine = doc.lineCount - 1;
    const lastLineText = doc.getText({
      start: Position.create(lastLine, 0),
      end: Position.create(lastLine, Number.MAX_SAFE_INTEGER),
    });

    const fullRange: Range = {
      start: Position.create(0, 0),
      end: Position.create(lastLine, lastLineText.length),
    };

    return [TextEdit.replace(fullRange, result.formatted)];
  } catch (err) {
    connection.console.error(
      `Formatting error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
