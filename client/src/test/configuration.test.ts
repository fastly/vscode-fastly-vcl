/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from "vscode";
import * as assert from "assert";
import { getDocUri, activate } from "./helper";

suite("Should respond to configuration changes", () => {
  const docUri = getDocUri("diagnostics.vcl");

  teardown(async () => {
    // Restore default settings after each test
    const config = vscode.workspace.getConfiguration("fastly.vcl");
    await config.update("lintingEnabled", undefined, true);
    // Wait for diagnostics to be restored
    await waitForDiagnosticsCount(docUri, (count) => count > 0);
  });

  test.skip("Disabling linting clears diagnostics", async () => {
    await activate(docUri);

    // Verify diagnostics exist with linting enabled (default)
    const initialDiagnostics = vscode.languages.getDiagnostics(docUri);
    assert.ok(
      initialDiagnostics.length > 0,
      "Expected diagnostics with linting enabled",
    );

    // Disable linting (use global config since no workspace is open in tests)
    const config = vscode.workspace.getConfiguration("fastly.vcl");
    await config.update("lintingEnabled", false, true);

    // Wait for diagnostics to be cleared
    const cleared = await waitForDiagnosticsCount(
      docUri,
      (count) => count === 0,
    );
    assert.ok(
      cleared,
      "Expected diagnostics to be cleared when linting disabled",
    );
  });
});

async function waitForDiagnosticsCount(
  docUri: vscode.Uri,
  predicate: (count: number) => boolean,
  timeout = 5000,
): Promise<boolean> {
  return new Promise((resolve) => {
    // Check immediately
    if (predicate(vscode.languages.getDiagnostics(docUri).length)) {
      resolve(true);
      return;
    }

    // Listen for changes
    const disposable = vscode.languages.onDidChangeDiagnostics((e) => {
      if (e.uris.some((uri) => uri.toString() === docUri.toString())) {
        if (predicate(vscode.languages.getDiagnostics(docUri).length)) {
          disposable.dispose();
          resolve(true);
        }
      }
    });

    // Timeout
    setTimeout(() => {
      disposable.dispose();
      resolve(predicate(vscode.languages.getDiagnostics(docUri).length));
    }, timeout);
  });
}
