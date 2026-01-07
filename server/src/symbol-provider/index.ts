/**
 * Document Symbol Provider
 *
 * This module provides document symbol functionality for VCL files, enabling
 * features like the Outline view, breadcrumbs, and Go to Symbol (Cmd+Shift+O).
 *
 * **Feature Overview:**
 * Document symbols represent the structural elements of a VCL file, such as
 * subroutines, backends, ACLs, tables, directors, and variable declarations.
 * These symbols appear in VS Code's Outline panel and can be navigated via
 * the symbol picker.
 *
 * **Implementation:**
 * 1. When a VCL document is parsed, `updateDocumentSymbols()` is called to
 *    extract symbols from the falco AST using `walkAST()`.
 * 2. The `getSymbol()` function maps AST node types to LSP `DocumentSymbol`
 *    objects, determining the appropriate `SymbolKind` (Function, Object,
 *    Variable, Module) based on the VCL construct.
 * 3. Symbols are cached per document URI for quick retrieval via
 *    `getSymbolInformation()` and `findSymbolByName()`.
 * 4. Nested subroutines (indicated by `node.Nest`) are added as children of
 *    their parent symbol to preserve hierarchy.
 *
 * **Supported VCL Constructs:**
 * - `sub` (subroutine) → SymbolKind.Function
 * - `backend`, `acl`, `table`, `director`, `ratecounter`, `penaltybox` → SymbolKind.Object
 * - `declare local` → SymbolKind.Variable
 * - `include` → SymbolKind.Module
 */
import {
  SymbolKind,
  Position,
  Range,
  DocumentSymbol,
} from "vscode-languageserver/node";

import { VclDocument } from "../shared/vclDocument";
import { walkAST, ASTNode } from "../shared/ast";

const symbolCache = new Map<string, DocumentSymbol[]>();

// falco AST <-> document symbols:
// https://github.com/ysugimoto/falco/blob/25892012b3038094ce3943deaaa6dfdc06fa4037/ast/ast.go
// https://github.com/ysugimoto/falco/blob/25892012b3038094ce3943deaaa6dfdc06fa4037/token/token.go
// https://github.com/ysugimoto/falco/blob/25892012b3038094ce3943deaaa6dfdc06fa4037/types/types.go

function getSymbol(vcl: VclDocument, node: ASTNode): DocumentSymbol | null {
  if (!node.Token) return null;
  const selectionRange = selectionRangeFromNode(
    node.Name || node.Module || node,
  );
  switch (node.Token.Type) {
    case "BACKEND": // Declarations:
    case "ACL":
    case "TABLE":
    case "DIRECTOR":
    case "RATECOUNTER":
    case "PENALTYBOX":
    case "SUBROUTINE": // Subroutines:
      if (node.Nest) return null;
      const declarationBlockRange = rangeForBlock(vcl, node);
      if (declarationBlockRange.end.line === selectionRange.end.line) {
        declarationBlockRange.end = selectionRange.end;
      }
      return {
        name: node.Name.Value,
        kind:
          node.Token.Type === "SUBROUTINE"
            ? SymbolKind.Function
            : SymbolKind.Object,
        detail: node.Token.Type,
        range: declarationBlockRange,
        selectionRange,
      };
      break;
    case "DECLARE": // Variables:
    case "INCLUDE": // Files:
      return {
        name: node.Name.Value,
        kind:
          node.Token.Type === "INCLUDE"
            ? SymbolKind.Module
            : SymbolKind.Variable,
        range: {
          start: positionFromNode(node),
          end: selectionRange.end,
        },
        selectionRange,
      };
      break;
    default:
      return null;
      break;
  }
}

function positionFromNode(node: ASTNode): Position {
  const { Line: line, Position: character } = node.Token;
  return {
    line: line - 1,
    character: character - 1,
  };
}

function rangeForBlock(vcl: VclDocument, node: ASTNode): Range {
  const start = positionFromNode(node);
  const end = vcl.getClosingBracePosition(start);
  return {
    start,
    end: end ?? start,
  };
}

function selectionRangeFromNode(node: ASTNode): Range {
  const start = positionFromNode(node);
  const end = positionFromNode(node);
  end.character += node.Token.Literal.length;
  return {
    start,
    end,
  };
}

function processSymbols(
  vcl: VclDocument,
  symbols: DocumentSymbol[],
  context?: DocumentSymbol,
) {
  return function (node: ASTNode) {
    // Leaf nodes must have Token.
    if (!node.Token) return;

    const documentSymbol = getSymbol(vcl, node);
    if (!documentSymbol) return;

    if (node.Nest && context) {
      context.children = context.children || [];
      context.children.push(documentSymbol);
    } else {
      context = documentSymbol;
      symbols.push(context);
    }
  };
}

export function getSymbolInformation(vclDoc: VclDocument): DocumentSymbol[] {
  return symbolCache.get(vclDoc.uri) || [];
}

export function findSymbolByName(
  uri: string,
  name: string,
): DocumentSymbol | undefined {
  const symbols = symbolCache.get(uri) || [];
  return symbols.find((s) => s.name === name);
}

export function updateDocumentSymbols(vclDoc: VclDocument) {
  if (vclDoc.AST) {
    const symbols: DocumentSymbol[] = [];
    try {
      walkAST(vclDoc.AST, processSymbols(vclDoc, symbols));
    } catch (e) {
      console.error(e);
      return;
    }
    symbolCache.set(vclDoc.uri, symbols);
  } else {
    symbolCache.delete(vclDoc.uri);
  }
}
