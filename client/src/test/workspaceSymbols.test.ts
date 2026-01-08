import * as vscode from "vscode";
import * as assert from "assert";
import { getDocUri, activate } from "./helper";

suite("Should provide workspace symbols", () => {
  const docUri = getDocUri("boilerplate.vcl");

  test("Returns symbols matching query", async () => {
    await activate(docUri);

    // Wait for symbols to be available
    await waitForWorkspaceSymbols("vcl_recv");

    // Search for a specific subroutine
    const symbols = (await vscode.commands.executeCommand(
      "vscode.executeWorkspaceSymbolProvider",
      "vcl_recv",
    )) as vscode.SymbolInformation[];

    assert.ok(symbols, "Expected symbols to be returned");
    assert.ok(symbols.length > 0, "Expected at least one matching symbol");

    const symbolNames = symbols.map((s) => s.name);
    assert.ok(
      symbolNames.includes("vcl_recv"),
      `Expected "vcl_recv" to be in results, got: ${symbolNames.join(", ")}`,
    );
  });

  test("Returns multiple matching symbols", async () => {
    await activate(docUri);

    // Search for "vcl_" which should match multiple subroutines
    const symbols = (await vscode.commands.executeCommand(
      "vscode.executeWorkspaceSymbolProvider",
      "vcl_",
    )) as vscode.SymbolInformation[];

    assert.ok(symbols, "Expected symbols to be returned");
    assert.ok(
      symbols.length >= 9,
      `Expected at least 9 vcl_ subroutines, got ${symbols.length}`,
    );

    const symbolNames = symbols.map((s) => s.name);
    const expectedSubroutines = [
      "vcl_recv",
      "vcl_hash",
      "vcl_hit",
      "vcl_miss",
      "vcl_pass",
      "vcl_fetch",
      "vcl_error",
      "vcl_deliver",
      "vcl_log",
    ];

    for (const sub of expectedSubroutines) {
      assert.ok(
        symbolNames.includes(sub),
        `Expected "${sub}" to be in results, got: ${symbolNames.join(", ")}`,
      );
    }
  });

  test("Returns empty array for non-matching query", async () => {
    await activate(docUri);

    // Search for something that doesn't exist
    const symbols = (await vscode.commands.executeCommand(
      "vscode.executeWorkspaceSymbolProvider",
      "nonexistent_symbol_xyz123",
    )) as vscode.SymbolInformation[];

    assert.ok(Array.isArray(symbols), "Expected array to be returned");
    assert.strictEqual(
      symbols.length,
      0,
      "Expected no matches for nonexistent symbol",
    );
  });

  test("Query is case-insensitive", async () => {
    await activate(docUri);

    // Search with uppercase
    const upperSymbols = (await vscode.commands.executeCommand(
      "vscode.executeWorkspaceSymbolProvider",
      "VCL_RECV",
    )) as vscode.SymbolInformation[];

    // Search with lowercase
    const lowerSymbols = (await vscode.commands.executeCommand(
      "vscode.executeWorkspaceSymbolProvider",
      "vcl_recv",
    )) as vscode.SymbolInformation[];

    assert.ok(upperSymbols.length > 0, "Expected uppercase query to match");
    assert.ok(lowerSymbols.length > 0, "Expected lowercase query to match");
    assert.strictEqual(
      upperSymbols.length,
      lowerSymbols.length,
      "Expected same number of results regardless of case",
    );
  });

  test("Symbols include location information", async () => {
    await activate(docUri);

    const symbols = (await vscode.commands.executeCommand(
      "vscode.executeWorkspaceSymbolProvider",
      "vcl_recv",
    )) as vscode.SymbolInformation[];

    assert.ok(symbols.length > 0, "Expected at least one symbol");

    const vclRecv = symbols.find((s) => s.name === "vcl_recv");
    assert.ok(vclRecv, "Expected to find vcl_recv symbol");
    assert.ok(vclRecv.location, "Expected symbol to have location");
    assert.ok(vclRecv.location.uri, "Expected location to have uri");
    assert.ok(vclRecv.location.range, "Expected location to have range");
  });

  test("Empty query returns all symbols", async () => {
    await activate(docUri);

    const symbols = (await vscode.commands.executeCommand(
      "vscode.executeWorkspaceSymbolProvider",
      "",
    )) as vscode.SymbolInformation[];

    assert.ok(symbols, "Expected symbols to be returned");
    // boilerplate.vcl has 9 subroutines, so we should get at least that many
    assert.ok(
      symbols.length >= 9,
      `Expected at least 9 symbols for empty query, got ${symbols.length}`,
    );
  });
});

/**
 * Waits for workspace symbols to become available.
 * Polls until at least one symbol matches the query or timeout is reached.
 */
async function waitForWorkspaceSymbols(
  query: string,
  timeout = 30000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const symbols = (await vscode.commands.executeCommand(
      "vscode.executeWorkspaceSymbolProvider",
      query,
    )) as vscode.SymbolInformation[];
    if (symbols && symbols.length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
