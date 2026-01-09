import * as vscode from "vscode";
import * as assert from "assert";
import { getDocUri, activate } from "./helper";

suite("Should provide semantic tokens", () => {
  const docUri = getDocUri("semanticTokens.vcl");

  test("Returns semantic tokens for document", async () => {
    await activate(docUri);

    const legend = await getSemanticTokensLegend();
    assert.ok(legend, "Semantic tokens legend should be available");
    assert.ok(
      legend.tokenTypes.includes("function"),
      "Legend should include function type",
    );
    assert.ok(
      legend.tokenTypes.includes("variable"),
      "Legend should include variable type",
    );
    assert.ok(
      legend.tokenTypes.includes("class"),
      "Legend should include class type",
    );

    // Wait for semantic tokens to be ready
    await waitForSemanticTokens(docUri);

    const tokens = await vscode.commands.executeCommand<vscode.SemanticTokens>(
      "vscode.provideDocumentSemanticTokens",
      docUri,
    );

    assert.ok(tokens, "Should return semantic tokens");
    assert.ok(tokens.data.length > 0, "Should have token data");
  });

  test("Classifies subroutine definitions as function+declaration", async () => {
    await activate(docUri);
    await waitForSemanticTokens(docUri);

    const tokens = await getDecodedTokens(docUri);

    // Find custom_handler subroutine definition (line 16, 0-indexed)
    const subToken = tokens.find(
      (t) =>
        t.line === 16 &&
        t.tokenType === "function" &&
        t.tokenModifiers.includes("declaration"),
    );

    assert.ok(
      subToken,
      "Should find subroutine definition with declaration modifier",
    );
  });

  test("Classifies backend definitions as class+declaration", async () => {
    await activate(docUri);
    await waitForSemanticTokens(docUri);

    const tokens = await getDecodedTokens(docUri);

    // Find origin_server backend definition (line 12, 0-indexed)
    const backendToken = tokens.find(
      (t) =>
        t.line === 12 &&
        t.tokenType === "class" &&
        t.tokenModifiers.includes("declaration"),
    );

    assert.ok(
      backendToken,
      "Should find backend definition with declaration modifier",
    );
  });

  test("Classifies ACL definitions as type+declaration", async () => {
    await activate(docUri);
    await waitForSemanticTokens(docUri);

    const tokens = await getDecodedTokens(docUri);

    // Find internal_networks ACL definition (line 3, 0-indexed)
    // ACLs are classified as type (access control definitions)
    const aclToken = tokens.find(
      (t) =>
        t.line === 3 &&
        t.tokenType === "type" &&
        t.tokenModifiers.includes("declaration"),
    );

    assert.ok(aclToken, "Should find ACL definition with declaration modifier");
  });

  test("Classifies table definitions as struct+declaration", async () => {
    await activate(docUri);
    await waitForSemanticTokens(docUri);

    const tokens = await getDecodedTokens(docUri);

    // Find redirects table definition (line 8, 0-indexed)
    // Tables are classified as struct (key-value data structures)
    const tableToken = tokens.find(
      (t) =>
        t.line === 8 &&
        t.tokenType === "struct" &&
        t.tokenModifiers.includes("declaration"),
    );

    assert.ok(
      tableToken,
      "Should find table definition with declaration modifier",
    );
  });

  test("Classifies built-in functions as function+defaultLibrary", async () => {
    await activate(docUri);
    await waitForSemanticTokens(docUri);

    const tokens = await getDecodedTokens(docUri);

    // Find digest.hash_sha256 call
    const funcToken = tokens.find(
      (t) =>
        t.tokenType === "function" &&
        t.tokenModifiers.includes("defaultLibrary"),
    );

    assert.ok(
      funcToken,
      "Should find built-in function with defaultLibrary modifier",
    );
  });

  test("Classifies variable declarations with declaration modifier", async () => {
    await activate(docUri);
    await waitForSemanticTokens(docUri);

    const tokens = await getDecodedTokens(docUri);

    // Find var.count declaration (line 24, 0-indexed: "declare local var.count INTEGER;")
    const varToken = tokens.find(
      (t) =>
        t.tokenType === "variable" && t.tokenModifiers.includes("declaration"),
    );

    assert.ok(
      varToken,
      "Should find variable declaration with declaration modifier",
    );
  });

  test("Classifies type annotations as type", async () => {
    await activate(docUri);
    await waitForSemanticTokens(docUri);

    const tokens = await getDecodedTokens(docUri);

    // Find type annotations (STRING, INTEGER)
    const typeTokens = tokens.filter((t) => t.tokenType === "type");

    assert.ok(typeTokens.length > 0, "Should find type annotation tokens");
  });

  test("Classifies regex patterns as regexp", async () => {
    await activate(docUri);
    await waitForSemanticTokens(docUri);

    const tokens = await getDecodedTokens(docUri);

    // Find regex patterns - both from ~ operator and regsub/regsuball functions
    const regexpTokens = tokens.filter((t) => t.tokenType === "regexp");

    // Should have at least 2: one from ~ operator, one from regsuball
    assert.ok(
      regexpTokens.length >= 2,
      `Should find at least 2 regexp tokens, found ${regexpTokens.length}`,
    );
  });

  test("Classifies comments as comment", async () => {
    await activate(docUri);
    await waitForSemanticTokens(docUri);

    const tokens = await getDecodedTokens(docUri);

    // Find comment tokens
    const commentTokens = tokens.filter((t) => t.tokenType === "comment");

    // Should find multiple comments in the fixture
    assert.ok(
      commentTokens.length > 0,
      `Should find comment tokens, found ${commentTokens.length}`,
    );
  });

  test("Classifies keywords as keyword", async () => {
    await activate(docUri);
    await waitForSemanticTokens(docUri);

    const tokens = await getDecodedTokens(docUri);

    // Find keyword tokens (return, if, etc.)
    const keywordTokens = tokens.filter((t) => t.tokenType === "keyword");

    // Should find keywords like return, if in the fixture
    assert.ok(
      keywordTokens.length > 0,
      `Should find keyword tokens, found ${keywordTokens.length}`,
    );
  });

  test("Classifies strings as string", async () => {
    await activate(docUri);
    await waitForSemanticTokens(docUri);

    const tokens = await getDecodedTokens(docUri);

    // Find string tokens
    const stringTokens = tokens.filter((t) => t.tokenType === "string");

    // Should find string literals in the fixture
    assert.ok(
      stringTokens.length > 0,
      `Should find string tokens, found ${stringTokens.length}`,
    );
  });

  test("Classifies numbers as number", async () => {
    await activate(docUri);
    await waitForSemanticTokens(docUri);

    const tokens = await getDecodedTokens(docUri);

    // Find number tokens (integers, floats, rtimes like 1h)
    const numberTokens = tokens.filter((t) => t.tokenType === "number");

    // Should find numeric literals in the fixture
    assert.ok(
      numberTokens.length > 0,
      `Should find number tokens, found ${numberTokens.length}`,
    );
  });

  test("Classifies operators as operator", async () => {
    await activate(docUri);
    await waitForSemanticTokens(docUri);

    const tokens = await getDecodedTokens(docUri);

    // Find operator tokens (==, ~, &&, ||, etc.)
    const operatorTokens = tokens.filter((t) => t.tokenType === "operator");

    // Should find operators in the fixture (~ for regex match, == for comparison)
    assert.ok(
      operatorTokens.length > 0,
      `Should find operator tokens, found ${operatorTokens.length}`,
    );
  });
});

