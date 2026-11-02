import * as vscode from "vscode";

export let doc: vscode.TextDocument;
export let editor: vscode.TextEditor;
export let documentEol: string;
export let platformEol: string;

export async function activate(docUri: vscode.Uri) {
  const ext = vscode.extensions.getExtension("fastly.vscode-fastly-vcl");
  if (!ext) {
    throw new Error("Extension not found");
  }
  await ext.activate();
  try {
    doc = await vscode.workspace.openTextDocument(docUri);
    editor = await vscode.window.showTextDocument(doc);
    await waitForLspReady(docUri);
  } catch (e) {
    console.error(e);
  }
}

async function waitForLspReady(docUri: vscode.Uri, timeout = 30000) {
  // Wait for completion to work (proves LSP is responding)
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const completions =
        await vscode.commands.executeCommand<vscode.CompletionList>(
          "vscode.executeCompletionItemProvider",
          docUri,
          new vscode.Position(0, 0),
        );
      if (completions && completions.items.length > 0) {
        return;
      }
    } catch {
      // LSP not ready yet
    }
    await sleep(100);
  }
}

/**
 * Wait until the number of diagnostics for `docUri` satisfies `predicate`.
 * Resolves to whether it did before `timeout` ms passed.
 */
export async function waitForDiagnosticsCount(
  docUri: vscode.Uri,
  predicate: (count: number) => boolean,
  // Generous: on a cold start the first lints can take several seconds.
  timeout = 30000,
): Promise<boolean> {
  const satisfied = () =>
    predicate(vscode.languages.getDiagnostics(docUri).length);
  if (satisfied()) {
    return true;
  }
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      disposable.dispose();
      resolve(satisfied());
    };
    const disposable = vscode.languages.onDidChangeDiagnostics((e) => {
      if (
        e.uris.some((uri) => uri.toString() === docUri.toString()) &&
        satisfied()
      ) {
        finish();
      }
    });
    const timer = setTimeout(finish, timeout);
  });
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The tests may run in a web worker host (desktop and browser), so fixtures
// are found through the workspace: the runners open client/testFixture as the
// workspace folder.
export const getDocUri = (p: string) => {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!root) {
    throw new Error("Open client/testFixture as the workspace folder");
  }
  return vscode.Uri.joinPath(root, p);
};

export async function setTestContent(content: string): Promise<boolean> {
  const all = new vscode.Range(
    doc.positionAt(0),
    doc.positionAt(doc.getText().length),
  );
  return editor.edit((eb) => eb.replace(all, content));
}
