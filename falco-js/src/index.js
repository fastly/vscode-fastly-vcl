// Maps Node's process.arch to $GOARCH
const GOARCH_MAP = {
  x64: "amd64",
  arm64: "arm64",
};

// Maps Node's process.platform to $GOOS
const GOOS_MAP = {
  darwin: "darwin",
  linux: "linux",
};

if (!(process.arch in GOARCH_MAP) || !(process.platform in GOOS_MAP)) {
  throw new Error(
    `Sorry, falco is not packaged for ${process.platform}-${process.arch} yet.`,
  );
}

const { spawn } = require("node:child_process");
const { join, dirname, sep } = require("node:path");
const fs = require("node:fs/promises");
const { tmpdir } = require("node:os");

const withTempFile = (fn) => withTempDir((dir) => fn(join(dir, "file")));

const withTempDir = async (fn) => {
  const dir = await fs.mkdtemp((await fs.realpath(tmpdir())) + sep);
  try {
    return await fn(dir);
  } finally {
    fs.rm(dir, { recursive: true });
  }
};

const falcoDistro = `falco-${GOOS_MAP[process.platform]}-${
  GOARCH_MAP[process.arch]
}`;
const falcoBinary = join(__dirname, "..", "bin", falcoDistro);

const falco = async (args) => {
  const falco = spawn(falcoBinary, args);
  let output = "";
  return new Promise((resolve, reject) => {
    falco.on("error", reject);

    falco.stdout.on("data", (data) => {
      output += data.toString();
    });

    falco.stdout.on("end", () => {
      resolve(output);
    });
  });
};

const lint = (file) => falco(["lint", "-json", file]);

const lintText = (
  text,
  {
    vclFileName,
    autoAddIncludes = true,
    diagnosticsOnly = true,
    deserialize = true,
  } = {},
) =>
  withTempFile(async (file) => {
    const falcoFlags = ["lint", "-json"];
    if (vclFileName) {
      falcoFlags.push("-I", dirname(vclFileName));
    }
    if (autoAddIncludes) {
      // Flag any other include paths from the code, that are not in the same directory as the file.
      for (const [_, includePath] of text.matchAll(
        /include\s+\"([^"]*\/[^"]+)\"/gm,
      ) || []) {
        falcoFlags.push("-I", dirname(`${includePath}.vcl`));
      }
    }
    await fs.writeFile(file, text);
    let lintResponse = await falco([...falcoFlags, file]);
    if (vclFileName) {
      lintResponse = lintResponse.replaceAll(file, vclFileName);
    }
    if (!deserialize) {
      return lintResponse;
    }
    const lintResult = JSON.parse(lintResponse);
    if (diagnosticsOnly) {
      delete lintResult.Vcl;
    }
    return lintResult;
  });

module.exports = {
  falco,
  lint,
  lintText,
};
