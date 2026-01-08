import * as vscode from "vscode";
import * as assert from "assert";
import { getDocUri, activate } from "./helper";

suite("Should provide inlay hints", () => {
  const docUri = getDocUri("inlayHints.vcl");

  test("Shows type hints on variable assignments", async () => {
    await activate(docUri);
    await waitForInlayHints(docUri);

    // Get hints for the first subroutine (compute_hash)
    // Should have hints only on SET statements, not on declarations or parameters
    const hints = await getInlayHints(
      docUri,
      new vscode.Range(new vscode.Position(0, 0), new vscode.Position(7, 0)),
    );

    // Should have hints for set statements only:
    // - set var.result = var.input (line 3, 0-indexed)
    // - set var.counter = 0 (line 4, 0-indexed)
    assert.strictEqual(
      hints.length,
      2,
      `Expected 2 hints on SET statements, got ${hints.length}`,
    );

    // Verify hints are on the correct lines (SET statements, not declarations)
    const hintLines = hints.map((h) => h.position.line);
    assert.ok(
      hintLines.includes(3),
      "Expected hint on line 3 (set var.result)",
    );
    assert.ok(
      hintLines.includes(4),
      "Expected hint on line 4 (set var.counter)",
    );
  });

  test("Shows different type hints on assignments", async () => {
    await activate(docUri);
    await waitForInlayHints(docUri);

    // Get hints for vcl_recv (lines 14-28, 0-indexed) - only SET statements should have hints
    const hints = await getInlayHints(
      docUri,
      new vscode.Range(new vscode.Position(14, 0), new vscode.Position(29, 0)),
    );

    // Should have 6 hints for set statements:
    // 4 local vars (IP, TIME, RTIME, FLOAT) + 2 built-in vars (BACKEND, BOOL)
    assert.strictEqual(
      hints.length,
      6,
      `Expected 6 hints, got ${hints.length}`,
    );

    // Check for different type hints
    const hintLabels = hints.map((h) => getLabelText(h.label));
    assert.ok(hintLabels.includes(": IP"), "Expected IP type hint");
    assert.ok(hintLabels.includes(": TIME"), "Expected TIME type hint");
    assert.ok(hintLabels.includes(": RTIME"), "Expected RTIME type hint");
    assert.ok(hintLabels.includes(": FLOAT"), "Expected FLOAT type hint");
    assert.ok(hintLabels.includes(": BACKEND"), "Expected BACKEND type hint");
    assert.ok(hintLabels.includes(": BOOL"), "Expected BOOL type hint");
  });

  test("Hints have correct kind (Type)", async () => {
    await activate(docUri);
    await waitForInlayHints(docUri);

    const hints = await getInlayHints(
      docUri,
      new vscode.Range(new vscode.Position(0, 0), new vscode.Position(47, 0)),
    );

    for (const hint of hints) {
      assert.strictEqual(
        hint.kind,
        vscode.InlayHintKind.Type,
        "All hints should be Type hints",
      );
    }
  });

  test("No hints on declarations or parameters", async () => {
    await activate(docUri);
    await waitForInlayHints(docUri);

    // Get hints for validate_request subroutine (lines 8-13, 0-indexed)
    const hints = await getInlayHints(
      docUri,
      new vscode.Range(new vscode.Position(8, 0), new vscode.Position(13, 0)),
    );

    // Should have only 1 hint on the SET statement (line 10, 0-indexed), not on param or declare
    assert.strictEqual(
      hints.length,
      1,
      `Expected 1 hint on SET, got ${hints.length}`,
    );
    assert.strictEqual(
      hints[0].position.line,
      10,
      "Hint should be on line 10 (set statement)",
    );
  });

  test("Shows hints for all SET statements in subroutine", async () => {
    await activate(docUri);
    await waitForInlayHints(docUri);

    // Get hints for concat_values subroutine (lines 38-46, 0-indexed)
    const hints = await getInlayHints(
      docUri,
      new vscode.Range(new vscode.Position(38, 0), new vscode.Position(47, 0)),
    );

    // Should have 3 hints for set statements only (not declares)
    assert.strictEqual(
      hints.length,
      3,
      `Expected 3 hints on SET statements, got ${hints.length}`,
    );

    // All should be STRING type
    const stringHints = hints.filter(
      (h) => getLabelText(h.label) === ": STRING",
    );
    assert.strictEqual(
      stringHints.length,
      3,
      `Expected 3 STRING hints, got ${stringHints.length}`,
    );
  });

  test("Shows type hints for built-in VCL variables", async () => {
    await activate(docUri);
    await waitForInlayHints(docUri);

    // Get hints for vcl_fetch subroutine which uses beresp.* variables (lines 31-36, 0-indexed)
    const hints = await getInlayHints(
      docUri,
      new vscode.Range(new vscode.Position(31, 0), new vscode.Position(36, 0)),
    );

    // Should have hints for beresp.ttl, beresp.grace, beresp.stale_if_error
    assert.strictEqual(
      hints.length,
      3,
      `Expected 3 hints for built-in variables, got ${hints.length}`,
    );

    const hintLabels = hints.map((h) => getLabelText(h.label));
    assert.ok(
      hintLabels.includes(": RTIME"),
      "Expected RTIME type hint for beresp.ttl",
    );
    assert.ok(
      hintLabels.filter((l) => l === ": RTIME").length === 3,
      "All beresp timing variables should be RTIME",
    );
  });
});

async function getInlayHints(
  docUri: vscode.Uri,
  range: vscode.Range,
): Promise<vscode.InlayHint[]> {
  return (
    (await vscode.commands.executeCommand<vscode.InlayHint[]>(
      "vscode.executeInlayHintProvider",
      docUri,
      range,
    )) || []
  );
}

async function waitForInlayHints(docUri: vscode.Uri, timeout = 5000) {
  const start = Date.now();
  const fullRange = new vscode.Range(
    new vscode.Position(0, 0),
    new vscode.Position(100, 0),
  );
  while (Date.now() - start < timeout) {
    try {
      const hints = await vscode.commands.executeCommand<vscode.InlayHint[]>(
        "vscode.executeInlayHintProvider",
        docUri,
        fullRange,
      );
      // Wait until we get at least one hint (AST is ready)
      if (hints && hints.length > 0) {
        return;
      }
    } catch {
      // LSP not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function getLabelText(label: string | vscode.InlayHintLabelPart[]): string {
  if (typeof label === "string") {
    return label;
  }
  return label.map((part) => part.value).join("");
}
