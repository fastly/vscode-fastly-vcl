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
 * - `fastly.vcl.falcoPath` - Custom path to falco binary
 */

import {
  DocumentFormattingParams,
  TextEdit,
  Range,
  Position,
} from "vscode-languageserver/node";

import { documentCache } from "../shared/documentCache";
import { getDocumentSettings, connection } from "../server";
import type { FormatResult } from "../../../falco-js/src/index";

type FormatTextFn = (
  text: string,
  options?: { falcoPath?: string },
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

  // Dynamic import of falco-js to handle platform-specific unavailability
  let formatText: FormatTextFn | null = null;
  try {
    const falcoJs = await import("../../../falco-js/src/index.js");
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
    const result = await formatText(text, {
      falcoPath: settings.falcoPath || undefined,
    });

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
