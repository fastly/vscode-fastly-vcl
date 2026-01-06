import * as vscode from "vscode";
import * as assert from "assert";
import { getDocUri, activate } from "./helper";

suite("Should provide folding ranges", () => {
  const docUri = getDocUri("foldingRanges.vcl");

  test("Provides folding ranges for block comment", async () => {
    const ranges = await getFoldingRanges(docUri);

    // Block comment at lines 1-5 (0-indexed: 0-4)
    const blockComment = ranges.find(
      (r) => r.start === 0 && r.kind === vscode.FoldingRangeKind.Comment,
    );
    assert.ok(blockComment, "Should have block comment folding range");
    assert.strictEqual(
      blockComment.end,
      4,
      "Block comment should end at line 4",
    );
  });

  test("Provides folding ranges for consecutive line comments", async () => {
    const ranges = await getFoldingRanges(docUri);

    // Consecutive # comments at lines 7-9 (0-indexed: 6-8)
    const lineComments = ranges.find(
      (r) => r.start === 6 && r.kind === vscode.FoldingRangeKind.Comment,
    );
    assert.ok(lineComments, "Should have line comment folding range");
    assert.strictEqual(
      lineComments.end,
      8,
      "Line comments should end at line 8",
    );
  });

  test("Provides folding ranges for ACL", async () => {
    const ranges = await getFoldingRanges(docUri);

    // ACL at lines 11-15 (0-indexed: 10-14)
    const acl = ranges.find(
      (r) => r.start === 10 && r.kind === vscode.FoldingRangeKind.Region,
    );
    assert.ok(acl, "Should have ACL folding range");
    assert.strictEqual(acl.end, 14, "ACL should end at line 14");
  });

  test("Provides folding ranges for table", async () => {
    const ranges = await getFoldingRanges(docUri);

    // Table at lines 17-21 (0-indexed: 16-20)
    const table = ranges.find(
      (r) => r.start === 16 && r.kind === vscode.FoldingRangeKind.Region,
    );
    assert.ok(table, "Should have table folding range");
    assert.strictEqual(table.end, 20, "Table should end at line 20");
  });

  test("Provides folding ranges for backend", async () => {
    const ranges = await getFoldingRanges(docUri);

    // Backend at lines 23-27 (0-indexed: 22-26)
    const backend = ranges.find(
      (r) => r.start === 22 && r.kind === vscode.FoldingRangeKind.Region,
    );
    assert.ok(backend, "Should have backend folding range");
    assert.strictEqual(backend.end, 26, "Backend should end at line 26");
  });

  test("Provides folding ranges for subroutine", async () => {
    const ranges = await getFoldingRanges(docUri);

    // custom_logic subroutine at lines 29-33 (0-indexed: 28-32)
    const customSub = ranges.find(
      (r) => r.start === 28 && r.kind === vscode.FoldingRangeKind.Region,
    );
    assert.ok(customSub, "Should have custom_logic subroutine folding range");
    assert.strictEqual(customSub.end, 32, "custom_logic should end at line 32");

    // vcl_recv subroutine at lines 35-54 (0-indexed: 34-53)
    const vclRecv = ranges.find(
      (r) => r.start === 34 && r.kind === vscode.FoldingRangeKind.Region,
    );
    assert.ok(vclRecv, "Should have vcl_recv subroutine folding range");
    assert.strictEqual(vclRecv.end, 53, "vcl_recv should end at line 53");
  });

  test("Provides folding ranges for if blocks", async () => {
    const ranges = await getFoldingRanges(docUri);

    // Outer if block at line 37 (0-indexed: 36)
    const outerIf = ranges.find(
      (r) => r.start === 36 && r.kind === vscode.FoldingRangeKind.Region,
    );
    assert.ok(outerIf, "Should have outer if block folding range");
    assert.strictEqual(outerIf.end, 44, "Outer if should end at line 44");

    // Nested if at line 40 (0-indexed: 39) - includes else clause
    const nestedIf = ranges.find(
      (r) => r.start === 39 && r.kind === vscode.FoldingRangeKind.Region,
    );
    assert.ok(nestedIf, "Should have nested if block folding range");
    assert.strictEqual(nestedIf.end, 43, "Nested if should end at line 43");
  });

  test("Returns multiple folding ranges", async () => {
    const ranges = await getFoldingRanges(docUri);

    // Should have: 2 comments + acl + table + backend + 4 subs + multiple if blocks
    assert.ok(
      ranges.length >= 10,
      `Expected at least 10 folding ranges, got ${ranges.length}`,
    );
  });
});

async function getFoldingRanges(
  docUri: vscode.Uri,
): Promise<vscode.FoldingRange[]> {
  await activate(docUri);

  // Wait for the language server to be ready
  await waitForFoldingRanges(docUri);

  const ranges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
    "vscode.executeFoldingRangeProvider",
    docUri,
  );

  return ranges || [];
}

async function waitForFoldingRanges(docUri: vscode.Uri, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const ranges = await vscode.commands.executeCommand<
        vscode.FoldingRange[]
      >("vscode.executeFoldingRangeProvider", docUri);
      // Wait until we have both comment and region ranges (AST-based)
      const hasComments = ranges?.some(
        (r) => r.kind === vscode.FoldingRangeKind.Comment,
      );
      const hasRegions = ranges?.some(
        (r) => r.kind === vscode.FoldingRangeKind.Region,
      );
      if (hasComments && hasRegions) {
        return;
      }
    } catch {
      // LSP not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
