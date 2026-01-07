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
    // Position on "F_origin" in "set req.backend = F_origin;"
    // Line 28 (0-indexed 27), character 20 is start of "F_origin"
    await testDefinition(docUri, new vscode.Position(27, 22), {
      uri: docUri,
      range: new vscode.Range(
        new vscode.Position(10, 8),
        new vscode.Position(10, 16),
      ),
    });
  });

  test("Definition from declaration stays at declaration", async () => {
    // Position on "F_origin" in "backend F_origin {" (line 11, 0-indexed 10)
    // Should return the same location (the definition itself)
    await testDefinition(docUri, new vscode.Position(10, 10), {
      uri: docUri,
      range: new vscode.Range(
        new vscode.Position(10, 8),
        new vscode.Position(10, 16),
      ),
    });
  });

  test("Returns empty for undefined symbol", async () => {
    // Position on "client" which has no definition in this file
    await testNoDefinition(docUri, new vscode.Position(19, 8));
  });

  test("Goes to local variable definition", async () => {
    // Position on "var.result" in "return var.result;" (line 41, 0-indexed 40)
    // Should jump to the declaration on line 37 (0-indexed 36), character 16
    await testDefinition(docUri, new vscode.Position(40, 12), {
      uri: docUri,
      range: new vscode.Range(
        new vscode.Position(36, 16),
        new vscode.Position(36, 26),
      ),
    });
  });

  test("Goes to subroutine parameter definition", async () => {
    // Position on "var.a" in "set var.result = var.a + var.b;" (line 47, 0-indexed 46)
    // Should jump to parameter declaration on line 45 (0-indexed 44), character 25
    await testDefinition(docUri, new vscode.Position(46, 21), {
      uri: docUri,
      range: new vscode.Range(
        new vscode.Position(44, 25),
        new vscode.Position(44, 30),
      ),
    });
  });

  test("Local variable definition is scope-aware", async () => {
    // Position on "var.result" in "return var.result;" inside concat_params (line 48, 0-indexed 47)
    // Should jump to the declaration on line 46 (0-indexed 45) within the SAME subroutine,
    // NOT to line 37 (0-indexed 36) which is in concat_values
    await testDefinition(docUri, new vscode.Position(47, 11), {
      uri: docUri,
      range: new vscode.Range(
        new vscode.Position(45, 16),
        new vscode.Position(45, 26),
      ),
    });
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
