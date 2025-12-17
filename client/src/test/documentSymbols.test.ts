/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from "vscode";
import * as assert from "assert";
import { getDocUri, activate } from "./helper";

suite("Should provide document symbols", () => {
  const docUri = getDocUri("boilerplate.vcl");

  test("Returns subroutine symbols", async () => {
    await activate(docUri);

    // Wait for linting to complete and symbols to be available
    // boilerplate.vcl has 0 lint errors, so we wait for either:
    // - diagnostics event to fire, or
    // - symbols to become available via polling
    await waitForSymbolsOrDiagnostics(docUri);

    // Get symbols (should be available immediately after the wait above)
    const symbols = await waitForSymbols(docUri, 30000);

    assert.ok(symbols, "Expected symbols to be returned");
    assert.ok(
      symbols.length > 0,
      "Expected at least one symbol (timed out waiting for document symbol provider)",
    );

    const symbolNames = symbols.map((s) => s.name);

    // boilerplate.vcl contains these subroutines
    const expectedSubroutines = [
      "vcl_recv",
      "vcl_hash",
      "vcl_hit",
      "vcl_miss",
      "vcl_pass",
      "vcl_fetch",
      "vcl_error",
      "vcl_deliver",
      "vcl_log",
    ];

    for (const sub of expectedSubroutines) {
      assert.ok(
        symbolNames.includes(sub),
        `Expected symbol "${sub}" to be present, got: ${symbolNames.join(", ")}`,
      );
    }
  });
});

async function waitForSymbolsOrDiagnostics(
  docUri: vscode.Uri,
  timeout = 60000,
): Promise<void> {
  // Wait for either:
  // 1. Symbols to become available (indicates linting completed and AST was parsed)
  // 2. Diagnostics event to fire for this URI
  // 3. Timeout (gives up waiting)
  //
  // CI environments can be significantly slower than local development,
  // so we use a generous timeout.
  let resolved = false;
  let pollInterval: ReturnType<typeof setInterval>;
  let timeoutId: ReturnType<typeof setTimeout>;

  return new Promise((resolve) => {
    const done = () => {
      if (!resolved) {
        resolved = true;
        disposable.dispose();
        clearInterval(pollInterval);
        clearTimeout(timeoutId);
        resolve();
      }
    };

    const disposable = vscode.languages.onDidChangeDiagnostics((e) => {
      if (e.uris.some((uri) => uri.toString() === docUri.toString())) {
        // Diagnostics were published - symbols should be available now
        // Add a small delay for slow CI environments
        setTimeout(done, 100);
      }
    });

    // Poll for symbols - this catches cases where diagnostics event was missed
    pollInterval = setInterval(() => {
      vscode.commands
        .executeCommand("vscode.executeDocumentSymbolProvider", docUri)
        .then((symbols) => {
          if (
            symbols &&
            Array.isArray(symbols) &&
            (symbols as unknown[]).length > 0
          ) {
            done();
          }
        });
    }, 500); // Poll every 500ms to reduce load

    // Timeout fallback
    timeoutId = setTimeout(done, timeout);
  });
}

async function waitForSymbols(
  docUri: vscode.Uri,
  timeout = 5000,
): Promise<vscode.DocumentSymbol[] | vscode.SymbolInformation[]> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const symbols = (await vscode.commands.executeCommand(
      "vscode.executeDocumentSymbolProvider",
      docUri,
    )) as vscode.DocumentSymbol[] | vscode.SymbolInformation[] | undefined;
    if (symbols && symbols.length > 0) {
      return symbols;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return [];
}
