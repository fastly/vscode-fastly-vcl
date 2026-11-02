/**
 * VCL Diagnostics Provider
 *
 * This module provides linting and diagnostics for Fastly VCL files by integrating
 * with the falco linter (https://github.com/ysugimoto/falco).
 *
 * ## Implementation
 *
 * 1. When a VCL document changes, `validateVCLDocument()` is called (debounced to
 *    avoid excessive linting during rapid typing).
 *
 * 2. The function invokes falco via the `falco-js` wrapper, which runs the platform-
 *    specific falco binary and returns parse errors, lint errors, and an AST.
 *
 * 3. Parse errors (syntax errors) and lint errors (style/best-practice violations)
 *    are converted into LSP `Diagnostic` objects with appropriate severity levels.
 *
 * 4. Diagnostics are published to VS Code via `connection.sendDiagnostics()`,
 *    which displays them in the Problems panel and as inline squiggles.
 *
 * ## Configuration
 *
 * - `fastly.vcl.lintingEnabled` - Enable/disable linting
 * - `fastly.vcl.maxLintingIssues` - Maximum number of issues to report
 */

import {
  CancellationTokenSource,
  Diagnostic,
  DiagnosticSeverity,
  Position,
} from "vscode-languageserver/browser";

import { VclDocument } from "../shared/vclDocument";
import { buildIncludeClosure, ReadFile, ReadResult } from "./includeClosure";
import { LintTracker, SettleOptions } from "./lintTracker";
import { documentCache } from "../shared/documentCache";
import { lintText as falcoLintText } from "../../../falco-js/src/wasm.mjs";
import { updateDocumentSymbols } from "../symbol-provider";
import { ASTNode } from "../shared/ast";

import {
  getDocumentSettings,
  hasDiagnosticRelatedInformationCapability,
  connection,
} from "../server";

const DEBOUNCE_INTERVAL = 1000;

export enum LintErrorSeverity {
  Error = "Error",
  Warning = "Warning",
  Info = "Info",
}

export function translateSeverity(sev: LintErrorSeverity): DiagnosticSeverity {
  switch (sev) {
    case LintErrorSeverity.Error:
      return DiagnosticSeverity.Error;
    case LintErrorSeverity.Warning:
      return DiagnosticSeverity.Warning;
    default:
      return DiagnosticSeverity.Information;
  }
}

export interface Token {
  Type: string;
  Literal: string;
  Line: number;
  Position: number;
  Offset: number;
  File: string;
  Snippet: boolean;
}

export interface ParseError {
  Message: string;
  Token: Token;
}
export interface LintError extends ParseError {
  Severity: LintErrorSeverity;
  Rule: string;
  Reference: string;
}

interface ErrorMap<T> {
  [file: string]: T;
}

export interface Vcl {
  AST: ASTNode;
}

export interface LintResult {
  LintErrors: ErrorMap<LintError[]>;
  ParseErrors: ErrorMap<ParseError>;
  Infos: number;
  Warnings: number;
  Errors: number;
  Vcl?: Vcl;
}

const lintText = falcoLintText as (
  ...args: Parameters<typeof falcoLintText>
) => Promise<LintResult>;

/**
 * Warm the linter backend: trigger the one-time wasm fetch and compile up
 * front (e.g. at server init) so the first real lint isn't slow.
 */
export async function warmupLinter(): Promise<void> {
  try {
    await lintText("sub vcl_recv {\n#FASTLY RECV\n}\n", {});
  } catch (e) {
    // Real lints surface any genuine error; log so a missing component shows.
    console.error("VCL linter warmup failed", e);
  }
}

// The server has no file system access, so files that are not open (included
// modules) are read by the client through workspace.fs. Must match the
// handler in client/src/extension.ts.
const READ_FILE_REQUEST = "fastly.vcl/readFile";

// buildIncludeClosure bounds how long reads take and aborts the ones it no
// longer needs; cancel those requests so the client can drop them.
const readFile: ReadFile = async (uri, signal) => {
  const source = new CancellationTokenSource();
  const cancel = () => source.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    return await connection.sendRequest<ReadResult>(
      READ_FILE_REQUEST,
      { uri },
      source.token,
    );
  } finally {
    signal.removeEventListener("abort", cancel);
    source.dispose();
  }
};

// VS Code caches document symbols per document version and LSP has no request
// to refresh them, so a symbols request answered before the document's lint
// finishes would leave the Outline empty until the next edit; requests wait
// via lintSettled. Lints of one document can also overlap, since resolving
// includes awaits the client; only the latest may publish.
const lints = new LintTracker();

export function validateVCLDocument(vclDoc: VclDocument): Promise<void> {
  const isLatest = lints.start(vclDoc.uri);
  return lints.track(vclDoc.uri, lintDocument(vclDoc, isLatest));
}

/**
 * Wait for the document's lint in progress or queued after an edit, if any,
 * so its AST is current. See LintTracker.settled for the options.
 */
export function lintSettled(
  uri: string,
  options?: SettleOptions,
): Promise<void> {
  return lints.settled(uri, options);
}

/**
 * Stop a closed document's lint in progress from publishing, and drop its
 * queued lint.
 */
export function forgetDocument(uri: string): void {
  lints.forget(uri);
}

