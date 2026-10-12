/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from "vscode";
import * as assert from "assert";
import * as fs from "fs";
import { getDocUri, getDocPath, activate } from "./helper";

suite("Should get diagnostics", () => {
  const docUri = getDocUri("diagnostics.vcl");

  test("Diagnoses linting problems", async () => {
    await testDiagnostics(docUri, [
      {
        message:
          'Subroutine "vcl_fetch" is missing Fastly boilerplate comment "#FASTLY FETCH" inside definition',
        range: toRange(12, 0, 12, 0),
        severity: vscode.DiagnosticSeverity.Warning,
        source: "vcl",
      },
      {
        message: "Error code 999: use a code between 600-699 instead",
        range: toRange(13, 8, 13, 8),
        severity: vscode.DiagnosticSeverity.Information,
        source: "vcl",
      },
      {
        message: 'Variable "client.display.width" is deprecated',
        range: toRange(18, 6, 18, 6),
        severity: vscode.DiagnosticSeverity.Warning,
        source: "vcl",
      },
      {
        message: 'Variable "client.display.height" is deprecated',
        range: toRange(18, 30, 18, 30),
        severity: vscode.DiagnosticSeverity.Warning,
        source: "vcl",
      },
      {
        message: 'Variable "client.display.width" is deprecated',
        range: toRange(19, 36, 19, 36),
        severity: vscode.DiagnosticSeverity.Warning,
        source: "vcl",
      },
      {
        message:
          "Type INTEGER implicit conversion to STRING on string concatenation",
        range: toRange(19, 36, 19, 36),
        severity: vscode.DiagnosticSeverity.Information,
        source: "vcl",
      },
      {
        message: 'Variable "client.display.height" is deprecated',
        range: toRange(19, 65, 19, 65),
        severity: vscode.DiagnosticSeverity.Warning,
        source: "vcl",
      },
      {
        message:
          "Type INTEGER implicit conversion to STRING on string concatenation",
        range: toRange(19, 65, 19, 65),
        severity: vscode.DiagnosticSeverity.Information,
        source: "vcl",
      },
    ]);
  });
});

suite("Should survive cyclic includes", () => {
  const docUri = getDocUri("includeCycleMain.vcl");

  test("Reports the include cycle instead of crashing the server", async () => {
    await testDiagnostics(docUri, [
      {
        message:
          'Cyclic include: "includeCycleA" -> "includeCycleB" -> "includeCycleA". The repeated include was skipped when linting.',
        range: toRange(0, 0, 0, 0),
        severity: vscode.DiagnosticSeverity.Warning,
        source: "vcl",
      },
    ]);
  });
});

suite("Should survive linter failures", () => {
  const docUri = getDocUri("lintFailure.vcl");

  test("Reports a failed lint as a warning", async () => {
    await testDiagnostics(docUri, [
      {
        message:
          "The VCL linter failed on this file: Maximum call stack size exceeded",
        range: toRange(0, 0, 0, 0),
        severity: vscode.DiagnosticSeverity.Warning,
        source: "vcl",
      },
    ]);
  });
});

suite("Should lint alone when includes are over budget", () => {
  const docUri = getDocUri("overBudgetMain.vcl");
  const modulePath = getDocPath("overBudgetModule.vcl");

  // Just over the server's 6 MiB include budget (MAX_TOTAL_SOURCE_BYTES).
  suiteSetup(() => {
    const line = "# " + "x".repeat(1022) + "\n";
    fs.writeFileSync(modulePath, line.repeat(6 * 1024 + 1));
  });

  suiteTeardown(() => {
    fs.rmSync(modulePath, { force: true });
  });

  test("Reports only the skipped cross-file checks", async () => {
    await testDiagnostics(docUri, [
      {
        message:
          "Included files are too large for the VCL linter; cross-file checks were skipped and only this file was linted.",
        range: toRange(0, 0, 0, 0),
        severity: vscode.DiagnosticSeverity.Information,
        source: "vcl",
      },
    ]);
  });
});

