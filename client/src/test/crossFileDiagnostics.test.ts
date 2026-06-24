import * as vscode from "vscode";
import * as assert from "assert";
import { getDocUri, activate } from "./helper";

suite("Should attribute cross-file diagnostics", () => {
  const mainUri = getDocUri("crossfile-main.vcl");
  const includedUri = getDocUri("crossfile-included.vcl");

  test("Reports included-file errors against the included file", async () => {
    await activate(mainUri);

    // The error lives in the included file, so diagnostics should be published
    // against the included file's URI, not the (clean) main file.
    const diagnostics = await waitForDiagnostics(includedUri, 1);

    assert.ok(
      diagnostics.length >= 1,
      "Expected diagnostics on the included file",
    );

    const undefinedVarError = diagnostics.find((d) =>
      /undefined_var/.test(d.message),
    );
    assert.ok(
      undefinedVarError,
      "Expected an 'undefined variable' error in the included file",
    );

    // The error is on the second line of the included file (0-based line 1),
    // proving the position is relative to the included file, not the main file.
    assert.strictEqual(undefinedVarError.range.start.line, 1);

    // The main file has no errors of its own.
    const mainDiagnostics = vscode.languages.getDiagnostics(mainUri);
    assert.strictEqual(
      mainDiagnostics.length,
      0,
      "Expected no diagnostics on the main file",
    );
  });
});

async function waitForDiagnostics(
  docUri: vscode.Uri,
  minCount: number,
  timeout = 5000,
): Promise<vscode.Diagnostic[]> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const diagnostics = vscode.languages.getDiagnostics(docUri);
    if (diagnostics.length >= minCount) {
      return diagnostics;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return vscode.languages.getDiagnostics(docUri);
}
