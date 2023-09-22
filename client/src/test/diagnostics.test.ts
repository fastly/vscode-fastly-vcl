/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode'
import * as assert from 'assert'
import { getDocUri, activate } from './helper'

suite('Should get diagnostics', () => {
  const docUri = getDocUri('diagnostics.vcl')

  test('Diagnoses linting problems', async () => {
    await testDiagnostics(docUri, [
      {
        message:
          'Subroutine "vcl_fetch" is missing Fastly boilerplate comment "FASTLY FETCH" inside definition',
        range: toRange(0, 0, 0, 0),
        severity: vscode.DiagnosticSeverity.Warning,
        source: 'vcl'
      },
      {
        message: 'Error code 999: use a code between 600-699 instead',
        range: toRange(1, 8, 1, 8),
        severity: vscode.DiagnosticSeverity.Information,
        source: 'vcl'
      }
    ])
  })
})

function toRange (sLine: number, sChar: number, eLine: number, eChar: number) {
  const start = new vscode.Position(sLine, sChar)
  const end = new vscode.Position(eLine, eChar)
  return new vscode.Range(start, end)
}

async function testDiagnostics (
  docUri: vscode.Uri,
  expectedDiagnostics: vscode.Diagnostic[]
) {
  await activate(docUri)

  const actualDiagnostics = vscode.languages.getDiagnostics(docUri)

  assert.equal(actualDiagnostics.length, expectedDiagnostics.length)

  expectedDiagnostics.forEach((expectedDiagnostic, i) => {
    const actualDiagnostic = actualDiagnostics[i]
    assert.equal(actualDiagnostic.message, expectedDiagnostic.message)
    assert.deepEqual(actualDiagnostic.range, expectedDiagnostic.range)
    assert.equal(actualDiagnostic.severity, expectedDiagnostic.severity)
  })
}
