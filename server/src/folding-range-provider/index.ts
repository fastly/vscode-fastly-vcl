import {
  FoldingRangeParams,
  FoldingRange,
  FoldingRangeKind,
} from "vscode-languageserver/node";

import { documentCache } from "../shared/documentCache";
import { VclDocument } from "../shared/vclDocument";
import { walkAST, ASTNode } from "../shared/ast";

/**
 * Provides folding ranges for VCL documents.
 * Supports folding for:
 * - Block declarations (sub, acl, table, backend, director, ratecounter, penaltybox)
 * - Control flow statements (if, else, elsif)
 * - Multi-line comments (/* ... *​/)
 * - Consecutive single-line comments (# ...)
 */
export function resolve(params: FoldingRangeParams): FoldingRange[] {
  const doc = documentCache.get(params.textDocument.uri);
  if (!doc) return [];

  const ranges: FoldingRange[] = [];

  // Get folding ranges from AST (declarations and control flow)
  ranges.push(...getASTFoldingRanges(doc));

  // Get folding ranges from comments
  ranges.push(...getCommentFoldingRanges(doc));

  return ranges;
}

/**
 * Block types in the AST that should be foldable.
 */
const FOLDABLE_BLOCK_TYPES = new Set([
  "BACKEND",
  "ACL",
  "TABLE",
  "DIRECTOR",
  "RATECOUNTER",
  "PENALTYBOX",
  "SUBROUTINE",
  "IF",
  "ELSE",
]);

/**
 * Extract folding ranges from AST nodes (declarations and control flow).
 */
function getASTFoldingRanges(doc: VclDocument): FoldingRange[] {
  const ranges: FoldingRange[] = [];

  if (!doc.AST) return ranges;

  walkAST(doc.AST, (node: ASTNode) => {
    if (!node.Token) return;

    const tokenType = node.Token.Type;
    if (!FOLDABLE_BLOCK_TYPES.has(tokenType)) return;

    // Skip nested subroutines (Fastly-specific)
    if (tokenType === "SUBROUTINE" && node.Nest) return;

    const startLine = node.Token.Line - 1; // Convert to 0-based
    const endPosition = doc.getClosingBracePosition({
      line: startLine,
      character: node.Token.Position - 1,
    });

    if (endPosition && endPosition.line > startLine) {
      ranges.push({
        startLine,
        endLine: endPosition.line,
        kind: FoldingRangeKind.Region,
      });
    }
  });

  return ranges;
}

/**
 * Extract folding ranges from comments.
 * Handles both multi-line /* ... *​/ comments and consecutive # line comments.
 */
function getCommentFoldingRanges(doc: VclDocument): FoldingRange[] {
  const ranges: FoldingRange[] = [];
  const text = doc.getText();
  const lines = text.split("\n");

  let inBlockComment = false;
  let blockCommentStart = -1;
  let consecutiveLineCommentStart = -1;
  let lastLineCommentLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Handle block comments /* ... */
    if (!inBlockComment) {
      const blockStart = line.indexOf("/*");
      if (blockStart !== -1) {
        // Check if it closes on the same line
        const blockEnd = line.indexOf("*/", blockStart + 2);
        if (blockEnd === -1) {
          inBlockComment = true;
          blockCommentStart = i;
        }
        // Single-line block comments don't need folding
      }
    } else {
      const blockEnd = line.indexOf("*/");
      if (blockEnd !== -1) {
        inBlockComment = false;
        if (i > blockCommentStart) {
          ranges.push({
            startLine: blockCommentStart,
            endLine: i,
            kind: FoldingRangeKind.Comment,
          });
        }
        blockCommentStart = -1;
      }
    }

    // Handle consecutive line comments (# ...)
    // Only process if not inside a block comment
    if (!inBlockComment && trimmed.startsWith("#")) {
      if (consecutiveLineCommentStart === -1) {
        consecutiveLineCommentStart = i;
      }
      lastLineCommentLine = i;
    } else if (consecutiveLineCommentStart !== -1) {
      // End of consecutive line comments
      if (lastLineCommentLine > consecutiveLineCommentStart) {
        ranges.push({
          startLine: consecutiveLineCommentStart,
          endLine: lastLineCommentLine,
          kind: FoldingRangeKind.Comment,
        });
      }
      consecutiveLineCommentStart = -1;
      lastLineCommentLine = -1;
    }
  }

  // Handle unclosed block comment at end of file
  if (inBlockComment && blockCommentStart !== -1) {
    ranges.push({
      startLine: blockCommentStart,
      endLine: lines.length - 1,
      kind: FoldingRangeKind.Comment,
    });
  }

  // Handle consecutive line comments at end of file
  if (
    consecutiveLineCommentStart !== -1 &&
    lastLineCommentLine > consecutiveLineCommentStart
  ) {
    ranges.push({
      startLine: consecutiveLineCommentStart,
      endLine: lastLineCommentLine,
      kind: FoldingRangeKind.Comment,
    });
  }

  return ranges;
}
