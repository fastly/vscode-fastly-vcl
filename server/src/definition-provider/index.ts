/**
 * Definition Provider for VCL files.
 *
 * Provides "Go to Definition" functionality (Ctrl/Cmd+Click or F12) to navigate
 * from symbol usages to their declarations.
 *
 * Resolution strategy:
 * 1. Named symbols (ACL, TABLE, BACKEND, DIRECTOR, SUBROUTINE) - Uses the symbol
 *    provider cache to find declarations by name matching.
 * 2. Local variables (declare local var.name) - Walks the AST to find DECLARE
 *    statements with matching variable names within the same subroutine scope.
 * 3. Subroutine parameters (STRING var.param) - Walks the AST to find parameter
 *    declarations in the containing subroutine's signature.
 */
import {
  DefinitionParams,
  Location,
  Position,
} from "vscode-languageserver/node";

import { documentCache } from "../shared/documentCache";
import { findSymbolByName } from "../symbol-provider";
import { walkAST, ASTNode } from "../shared/ast";

interface VariableDeclaration {
  name: string;
  line: number;
  position: number;
  length: number;
}

export function resolve(params: DefinitionParams): Location | null {
  const doc = documentCache.get(params.textDocument.uri);
  if (!doc) return null;

  const word = doc.getWord(params.position);
  if (!word) return null;

  console.debug("definition:resolve", { word, position: params.position });

  // Find matching symbol definition (ACL, TABLE, BACKEND, DIRECTOR, SUBROUTINE)
  const symbol = findSymbolByName(params.textDocument.uri, word);

  if (symbol) {
    return {
      uri: params.textDocument.uri,
      range: symbol.selectionRange,
    };
  }

  // Check for local variable or parameter declarations in AST
  if (doc.AST) {
    const declaration = findVariableDeclaration(doc.AST, word, params.position);
    if (declaration) {
      return {
        uri: params.textDocument.uri,
        range: {
          start: { line: declaration.line, character: declaration.position },
          end: {
            line: declaration.line,
            character: declaration.position + declaration.length,
          },
        },
      };
    }
  }

  return null;
}

/**
 * Finds the subroutine node that contains the given position.
 */
function findContainingSubroutine(
  ast: ASTNode,
  position: Position,
): ASTNode | null {
  let containingSub: ASTNode | null = null;

  walkAST(ast, (node: ASTNode) => {
    if (node.Token?.Type === "SUBROUTINE" && node.Block) {
      const startLine = node.Token.Line - 1;
      const endLine = node.Block.EndLine ? node.Block.EndLine - 1 : startLine;

      if (position.line >= startLine && position.line <= endLine) {
        containingSub = node;
      }
    }
  });

  return containingSub;
}

/**
 * Walks the AST to find local variable declarations (declare local)
 * and parameter declarations in subroutine signatures.
 * Only searches within the subroutine that contains the cursor position.
 */
function findVariableDeclaration(
  ast: ASTNode,
  name: string,
  position: Position,
): VariableDeclaration | null {
  // First, find which subroutine contains the cursor
  const containingSub = findContainingSubroutine(ast, position);
  if (!containingSub) return null;

  let result: VariableDeclaration | null = null;

  // Check for parameter declarations in the subroutine signature
  if (containingSub.Parameters && Array.isArray(containingSub.Parameters)) {
    for (const param of containingSub.Parameters) {
      if (param.Name?.Value === name) {
        return {
          name: param.Name.Value,
          line: param.Name.Token.Line - 1,
          position: param.Name.Token.Position - 1,
          length: param.Name.Token.Literal.length,
        };
      }
    }
  }

  // Search for declare local statements within this subroutine's block
  if (containingSub.Block) {
    walkAST(containingSub.Block, (node: ASTNode) => {
      if (result) return; // Already found

      if (node.Token?.Type === "DECLARE" && node.Name?.Value === name) {
        result = {
          name: node.Name.Value,
          line: node.Name.Token.Line - 1,
          position: node.Name.Token.Position - 1,
          length: node.Name.Token.Literal.length,
        };
      }
    });
  }

  return result;
}
