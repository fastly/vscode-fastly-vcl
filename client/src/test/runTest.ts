import * as path from "path";

import { runTests } from "@vscode/test-electron";

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, "../../../");

    // The bundled test runner (see scripts/bundle.mjs). The extension is
    // browser-only, so VS Code runs it and its tests in a web worker host.
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(
      __dirname,
      "../../dist/test/index.js",
    );

    // The tests find their fixtures through the workspace folder.
    const testFixture = path.resolve(__dirname, "../../testFixture");

    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [testFixture, "--disable-workspace-trust"],
    });
  } catch {
    console.error("Failed to run tests");
    process.exit(1);
  }
}

main();
