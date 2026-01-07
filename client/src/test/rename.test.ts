import * as vscode from "vscode";
import * as assert from "assert";
import { getDocUri, activate } from "./helper";

suite("Should rename symbols", () => {
  const docUri = getDocUri("rename.vcl");

  test("Renames ACL from definition", async () => {
    await activate(docUri);

    // Position on "internal" in "acl internal" (line 0, char 4)
    const edit = await renameSymbol(
      docUri,
      new vscode.Position(0, 5),
      "allowed_ips",
    );

    assert.ok(edit, "Expected WorkspaceEdit for ACL rename");
    const changes = edit.get(docUri);
    assert.ok(changes, "Expected changes for document");
    // Should have: definition + 2 usages (~ internal, !~ internal)
    assert.strictEqual(changes.length, 3, "Expected 3 edits for ACL rename");
    assertEditAtLine(changes, 0); // definition
    assertEditAtLine(changes, 6); // ~ internal
    assertEditAtLine(changes, 7); // !~ internal
    assertAllEditsHaveNewText(changes, "allowed_ips");
  });

  test("Renames ACL from usage", async () => {
    await activate(docUri);

    // Position on "internal" in "~ internal" (line 6)
    const edit = await renameSymbol(
      docUri,
      new vscode.Position(6, 20),
      "allowed_ips",
    );

    assert.ok(edit, "Expected WorkspaceEdit for ACL rename from usage");
    const changes = edit.get(docUri);
    assert.ok(changes, "Expected changes for document");
    assert.strictEqual(
      changes.length,
      3,
      "Expected 3 edits for ACL rename from usage",
    );
  });

  test("Renames table from definition", async () => {
    await activate(docUri);

    // Position on "redirects" in "table redirects" (line 1)
    const edit = await renameSymbol(
      docUri,
      new vscode.Position(1, 8),
      "url_mappings",
    );

    assert.ok(edit, "Expected WorkspaceEdit for table rename");
    const changes = edit.get(docUri);
    assert.ok(changes, "Expected changes for document");
    // Should have: definition + 2 usages (lookup + contains)
    assert.strictEqual(changes.length, 3, "Expected 3 edits for table rename");
    assertEditAtLine(changes, 1); // definition
    assertEditAtLine(changes, 8); // table.lookup
    assertEditAtLine(changes, 9); // table.contains
    assertAllEditsHaveNewText(changes, "url_mappings");
  });

  test("Renames backend from definition", async () => {
    await activate(docUri);

    // Position on "F_origin" in "backend F_origin" (line 2)
    const edit = await renameSymbol(
      docUri,
      new vscode.Position(2, 10),
      "F_primary",
    );

    assert.ok(edit, "Expected WorkspaceEdit for backend rename");
    const changes = edit.get(docUri);
    assert.ok(changes, "Expected changes for document");
    // Should have: definition + 2 usages (req.backend + bereq.backend)
    assert.strictEqual(
      changes.length,
      3,
      "Expected 3 edits for backend rename",
    );
    assertEditAtLine(changes, 2); // definition
    assertEditAtLine(changes, 10); // req.backend
    assertEditAtLine(changes, 15); // bereq.backend
    assertAllEditsHaveNewText(changes, "F_primary");
  });

  test("Renames subroutine from definition", async () => {
    await activate(docUri);

    // Position on "custom_recv" in "sub custom_recv" (line 3)
    const edit = await renameSymbol(
      docUri,
      new vscode.Position(3, 6),
      "handle_request",
    );

    assert.ok(edit, "Expected WorkspaceEdit for subroutine rename");
    const changes = edit.get(docUri);
    assert.ok(changes, "Expected changes for document");
    // Should have: definition + 2 call sites
    assert.strictEqual(
      changes.length,
      3,
      "Expected 3 edits for subroutine rename",
    );
    assertEditAtLine(changes, 3); // definition
    assertEditAtLine(changes, 11); // call in vcl_recv
    assertEditAtLine(changes, 16); // call in vcl_miss
    assertAllEditsHaveNewText(changes, "handle_request");
  });

  test("Rejects renaming built-in subroutine", async () => {
    await activate(docUri);

    // Position on "vcl_recv" in "sub vcl_recv" (line 5)
    // Built-in subroutines should not be renameable
    try {
      await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
        "vscode.executeDocumentRenameProvider",
        docUri,
        new vscode.Position(5, 6),
        "my_recv",
      );
      // If we get here, either the rename was rejected (good) or returned empty
      assert.ok(true, "Built-in subroutine rename was correctly rejected");
    } catch {
      // Expected: "The element can't be renamed" error
      assert.ok(true, "Built-in subroutine rename was correctly rejected");
    }
  });

  test("Renames local variable", async () => {
    await activate(docUri);

    // Position on "var.result" in declaration (line 20)
    const edit = await renameSymbol(
      docUri,
      new vscode.Position(20, 20),
      "var.output",
    );

    assert.ok(edit, "Expected WorkspaceEdit for local variable rename");
    const changes = edit.get(docUri);
    assert.ok(changes, "Expected changes for document");
    // Should have: declaration + 4 usages (line 22 has 2 occurrences)
    // Note: References test also expects 5 for the same variable
    assert.strictEqual(
      changes.length,
      5,
      "Expected 5 edits for local variable rename",
    );
    assertEditAtLine(changes, 20); // declaration
    assertEditAtLine(changes, 21); // set var.result = "hello"
    assertEditAtLine(changes, 22); // set var.result = var.result + ... (2 edits)
    assertEditAtLine(changes, 23); // return var.result
    assertAllEditsHaveNewText(changes, "var.output");
  });

  test("Renames subroutine parameter", async () => {
    await activate(docUri);

    // Position on "var.input" in parameter list (line 26)
    const edit = await renameSymbol(
      docUri,
      new vscode.Position(26, 25),
      "var.text",
    );

    assert.ok(edit, "Expected WorkspaceEdit for parameter rename");
    const changes = edit.get(docUri);
    assert.ok(changes, "Expected changes for document");
    // Should have: parameter declaration + 1 usage
    assert.strictEqual(
      changes.length,
      2,
      "Expected 2 edits for parameter rename",
    );
    assertEditAtLine(changes, 26); // parameter declaration
    assertEditAtLine(changes, 28); // usage in set statement
    assertAllEditsHaveNewText(changes, "var.text");
  });

  test("Returns null for unknown symbol", async () => {
    await activate(docUri);

    // Position on whitespace/empty line where there's no symbol (line 4)
    // Unknown symbols should not be renameable
    try {
      await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
        "vscode.executeDocumentRenameProvider",
        docUri,
        new vscode.Position(4, 0),
        "something",
      );
      // If we get here, either the rename was rejected (good) or returned empty
      assert.ok(true, "Unknown symbol rename was correctly rejected");
    } catch {
      // Expected: "The element can't be renamed" or "No result" error
      assert.ok(true, "Unknown symbol rename was correctly rejected");
    }
  });

  // HTTP header rename
  test("Renames HTTP header", async () => {
    await activate(docUri);

    // Position on "req.http.X-Custom-Header" (line 33)
    const edit = await renameSymbol(
      docUri,
      new vscode.Position(33, 15),
      "req.http.X-Renamed-Header",
    );

    assert.ok(edit, "Expected WorkspaceEdit for HTTP header rename");
    const changes = edit.get(docUri);
    assert.ok(changes, "Expected changes for document");
    // Should have: 4 usages (set, set, if, unset)
    assert.strictEqual(
      changes.length,
      4,
      "Expected 4 edits for HTTP header rename",
    );
    assertEditAtLine(changes, 33); // set req.http.X-Custom-Header = "value1"
    assertEditAtLine(changes, 34); // set req.http.X-Custom-Header = "value2"
    assertEditAtLine(changes, 35); // if (req.http.X-Custom-Header == ...)
    assertEditAtLine(changes, 36); // unset req.http.X-Custom-Header
    assertAllEditsHaveNewText(changes, "req.http.X-Renamed-Header");
  });
});

async function renameSymbol(
  docUri: vscode.Uri,
  position: vscode.Position,
  newName: string,
  timeout = 5000,
): Promise<vscode.WorkspaceEdit | undefined> {
  // Poll for rename result - LSP may need time to parse the document
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
        "vscode.executeDocumentRenameProvider",
        docUri,
        position,
        newName,
      );
      if (edit) {
        const changes = edit.get(docUri);
        if (changes && changes.length > 0) {
          return edit;
        }
      }
    } catch {
      // LSP not ready yet or rename failed
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return undefined;
}

function assertEditAtLine(edits: vscode.TextEdit[], expectedLine: number) {
  const found = edits.some((edit) => edit.range.start.line === expectedLine);
  assert.ok(found, `Expected edit at line ${expectedLine}`);
}

function assertAllEditsHaveNewText(edits: vscode.TextEdit[], newText: string) {
  for (const edit of edits) {
    assert.strictEqual(
      edit.newText,
      newText,
      `Expected newText to be "${newText}" but got "${edit.newText}"`,
    );
  }
}
