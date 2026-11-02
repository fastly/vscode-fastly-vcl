import * as vscode from "vscode";
import * as assert from "assert";

suite("Should run in a web worker extension host", () => {
  test("Runs the extension and its tests in a web worker", () => {
    // VS Code runs the tests in the same host as the extension under test.
    assert.ok(
      typeof (globalThis as { WorkerGlobalScope?: unknown })
        .WorkerGlobalScope !== "undefined",
      "Expected a web worker extension host",
    );
  });

  test("Loads the extension from file: URIs on desktop", function () {
    if (vscode.env.uiKind !== vscode.UIKind.Desktop) {
      this.skip();
    }
    // So on desktop the lint and format tests cover the server fetching the
    // falco component from a file: URL.
    const ext = vscode.extensions.getExtension("fastly.vscode-fastly-vcl");
    assert.equal(ext?.extensionUri.scheme, "file");
  });
});
