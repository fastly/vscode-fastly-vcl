/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from "vscode";
import * as assert from "assert";
import { getDocUri, activate, waitForDiagnosticsCount } from "./helper";

suite("Should respond to configuration changes", () => {
  const docUri = getDocUri("diagnostics.vcl");

  teardown(async () => {
    // Restore default settings after each test
    const config = vscode.workspace.getConfiguration("fastly.vcl");
    await config.update("lintingEnabled", undefined, true);
    // Wait for diagnostics to be restored
    await waitForDiagnosticsCount(docUri, (count) => count > 0);
  });

  test("Disabling linting clears diagnostics", async () => {
    await activate(docUri);

    // Verify diagnostics exist with linting enabled (default). activate()
    // only waits for the server to answer, not for the first lint.
    const linted = await waitForDiagnosticsCount(docUri, (count) => count > 0);
    assert.ok(linted, "Expected diagnostics with linting enabled");

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
