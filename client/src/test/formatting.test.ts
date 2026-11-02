import * as vscode from "vscode";
import * as assert from "assert";
import { getDocUri, activate } from "./helper";
// Bundled as text (see scripts/bundle.mjs): the tests run in a web worker.
import expectedBefore from "../../../test/formatting-results/formatting.vcl.before.xml";
import expectedAfter from "../../../test/formatting-results/formatting.vcl.after.xml";

interface DecodedToken {
  line: number;
  character: number;
  length: number;
  tokenType: string;
  tokenModifiers: string[];
}

suite("Should format documents", () => {
  const docUri = getDocUri("formatting.vcl");

  test("Formats poorly formatted VCL", async () => {
    await activate(docUri);

    // Get the document
    const doc = await vscode.workspace.openTextDocument(docUri);
    const originalText = doc.getText();

    // Execute format document command
    const edits = (await vscode.commands.executeCommand(
      "vscode.executeFormatDocumentProvider",
      docUri,
      { tabSize: 2, insertSpaces: true },
    )) as vscode.TextEdit[];

    // Should return edits (or empty array if already formatted)
    assert.ok(
      Array.isArray(edits),
      "Expected array of TextEdits from formatting",
    );

    if (edits.length > 0) {
      // Apply the edits to check the result
      const edit = new vscode.WorkspaceEdit();
      edit.set(docUri, edits);
      await vscode.workspace.applyEdit(edit);

      const formattedText = doc.getText();

      // Verify formatting improved the code
      assert.notStrictEqual(
        formattedText,
        originalText,
        "Expected formatting to change the document",
      );

      // Check for consistent indentation (spaces, not crammed together)
      assert.ok(
        formattedText.includes("  ") || formattedText.includes("\n"),
        "Expected formatted code to have proper whitespace",
      );

      // Revert the changes for other tests
      await restoreText(doc, originalText);
    }
  });

  test("Returns empty array when document is already formatted", async () => {
    // Format the document first
    await activate(docUri);
    const doc = await vscode.workspace.openTextDocument(docUri);
    const originalText = doc.getText();

    // Format once
    const firstEdits = (await vscode.commands.executeCommand(
      "vscode.executeFormatDocumentProvider",
      docUri,
      { tabSize: 2, insertSpaces: true },
    )) as vscode.TextEdit[];

    if (firstEdits && firstEdits.length > 0) {
      const edit = new vscode.WorkspaceEdit();
      edit.set(docUri, firstEdits);
      await vscode.workspace.applyEdit(edit);

      // Format again - should return empty or no changes
      const secondEdits = (await vscode.commands.executeCommand(
        "vscode.executeFormatDocumentProvider",
        docUri,
        { tabSize: 2, insertSpaces: true },
      )) as vscode.TextEdit[];

      // Second format should have no changes (already formatted)
      assert.ok(
        !secondEdits || secondEdits.length === 0,
        "Expected no edits when document is already formatted",
      );

      // Revert for other tests
      await restoreText(doc, originalText);
    }
  });

  // This test verifies semantic tokens are correct before and after formatting.
  // It requires waiting for the linter debounce (3s) so it's slower.
  test("Semantic tokens match expected XML before and after formatting", async () => {
    await activate(docUri);

    const doc = await vscode.workspace.openTextDocument(docUri);
    const originalText = doc.getText();

    // Wait for initial semantic tokens (linter needs to run first)
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await waitForSemanticTokens(docUri);

    // Get XML before formatting
    const xmlBefore = await renderTokensAsXml(docUri);

    // Compare before formatting
    assert.strictEqual(
      xmlBefore.trim(),
      expectedBefore.trim(),
      "Semantic tokens before formatting don't match expected XML",
    );

    // Format the document
    const edits = (await vscode.commands.executeCommand(
      "vscode.executeFormatDocumentProvider",
      docUri,
      { tabSize: 2, insertSpaces: true },
    )) as vscode.TextEdit[];

    assert.ok(
      Array.isArray(edits) && edits.length > 0,
      "Expected formatting edits",
    );

    const edit = new vscode.WorkspaceEdit();
    edit.set(docUri, edits);
    await vscode.workspace.applyEdit(edit);

    // Wait for the linter to re-run and update the AST
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await waitForSemanticTokens(docUri);

    // Get XML after formatting
    const xmlAfter = await renderTokensAsXml(docUri);

    // Compare after formatting
    assert.strictEqual(
      xmlAfter.trim(),
      expectedAfter.trim(),
      "Semantic tokens after formatting don't match expected XML",
    );

    // Revert for other tests
    await restoreText(doc, originalText);
  }).timeout(15000);
});

async function waitForSemanticTokens(
  docUri: vscode.Uri,
  maxWait = 5000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const tokens = await vscode.commands.executeCommand<vscode.SemanticTokens>(
      "vscode.provideDocumentSemanticTokens",
      docUri,
    );
    if (tokens && tokens.data.length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function getSemanticTokensLegend(): Promise<{
  tokenTypes: string[];
  tokenModifiers: string[];
}> {
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

  const decoded: DecodedToken[] = [];
  const data = tokens.data;

  let line = 0;
  let character = 0;

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

async function renderTokensAsXml(docUri: vscode.Uri): Promise<string> {
  const doc = await vscode.workspace.openTextDocument(docUri);
  const content = doc.getText();
  const tokens = await getDecodedTokens(docUri);

  // Sort by position (reverse for insertion - process from end to start)
  tokens.sort((a, b) => {
    if (a.line !== b.line) {
      return b.line - a.line;
    }
    return b.character - a.character;
  });

  // Apply tags to content
  const lines = content.split("\n");

  for (const token of tokens) {
    if (token.line >= lines.length) {
      continue;
    }

    const lineContent = lines[token.line];
    const before = lineContent.slice(0, token.character);
    const text = lineContent.slice(
      token.character,
      token.character + token.length,
    );
    const after = lineContent.slice(token.character + token.length);

    // Build tag with modifiers
    const modifierStr =
      token.tokenModifiers.length > 0
        ? ` ${token.tokenModifiers.join(" ")}`
        : "";
    const openTag = `<${token.tokenType}${modifierStr}>`;
    const closeTag = `</${token.tokenType}>`;

    lines[token.line] = `${before}${openTag}${text}${closeTag}${after}`;
  }

  return lines.join("\n");
}

// Put back a document's text. Unlike the "undo" command, this does not depend
// on the editor having focus, which a desktop test window may not have.
async function restoreText(doc: vscode.TextDocument, text: string) {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    doc.uri,
    new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)),
    text,
  );
  await vscode.workspace.applyEdit(edit);
}
