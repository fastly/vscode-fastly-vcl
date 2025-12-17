/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from "vscode";
import * as assert from "assert";
import { getDocUri, activate } from "./helper";

suite("Should respect maxLintingIssues setting", () => {
  const docUri = getDocUri("manyIssues.vcl");

  teardown(async () => {
    // Restore default settings after each test
    const config = vscode.workspace.getConfiguration("fastly.vcl");
    await config.update("maxLintingIssues", undefined, true);
  });

  test("Limits diagnostics to maxLintingIssues", async () => {
    // Set a low limit of 3 BEFORE activating the document
    // This ensures the linter sees the setting when the document is first opened
    const config = vscode.workspace.getConfiguration("fastly.vcl");
    await config.update("maxLintingIssues", 3, true);

    await activate(docUri);

    // Wait for diagnostics to stabilize (no changes for 100ms)
    await waitForDiagnosticsToStabilize(docUri);

    const diagnostics = vscode.languages.getDiagnostics(docUri);

    // The fixture has 6 potential issues:
    // 1 boilerplate warning + 5 error code warnings (999, 998, 997, 996, 995)
    // With maxLintingIssues=3, we should get at most 4 diagnostics
    // (the limit is checked after incrementing problems counter)
    assert.ok(
      diagnostics.length <= 4,
      `Expected at most 4 diagnostics with maxLintingIssues=3, got ${diagnostics.length}`,
    );

    // Verify the diagnostics we do get are the expected ones
    const boilerplateWarning = diagnostics.find((d) =>
      d.message.includes("FASTLY FETCH"),
    );
    assert.ok(boilerplateWarning, "Expected boilerplate warning");
    assert.strictEqual(
      boilerplateWarning.severity,
      vscode.DiagnosticSeverity.Warning,
    );

    const errorCodeWarnings = diagnostics.filter((d) =>
      d.message.includes("Error code"),
    );
    assert.ok(
      errorCodeWarnings.length >= 1,
      "Expected at least one error code warning",
    );
    errorCodeWarnings.forEach((d) => {
      assert.strictEqual(
        d.severity,
        vscode.DiagnosticSeverity.Information,
        "Error code warnings should be Information severity",
      );
      assert.strictEqual(d.source, "vcl", "Diagnostic source should be 'vcl'");
    });
  });
});

async function waitForDiagnosticsToStabilize(
  docUri: vscode.Uri,
  stableMs = 100,
  timeout = 5000,
): Promise<void> {
  return new Promise((resolve) => {
    let lastChangeTime = Date.now();

    const disposable = vscode.languages.onDidChangeDiagnostics((e) => {
      if (e.uris.some((uri) => uri.toString() === docUri.toString())) {
        lastChangeTime = Date.now();
      }
    });

    // Check periodically if diagnostics have stabilized
    const checkInterval = setInterval(() => {
      const timeSinceLastChange = Date.now() - lastChangeTime;
      if (timeSinceLastChange >= stableMs) {
        clearInterval(checkInterval);
        disposable.dispose();
        resolve();
      }
    }, 50);

    // Timeout fallback
    setTimeout(() => {
      clearInterval(checkInterval);
      disposable.dispose();
      resolve();
    }, timeout);
  });
}
