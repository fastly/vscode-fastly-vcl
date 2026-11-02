// Write falco-js/component/THIRD_PARTY_LICENSES.txt: the licenses of the
// software compiled into the vendored falco component. That is falco itself,
// every Go module it links for wasip1/wasm, the Go standard library, the WASI
// adapter (wasmtime) the build links in, and jco, which generates the
// component's JavaScript glue. scripts/bundle.mjs appends the file to
// ThirdPartyNotices.txt.
//
// Run it after rebuilding the component (see DEVELOPMENT.md, "Updating falco"):
//
//   node scripts/falco-licenses.mjs <falco-checkout> <jco-version>
//
// Module directories come from `go list` in the checkout, so they honour its
// go.work and replace directives, as the build does. The wasmtime license is
// fetched from GitHub at the adapter's tag and jco's from npm.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const [checkoutArg, jcoVersion] = process.argv.slice(2);
if (!checkoutArg || !jcoVersion) {
  console.error(
    "usage: node scripts/falco-licenses.mjs <falco-checkout> <jco-version>",
  );
  process.exit(1);
}
const checkout = resolve(checkoutArg);
const OUTPUT = "falco-js/component/THIRD_PARTY_LICENSES.txt";
const LICENSE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i;

const run = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", ...options }).trim();

/** The license and notice files in `dir`, in a stable order. */
function licenseTexts(dir) {
  const files = readdirSync(dir)
    .filter((f) => LICENSE_FILE.test(f))
    .sort();
  if (files.length === 0) {
    throw new Error(`No license file found in ${dir}`);
  }
  return files.map((f) => ({
    file: f,
    text: readFileSync(join(dir, f), "utf8").trim(),
  }));
}

const sections = [];

// Go modules linked into the component, built as the Makefile builds it.
const goEnv = { ...process.env, GOOS: "wasip1", GOARCH: "wasm" };
const modules = new Map();
for (const line of run(
  "go",
  [
    "list",
    "-deps",
    "-f",
    "{{with .Module}}{{.Path}}\t{{.Version}}\t{{with .Replace}}{{.Path}}\t{{.Version}}\t{{.Dir}}{{else}}\t\t{{.Dir}}{{end}}{{end}}",
    "./cmd/falco-component",
  ],
  { cwd: checkout, env: goEnv },
).split("\n")) {
  if (!line) continue;
  const [path, version, replacePath, replaceVersion, dir] = line.split("\t");
  modules.set(path, { path, version, replacePath, replaceVersion, dir });
}

const falcoCommit = run("git", ["-C", checkout, "rev-parse", "HEAD"]);
for (const m of [...modules.values()].sort((a, b) =>
  a.path.localeCompare(b.path),
)) {
  let name = `${m.path}${m.version ? `@${m.version}` : ""}`;
  if (m.dir === checkout) {
    name += ` (commit ${falcoCommit})`;
  } else if (m.replacePath) {
    // A local replacement has no version; name its commit when it is a repo.
    let source = m.replaceVersion
      ? `${m.replacePath}@${m.replaceVersion}`
      : m.replacePath;
    if (!m.replaceVersion) {
      try {
        const remote = run("git", [
          "-C",
          m.dir,
          "remote",
          "get-url",
          "origin",
        ]).replace(/^git@([^:]+):(.*?)(\.git)?$/, "https://$1/$2");
        const commit = run("git", ["-C", m.dir, "rev-parse", "HEAD"]);
        source = `${remote} (commit ${commit})`;
      } catch {
        // Not a git checkout; the path is all there is.
      }
    }
    name += `, replaced by ${source}`;
  }
  sections.push({ name, texts: licenseTexts(m.dir) });
}

// The Go standard library and runtime.
const goVersion = run("go", ["env", "GOVERSION"], { cwd: checkout });
const goRoot = run("go", ["env", "GOROOT"], { cwd: checkout });
sections.push({
  name: `Go standard library (${goVersion})`,
  texts: licenseTexts(goRoot),
});

// The WASI preview1 adapter from wasmtime, at the version the Makefile pins.
const adapterVersion = /^WASI_ADAPTER_VERSION \?= (\S+)$/m.exec(
  readFileSync(join(checkout, "Makefile"), "utf8"),
)?.[1];
if (!adapterVersion) {
  throw new Error("WASI_ADAPTER_VERSION not found in the falco Makefile");
}
const adapterLicenseUrl = `https://raw.githubusercontent.com/bytecodealliance/wasmtime/${adapterVersion}/LICENSE`;
const response = await fetch(adapterLicenseUrl);
if (!response.ok) {
  throw new Error(`${adapterLicenseUrl}: HTTP ${response.status}`);
}
sections.push({
  name: `wasmtime wasi_snapshot_preview1 reactor adapter ${adapterVersion}`,
  texts: [{ file: "LICENSE", text: (await response.text()).trim() }],
});

// jco, whose transpile output (the component's JavaScript) embeds its code.
const packDir = mkdtempSync(join(tmpdir(), "jco-"));
const tarball = run(
  "npm",
  [
    "pack",
    `@bytecodealliance/jco@${jcoVersion}`,
    "--pack-destination",
    packDir,
    "--silent",
  ],
  { cwd: packDir },
);
run("tar", ["-xzf", join(packDir, tarball), "-C", packDir]);
sections.push({
  name: `@bytecodealliance/jco@${jcoVersion}`,
  texts: licenseTexts(join(packDir, "package")),
});

const rule = `\n\n${"-".repeat(78)}\n\n`;
writeFileSync(
  OUTPUT,
  [
    "The falco component (falco-js/component/) includes the following software.",
    ...sections.map(({ name, texts }) =>
      [name, ...texts.map(({ file, text }) => `${file}:\n\n${text}`)].join(
        "\n\n",
      ),
    ),
  ].join(rule) + "\n",
);
console.log(`Wrote ${OUTPUT} (${sections.length} components)`);
