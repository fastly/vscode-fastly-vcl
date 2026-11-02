//@ts-check
import { rmSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runTests } from "@vscode/test-electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function go() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, "..");
    const extensionTestsPath = path.resolve(__dirname);
    // A fresh profile of its own: in the e2e runs' profile VS Code restores
    // their window too, so the tests run in two windows and the run passes
    // even when one fails. Keep the path short for VS Code's socket on macOS.
    const userDataDir = path.resolve(__dirname, "../.vscode-test/ud-colorize");
    rmSync(userDataDir, { recursive: true, force: true });
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      // The colorization tests only need the grammar and are Node code, so
      // run them in the Node extension host, where the browser-only
      // extension's code does not run.
      launchArgs: [
        "--disable-extensions",
        "--extensionDevelopmentKind=workspace",
        `--user-data-dir=${userDataDir}`,
      ],
    });
  } catch (err) {
    console.error("Failed to run tests:", err);
    process.exit(1);
  }
}

go();
