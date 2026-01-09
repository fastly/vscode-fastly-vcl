/**
 * Renders semantic tokens as XML tags around the text.
 * Usage: npx ts-node scripts/render-semantic-tokens.ts [file.vcl]
 */
import * as fs from "fs";
import * as path from "path";

// Import from compiled output
const serverPath = path.join(__dirname, "../server/out");
const { resolve, tokenTypes } = require(
  path.join(serverPath, "semantic-tokens-provider/index.js"),
);
const { documentCache } = require(
  path.join(serverPath, "shared/documentCache.js"),
);

const filePath = process.argv[2] || "client/testFixture/semanticTokens.vcl";
const absolutePath = path.resolve(filePath);
const content = fs.readFileSync(absolutePath, "utf-8");
const uri = "file://" + absolutePath;

// Add to cache
documentCache.set(uri, content);

// Get tokens
const result = resolve({ textDocument: { uri } });
const data = result.data;

// Decode tokens
interface Token {
  line: number;
  character: number;
  length: number;
  tokenType: string;
}

const tokens: Token[] = [];
let line = 0;
let char = 0;

for (let i = 0; i < data.length; i += 5) {
  line += data[i];
  if (data[i] > 0) char = 0;
  char += data[i + 1];

  tokens.push({
    line,
    character: char,
    length: data[i + 2],
    tokenType: tokenTypes[data[i + 3]],
  });
}

// Sort by position (reverse for insertion - process from end to start)
tokens.sort((a, b) => {
  if (a.line !== b.line) return b.line - a.line;
  return b.character - a.character;
});

// Apply tags to content
const lines = content.split("\n");

for (const token of tokens) {
  const lineContent = lines[token.line];
  const before = lineContent.slice(0, token.character);
  const text = lineContent.slice(
    token.character,
    token.character + token.length,
  );
  const after = lineContent.slice(token.character + token.length);
  lines[token.line] =
    `${before}<${token.tokenType}>${text}</${token.tokenType}>${after}`;
}

console.log(lines.join("\n"));
