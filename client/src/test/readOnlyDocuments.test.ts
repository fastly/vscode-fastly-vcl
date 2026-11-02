import * as vscode from "vscode";
import * as assert from "assert";

import { activate, getDocUri, waitForDiagnosticsCount } from "./helper";

suite("Should not lint read-only views of documents", () => {
  const controlUri = getDocUri("readOnlyControl.vcl");

  teardown(async () => {
    try {
      await vscode.workspace.fs.delete(controlUri);
    } catch {
      // Already gone.
    }
  });

  test("Ignores documents from other providers, such as git diffs", async () => {
    // Stands in for the git: side of a Source Control diff: a read-only VCL
    // document from a content provider, with lint errors in it.
    const scheme = "vcl-readonly-test";
    const source = await vscode.workspace.fs.readFile(
      getDocUri("diagnostics.vcl"),
    );
    const provider = vscode.workspace.registerTextDocumentContentProvider(
      scheme,
      { provideTextDocumentContent: () => new TextDecoder().decode(source) },
    );
    try {
      const ext = vscode.extensions.getExtension("fastly.vscode-fastly-vcl");
      await ext?.activate();
      const uri = vscode.Uri.from({ scheme, path: "/diagnostics.vcl" });
      const doc = await vscode.workspace.openTextDocument(uri);
      assert.equal(doc.languageId, "vcl");
      await vscode.window.showTextDocument(doc);

      // Then open a file with the same text. The client sends opens in
      // order and both lints take the same time, so once the file's
      // diagnostics arrive the server is ready and would have linted the
      // read-only document too, had the client sent it.
      await vscode.workspace.fs.writeFile(controlUri, source);
      await activate(controlUri);
      assert.ok(
        await waitForDiagnosticsCount(controlUri, (count) => count > 0),
        "Expected diagnostics for the same text in a file",
      );

      const diagnostics = vscode.languages.getDiagnostics(uri);
      assert.equal(
        diagnostics.length,
        0,
        `Expected no diagnostics, got: ${diagnostics.map((d) => d.message).join("; ")}`,
      );
    } finally {
      provider.dispose();
    }
  });
});
