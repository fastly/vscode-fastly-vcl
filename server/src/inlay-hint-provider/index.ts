/**
 * Inlay Hint Provider for VCL files.
 *
 * Provides inline type annotations for variable assignments, helping developers
 * understand variable types without navigating to the declaration.
 *
 * Supported hints:
 * - `set var.name = value;` → Shows `: TYPE` after the variable name (for local vars)
 * - `set beresp.ttl = 60s;` → Shows `: RTIME` after the variable name (for built-in vars)
 */
import {
  InlayHint,
  InlayHintKind,
  InlayHintParams,
} from "vscode-languageserver/node";

import { documentCache } from "../shared/documentCache";
import { walkAST, ASTNode } from "../shared/ast";
import { getDocumentSettings } from "../server";
import vclVariables from "../metadata/variables.json";

interface TypeHintInfo {
  line: number;
  character: number;
  type: string;
}

interface VariableTypeMap {
  [name: string]: string;
}

/**
 * Resolves inlay hints for the given document range.
 */
export async function resolve(params: InlayHintParams): Promise<InlayHint[]> {
  const doc = documentCache.get(params.textDocument.uri);
  if (!doc || !doc.AST) return [];

  const settings = await getDocumentSettings(params.textDocument.uri);
  if (!settings.inlayHintsEnabled) return [];

  const hints: TypeHintInfo[] = [];
  const { start, end } = params.range;

  // First pass: collect all variable types from declarations and parameters
  const variableTypes: VariableTypeMap = {};
  collectVariableTypes(doc.AST, variableTypes);

  walkAST(doc.AST, (node: ASTNode) => {
    // Handle SET statements for local variables: set var.name = value;
    if (node.Token?.Type === "SET") {
      const hint = extractSetHint(node, variableTypes);
      if (hint && isInRange(hint, start, end)) {
        hints.push(hint);
      }
    }
  });

  return hints.map(createInlayHint);
}

/**
 * Collects variable types from DECLARE statements and subroutine parameters.
 */
function collectVariableTypes(ast: ASTNode, types: VariableTypeMap): void {
  walkAST(ast, (node: ASTNode) => {
    // Collect from DECLARE statements
    if (
      node.Token?.Type === "DECLARE" &&
      node.Name?.Value &&
      node.ValueType?.Value
    ) {
      types[node.Name.Value] = node.ValueType.Value;
    }

    // Collect from subroutine parameters
    if (node.Token?.Type === "SUBROUTINE" && Array.isArray(node.Parameters)) {
      for (const param of node.Parameters) {
        if (param.Name?.Value && param.Type?.Value) {
          types[param.Name.Value] = param.Type.Value;
        }
      }
    }
  });
}

/**
 * Extracts type hint from a SET statement for both local and built-in variables.
 * Examples:
 * - `set var.name = "value";` → Shows `: STRING` after var.name
 * - `set beresp.ttl = 60s;` → Shows `: RTIME` after beresp.ttl
 */
function extractSetHint(
  node: ASTNode,
  variableTypes: VariableTypeMap,
): TypeHintInfo | null {
  if (!node.Ident?.Token || !node.Ident?.Value) return null;

  const varName = node.Ident.Value;
  let type: string | undefined;

  // Check if it's a local variable (var.*)
  if (varName.startsWith("var.")) {
    type = variableTypes[varName];
  } else {
    // Check if it's a built-in VCL variable
    const vclVar = vclVariables[varName as keyof typeof vclVariables];
    if (vclVar && "type" in vclVar) {
      type = vclVar.type;
    }
  }

  if (!type) return null;

  const identToken = node.Ident.Token;
  return {
    line: identToken.Line - 1,
    character: identToken.Position - 1 + identToken.Literal.length,
    type,
  };
}

/**
 * Checks if a hint position falls within the requested range.
 */
function isInRange(
  hint: TypeHintInfo,
  start: { line: number; character: number },
  end: { line: number; character: number },
): boolean {
  if (hint.line < start.line || hint.line > end.line) return false;
  if (hint.line === start.line && hint.character < start.character)
    return false;
  if (hint.line === end.line && hint.character > end.character) return false;
  return true;
}

/**
 * Creates an LSP InlayHint from our internal hint info.
 */
function createInlayHint(hint: TypeHintInfo): InlayHint {
  return {
    position: {
      line: hint.line,
      character: hint.character,
    },
    label: `: ${hint.type}`,
    kind: InlayHintKind.Type,
    paddingLeft: false,
    paddingRight: true,
  };
}
