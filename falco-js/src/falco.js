#!/usr/bin/env node

const { falco, lintText } = require("./index.js");

const args = process.argv.slice(2);

async function pipedFalco() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return await lintText(data, { autoAddIncludes: false, deserialize: false });
}

if (args.length && args.includes("-slurp")) {
  pipedFalco()
    .then((f) => console.log(f.toString()))
    .catch((e) => console.error(e));
} else {
  falco(["lint", "-json", ...args])
    .then((f) => console.log(f.toString()))
    .catch((e) => console.error(e));
}
