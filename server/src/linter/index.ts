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

import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

import {
  Diagnostic,
  DiagnosticSeverity,
  Position,
} from "vscode-languageserver/node";

import { VclDocument } from "../shared/vclDocument";
import { buildIncludeClosure } from "./includeClosure";
import { importESM } from "../shared/esmImport";
import { updateDocumentSymbols } from "../symbol-provider";
import { debounce } from "../shared/utils";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LintTextFn = (text: string, options?: any) => Promise<LintResult>;

// The WASI component backend (wasm.mjs) is an ES module: falco-js is not a
// workspace symlink and the component has top-level await, so it must be loaded
// via a real dynamic import (see importESM) -- require() cannot load it. The
// import (and the underlying 9.5 MB wasm compile) is memoized so it happens once.
let backendPromise: Promise<{ lintText: LintTextFn } | null> | null = null;

function loadBackend(): Promise<{ lintText: LintTextFn } | null> {
  if (!backendPromise) {
    const wasmUrl = pathToFileURL(
      join(__dirname, "../../../falco-js/src/wasm.mjs"),
    ).href;
    backendPromise = importESM(wasmUrl).catch((e) => {
      console.error(`Diagnostic service unavailable.`, e.message);
      return null;
    });
  }
  return backendPromise;
}

/**
 * Warm the linter backend: trigger the dynamic import and the one-time wasm
 * compile up front (e.g. at server init) so the first real lint isn't slow.
 */
export async function warmupLinter(): Promise<void> {
  const backend = await loadBackend();
  if (!backend) {
    return;
  }
  try {
    await backend.lintText("sub vcl_recv {\n#FASTLY RECV\n}\n", {});
  } catch {
    // Warmup is best-effort; real lints surface any genuine error.
  }
}

export async function validateVCLDocument(vclDoc: VclDocument): Promise<void> {
  const backend = await loadBackend();

  const settings = await getDocumentSettings(vclDoc.uri);
  if (!settings.lintingEnabled) {
    // Clear any diagnostics published while linting was enabled.
    connection.sendDiagnostics({ uri: vclDoc.uri, diagnostics: [] });
    return;
  }
  if (!backend) {
    return;
  }
  const { lintText } = backend;

  console.debug("lint", vclDoc.uri);
  const vclDocPath = fileURLToPath(vclDoc.uri);

  // The component has no filesystem, so resolve `include`d modules from disk /
  // open buffers here and hand their contents to the linter.
  const closure = buildIncludeClosure(vclDoc.getText(), vclDocPath);

  // TODO: Cache the AST and walk it for context-aware completions, colorization, etc
  let lintResult: LintResult;
  try {
    lintResult = await lintText(vclDoc.getText(), {
      vclFileName: vclDocPath,
      diagnosticsOnly: false, // Set to false to return the full AST (for parseable VCL only)
      includes: closure.includes,
      // Over budget, no modules are supplied, so every include would be
      // reported as unresolvable. The notice added below explains instead.
      rules: closure.overBudget
        ? { "include/module-load-failed": "IGNORE" }
        : undefined,
    });
  } catch (e) {
    // The component throws on fatal errors, such as a stack overflow on very
    // deeply nested expressions. Keep the last good AST and symbols, and
    // replace any stale diagnostics with one saying linting failed.
    const reason = e instanceof Error ? e.message : String(e);
    console.error("lint failed", vclDoc.uri, e);
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

export const debouncedVCLLint = debounce(
  validateVCLDocument,
  DEBOUNCE_INTERVAL,
);
