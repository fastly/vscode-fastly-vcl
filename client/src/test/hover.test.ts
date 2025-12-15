/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from "vscode";
import * as assert from "assert";
import { getDocUri, activate } from "./helper";

suite("Should do hover", () => {
  const docUri = getDocUri("boilerplate.vcl");

  test("Shows hover for req.method", async () => {
    // Line 6: if (req.method != "HEAD" ...
    // req.method starts at column 6
    await testHover(
      docUri,
      new vscode.Position(5, 10),
      "HTTP method for the request",
    );
  });

  test("Shows hover for beresp.ttl", async () => {
    // Line 65: set beresp.ttl = 3600s;
    // beresp.ttl starts at column 8
    await testHover(
      docUri,
      new vscode.Position(64, 12),
      "Amount of time the fetched object should be cached for",
    );
  });
});

async function testHover(
  docUri: vscode.Uri,
  position: vscode.Position,
  expectedContent: string,
) {
  await activate(docUri);

  const hovers = (await vscode.commands.executeCommand(
    "vscode.executeHoverProvider",
    docUri,
    position,
  )) as vscode.Hover[];

  assert.ok(hovers.length > 0, "Expected at least one hover result");

  const hoverContent = hovers
    .flatMap((h) => h.contents)
    .map((c) => {
      if (typeof c === "string") {
        return c;
      }
      if (c instanceof vscode.MarkdownString) {
        return c.value;
      }
      return (c as { value: string }).value;
    })
    .join("\n");

  assert.ok(
    hoverContent.toLowerCase().includes(expectedContent.toLowerCase()),
    `Expected hover to contain "${expectedContent}", got: ${hoverContent}`,
  );
}
