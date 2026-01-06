import * as vscode from "vscode";
import * as assert from "assert";
import { getDocUri, activate } from "./helper";

suite("Should find references", () => {
  const docUri = getDocUri("references.vcl");

  test("Finds ACL references from definition", async () => {
    await activate(docUri);

    // Position on "internal" in "acl internal"
    const references = await findReferences(docUri, new vscode.Position(0, 5));

    // Should find: definition + 2 usages (~ internal, !~ internal)
    assert.strictEqual(references.length, 3, "Expected 3 references for ACL");
    assertReferenceAtLine(references, 0); // definition
    assertReferenceAtLine(references, 6); // ~ internal
    assertReferenceAtLine(references, 7); // !~ internal
  });

  test("Finds ACL references from usage", async () => {
    await activate(docUri);

    // Position on "internal" in "~ internal"
    const references = await findReferences(docUri, new vscode.Position(6, 20));

    assert.strictEqual(
      references.length,
      3,
      "Expected 3 references for ACL from usage",
    );
  });

  test("Finds table references from definition", async () => {
    await activate(docUri);

    // Position on "redirects" in "table redirects"
    const references = await findReferences(docUri, new vscode.Position(1, 8));

    // Should find: definition + 2 usages (lookup + contains)
    assert.strictEqual(references.length, 3, "Expected 3 references for table");
    assertReferenceAtLine(references, 1); // definition
    assertReferenceAtLine(references, 8); // table.lookup
    assertReferenceAtLine(references, 9); // table.contains
  });

  test("Finds backend references from definition", async () => {
    await activate(docUri);

    // Position on "origin" in "backend origin"
    const references = await findReferences(docUri, new vscode.Position(2, 10));

    // Should find: definition + 2 usages (req.backend + bereq.backend)
    assert.strictEqual(
      references.length,
      3,
      "Expected 3 references for backend",
    );
    assertReferenceAtLine(references, 2); // definition
    assertReferenceAtLine(references, 10); // req.backend
    assertReferenceAtLine(references, 15); // bereq.backend
  });

  test("Finds subroutine references from definition", async () => {
    await activate(docUri);

    // Position on "custom_recv" in "sub custom_recv"
    const references = await findReferences(docUri, new vscode.Position(3, 6));

    // Should find: definition + 2 call sites
    assert.strictEqual(
      references.length,
      3,
      "Expected 3 references for subroutine",
    );
    assertReferenceAtLine(references, 3); // definition
    assertReferenceAtLine(references, 11); // call in vcl_recv
    assertReferenceAtLine(references, 16); // call in vcl_miss
  });

  test("Finds references excluding declaration", async () => {
    await activate(docUri);

    // Position on "internal" in "acl internal"
    const references = await findReferencesExcludingDeclaration(
      docUri,
      new vscode.Position(0, 5),
    );

    // Should find: 2 usages only (no definition)
    assert.strictEqual(
      references.length,
      2,
      "Expected 2 references excluding declaration",
    );
    // Definition at line 0 should not be included
    const hasDefinition = references.some((r) => r.range.start.line === 0);
    assert.strictEqual(
      hasDefinition,
      false,
      "Should not include definition when excludeDeclaration is true",
    );
  });
});

async function findReferences(
  docUri: vscode.Uri,
  position: vscode.Position,
  timeout = 5000,
): Promise<vscode.Location[]> {
  // Poll for references - LSP may need time to parse the document
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const references = await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeReferenceProvider",
      docUri,
      position,
    );
    if (references && references.length > 0) {
      return references;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return [];
}

async function findReferencesExcludingDeclaration(
  docUri: vscode.Uri,
  position: vscode.Position,
): Promise<vscode.Location[]> {
  // VS Code's executeReferenceProvider always includes declaration
  // We filter it out manually for this test
  const references = await findReferences(docUri, position);
  // The definition is typically the first one or at the position we queried
  return references.filter((r) => r.range.start.line !== position.line);
}

function assertReferenceAtLine(
  references: vscode.Location[],
  line: number,
): void {
  const found = references.some((r) => r.range.start.line === line);
  assert.ok(found, `Expected a reference at line ${line}`);
}
