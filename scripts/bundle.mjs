// Bundle the client and server for VS Code's web worker extension host, which
// runs the extension on desktop and on the web (vscode.dev, github.dev).
//
// - client/dist/extension.js: CommonJS, loaded by the extension host.
// - client/dist/test/index.js: the e2e suite, which runs in the same host.
// - server/dist/server.js: a classic worker script; VS Code loads it with
//   importScripts() from a blob: URL, so it cannot be an ES module.
//
// The falco component's core wasm modules are not bundled: the server fetches
// them from falco-js/component/ at the URL the client passes in.
//
// A build (not --watch) also writes ThirdPartyNotices.txt with the license of
// every npm package bundled into the shipped client and server, followed by
// the licenses of the software in the falco component
// (falco-js/component/THIRD_PARTY_LICENSES.txt, from scripts/falco-licenses.mjs).

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const testFiles = readdirSync("client/src/test")
  .filter((f) => f.endsWith(".test.ts"))
  .sort();

// mocha.js is a UMD script, but mocha 12's package.json says "type": "module",
// so esbuild would inline it as ESM. Its UMD check would then find the test
// bundle's own `module` and replace our exported `run` with the mocha instance,
// and VS Code would never get the result. Loading it from another namespace
// makes esbuild detect it as CommonJS and wrap it.
const mochaAsCommonJs = {
  name: "mocha-as-commonjs",
  setup(build) {
    build.onResolve({ filter: /^mocha\/mocha\.js$/ }, async (args) => {
      if (args.pluginData === "mocha-as-commonjs") {
        return undefined;
      }
      const result = await build.resolve(args.path, {
        kind: args.kind,
        resolveDir: args.resolveDir,
        pluginData: "mocha-as-commonjs",
      });
      if (result.errors.length > 0) {
        return { errors: result.errors };
      }
      return { path: result.path, namespace: "mocha-as-commonjs" };
    });
    build.onLoad(
      { filter: /.*/, namespace: "mocha-as-commonjs" },
      async (args) => ({
        contents: await readFile(args.path, "utf8"),
        loader: "js",
        resolveDir: dirname(args.path),
      }),
    );
  },
};

const common = {
  bundle: true,
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  logLevel: "warning",
};

const builds = [
  {
    ...common,
    entryPoints: ["client/src/extension.ts"],
    outfile: "client/dist/extension.js",
    format: "cjs",
    external: ["vscode"],
    metafile: true,
  },
  {
    // The e2e suite: the runner first (it sets up mocha), then every test.
    ...common,
    stdin: {
      contents: [
        'export { run } from "./index";',
        ...testFiles.map((f) => `import "./${f}";`),
      ].join("\n"),
      resolveDir: "client/src/test",
      sourcefile: "tests.ts",
      loader: "ts",
    },
    outfile: "client/dist/test/index.js",
    format: "cjs",
    external: ["vscode"],
    loader: { ".xml": "text" },
    plugins: [mochaAsCommonJs],
    // The `assert` polyfill and its `util` dependency read these Node globals;
    // without `process.stderr`, building a failed assertion's message throws
    // "process is not defined" and hides the real failure.
    define: {
      "process.env.NODE_DEBUG": "false",
      "process.stderr": "undefined",
    },
  },
  {
    ...common,
    entryPoints: ["server/src/server.ts"],
    outfile: "server/dist/server.js",
    format: "iife",
    metafile: true,
    // The falco wrappers only import node:fs on Node, behind a runtime check.
    external: ["node:*"],
    // Both import.meta.url uses are fallbacks for unbundled use; the server
    // always calls setComponentBaseUrl().
    logOverride: { "empty-import-meta": "silent" },
  },
];

if (watch) {
  for (const options of builds) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
  }
} else {
  const results = await Promise.all(
    builds.map((options) => esbuild.build(options)),
  );
  writeThirdPartyNotices(results.filter((r) => r.metafile));
}

/** The node_modules package directory an esbuild input belongs to, if any. */
function packageDirOf(input) {
  const match = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(input);
  return match?.[1];
}

function writeThirdPartyNotices(results) {
  const dirs = new Set();
  for (const { metafile } of results) {
    for (const input of Object.keys(metafile.inputs)) {
      const dir = packageDirOf(input);
      if (dir) {
        dirs.add(dir);
      }
    }
  }

  const packages = [...dirs].map((dir) => {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const licenseFile = readdirSync(dir).find((f) =>
      /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f),
    );
    if (!licenseFile) {
      throw new Error(`No license file found for bundled package in ${dir}`);
    }
    return {
      name: pkg.name,
      version: pkg.version,
      license: pkg.license,
      text: readFileSync(join(dir, licenseFile), "utf8").trim(),
    };
  });
  packages.sort((a, b) =>
    `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
  );

  const sections = packages.map(
    (p) => `${p.name}@${p.version}\nLicense: ${p.license}\n\n${p.text}`,
  );
  const rule = `\n\n${"-".repeat(78)}\n\n`;
  const falco = readFileSync(
    "falco-js/component/THIRD_PARTY_LICENSES.txt",
    "utf8",
  ).trim();
  writeFileSync(
    "ThirdPartyNotices.txt",
    [
      "This extension bundles the following third-party software.",
      ...sections,
    ].join(rule) + `\n\n${"=".repeat(78)}\n\n${falco}\n`,
  );
}
