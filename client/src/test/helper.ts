import * as vscode from "vscode";
import * as path from "path";

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

async function waitForLspReady(docUri: vscode.Uri, timeout = 5000) {
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

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const getDocPath = (p: string) => {
  return path.resolve(__dirname, "../../testFixture", p);
};
export const getDocUri = (p: string) => {
  return vscode.Uri.file(getDocPath(p));
};

export async function setTestContent(content: string): Promise<boolean> {
  const all = new vscode.Range(
    doc.positionAt(0),
    doc.positionAt(doc.getText().length),
  );
  return editor.edit((eb) => eb.replace(all, content));
}
