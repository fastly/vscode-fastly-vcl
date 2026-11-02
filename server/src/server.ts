import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createConnection,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  TextDocumentSyncKind,
  InitializeResult,
} from "vscode-languageserver/browser";

import { ConfigSettings, CONFIG } from "./config";
import { documentCache } from "./shared/documentCache";

import * as completionsProvider from "./completion-provider";
import * as signatureHelpProvider from "./signature-help-provider";
import * as hoverProvider from "./hover-provider";
import * as symbolProvider from "./symbol-provider";
import * as definitionProvider from "./definition-provider";
import * as referencesProvider from "./references-provider";
import * as foldingRangeProvider from "./folding-range-provider";
import * as documentHighlightProvider from "./document-highlight-provider";
import * as renameProvider from "./rename-provider";
import * as inlayHintProvider from "./inlay-hint-provider";
import * as workspaceSymbolProvider from "./workspace-symbol-provider";
import * as selectionRangeProvider from "./selection-range-provider";
import * as semanticTokensProvider from "./semantic-tokens-provider";
import * as formattingProvider from "./formatting-provider";
import * as linter from "./linter";
import { setComponentBaseUrl } from "../../falco-js/src/wasm.mjs";

// The server runs in a Web Worker started by the client; messages arrive on
// the worker's global scope.
export const connection = createConnection(
  ProposedFeatures.all,
  new BrowserMessageReader(self),
  new BrowserMessageWriter(self),
);

// Log unhandled rejections with context instead of leaving them to the
// browser's generic "Uncaught (in promise)". Older jco glue for the falco
// component leaked such a rejection after a stack overflow inside it, even when
// the caller handled the error.
self.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  console.error(
    "Unhandled rejection in the VCL language server:",
    event.reason,
  );
});

let globalConfig: ConfigSettings = CONFIG;
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
export let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  // The worker cannot locate the falco component itself (its location is a
  // blob: URL inside VS Code), so the client says where it is.
  const falcoComponentUrl = params.initializationOptions?.falcoComponentUrl;
  if (typeof falcoComponentUrl === "string") {
    setComponentBaseUrl(falcoComponentUrl);
  }

  // If client doesn't support the `workspace/configuration`, fall back on global settings.
  hasConfigurationCapability = !!capabilities.workspace?.configuration;
  hasWorkspaceFolderCapability = !!capabilities.workspace?.workspaceFolders;

  hasDiagnosticRelatedInformationCapability =
    !!capabilities.textDocument?.publishDiagnostics?.relatedInformation;

  // Announce server capabilities.
  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ["#"],
        completionItem: {
          labelDetailsSupport: true,
        },
      },
      signatureHelpProvider: {
        triggerCharacters: ["("],
      },
      hoverProvider: true,
      documentSymbolProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      foldingRangeProvider: true,
      documentHighlightProvider: true,
      renameProvider: {
        prepareProvider: true,
      },
      inlayHintProvider: true,
      workspaceSymbolProvider: true,
      selectionRangeProvider: true,
      semanticTokensProvider: {
        legend: semanticTokensProvider.legend,
        full: true,
      },
      documentFormattingProvider: true,
    },
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }
  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined,
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.log("Workspace folder changed.");
    });
  }
  // Compile the linter's wasm component now so the first document lint isn't slow.
  linter.warmupLinter();
});

// Cache the settings of all open documents.
const documentSettings: Map<string, Thenable<ConfigSettings>> = new Map();

export function getDocumentSettings(
  resource: string,
): Thenable<ConfigSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalConfig);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: "fastly.vcl",
    });
    documentSettings.set(resource, result);
  }
  return result;
}

connection.onDidChangeConfiguration((change) => {
  if (hasConfigurationCapability) {
    // Reset all cached document settings.
    documentSettings.clear();
  } else {
    globalConfig = <ConfigSettings>(change.settings.fastly.vcl || CONFIG);
  }
  relintAll();
});

function relintAll(): void {
  for (const document of documentCache.all()) {
    linter.validateVCLDocument(document);
  }
}

// Sent by the client when the workspace becomes trusted, so includes it could
// not read in Restricted Mode resolve. Must match client/src/extension.ts.
connection.onNotification("fastly.vcl/relint", relintAll);

connection.onDidOpenTextDocument((params) => {
  // Lint the newly opened document.
  documentCache.set(params.textDocument);
  const document = documentCache.get(params.textDocument.uri);
  if (!document) return;
  linter.validateVCLDocument(document);
});

connection.onDidChangeTextDocument(async (params) => {
  // Apply incremental changes to the cached document.
  documentCache.applyChanges(params);
  const document = documentCache.get(params.textDocument.uri);
  if (!document) return;
  linter.debouncedVCLLint(document);
});

connection.onDidCloseTextDocument((params) => {
  // Only cache open documents and their settings.
  documentSettings.delete(params.textDocument.uri);
  documentCache.delete(params.textDocument.uri);
  linter.forgetDocument(params.textDocument.uri);
});

connection.onCompletion(completionsProvider.query);

connection.onCompletionResolve(completionsProvider.resolve);

connection.onSignatureHelp(signatureHelpProvider.help);

connection.onHover(hoverProvider.resolve);

connection.onDefinition(definitionProvider.resolve);

// How long a symbols request waits for the lint once the document has symbols.
const SYMBOLS_LINT_WAIT = 10_000;

connection.onDocumentSymbol(async (params, token) => {
  // Symbols come from the lint's AST, and VS Code keeps the answer for the
  // document's version, so wait for the lint. Until the document's first lint
  // finishes, wait for as long as it takes (e.g. the falco component's first
  // download on the web): answering early would leave the Outline empty.
  // After that, a slow lint only delays updates, so stop waiting after a while.
  const uri = params.textDocument.uri;
  await linter.lintSettled(uri, {
    token,
    timeout: documentCache.get(uri)?.AST ? SYMBOLS_LINT_WAIT : undefined,
  });
  const document = documentCache.get(params.textDocument.uri);
  if (!document) return [];
  return symbolProvider.getSymbolInformation(document);
});

connection.onReferences(referencesProvider.resolve);

connection.onDocumentHighlight(documentHighlightProvider.resolve);

connection.onFoldingRanges(foldingRangeProvider.resolve);

connection.onPrepareRename(renameProvider.prepare);

connection.onRenameRequest(renameProvider.resolve);

connection.languages.inlayHint.on(inlayHintProvider.resolve);

connection.onWorkspaceSymbol(workspaceSymbolProvider.resolve);

connection.onSelectionRanges(selectionRangeProvider.resolve);

connection.languages.semanticTokens.on(semanticTokensProvider.resolve);

connection.onDocumentFormatting(formattingProvider.resolve);

connection.listen();
