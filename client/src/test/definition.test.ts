import * as vscode from "vscode";
import * as assert from "assert";
import { getDocUri, activate } from "./helper";

suite("Should do definition", () => {
  const docUri = getDocUri("definition.vcl");

  test("Goes to ACL definition", async () => {
    // Position on "internal" in "if (client.ip ~ internal) {"
    // Line 20 (0-indexed 19), character 18 is start of "internal"
    await testDefinition(docUri, new vscode.Position(19, 20), {
      uri: docUri,
      range: new vscode.Range(
        new vscode.Position(0, 4),
        new vscode.Position(0, 12),
      ),
    });
  });

  test("Goes to table definition", async () => {
    // Position on "redirects" in "table.lookup(redirects, req.url)"
    // Line 25 (0-indexed 24), character 39 is start of "redirects"
    await testDefinition(docUri, new vscode.Position(24, 42), {
      uri: docUri,
      range: new vscode.Range(
        new vscode.Position(5, 6),
        new vscode.Position(5, 15),
      ),
    });
  });

  test("Goes to backend definition", async () => {
    // Position on "origin" in "set req.backend = origin;"
    // Line 28 (0-indexed 27), character 20 is start of "origin"
    await testDefinition(docUri, new vscode.Position(27, 22), {
      uri: docUri,
      range: new vscode.Range(
        new vscode.Position(10, 8),
        new vscode.Position(10, 14),
      ),
    });
  });

  test("Returns empty for undefined symbol", async () => {
    // Position on "client" which has no definition in this file
    await testNoDefinition(docUri, new vscode.Position(19, 8));
  });
});

async function testDefinition(
  docUri: vscode.Uri,
  position: vscode.Position,
  expectedLocation: { uri: vscode.Uri; range: vscode.Range },
) {
  await activate(docUri);

  // Wait for symbols to be available (AST needs to be parsed first)
  await waitForDefinition(docUri, position);

  const actualLocations = (await vscode.commands.executeCommand(
    "vscode.executeDefinitionProvider",
    docUri,
    position,
  )) as vscode.Location[];

  assert.ok(actualLocations.length >= 1, "Expected at least one definition");

  const location = actualLocations[0];
  assert.strictEqual(
    location.uri.toString(),
    expectedLocation.uri.toString(),
    "Definition URI should match",
  );
  assert.strictEqual(
    location.range.start.line,
    expectedLocation.range.start.line,
    "Definition start line should match",
  );
  assert.strictEqual(
    location.range.start.character,
    expectedLocation.range.start.character,
    "Definition start character should match",
  );
}

async function testNoDefinition(docUri: vscode.Uri, position: vscode.Position) {
  await activate(docUri);

  const actualLocations = (await vscode.commands.executeCommand(
    "vscode.executeDefinitionProvider",
    docUri,
    position,
  )) as vscode.Location[];

  assert.strictEqual(
    actualLocations.length,
    0,
    "Expected no definitions for undefined symbol",
  );
}

async function waitForDefinition(
  docUri: vscode.Uri,
  position: vscode.Position,
  timeout = 5000,
) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const locations = await vscode.commands.executeCommand<vscode.Location[]>(
        "vscode.executeDefinitionProvider",
        docUri,
        position,
      );
      if (locations && locations.length > 0) {
        return;
      }
    } catch {
      // LSP not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
