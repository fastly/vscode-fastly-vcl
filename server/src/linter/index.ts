import {
  Diagnostic,
  DiagnosticSeverity,
  Position,
} from "vscode-languageserver/node";

import { VclDocument } from "../shared/vclDocument";
import { updateDocumentSymbols } from "../symbol-provider";
import { debounce } from "../shared/utils";
import { ASTNode } from "../shared/ast";

import {
  getDocumentSettings,
  hasDiagnosticRelatedInformationCapability,
  connection,
} from "../server";

const DEBOUNCE_INTERVAL = 3000;

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
  const { lintText } = await import("falco-js").catch((e) => {
    // falco isn't available for Windows yet, fail gracefully.
    console.error(`Diagnostic service unavailable.`, e.message);
    return { lintText: null };
  });

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

  connection.sendDiagnostics({ uri: vclDoc.uri, diagnostics });
}

export const debouncedVCLLint = debounce(
  validateVCLDocument,
  DEBOUNCE_INTERVAL,
);
