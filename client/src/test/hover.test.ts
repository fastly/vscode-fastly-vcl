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
    await testHover(docUri, new vscode.Position(5, 10), [
      "HTTP method for the request",
      "Available in all subroutines.",
      "https://developer.fastly.com/reference/vcl/variables/client-request/req-method/",
    ]);
  });

  test("Shows hover for beresp.ttl", async () => {
    // Line 65: set beresp.ttl = 3600s;
    // beresp.ttl starts at column 8
    await testHover(docUri, new vscode.Position(64, 12), [
      "Amount of time the fetched object should be cached for",
      "Available in `vcl_fetch`.",
      "https://developer.fastly.com/reference/vcl/variables/backend-response/beresp-ttl/",
    ]);
  });

  test("Shows hover for regsub function", async () => {
    const fnDocUri = getDocUri("signatureHelp.vcl");
    // Line 2: set req.url = regsub(req.url, "^/old/", "/new/");
    // regsub starts at column 18
    await testHover(fnDocUri, new vscode.Position(1, 20), [
      "STRING regsub(STRING input, REGEX pattern, STRING replacement)",
      "Replace the first occurrence of a regular expression",
      "Available in all subroutines.",
      "https://developer.fastly.com/reference/vcl/functions/strings/regsub/",
    ]);
  });
});

async function testHover(
  docUri: vscode.Uri,
  position: vscode.Position,
  expectedContents: string[],
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

  for (const expected of expectedContents) {
    assert.ok(
      hoverContent.toLowerCase().includes(expected.toLowerCase()),
      `Expected hover to contain "${expected}", got: ${hoverContent}`,
    );
  }
}
