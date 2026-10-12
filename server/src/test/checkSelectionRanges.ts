/**
 * Checks that every selection range chain is properly nested: each parent
 * range must contain its child. VS Code rejects the whole response otherwise
 * ("parent must contain this range") and silently falls back to its built-in
 * providers, so the e2e tests cannot see the failure.
 *
 * Usage: npx tsx server/src/test/checkSelectionRanges.ts
 */

import * as fs from "fs";
import * as path from "path";
import { Range, SelectionRange } from "vscode-languageserver/node";

import { resolve } from "../selection-range-provider";
import { documentCache } from "../shared/documentCache";

const fixturesPath = path.resolve(__dirname, "../../../client/testFixture");

function contains(outer: Range, inner: Range): boolean {
  const startsBefore =
    outer.start.line < inner.start.line ||
    (outer.start.line === inner.start.line &&
      outer.start.character <= inner.start.character);
  const endsAfter =
    outer.end.line > inner.end.line ||
    (outer.end.line === inner.end.line &&
      outer.end.character >= inner.end.character);
  return startsBefore && endsAfter;
}

function format(range: Range): string {
  return `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
}

async function checkFixture(filePath: string): Promise<string[]> {
  const content = fs.readFileSync(filePath, "utf-8");
  const uri = `file://${filePath}`;

  documentCache.set({ uri, languageId: "vcl", version: 1, text: content });

  // Some fixtures make falco fail on purpose; check them without an AST
  const { lintText } = await import("../../../falco-js/src/wasm.mjs");
  try {
    const lintResult = await lintText(content, {
      vclFileName: filePath,
      diagnosticsOnly: false,
    });
    const doc = documentCache.get(uri);
    if (doc) {
      doc.AST = (lintResult as { Vcl?: { AST?: unknown } }).Vcl?.AST;
    }
  } catch {
    // Leave the AST unset
  }

  const errors: string[] = [];
  const lines = content.split("\n");

  for (let line = 0; line < lines.length; line++) {
    for (let character = 0; character <= lines[line].length; character++) {
      const [selectionRange] = resolve({
        textDocument: { uri },
        positions: [{ line, character }],
      });

      let current: SelectionRange | undefined = selectionRange;
      while (current?.parent) {
        if (!contains(current.parent.range, current.range)) {
          errors.push(
            `${path.basename(filePath)} at ${line}:${character}: ` +
              `parent ${format(current.parent.range)} does not contain ` +
              `${format(current.range)}`,
          );
        }
        current = current.parent;
      }
    }
  }

  documentCache.delete(uri);
  return errors;
}

async function main() {
  const fixtures = fs
    .readdirSync(fixturesPath)
    .filter((f) => f.endsWith(".vcl"))
    .map((f) => path.join(fixturesPath, f));

  let failed = 0;
  for (const fixture of fixtures) {
    const errors = await checkFixture(fixture);
    if (errors.length === 0) {
      console.log(`✓ ${path.basename(fixture)}`);
    } else {
      failed++;
      console.error(`✗ ${path.basename(fixture)} (${errors.length} errors)`);
      errors.slice(0, 10).forEach((e) => console.error(`  ${e}`));
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} fixture(s) have improperly nested ranges`);
    process.exit(1);
  }
}

main();
