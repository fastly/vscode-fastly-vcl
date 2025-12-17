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

    // Give linting time to complete (it runs async after document open)
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Wait for symbols to be available (LSP may need time to parse)
    const symbols = await waitForSymbols(docUri, 10000);

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