async function lintDocument(
  vclDoc: VclDocument,
  isLatest: () => boolean,
): Promise<void> {
  // Snapshot the text: getting settings and resolving includes await the
  // client, during which the document can change.
  const text = vclDoc.getText();
  const version = vclDoc.doc.version;
  // Publish only while this is the document's latest lint, for the same open
  // document and text: a newer lint (after an edit or a settings change) or
  // closing the document supersedes it, so its results or failure never
  // replace newer ones, and the AST is never marked current for other text.
  const isCurrent = () =>
    isLatest() &&
    documentCache.get(vclDoc.uri) === vclDoc &&
    vclDoc.doc.version === version;

  try {
    await lintAndPublish(vclDoc, text, isLatest, isCurrent);
  } catch (e) {
    // E.g. the component throws on fatal errors, such as a stack overflow on
    // very deeply nested expressions. Keep the last good AST and symbols, and
    // replace any stale diagnostics with one saying linting failed.
    const reason = e instanceof Error ? e.message : String(e);
    console.error("lint failed", vclDoc.uri, e);
    if (!isCurrent()) {
      return;
    }
    connection.sendDiagnostics({
      uri: vclDoc.uri,
      diagnostics: [
        {
          severity: DiagnosticSeverity.Warning,
          range: {
            start: Position.create(0, 0),
            end: Position.create(0, 0),
          },
          message: `The VCL linter failed on this file: ${reason}`,
          source: "vcl",
        },
      ],
    });
  }
}

async function lintAndPublish(
  vclDoc: VclDocument,
  text: string,
  isLatest: () => boolean,
  isCurrent: () => boolean,
): Promise<void> {
  const settings = await getDocumentSettings(vclDoc.uri);
  if (!settings.lintingEnabled) {
    // Clear any diagnostics published while linting was enabled.
    if (isLatest()) {
      connection.sendDiagnostics({ uri: vclDoc.uri, diagnostics: [] });
    }
    return;
  }

  console.debug("lint", vclDoc.uri);
  // The main source's key in falco's results. Any unique name works; the URI
  // also covers documents with no file path (untitled, virtual workspaces).
  const vclDocPath = vclDoc.uri;

  // The component has no filesystem, so resolve `include`d modules from open
  // buffers / the client's file system here and hand their contents to the
  // linter.
  const closure = await buildIncludeClosure(text, vclDoc.uri, readFile);

  // TODO: Cache the AST and walk it for context-aware completions, colorization, etc
  const lintResult = await lintText(text, {
    vclFileName: vclDocPath,
    diagnosticsOnly: false, // Set to false to return the full AST (for parseable VCL only)
    includes: closure.includes,
    // Over budget, no modules are supplied, so every include would be
    // reported as unresolvable. The notice added below explains instead.
    rules: closure.overBudget
      ? { "include/module-load-failed": "IGNORE" }
      : undefined,
  });

  if (!isCurrent()) {
    return;
  }

  vclDoc.AST = lintResult.Vcl?.AST;

  updateDocumentSymbols(vclDoc);

  // Notify client to refresh semantic tokens now that AST is updated
  connection.languages.semanticTokens.refresh();

  let problems = 0;
  const diagnostics: Diagnostic[] = [];

  if (lintResult.ParseErrors[vclDocPath]) {
    const pE = lintResult.ParseErrors[vclDocPath];
    problems++;
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: {
        start: Position.create(pE.Token.Line - 1, pE.Token.Position - 1),
        end: Position.create(
          pE.Token.Line - 1,
          pE.Token.Position - 1 + pE.Token.Literal.length,
        ),
      },
      message: pE.Message,
    });
  }

  for (const lE of lintResult.LintErrors[vclDocPath] || []) {
    if (problems > settings.maxLintingIssues) {
      break;
    }
    const diagnostic: Diagnostic = {
      severity: translateSeverity(lE.Severity),
      range: {
        start: Position.create(lE.Token.Line - 1, lE.Token.Position - 1),
        end: Position.create(lE.Token.Line - 1, lE.Token.Position - 1),
      },
      message: lE.Message,
      code: lE.Rule,
      source: "vcl",
    };
    if (
      hasDiagnosticRelatedInformationCapability &&
      lE.Token.File !== vclDocPath
    ) {
      diagnostic.relatedInformation = [
        {
          location: {
            uri: `file://${lE.Token.File}`,
            range: Object.assign({}, diagnostic.range),
          },
          message: lE.Message,
        },
      ];
    }

    problems++;
    diagnostics.push(diagnostic);
  }

  for (const cycle of closure.cycles) {
    const at = Position.create(cycle.line, cycle.character);
    diagnostics.unshift({
      severity: DiagnosticSeverity.Warning,
      range: { start: at, end: at },
      message: `Cyclic include: ${cycle.chain.map((m) => `"${m}"`).join(" -> ")}. The repeated include was skipped when linting.`,
      source: "vcl",
    });
  }

  if (closure.overBudget) {
    diagnostics.unshift({
      severity: DiagnosticSeverity.Information,
      range: {
        start: Position.create(0, 0),
        end: Position.create(0, 0),
      },
      message:
        "Included files are too large for the VCL linter; cross-file checks were skipped and only this file was linted.",
      source: "vcl",
    });
  }

  connection.sendDiagnostics({ uri: vclDoc.uri, diagnostics });
}

export function debouncedVCLLint(vclDoc: VclDocument): void {
  lints.debounce(vclDoc.uri, DEBOUNCE_INTERVAL, () => {
    validateVCLDocument(vclDoc);
  });
}
