import { workspace, window, ExtensionContext, Uri } from "vscode";

import {
  LanguageClient,
  LanguageClientOptions,
} from "vscode-languageclient/browser";

import { readIncludedFile } from "./readFile";

let client: LanguageClient | undefined;

// The server runs in a Web Worker with no file system access, so it asks the
// client for files that are not open (included modules). Must match
// READ_FILE_REQUEST in server/src/linter/index.ts.
const READ_FILE_REQUEST = "fastly.vcl/readFile";

// Asks the server to lint open documents again. Must match server/src/server.ts.
const RELINT_NOTIFICATION = "fastly.vcl/relint";

const DOCUMENT_SCHEMES = [
  "file",
  "untitled",
  "vscode-remote",
  "vscode-vfs",
  "vscode-test-web",
];

export async function activate(context: ExtensionContext) {
  const outputChannel = window.createOutputChannel("Fastly VCL");

  // Installed on a remote host (e.g. from a dev container's extension list)
  // but run in the browser or the local web worker host, the extension's
  // files are vscode-remote: URIs. VS Code cannot start a worker from those,
  // and the server could not fetch the falco component from them either.
  if (context.extensionUri.scheme === "vscode-remote") {
    const message =
      "Fastly VCL can't start its language server because the extension is installed on the remote host. Install it locally (or in the browser) instead, e.g. remove it from the dev container's extensions list.";
    outputChannel.appendLine(message);
    window.showErrorMessage(message);
    return;
  }

  const serverMain = Uri.joinPath(
    context.extensionUri,
    "server",
    "dist",
    "server.js",
  );
  // VS Code wraps the worker in a blob: URL, so the server cannot find the
  // falco component relative to itself.
  const falcoComponentUrl = Uri.joinPath(
    context.extensionUri,
    "falco-js",
    "component",
  ).toString(true);

  // Options to control the language client.
  const clientOptions: LanguageClientOptions = {
    // Register the server for VCL documents people edit: local and remote
    // files, new files, github.dev and VS Code for the Web. Not read-only
    // views such as the git: side of a diff, which would duplicate the file's
    // diagnostics and fail to resolve its includes.
    documentSelector: DOCUMENT_SCHEMES.map((scheme) => ({
      scheme,
      language: "vcl",
    })),
    diagnosticCollectionName: "vcl",
    initializationOptions: { falcoComponentUrl },
    synchronize: {
      configurationSection: "fastly.vcl",
    },
    outputChannel,
  };

  outputChannel.appendLine("Starting Fastly VCL language server...");
  try {
    // Create the language client and start the client.
    const languageClient = new LanguageClient(
      "vcl",
      "Fastly VCL Server",
      clientOptions,
      new Worker(serverMain.toString(true)),
    );
    client = languageClient;

    languageClient.onRequest(
      READ_FILE_REQUEST,
      ({ uri }: { uri: string }, token) => readIncludedFile(uri, token),
    );

    // Includes outside the workspace folders are not read in Restricted
    // Mode; lint again once they can be.
    context.subscriptions.push(
      languageClient,
      workspace.onDidGrantWorkspaceTrust(() =>
        languageClient.sendNotification(RELINT_NOTIFICATION),
      ),
    );

    await languageClient.start();
  } catch (e) {
    const message = `Fastly VCL failed to start its language server: ${e}`;
    outputChannel.appendLine(message);
    window.showErrorMessage(message);
  }
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
