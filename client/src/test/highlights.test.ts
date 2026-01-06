import * as vscode from "vscode";
import * as assert from "assert";
import { getDocUri, activate } from "./helper";

suite("Should provide document highlights", () => {
  const docUri = getDocUri("highlights.vcl");

  test("Highlights ACL from definition", async () => {
    await activate(docUri);

    // Position on "internal" in "acl internal"
    const highlights = await getHighlights(docUri, new vscode.Position(0, 5));

    // Should find: definition + 2 usages (~ internal, !~ internal)
    assert.strictEqual(highlights.length, 3, "Expected 3 highlights for ACL");
    assertHighlightKind(
      highlights,
      0,
      vscode.DocumentHighlightKind.Write,
      "definition",
    );
  });

  test("Highlights ACL from usage", async () => {
    await activate(docUri);

    // Position on "internal" in "~ internal" (line 16)
    const highlights = await getHighlights(docUri, new vscode.Position(16, 20));

    assert.strictEqual(
      highlights.length,
      3,
      "Expected 3 highlights for ACL from usage",
    );
  });

  test("Highlights table from definition", async () => {
    await activate(docUri);

    // Position on "redirects" in "table redirects"
    const highlights = await getHighlights(docUri, new vscode.Position(1, 8));

    // Should find: definition + 2 usages (lookup + contains)
    assert.strictEqual(highlights.length, 3, "Expected 3 highlights for table");
  });

  test("Highlights backend from definition", async () => {
    await activate(docUri);

    // Position on "F_origin" in "backend F_origin"
    const highlights = await getHighlights(docUri, new vscode.Position(2, 10));

    // Should find: definition + 2 usages (req.backend + req.backend)
    assert.strictEqual(
      highlights.length,
      3,
      "Expected 3 highlights for backend",
    );
  });

  test("Highlights subroutine from definition", async () => {
    await activate(docUri);

    // Position on "custom_handler" in "sub custom_handler"
    const highlights = await getHighlights(docUri, new vscode.Position(4, 6));

    // Should find: definition + 2 call sites
    assert.strictEqual(
      highlights.length,
      3,
      "Expected 3 highlights for subroutine",
    );
  });

  test("Highlights header occurrences", async () => {
    await activate(docUri);

    // Position on "req.http.X-Custom" (line 31: set req.http.X-Custom = "value1")
    const highlights = await getHighlights(docUri, new vscode.Position(30, 10));

    // Should find: 2 set statements + 1 read in if + 1 read in assignment
    assert.strictEqual(
      highlights.length,
      4,
      "Expected 4 highlights for req.http.X-Custom",
    );

    // First two should be writes (set statements)
    const writeHighlights = highlights.filter(
      (h) => h.kind === vscode.DocumentHighlightKind.Write,
    );
    assert.ok(
      writeHighlights.length >= 2,
      "Expected at least 2 write highlights for set statements",
    );
  });

  test("Highlights variable occurrences", async () => {
    await activate(docUri);

    // Position on "var.result" (line 10: declare local var.result)
    const highlights = await getHighlights(docUri, new vscode.Position(9, 22));

    // Should find: declare + set + return
    assert.strictEqual(
      highlights.length,
      3,
      "Expected 3 highlights for var.result",
    );

    // declare and set should be writes
    const writeHighlights = highlights.filter(
      (h) => h.kind === vscode.DocumentHighlightKind.Write,
    );
    assert.strictEqual(
      writeHighlights.length,
      2,
      "Expected 2 write highlights (declare and set)",
    );
  });

  test("Highlights parameter variable occurrences", async () => {
    await activate(docUri);

    // Position on "var.left" in function signature (line 9)
    const highlights = await getHighlights(docUri, new vscode.Position(8, 30));

    // Should find: parameter declaration + usage in set statement
    assert.strictEqual(
      highlights.length,
      2,
      "Expected 2 highlights for var.left",
    );

    // Parameter declaration should be write
    const writeHighlights = highlights.filter(
      (h) => h.kind === vscode.DocumentHighlightKind.Write,
    );
    assert.strictEqual(
      writeHighlights.length,
      1,
      "Expected 1 write highlight for parameter declaration",
    );
  });

  test("Does not highlight different headers together", async () => {
    await activate(docUri);

    // Position on "req.http.X-Other" (line 35)
    const highlights = await getHighlights(docUri, new vscode.Position(35, 10));

    // Should only find 1 occurrence of X-Other
    assert.strictEqual(
      highlights.length,
      1,
      "Expected 1 highlight for req.http.X-Other (not mixed with X-Custom)",
    );
  });

  test("Highlights header with add statement", async () => {
    await activate(docUri);

    // Position on "resp.http.Set-Cookie" (line 52: add resp.http.Set-Cookie = ...)
    const highlights = await getHighlights(docUri, new vscode.Position(51, 10));

    // Should find: 2 add statements + 1 read in if
    assert.strictEqual(
      highlights.length,
      3,
      "Expected 3 highlights for resp.http.Set-Cookie",
    );

    // Both add statements should be writes
    const writeHighlights = highlights.filter(
      (h) => h.kind === vscode.DocumentHighlightKind.Write,
    );
    assert.strictEqual(
      writeHighlights.length,
      2,
      "Expected 2 write highlights for add statements",
    );
  });
});

async function getHighlights(
  docUri: vscode.Uri,
  position: vscode.Position,
  timeout = 5000,
): Promise<vscode.DocumentHighlight[]> {
  // Poll for highlights - LSP may need time to parse the document
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const highlights = await vscode.commands.executeCommand<
      vscode.DocumentHighlight[]
    >("vscode.executeDocumentHighlights", docUri, position);
    if (highlights && highlights.length > 0) {
      return highlights;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return [];
}

function assertHighlightKind(
  highlights: vscode.DocumentHighlight[],
  line: number,
  expectedKind: vscode.DocumentHighlightKind,
  description: string,
): void {
  const highlight = highlights.find((h) => h.range.start.line === line);
  assert.ok(
    highlight,
    `Expected a highlight at line ${line} for ${description}`,
  );
  assert.strictEqual(
    highlight.kind,
    expectedKind,
    `Expected ${description} to have kind ${expectedKind}`,
  );
}
