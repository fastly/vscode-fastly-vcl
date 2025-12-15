import { workspace, window, ExtensionContext } from "vscode";

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

export async function activate(context: ExtensionContext) {
  const outputChannel = window.createOutputChannel("Fastly VCL");
  const serverModule = require.resolve("fastly-vcl-lsp");
  // If the extension is launched in debug mode then the debug server options are used.
  // Otherwise run options are used.
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
  };

  // Options to control the language client.
  const clientOptions: LanguageClientOptions = {
    // Register the server for VCL documents.
    documentSelector: [
      { scheme: "file", language: "vcl", pattern: "**/*.vcl" },
    ],
    diagnosticCollectionName: "vcl",
    synchronize: {
      // Notify the server about file changes to config files contained in the workspace.
      fileEvents: [workspace.createFileSystemWatcher("**/.vclrc")],
    },
    outputChannel,
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    "vcl",
    "Fastly VCL Server",
    serverOptions,
    clientOptions,
  );

  context.subscriptions.push(client);

  outputChannel.appendLine("Starting Fastly VCL language server...");
  try {
    await client.start();
  } catch (e) {
    outputChannel.appendLine(`Failed to start VCL server: ${e}`);
  }
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
