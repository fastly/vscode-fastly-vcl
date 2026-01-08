/**
 * Selection Range Provider for VCL Documents
 *
 * Provides smart expanding selection (Cmd+Shift+→ on Mac, Ctrl+Shift+→ on Windows/Linux)
 * that progressively selects larger syntactic units based on the AST structure.
 *
 * Selection expansion hierarchy:
 * 1. Word/identifier at cursor
 * 2. Expression (e.g., string literal, function call arguments)
 * 3. Statement (e.g., set statement, call statement)
 * 4. Block contents (e.g., if body, subroutine body)
 * 5. Full block including braces (e.g., entire if block, entire subroutine)
 * 6. Top-level declaration
 *
 * The implementation walks the AST to build a parent chain from each cursor
 * position to the document root, then converts that into nested SelectionRange objects.
 */
import {
  SelectionRangeParams,
  SelectionRange,
  Position,
  Range,
} from "vscode-languageserver/node";

import { documentCache } from "../shared/documentCache";
import { VclDocument } from "../shared/vclDocument";
import { walkAST, ASTNode } from "../shared/ast";

/**
 * Represents a range in the document with its AST context.
 */
interface NodeRange {
  range: Range;
  type: string;
}

export function resolve(params: SelectionRangeParams): SelectionRange[] {
  const doc = documentCache.get(params.textDocument.uri);
  if (!doc) return [];

  return params.positions.map((position) =>
    getSelectionRangeAtPosition(doc, position),
  );
}

/**
 * Builds a SelectionRange chain for a given position.
 */
function getSelectionRangeAtPosition(
  doc: VclDocument,
  position: Position,
): SelectionRange {
  // Collect all ranges that contain the position, from smallest to largest
  const containingRanges = getContainingRanges(doc, position);

  // Sort ranges from smallest to largest by their span
  containingRanges.sort((a, b) => {
    const aSize = rangeSize(a.range, doc);
    const bSize = rangeSize(b.range, doc);
    return aSize - bSize;
  });

  // Remove duplicate ranges (same start and end)
  const uniqueRanges = deduplicateRanges(containingRanges);

  // Build the SelectionRange chain from innermost to outermost
  let selectionRange: SelectionRange | undefined;

  for (let i = uniqueRanges.length - 1; i >= 0; i--) {
    selectionRange = {
      range: uniqueRanges[i].range,
      parent: selectionRange,
    };
  }

  // If no AST-based ranges found, return a minimal range at the position
  if (!selectionRange) {
    const wordRange = getWordRangeAtPosition(doc, position);
    selectionRange = { range: wordRange };
  }

  return selectionRange;
}

/**
 * Collects all AST node ranges that contain the given position.
 */
function getContainingRanges(
  doc: VclDocument,
  position: Position,
): NodeRange[] {
  const ranges: NodeRange[] = [];

  // Add word range as the innermost selection
  const wordRange = getWordRangeAtPosition(doc, position);
  if (
    wordRange.start.character !== wordRange.end.character ||
    wordRange.start.line !== wordRange.end.line
  ) {
    ranges.push({ range: wordRange, type: "word" });
  }

  // Walk the AST and collect containing ranges
  if (doc.AST) {
    walkAST(doc.AST, (node: ASTNode) => {
      const nodeRange = getNodeRange(node, doc);
      if (nodeRange && rangeContainsPosition(nodeRange.range, position)) {
        ranges.push(nodeRange);

        // For nodes with blocks, also add the block content range (inside braces)
        const blockContentRange = getBlockContentRange(node, doc);
        if (
          blockContentRange &&
          rangeContainsPosition(blockContentRange.range, position)
        ) {
          ranges.push(blockContentRange);
        }
      }
    });
  }

  // Add line range
  const lineRange = getLineRange(doc, position);
  if (rangeContainsPosition(lineRange, position)) {
    ranges.push({ range: lineRange, type: "line" });
  }

  return ranges;
}

/**
 * Gets the range for an AST node based on its type.
 */
