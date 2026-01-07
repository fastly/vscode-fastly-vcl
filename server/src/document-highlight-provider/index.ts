/**
 * Document Highlight Provider for VCL Documents
 *
 * This module provides document highlighting functionality for VCL files in VS Code,
 * allowing users to see all occurrences of a symbol highlighted when they place their
 * cursor on it. This helps with code navigation and understanding variable usage.
 *
 * Highlighting is supported for:
 * - Declarations: sub, acl, table, backend, director, ratecounter, penaltybox
 * - Variable references: both reads and writes (set, unset, add statements)
 * - Subroutine calls via the call statement
 * - Function arguments including table references
 * - ACL checks using ~ and !~ operators
 * - Parameter declarations in subroutine signatures
 *
 * The implementation uses two strategies:
 * 1. AST-based highlighting (preferred): Walks the parsed AST to find all occurrences
 *    of an identifier, distinguishing between read and write operations. This approach
 *    is more accurate as it won't match identifiers inside strings or comments.
 * 2. Symbol-based fallback: When no AST is available, falls back to using symbol
 *    information to highlight just the definition location.
 *
 * Highlights are categorized as:
 * - Write: Declarations, set/unset/add statements, parameter definitions
 * - Read: Variable references, function calls, subroutine calls, ACL checks
 */

import {
  DocumentHighlightParams,
  DocumentHighlight,
  DocumentHighlightKind,
} from "vscode-languageserver/node";

import { documentCache } from "../shared/documentCache";
import { getSymbolInformation } from "../symbol-provider";
import { VclDocument } from "../shared/vclDocument";
import { walkAST, ASTNode } from "../shared/ast";

interface IdentifierLocation {
  value: string;
  line: number;
  position: number;
  length: number;
  isWrite: boolean;
}

/**
 * Resolves document highlights for VCL symbols, headers, and variables.
 * Uses the falco AST to find all occurrences of an identifier.
 */
export function resolve(params: DocumentHighlightParams): DocumentHighlight[] {
  const doc = documentCache.get(params.textDocument.uri);
  if (!doc) return [];

  const word = doc.getWord(params.position);
  if (!word) return [];

  // If we have an AST, use it for accurate highlighting
  if (doc.AST) {
    return findHighlightsFromAST(doc, word);
  }

  // Fallback to symbol-based highlighting for named declarations
  return findSymbolHighlights(doc, word);
}

/**
 * Walks the AST to find all occurrences of an identifier.
 * This is more accurate than regex as it won't match inside strings.
 */
