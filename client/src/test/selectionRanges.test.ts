import * as vscode from "vscode";
import * as assert from "assert";
import { getDocUri, activate } from "./helper";

suite("Should provide selection ranges", () => {
  const docUri = getDocUri("selectionRanges.vcl");

  test("Provides selection ranges for word", async () => {
    const ranges = await getSelectionRanges(docUri, [
      new vscode.Position(5, 10), // Inside "req" of req.http.X-Custom
    ]);

    assert.ok(ranges.length > 0, "Should return selection ranges");
    assert.ok(ranges[0], "Should have at least one selection range");

    // The innermost range should be the word
    const innermost = ranges[0];
    assert.ok(innermost.range, "Should have a range");
  });

  test("Selection ranges expand outward", async () => {
    const ranges = await getSelectionRanges(docUri, [
      new vscode.Position(5, 30), // Inside "value" string
    ]);

    assert.ok(ranges.length > 0, "Should return selection ranges");
    const range = ranges[0];

    // Walk the parent chain and verify each range contains the previous
    let current: vscode.SelectionRange | undefined = range;
    let previousSize = 0;

    while (current) {
      const currentSize =
        (current.range.end.line - current.range.start.line) * 1000 +
        (current.range.end.character - current.range.start.character);

      assert.ok(
        currentSize >= previousSize,
        "Each parent range should be larger than or equal to child",
      );
      previousSize = currentSize;
      current = current.parent;
    }
  });

  test("Selection ranges include statement", async () => {
    const ranges = await getSelectionRanges(docUri, [
      new vscode.Position(5, 6), // At "set" keyword
    ]);

    assert.ok(ranges.length > 0, "Should return selection ranges");

    // Walk to find a range that covers the full statement
    let current: vscode.SelectionRange | undefined = ranges[0];
    let foundStatement = false;

    while (current) {
      const text = await getTextInRange(docUri, current.range);
      if (text.includes("set") && text.includes(";")) {
        foundStatement = true;
        break;
      }
      current = current.parent;
    }

    assert.ok(
      foundStatement,
      "Should have a range covering the full statement",
    );
  });

  test("Selection ranges include if block", async () => {
    const ranges = await getSelectionRanges(docUri, [
      new vscode.Position(9, 10), // Inside the outer if block
    ]);

    assert.ok(ranges.length > 0, "Should return selection ranges");

    // Walk to find a range that covers the if block
    let current: vscode.SelectionRange | undefined = ranges[0];
    let foundIfBlock = false;

    while (current) {
      // Check if range spans multiple lines (block)
      if (current.range.end.line > current.range.start.line + 1) {
        foundIfBlock = true;
        break;
      }
      current = current.parent;
    }

    assert.ok(foundIfBlock, "Should have a range covering the if block");
  });

  test("Selection ranges include subroutine", async () => {
    const ranges = await getSelectionRanges(docUri, [
      new vscode.Position(5, 10), // Inside vcl_recv
    ]);

    assert.ok(ranges.length > 0, "Should return selection ranges");

    // Walk to find a range that covers the subroutine
    let current: vscode.SelectionRange | undefined = ranges[0];
    let foundSubroutine = false;

    while (current) {
      const text = await getTextInRange(docUri, current.range);
      if (text.includes("sub vcl_recv") && text.includes("}")) {
        foundSubroutine = true;
        break;
      }
      current = current.parent;
    }

    assert.ok(foundSubroutine, "Should have a range covering the subroutine");
  });

  test("Handles multiple positions", async () => {
    const positions = [
      new vscode.Position(5, 10), // Inside vcl_recv
      new vscode.Position(27, 10), // Inside validate_api
    ];

    const ranges = await getSelectionRanges(docUri, positions);

    assert.strictEqual(
      ranges.length,
      2,
      "Should return ranges for each position",
    );
    assert.ok(ranges[0], "Should have range for first position");
    assert.ok(ranges[1], "Should have range for second position");
  });

  test("Selection ranges for nested blocks", async () => {
    const ranges = await getSelectionRanges(docUri, [
      new vscode.Position(14, 15), // Inside nested if (req.http.Authorization)
    ]);

    assert.ok(ranges.length > 0, "Should return selection ranges");

    // Count how many levels of nesting we have
    let current: vscode.SelectionRange | undefined = ranges[0];
    let depth = 0;

    while (current) {
      depth++;
      current = current.parent;
    }

    // Should have multiple levels: word -> line/statement -> block(s)
    assert.ok(
      depth >= 2,
      `Expected at least 2 levels of nesting, got ${depth}`,
    );
  });
});

async function getSelectionRanges(
  docUri: vscode.Uri,
  positions: vscode.Position[],
): Promise<vscode.SelectionRange[]> {
  await activate(docUri);

  // Wait for the language server to be ready
  await waitForSelectionRanges(docUri);

  const ranges = await vscode.commands.executeCommand<vscode.SelectionRange[]>(
    "vscode.executeSelectionRangeProvider",
    docUri,
    positions,
  );

  return ranges || [];
}

async function waitForSelectionRanges(docUri: vscode.Uri, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const ranges = await vscode.commands.executeCommand<
        vscode.SelectionRange[]
      >("vscode.executeSelectionRangeProvider", docUri, [
        new vscode.Position(0, 0),
      ]);
      if (ranges && ranges.length > 0) {
        return;
      }
    } catch {
      // LSP not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function getTextInRange(
  docUri: vscode.Uri,
  range: vscode.Range,
): Promise<string> {
  const doc = await vscode.workspace.openTextDocument(docUri);
  return doc.getText(range);
}
