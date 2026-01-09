/**
 * Renders a VCL file with semantic tokens as XML tags.
 * Used for testing/debugging semantic token positions.
 *
 * Usage: npx tsx server/src/test/renderSemanticTokens.ts <vcl-file>
 */

import * as fs from "fs";
import * as path from "path";

// Import the semantic tokens provider
import { resolve, legend } from "../semantic-tokens-provider";
import { documentCache } from "../shared/documentCache";

async function renderWithTags(filePath: string): Promise<string> {
  const absolutePath = path.resolve(filePath);
  const content = fs.readFileSync(absolutePath, "utf-8");
  const uri = `file://${absolutePath}`;

  // Add document to cache (this parses it)
  documentCache.set({
    uri,
    languageId: "vcl",
    version: 1,
    text: content,
  });

  // Parse with falco to get AST
  const { lintText } = await import("../../../falco-js/src/index.js");
  const lintResult = await lintText(content, {
    vclFileName: absolutePath,
    diagnosticsOnly: false,
  });

  // Set AST on document
  const doc = documentCache.get(uri);
  if (doc) {
    doc.AST = (lintResult as { Vcl?: { AST?: unknown } }).Vcl?.AST;
  }

  // Get semantic tokens
  const result = resolve({ textDocument: { uri } });
  const data = result.data;

  if (data.length === 0) {
    console.error("No semantic tokens generated");
    return content;
  }

  // Decode delta-encoded tokens
  interface Token {
    line: number;
    character: number;
    length: number;
    tokenType: string;
    tokenModifiers: string[];
  }

  const tokens: Token[] = [];
  let line = 0;
  let character = 0;

  for (let i = 0; i < data.length; i += 5) {
    const deltaLine = data[i];
    const deltaChar = data[i + 1];
    const length = data[i + 2];
    const tokenTypeIndex = data[i + 3];
    const tokenModifiersBits = data[i + 4];

    if (deltaLine > 0) {
      line += deltaLine;
      character = deltaChar;
    } else {
      character += deltaChar;
    }

    const tokenType =
      legend.tokenTypes[tokenTypeIndex] || `unknown(${tokenTypeIndex})`;
    const modifiers: string[] = [];
    for (let j = 0; j < legend.tokenModifiers.length; j++) {
      if (tokenModifiersBits & (1 << j)) {
        modifiers.push(legend.tokenModifiers[j]);
      }
    }

    tokens.push({
      line,
      character,
      length,
      tokenType,
      tokenModifiers: modifiers,
    });
  }

  // Sort tokens by position (should already be sorted, but be safe)
  tokens.sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    return a.character - b.character;
  });

  // Split content into lines
  const lines = content.split("\n");

  // Process each line, inserting tags
  const result_lines: string[] = [];

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const lineContent = lines[lineNum];
    const lineTokens = tokens.filter((t) => t.line === lineNum);

    if (lineTokens.length === 0) {
      result_lines.push(lineContent);
      continue;
    }

    // Debug string tokens
    for (const token of lineTokens) {
      if (token.tokenType === "string") {
        const text = lineContent.substring(
          token.character,
          token.character + token.length,
        );
        console.error(
          `DEBUG string L${lineNum + 1}: char=${token.character}, len=${token.length}, text="${text}", line="${lineContent}"`,
        );
      }
    }

    // Sort by character position descending so we insert from right to left
    lineTokens.sort((a, b) => b.character - a.character);

    let modifiedLine = lineContent;
    for (const token of lineTokens) {
      const start = token.character;
      const end = start + token.length;

      if (start < 0 || end > modifiedLine.length) {
        // Invalid position, skip but warn
        console.error(
          `Warning: Token out of bounds on line ${lineNum + 1}: ` +
            `start=${start}, end=${end}, lineLength=${modifiedLine.length}, ` +
            `type=${token.tokenType}, text="${lineContent.substring(Math.max(0, start), Math.min(modifiedLine.length, end))}"`,
        );
        continue;
      }

      const before = modifiedLine.substring(0, start);
      const text = modifiedLine.substring(start, end);
      const after = modifiedLine.substring(end);

      const modStr =
        token.tokenModifiers.length > 0
          ? ` ${token.tokenModifiers.join(" ")}`
          : "";
      modifiedLine = `${before}<${token.tokenType}${modStr}>${text}</${token.tokenType}>${after}`;
    }

    result_lines.push(modifiedLine);
  }

  return result_lines.join("\n");
}

// Main
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(
    "Usage: npx tsx server/src/test/renderSemanticTokens.ts <vcl-file>",
  );
  process.exit(1);
}

renderWithTags(args[0]).then((output) => {
  console.log(output);
});
