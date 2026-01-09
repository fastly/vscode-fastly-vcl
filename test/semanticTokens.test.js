/*---------------------------------------------------------------------------------------------
 *  Semantic Tokens Test
 *  Compares rendered semantic tokens against stored fixtures.
 *  Run with: node test/semanticTokens.test.js
 *--------------------------------------------------------------------------------------------*/
// @ts-check
"use strict";

const assert = require("assert");
const { join, basename } = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

const projectRoot = join(__dirname, "..");
const fixturesPath = join(projectRoot, "client", "testFixture");
const resultsPath = join(__dirname, "semantic-tokens-results");

/**
 * Renders semantic tokens for a VCL file and compares against expected output.
 * @param {string} testFixturePath - Path to the VCL fixture file
 * @returns {boolean} - True if test passed
 */
function assertUnchangedSemanticTokens(testFixturePath) {
  const fileName = basename(testFixturePath);

  // Run the renderer script
  const rendererPath = join(
    projectRoot,
    "server/src/test/renderSemanticTokens.ts",
  );

  const result = execSync(`npx tsx "${rendererPath}" "${testFixturePath}"`, {
    cwd: projectRoot,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Check against stored result
  if (!fs.existsSync(resultsPath)) {
    fs.mkdirSync(resultsPath, { recursive: true });
  }

  const resultPath = join(resultsPath, `${fileName}.xml`);

  if (fs.existsSync(resultPath)) {
    const previousData = fs.readFileSync(resultPath, "utf-8");
    assert.strictEqual(
      result,
      previousData,
      `Semantic tokens for ${fileName} have changed. Run 'npx tsx server/src/test/renderSemanticTokens.ts ${testFixturePath} > ${resultPath}' to update.`,
    );
    return true;
  } else {
    // First run - save the result
    fs.writeFileSync(resultPath, result);
    console.log(`Created new semantic tokens fixture: ${resultPath}`);
    return true;
  }
}

// Run tests
if (fs.existsSync(resultsPath)) {
  const resultFiles = fs
    .readdirSync(resultsPath)
    .filter((f) => f.endsWith(".xml"));
  let passed = 0;
  let failed = 0;

  resultFiles.forEach((resultFile) => {
    // Result file is "semanticTokens.vcl.xml", fixture is "semanticTokens.vcl"
    const fixtureFile = resultFile.replace(/\.xml$/, "");
    const fixturePath = join(fixturesPath, fixtureFile);

    if (fs.existsSync(fixturePath)) {
      try {
        assertUnchangedSemanticTokens(fixturePath);
        console.log(`✓ ${fixtureFile}`);
        passed++;
      } catch (e) {
        console.error(`✗ ${fixtureFile}`);
        console.error(`  ${e.message}`);
        failed++;
      }
    }
  });

  console.log(`\n${passed} passing, ${failed} failing`);
  process.exit(failed > 0 ? 1 : 0);
} else {
  console.log(
    "No semantic token fixtures found. Run the renderer first to generate them.",
  );
  process.exit(0);
}