suite("Should lint includes from unsaved buffers", () => {
  const docUri = getDocUri("openBufferMain.vcl");
  const moduleUri = getDocUri("openBuffer+module.vcl");

  test("Uses an included file's unsaved edits", async () => {
    const moduleDoc = await vscode.workspace.openTextDocument(moduleUri);
    const original = moduleDoc.getText();
    const replaceModule = async (text: string) => {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        moduleUri,
        new vscode.Range(
          moduleDoc.positionAt(0),
          moduleDoc.positionAt(moduleDoc.getText().length),
        ),
        text,
      );
      assert.ok(await vscode.workspace.applyEdit(edit));
    };

    // Remove the helper the main file calls, without saving.
    await replaceModule("# buffer_helper removed in an unsaved edit\n");
    try {
      await testDiagnostics(docUri, [
        {
          message: "Subroutine buffer_helper is not defined",
          range: toRange(6, 2, 6, 2),
          severity: vscode.DiagnosticSeverity.Error,
          source: "vcl",
        },
      ]);
    } finally {
      await replaceModule(original);
    }
  });
});

suite("Should lint VCL snippets", () => {
  test("Lints an annotated snippet in its scope", async () => {
    await testDiagnostics(getDocUri("snippetDeliver.vcl"), [
      {
        message: 'Variable "client.display.width" is deprecated',
        range: toRange(2, 24, 2, 24),
        severity: vscode.DiagnosticSeverity.Warning,
        source: "vcl",
      },
    ]);
  });

  test("Reports variables used outside the snippet scope", async () => {
    await testDiagnostics(getDocUri("snippetWrongScope.vcl"), [
      {
        message:
          'Variable "resp.http.Server" could not access in scope of RECV \nSee reference documentation: https://developer.fastly.com/reference/vcl/variables/client-response/resp-http/',
        range: toRange(2, 6, 2, 6),
        severity: vscode.DiagnosticSeverity.Error,
        source: "vcl",
      },
    ]);
  });

  test("Reports a snippet without a @scope annotation", async () => {
    await testDiagnostics(getDocUri("snippetMissingScope.vcl"), [
      {
        message:
          "VCL snippet requires @scope annotation (e.g., # @scope: deliver)",
        range: toRange(1, 0, 1, 0),
        severity: vscode.DiagnosticSeverity.Error,
        source: "vcl",
      },
    ]);
  });
});

function toRange(sLine: number, sChar: number, eLine: number, eChar: number) {
  const start = new vscode.Position(sLine, sChar);
  const end = new vscode.Position(eLine, eChar);
  return new vscode.Range(start, end);
}

async function testDiagnostics(
  docUri: vscode.Uri,
  expectedDiagnostics: vscode.Diagnostic[],
) {
  await activate(docUri);

  // Wait for diagnostics to be available
  const actualDiagnostics = await waitForDiagnostics(
    docUri,
    expectedDiagnostics.length,
  );

  // Sort both arrays by line, then character, then message for stable comparison
  const sortDiagnostics = (diagnostics: vscode.Diagnostic[]) =>
    [...diagnostics].sort((a, b) => {
      if (a.range.start.line !== b.range.start.line) {
        return a.range.start.line - b.range.start.line;
      }
      if (a.range.start.character !== b.range.start.character) {
        return a.range.start.character - b.range.start.character;
      }
      return a.message.localeCompare(b.message);
    });

  const sortedActual = sortDiagnostics(actualDiagnostics);
  const sortedExpected = sortDiagnostics(expectedDiagnostics);

  assert.equal(sortedActual.length, sortedExpected.length);

  sortedExpected.forEach((expectedDiagnostic, i) => {
    const actualDiagnostic = sortedActual[i];
    assert.equal(actualDiagnostic.message, expectedDiagnostic.message);
    assert.deepEqual(actualDiagnostic.range, expectedDiagnostic.range);
    assert.equal(actualDiagnostic.severity, expectedDiagnostic.severity);
  });
}

async function waitForDiagnostics(
  docUri: vscode.Uri,
  minCount: number,
  timeout = 5000,
): Promise<vscode.Diagnostic[]> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const diagnostics = vscode.languages.getDiagnostics(docUri);
    if (diagnostics.length >= minCount) {
      return diagnostics;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return vscode.languages.getDiagnostics(docUri);
}
