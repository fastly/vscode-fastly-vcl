/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from "vscode";
import * as assert from "assert";
import { getDocUri, activate } from "./helper";

suite("Should do signature help", () => {
  const docUri = getDocUri("signatureHelp.vcl");

  test("Shows signature help for regsub function", async () => {
    // Line 2: set req.url = regsub(req.url, "^/old/", "/new/");
    // Position right after the opening parenthesis of regsub(
    await testSignatureHelp(docUri, new vscode.Position(1, 25), "regsub", [
      "input",
      "pattern",
      "replacement",
    ]);
  });
});

async function testSignatureHelp(
  docUri: vscode.Uri,
  position: vscode.Position,
  expectedFunctionName: string,
  expectedParameters: string[],
) {
  await activate(docUri);

  const signatureHelp = (await vscode.commands.executeCommand(
    "vscode.executeSignatureHelpProvider",
    docUri,
    position,
    "(",
  )) as vscode.SignatureHelp | undefined;

  assert.ok(signatureHelp, "Expected signature help to be returned");
  assert.ok(
    signatureHelp.signatures.length > 0,
    "Expected at least one signature",
  );

  const signature = signatureHelp.signatures[0];
  assert.ok(
    signature.label.toLowerCase().includes(expectedFunctionName.toLowerCase()),
    `Expected signature to contain "${expectedFunctionName}", got: ${signature.label}`,
  );

  for (const param of expectedParameters) {
    const hasParam = signature.parameters.some((p) =>
      (typeof p.label === "string"
        ? p.label
        : signature.label.slice(p.label[0], p.label[1])
      )
        .toLowerCase()
        .includes(param.toLowerCase()),
    );
    assert.ok(hasParam, `Expected parameter "${param}" in signature`);
  }
}
