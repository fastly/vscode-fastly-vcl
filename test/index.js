import path from "path";
import Mocha from "mocha";

export function run(testsRoot, cb) {
  // Create the mocha test
  const mocha = new Mocha({
    ui: "tdd",
    timeout: 30_000,
  });

  // Only the colorization suite: the other *.test.js files here are
  // standalone Node scripts, and semanticTokens.test.js calls process.exit,
  // which would end the extension host before mocha reports.
  mocha.addFile(path.resolve(testsRoot, "colorization.test.js"));

  try {
    // Run the mocha test
    mocha.run((failures) => {
      cb(null, failures);
    });
  } catch (err) {
    console.error(err);
    cb(err);
  }
}