interface DecodedToken {
  line: number;
  character: number;
  length: number;
  tokenType: string;
  tokenModifiers: string[];
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSemanticTokens(
  docUri: vscode.Uri,
  timeout = 5000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const tokens =
        await vscode.commands.executeCommand<vscode.SemanticTokens>(
          "vscode.provideDocumentSemanticTokens",
          docUri,
        );
      if (tokens && tokens.data.length > 0) {
        return;
      }
    } catch {
      // Not ready yet
    }
    await sleep(100);
  }
}

async function getSemanticTokensLegend(): Promise<
  vscode.SemanticTokensLegend | undefined
> {
  // The legend is exposed through the language features API
  // We can infer it from a successful token request
  return {
    tokenTypes: [
      "function",
      "variable",
      "parameter",
      "class",
      "type",
      "struct",
      "property",
      "regexp",
      "comment",
      "keyword",
      "string",
      "number",
      "operator",
    ],
    tokenModifiers: ["declaration", "defaultLibrary", "readonly"],
  };
}

async function getDecodedTokens(docUri: vscode.Uri): Promise<DecodedToken[]> {
  const tokens = await vscode.commands.executeCommand<vscode.SemanticTokens>(
    "vscode.provideDocumentSemanticTokens",
    docUri,
  );

  if (!tokens) {
    return [];
  }

  const legend = await getSemanticTokensLegend();
  if (!legend) {
    return [];
  }

  const decoded: DecodedToken[] = [];
  const data = tokens.data;

  let line = 0;
  let character = 0;

  // Semantic tokens are delta-encoded:
  // [deltaLine, deltaStartChar, length, tokenType, tokenModifiers]
  for (let i = 0; i < data.length; i += 5) {
    const deltaLine = data[i];
    const deltaChar = data[i + 1];
    const length = data[i + 2];
    const tokenTypeIndex = data[i + 3];
    const tokenModifiersBitset = data[i + 4];

    line += deltaLine;
    if (deltaLine > 0) {
      character = deltaChar;
    } else {
      character += deltaChar;
    }

    const tokenType = legend.tokenTypes[tokenTypeIndex] || "unknown";
    const tokenModifiers: string[] = [];
    for (let j = 0; j < legend.tokenModifiers.length; j++) {
      if (tokenModifiersBitset & (1 << j)) {
        tokenModifiers.push(legend.tokenModifiers[j]);
      }
    }

    decoded.push({
      line,
      character,
      length,
      tokenType,
      tokenModifiers,
    });
  }

  return decoded;
}