function getNodeRange(node: ASTNode, doc: VclDocument): NodeRange | null {
  if (!node.Token) return null;

  const tokenType = node.Token.Type;
  const startLine = node.Token.Line - 1;
  const startChar = node.Token.Position - 1;

  // Handle different node types
  switch (tokenType) {
    case "SUBROUTINE":
    case "BACKEND":
    case "ACL":
    case "TABLE":
    case "DIRECTOR":
    case "RATECOUNTER":
    case "PENALTYBOX": {
      // Full declaration including closing brace
      const endPos = doc.getClosingBracePosition({
        line: startLine,
        character: startChar,
      });
      if (endPos) {
        return {
          range: {
            start: { line: startLine, character: startChar },
            end: { line: endPos.line, character: endPos.character + 1 },
          },
          type: tokenType,
        };
      }
      break;
    }

    case "IF":
    case "ELSE":
    case "ELSIF": {
      // Control flow block
      const endPos = doc.getClosingBracePosition({
        line: startLine,
        character: startChar,
      });
      if (endPos) {
        return {
          range: {
            start: { line: startLine, character: startChar },
            end: { line: endPos.line, character: endPos.character + 1 },
          },
          type: tokenType,
        };
      }
      break;
    }

    case "SET":
    case "UNSET":
    case "ADD":
    case "CALL":
    case "RETURN":
    case "ERROR":
    case "RESTART":
    case "SYNTHETIC":
    case "LOG":
    case "DECLARE":
    case "INCLUDE": {
      // Statement - find the semicolon
      const line = doc.getLine({ line: startLine, character: 0 });
      const semicolonPos = line.indexOf(";", startChar);
      if (semicolonPos !== -1) {
        return {
          range: {
            start: { line: startLine, character: startChar },
            end: { line: startLine, character: semicolonPos + 1 },
          },
          type: tokenType,
        };
      }
      // Statement might span multiple lines, use a simpler approach
      return {
        range: {
          start: { line: startLine, character: startChar },
          end: { line: startLine, character: line.length },
        },
        type: tokenType,
      };
    }

    case "STRING": {
      // String literal
      if (node.Token.Literal) {
        return {
          range: {
            start: { line: startLine, character: startChar },
            end: {
              line: startLine,
              character: startChar + node.Token.Literal.length,
            },
          },
          type: tokenType,
        };
      }
      break;
    }

    case "IDENT": {
      // Identifier
      if (node.Token.Literal) {
        return {
          range: {
            start: { line: startLine, character: startChar },
            end: {
              line: startLine,
              character: startChar + node.Token.Literal.length,
            },
          },
          type: tokenType,
        };
      }
      break;
    }
  }

  return null;
}

/**
 * Gets the range for the content inside a block (between braces).
 */
function getBlockContentRange(
  node: ASTNode,
  doc: VclDocument,
): NodeRange | null {
  if (!node.Token || !node.Block) return null;

  const tokenType = node.Token.Type;
  if (
    ![
      "SUBROUTINE",
      "BACKEND",
      "ACL",
      "TABLE",
      "DIRECTOR",
      "IF",
      "ELSE",
      "ELSIF",
    ].includes(tokenType)
  ) {
    return null;
  }

  const startLine = node.Token.Line - 1;
  const startChar = node.Token.Position - 1;

  // Find opening brace
  const line = doc.getLine({ line: startLine, character: 0 });
  const openBracePos = line.indexOf("{", startChar);

  if (openBracePos === -1) return null;

  // Find closing brace
  const endPos = doc.getClosingBracePosition({
    line: startLine,
    character: startChar,
  });
  if (!endPos) return null;

  // Block content is between the braces
  return {
    range: {
      start: { line: startLine, character: openBracePos + 1 },
      end: { line: endPos.line, character: endPos.character },
    },
    type: `${tokenType}_CONTENT`,
  };
}

/**
 * Gets the word range at the given position.
 */
function getWordRangeAtPosition(doc: VclDocument, position: Position): Range {
  const line = doc.getLine(position);

  // Find word boundaries
  let start = position.character;
  let end = position.character;

  // Expand left
  while (start > 0 && /[\w\d._:-]/.test(line[start - 1])) {
    start--;
  }

  // Expand right
  while (end < line.length && /[\w\d._:-]/.test(line[end])) {
    end++;
  }

  return {
    start: { line: position.line, character: start },
    end: { line: position.line, character: end },
  };
}

/**
 * Gets the range for the entire line at the given position.
 */
function getLineRange(doc: VclDocument, position: Position): Range {
  const line = doc.getLine(position);
  const trimmedStart = line.length - line.trimStart().length;
  const trimmedEnd = line.trimEnd().length;

  return {
    start: { line: position.line, character: trimmedStart },
    end: { line: position.line, character: trimmedEnd },
  };
}

/**
 * Checks if a range contains a position.
 */
function rangeContainsPosition(range: Range, position: Position): boolean {
  if (position.line < range.start.line || position.line > range.end.line) {
    return false;
  }
  if (
    position.line === range.start.line &&
    position.character < range.start.character
  ) {
    return false;
  }
  if (
    position.line === range.end.line &&
    position.character > range.end.character
  ) {
    return false;
  }
  return true;
}

/**
 * Calculates the "size" of a range for sorting purposes.
 */
function rangeSize(range: Range, doc: VclDocument): number {
  const startOffset = doc.doc.offsetAt(range.start);
  const endOffset = doc.doc.offsetAt(range.end);
  return endOffset - startOffset;
}

/**
 * Removes duplicate ranges (same start and end positions).
 */
function deduplicateRanges(ranges: NodeRange[]): NodeRange[] {
  const seen = new Set<string>();
  return ranges.filter((r) => {
    const key = `${r.range.start.line}:${r.range.start.character}-${r.range.end.line}:${r.range.end.character}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
