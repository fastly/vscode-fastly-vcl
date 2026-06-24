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
 * 2. The function invokes falco via the `falco-js` wrapper, which runs the
 *    falco WebAssembly module and returns parse errors, lint errors, and an AST.
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
  Diagnostic,
  DiagnosticSeverity,
  Position,
} from "vscode-languageserver/node";

import { VclDocument } from "../shared/vclDocument";
import { documentCache } from "../shared/documentCache";
import { updateDocumentSymbols } from "../symbol-provider";
import { debounce } from "../shared/utils";
import { ASTNode } from "../shared/ast";

import { getDocumentSettings, connection } from "../server";

const DEBOUNCE_INTERVAL = 1000;

// Tracks, per source document URI, the set of file URIs it last published
// diagnostics to, so stale cross-file diagnostics can be cleared on re-lint.
const publishedByDocument = new Map<string, Set<string>>();

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

export async function validateVCLDocument(vclDoc: VclDocument): Promise<void> {
  // Use relative path to falco-js since the npm workspace symlink is excluded from the packaged extension
  const { lintText } = await import("../../../falco-js/src/index.js").catch(
    (e) => {
      // If the Wasm module cannot be loaded, fail gracefully.
      console.error(`Diagnostic service unavailable.`, e.message);
      return { lintText: null };
    },
  );

  const settings = await getDocumentSettings(vclDoc.uri);
  if (!lintText || !settings.lintingEnabled) {
    return;
  }

  console.debug("lint", vclDoc.uri);
  // Remove file://
  const vclDocPath = vclDoc.uri.slice(7);

  // TODO: Cache the AST and walk it for context-aware completions, colorization, etc
  const lintResult = (await lintText(vclDoc.getText(), {
    vclFileName: vclDocPath,
    diagnosticsOnly: false, // Set to false to return the full AST (for parseable VCL only)
  })) as LintResult;

  vclDoc.AST = lintResult.Vcl?.AST;

  updateDocumentSymbols(vclDoc);

  // Notify client to refresh semantic tokens now that AST is updated
  connection.languages.semanticTokens.refresh();

  let problems = 0;
  // Group diagnostics by the absolute path of the file they belong to, so
  // errors originating in included files are attributed to those files rather
  // than mis-positioned in the main document.
  const byFile = new Map<string, Diagnostic[]>();
  const diagnosticsFor = (file: string): Diagnostic[] => {
    let list = byFile.get(file);
    if (!list) {
      list = [];
      byFile.set(file, list);
    }
    return list;
  };

  // Parse errors only occur in the main document.
  if (lintResult.ParseErrors[vclDocPath]) {
    const pE = lintResult.ParseErrors[vclDocPath];
    problems++;
    diagnosticsFor(vclDocPath).push({
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

  collect: for (const [file, lintErrors] of Object.entries(
    lintResult.LintErrors,
  )) {
    for (const lE of lintErrors) {
      if (problems > settings.maxLintingIssues) {
        break collect;
      }
      diagnosticsFor(file).push({
        severity: translateSeverity(lE.Severity),
        range: {
          start: Position.create(lE.Token.Line - 1, lE.Token.Position - 1),
          end: Position.create(lE.Token.Line - 1, lE.Token.Position - 1),
        },
        message: lE.Message,
        code: lE.Rule,
        source: "vcl",
      });
      problems++;
    }
  }

  // Always publish for the main document so its diagnostics clear when fixed.
  if (!byFile.has(vclDocPath)) {
    byFile.set(vclDocPath, []);
  }

  const published = new Set<string>();
  for (const [file, diagnostics] of byFile) {
    const uri = `file://${file}`;
    // Open documents are linted on their own and own their diagnostics; don't
    // clobber them from another document's lint.
    if (uri !== vclDoc.uri && documentCache.isOpen(uri)) {
      continue;
    }
    connection.sendDiagnostics({ uri, diagnostics });
    published.add(uri);
  }

  // Clear diagnostics for files this document previously reported on but no
  // longer does (e.g. an include was removed or its errors were fixed).
  const previous = publishedByDocument.get(vclDoc.uri);
  if (previous) {
    for (const uri of previous) {
      if (!published.has(uri)) {
        connection.sendDiagnostics({ uri, diagnostics: [] });
      }
    }
  }
  publishedByDocument.set(vclDoc.uri, published);
}

// Clear all diagnostics a document published (its own and any cross-file
// diagnostics it reported on includes), and drop its tracking entry. Called
// when a document is closed so stale diagnostics don't linger and the tracking
// map doesn't grow unbounded.
export function clearDocumentDiagnostics(docUri: string): void {
  const published = publishedByDocument.get(docUri);
  if (published) {
    for (const uri of published) {
      // Leave diagnostics owned by another open document intact.
      if (uri !== docUri && documentCache.isOpen(uri)) {
        continue;
      }
      connection.sendDiagnostics({ uri, diagnostics: [] });
    }
    publishedByDocument.delete(docUri);
  }
}

export const debouncedVCLLint = debounce(
  validateVCLDocument,
  DEBOUNCE_INTERVAL,
);
