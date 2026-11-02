/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from "vscode";
import * as assert from "assert";
import { getDocUri, activate, waitForDiagnosticsCount } from "./helper";

suite("Should respect lintingEnabled setting", () => {
  // Use dedicated fixture to avoid conflicts with other tests
  const docUri = getDocUri("lintingEnabled.vcl");

  teardown(async () => {
    // Restore default settings after each test
    const config = vscode.workspace.getConfiguration("fastly.vcl");
    await config.update("lintingEnabled", undefined, true);
  });

  test("Diagnostics are produced when linting is enabled", async () => {
    // Ensure linting is enabled (default)
    const config = vscode.workspace.getConfiguration("fastly.vcl");
    await config.update("lintingEnabled", true, true);

    await activate(docUri);

    // Wait for diagnostics to appear
    await waitForDiagnosticsCount(docUri, (count) => count > 0);

    const diagnostics = vscode.languages.getDiagnostics(docUri);

    // lintingEnabled.vcl has at least 2 issues:
    // 1. Missing FASTLY FETCH boilerplate comment
    // 2. Error code 601 is reserved
    assert.ok(
      diagnostics.length >= 1,
      `Expected at least 1 diagnostic with linting enabled, got ${diagnostics.length}`,
    );

    // Verify we have the boilerplate warning
    const boilerplateWarning = diagnostics.find((d) =>
      d.message.includes("FASTLY FETCH"),
    );
    assert.ok(boilerplateWarning, "Expected boilerplate warning");
    assert.strictEqual(
      boilerplateWarning.severity,
      vscode.DiagnosticSeverity.Warning,
      "Boilerplate warning should have Warning severity",
    );

    // Verify diagnostic source
    diagnostics.forEach((d) => {
      assert.strictEqual(d.source, "vcl", "Diagnostic source should be 'vcl'");
    });
  });
});
