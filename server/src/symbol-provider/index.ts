// Tags interesting symbols from the AST.
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
