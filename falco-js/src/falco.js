#!/usr/bin/env node

const { lintText } = require("./index.js");

const args = process.argv.slice(2);

async function lintStdin() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return lintText(data, { autoAddIncludes: false, diagnosticsOnly: false });
}

async function lintFile(file) {
  const { readFile } = require("node:fs/promises");
  const text = await readFile(file, "utf8");
  return lintText(text, { vclFileName: file, diagnosticsOnly: false });
}

async function main() {
  if (args.includes("-slurp")) {
    return lintStdin();
  }
  const file = args.find((a) => !a.startsWith("-"));
  if (!file) {
    throw new Error(
      "Usage: falco-js <file.vcl>  (or pipe VCL via stdin with -slurp)",
    );
  }
  return lintFile(file);
}

main()
  .then((result) => console.log(JSON.stringify(result)))
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