function findHighlightsFromAST(
  doc: VclDocument,
  word: string,
): DocumentHighlight[] {
  const locations: IdentifierLocation[] = [];

  walkAST(doc.AST!, (node: ASTNode) => {
    // Check for identifier nodes (IDENT tokens)
    if (node.Token?.Type === "IDENT" && node.Value === word) {
      locations.push({
        value: node.Value,
        line: node.Token.Line - 1,
        position: node.Token.Position - 1,
        length: node.Token.Literal.length,
        isWrite: false, // Will be updated below
      });
    }

    // Check Name property for declarations (ACL, TABLE, BACKEND, etc.)
    if (node.Name?.Token?.Type === "IDENT" && node.Name.Value === word) {
      // Check if this is a declaration (has a Token.Type that's a keyword)
      const isDeclaration = [
        "ACL",
        "TABLE",
        "BACKEND",
        "DIRECTOR",
        "SUBROUTINE",
        "DECLARE",
        "PENALTYBOX",
        "RATECOUNTER",
      ].includes(node.Token?.Type);

      locations.push({
        value: node.Name.Value,
        line: node.Name.Token.Line - 1,
        position: node.Name.Token.Position - 1,
        length: node.Name.Token.Literal.length,
        isWrite: isDeclaration,
      });
    }

    // Check Ident property for SET statements
    if (node.Token?.Type === "SET" && node.Ident?.Value === word) {
      locations.push({
        value: node.Ident.Value,
        line: node.Ident.Token.Line - 1,
        position: node.Ident.Token.Position - 1,
        length: node.Ident.Token.Literal.length,
        isWrite: true,
      });
    }

    // Check Ident property for UNSET statements
    if (node.Token?.Type === "UNSET" && node.Ident?.Value === word) {
      locations.push({
        value: node.Ident.Value,
        line: node.Ident.Token.Line - 1,
        position: node.Ident.Token.Position - 1,
        length: node.Ident.Token.Literal.length,
        isWrite: true,
      });
    }

    // Check Ident property for ADD statements
    if (node.Token?.Type === "ADD" && node.Ident?.Value === word) {
      locations.push({
        value: node.Ident.Value,
        line: node.Ident.Token.Line - 1,
        position: node.Ident.Token.Position - 1,
        length: node.Ident.Token.Literal.length,
        isWrite: true,
      });
    }

    // Check function arguments for table references
    if (node.Arguments && Array.isArray(node.Arguments)) {
      for (const arg of node.Arguments) {
        if (arg.Token?.Type === "IDENT" && arg.Value === word) {
          locations.push({
            value: arg.Value,
            line: arg.Token.Line - 1,
            position: arg.Token.Position - 1,
            length: arg.Token.Literal.length,
            isWrite: false,
          });
        }
      }
    }

    // Check for parameter declarations in subroutine signatures
    if (node.Parameters && Array.isArray(node.Parameters)) {
      for (const param of node.Parameters) {
        if (param.Name?.Value === word) {
          locations.push({
            value: param.Name.Value,
            line: param.Name.Token.Line - 1,
            position: param.Name.Token.Position - 1,
            length: param.Name.Token.Literal.length,
            isWrite: true, // Parameter declaration is a write
          });
        }
      }
    }

    // Check Right side of infix expressions (for ACL checks like ~ internal)
    if (
      node.Right?.Token?.Type === "IDENT" &&
      node.Right.Value === word &&
      (node.Operator === "~" || node.Operator === "!~")
    ) {
      locations.push({
        value: node.Right.Value,
        line: node.Right.Token.Line - 1,
        position: node.Right.Token.Position - 1,
        length: node.Right.Token.Literal.length,
        isWrite: false,
      });
    }

    // Check Left side of infix expressions (for variable reads)
    if (node.Left?.Token?.Type === "IDENT" && node.Left.Value === word) {
      // Don't add if already added from another context
      const alreadyAdded = locations.some(
        (loc) =>
          loc.line === node.Left.Token.Line - 1 &&
          loc.position === node.Left.Token.Position - 1,
      );
      if (!alreadyAdded) {
        locations.push({
          value: node.Left.Value,
          line: node.Left.Token.Line - 1,
          position: node.Left.Token.Position - 1,
          length: node.Left.Token.Literal.length,
          isWrite: false,
        });
      }
    }

    // Check call statements for subroutine references
    if (node.Token?.Type === "CALL" && node.Subroutine?.Value === word) {
      locations.push({
        value: node.Subroutine.Value,
        line: node.Subroutine.Token.Line - 1,
        position: node.Subroutine.Token.Position - 1,
        length: node.Subroutine.Token.Literal.length,
        isWrite: false,
      });
    }

    // Check return statements with function calls
    if (node.Token?.Type === "RETURN" && node.Argument) {
      checkValueNode(node.Argument, word, locations);
    }

    // Check if conditions
    if (node.Condition) {
      checkValueNode(node.Condition, word, locations);
    }

    // Check Value property (for expressions, assignments, etc.)
    if (node.Value && typeof node.Value === "object" && node.Value.Token) {
      checkValueNode(node.Value, word, locations);
    }
  });

  // Deduplicate locations (AST walking may find same node multiple times)
  const uniqueLocations = deduplicateLocations(locations);

  return uniqueLocations.map((loc) => ({
    range: {
      start: { line: loc.line, character: loc.position },
      end: { line: loc.line, character: loc.position + loc.length },
    },
    kind: loc.isWrite
      ? DocumentHighlightKind.Write
      : DocumentHighlightKind.Read,
  }));
}

/**
 * Helper to check value nodes for identifier matches
 */
function checkValueNode(
  node: ASTNode,
  word: string,
  locations: IdentifierLocation[],
): void {
  if (node.Token?.Type === "IDENT" && node.Value === word) {
    const alreadyAdded = locations.some(
      (loc) =>
        loc.line === node.Token.Line - 1 &&
        loc.position === node.Token.Position - 1,
    );
    if (!alreadyAdded) {
      locations.push({
        value: node.Value,
        line: node.Token.Line - 1,
        position: node.Token.Position - 1,
        length: node.Token.Literal.length,
        isWrite: false,
      });
    }
  }

  // Check function calls
  if (node.Function?.Value === word) {
    const alreadyAdded = locations.some(
      (loc) =>
        loc.line === node.Function.Token.Line - 1 &&
        loc.position === node.Function.Token.Position - 1,
    );
    if (!alreadyAdded) {
      locations.push({
        value: node.Function.Value,
        line: node.Function.Token.Line - 1,
        position: node.Function.Token.Position - 1,
        length: node.Function.Token.Literal.length,
        isWrite: false,
      });
    }
  }
}

/**
 * Removes duplicate locations based on line and position
 */
function deduplicateLocations(
  locations: IdentifierLocation[],
): IdentifierLocation[] {
  const seen = new Set<string>();
  return locations.filter((loc) => {
    const key = `${loc.line}:${loc.position}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Fallback: Finds highlights using symbol information when AST is not available.
 */
function findSymbolHighlights(
  doc: VclDocument,
  word: string,
): DocumentHighlight[] {
  const symbols = getSymbolInformation(doc);

  // Find the symbol by name
  const symbol = symbols.find((s) => s.name === word);
  if (!symbol) return [];

  // Just return the definition highlight when no AST
  return [
    {
      range: symbol.selectionRange,
      kind: DocumentHighlightKind.Write,
    },
  ];
}
