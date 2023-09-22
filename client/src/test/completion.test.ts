/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode'
import * as assert from 'assert'
import { getDocUri, activate } from './helper'

suite('Should do completion', () => {
  const docUri = getDocUri('completion.vcl')

  test('Completes functions and variables', async () => {
    await testCompletion(docUri, new vscode.Position(1, 2), {
      items: [
        {
          label: 'accept.charset_lookup',
          kind: vscode.CompletionItemKind.Method
        },
        {
          label: 'backend.conn.is_tls',
          kind: vscode.CompletionItemKind.Variable
        }
      ]
    })
  })
})

async function testCompletion (
  docUri: vscode.Uri,
  position: vscode.Position,
  expectedCompletionList: vscode.CompletionList
) {
  await activate(docUri)

  // Executing the command `vscode.executeCompletionItemProvider` to simulate triggering completion
  const actualCompletionList = (await vscode.commands.executeCommand(
    'vscode.executeCompletionItemProvider',
    docUri,
    position
  )) as vscode.CompletionList

  assert.ok(actualCompletionList.items.length >= 2)

  expectedCompletionList.items.forEach((expectedItem, i) => {
    assert.ok(
      actualCompletionList.items.find(
        actualItem =>
          actualItem.insertText === expectedItem.label &&
          actualItem.kind === expectedItem.kind
      )
    )
  })
}
