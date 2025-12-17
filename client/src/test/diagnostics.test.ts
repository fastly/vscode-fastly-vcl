/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from "vscode";
import * as assert from "assert";
import { getDocUri, activate } from "./helper";

suite("Should get diagnostics", () => {
  const docUri = getDocUri("diagnostics.vcl");

  test("Diagnoses linting problems", async () => {
    await testDiagnostics(docUri, [
      // Not sure why this is a warning
      {
        message: 'Variable "left" is unused',
        range: toRange(7, 24, 7, 24),
        severity: vscode.DiagnosticSeverity.Warning,
        source: "vcl",
      },
      // Not sure why this is a warning
      {
        message: 'Variable "right" is unused',
        range: toRange(7, 41, 7, 41),
        severity: vscode.DiagnosticSeverity.Warning,
        source: "vcl",
      },
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
