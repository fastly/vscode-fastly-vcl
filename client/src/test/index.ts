// Test runner for the e2e suite. It runs in the extension's host, which for a
// browser-only extension is a web worker on desktop and on the web, so it uses
// mocha's browser build. scripts/bundle.mjs bundles this file followed by every
// *.test.ts file into client/dist/test/index.js.
//
// scripts/bundle.mjs makes esbuild treat mocha.js as CommonJS; otherwise mocha
// replaces this module's exported `run` and VS Code never exits.
import "mocha/mocha.js";

mocha.setup({
  ui: "tdd",
  // The default HTML reporter needs a DOM; without one mocha logs to the console.
  reporter: undefined,
  color: true,
  timeout: 100000,
});

export function run(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures: number) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      console.error(err);
      reject(err);
    }
  });
}
