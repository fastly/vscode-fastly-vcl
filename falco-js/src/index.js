"use strict";

// JSON-only wrapper around the falco VCL linter, backed by a WebAssembly build.
//
// The Wasm module (`falco.wasm`) is loaded once in Node via Go's `wasm_exec.js`
// runtime, which installs a global `FalcoVCL` API. Running falco as Wasm makes
// the extension cross-platform (including Windows) and removes the need to
// download per-platform native binaries.
//
// The Wasm `FalcoVCL.lint`/`FalcoVCL.format` API returns a flat, lower-cased
// shape. This module adapts `lint` results back into the legacy falco CLI
// `LintResult` shape (PascalCase, file-keyed `LintErrors`/`ParseErrors`,
// `Vcl.AST`) so the LSP server consumers stay unchanged.

const { readFile } = require("node:fs/promises");
const { join, dirname, resolve: resolvePath } = require("node:path");

// ---------------------------------------------------------------------------
// Wasm initialization (lazy singleton)
// ---------------------------------------------------------------------------

let falcoPromise = null;

// Load and instantiate the falco Wasm module exactly once, returning the
// global `FalcoVCL` API object.
function getFalco() {
  if (!falcoPromise) {
    falcoPromise = (async () => {
      // wasm_exec.js defines globalThis.Go (Go's Wasm runtime shim).
      require("../wasm_exec.js");
      const go = new globalThis.Go();
      const wasmBytes = await readFile(join(__dirname, "..", "falco.wasm"));
      const { instance } = await WebAssembly.instantiate(
        wasmBytes,
        go.importObject,
      );
      // `go.run` only resolves when the Go program exits. The module blocks on
      // a select{} to keep the FalcoVCL callbacks alive, so we intentionally do
      // not await it. Go's main() runs synchronously up to that block, so
      // globalThis.FalcoVCL is defined by the time run() returns control.
      go.run(instance);
      if (!globalThis.FalcoVCL) {
        throw new Error("falco wasm did not initialize FalcoVCL");
      }
      return globalThis.FalcoVCL;
    })();
  }
  return falcoPromise;
}

// ---------------------------------------------------------------------------
// Include resolution
// ---------------------------------------------------------------------------

const INCLUDE_RE = /include\s+"([^"]+)"/gm;

// Build the in-memory include map the Wasm `lint` API expects. Keys are the
// literal module path as written in the `include "..."` statement; falco's
// resolver normalizes the ".vcl" suffix. Files are read from disk relative to
// the main file's directory, matching the old `-I <dir>` behavior. Nested
// includes are followed transitively. Unreadable includes are skipped so that
// falco reports them as resolution errors.
async function buildIncludeMap(text, baseDir) {
  const includes = {};
  const visited = new Set();
  const queue = [];

  const scan = (src) => {
    for (const match of src.matchAll(INCLUDE_RE)) {
      queue.push(match[1]);
    }
  };

  scan(text);
  while (queue.length) {
    const mod = queue.shift();
    const key = mod.endsWith(".vcl") ? mod : `${mod}.vcl`;
    if (visited.has(key)) continue;
    visited.add(key);
    try {
      const content = await readFile(resolvePath(baseDir, key), "utf8");
      // Key by the literal module string; falco normalizes the suffix.
      includes[mod] = content;
      scan(content);
    } catch {
      // Unresolved include; let falco surface it as a diagnostic.
    }
  }
  return includes;
}

// ---------------------------------------------------------------------------
// Adapter: Wasm lint result -> legacy CLI LintResult shape
// ---------------------------------------------------------------------------

const SEVERITY_MAP = { error: "Error", warning: "Warning", info: "Info" };

// Recover line/position from a falco error string. Structured parse errors
// (the common case) arrive as entries in the `errors` array with real
// line/position fields and never reach this function. It is only used for the
// rare fallback where `lint` returns a free-form `error` string for a
// non-ParseError failure that has no structured coordinates. We best-effort
// scrape "... line: N, position: M" if present and otherwise fall back to
// {1,1} (the start of the document) rather than mis-pointing elsewhere.
function extractLinePosition(message) {
  const match = message.match(/line[:\s]+(\d+).*?position[:\s]+(\d+)/i);
  if (match) {
    return { line: parseInt(match[1], 10), position: parseInt(match[2], 10) };
  }
  return { line: 1, position: 1 };
}

// Resolve the file an error originates from to an absolute path. Main-file
// errors carry the `mainFile` value we passed in; included-file errors carry
// the resolver's module key (e.g. "shared/custom.vcl"), which is relative to
// the main file's directory.
function resolveErrorFile(errorFile, mainFile, baseDir) {
  if (!errorFile || errorFile === mainFile) return mainFile;
  return baseDir ? resolvePath(baseDir, errorFile) : errorFile;
}

function toLegacyLintResult(result, mainFile, baseDir, diagnosticsOnly) {
  const out = {
    LintErrors: {},
    ParseErrors: {},
    Infos: 0,
    Warnings: 0,
    Errors: 0,
  };

  // Fallback path only: `lint` returns a free-form `error` string for a
  // non-ParseError failure (structured parse errors arrive in `errors`).
  // Attribute it to the main file.
  if (result.error) {
    const { line, position } = extractLinePosition(result.error);
    out.ParseErrors[mainFile] = {
      Message: result.error.replace(/^Parse error:\s*/i, ""),
      Token: { Line: line, Position: position, Literal: "", File: mainFile },
    };
    out.Errors = 1;
    return out;
  }

  for (const error of result.errors || []) {
    const severity = SEVERITY_MAP[error.severity] || "Info";
    if (severity === "Error") out.Errors++;
    else if (severity === "Warning") out.Warnings++;
    else out.Infos++;

    // Bucket each error under the absolute path of the file it came from so the
    // server can attribute diagnostics to the correct document.
    const file = resolveErrorFile(error.file, mainFile, baseDir);
    (out.LintErrors[file] ||= []).push({
      Severity: severity,
      Message: error.message,
      Rule: error.rule || "",
      Reference: "",
      Token: {
        Line: error.line,
        Position: error.position,
        Literal: "",
        File: file,
      },
    });
  }

  // Expose the parsed AST unless the caller only wants diagnostics.
  if (!diagnosticsOnly && result.ast) {
    out.Vcl = { AST: result.ast };
  }

  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Lint VCL text. Returns a falco-CLI-compatible LintResult object.
const lintText = async (
  text,
  { vclFileName, autoAddIncludes = true, diagnosticsOnly = true } = {},
) => {
  const falco = await getFalco();
  const mainFile = vclFileName || "main.vcl";
  const baseDir = vclFileName ? dirname(vclFileName) : undefined;

  const lintOptions = { mainFile };
  if (autoAddIncludes && vclFileName) {
    const includes = await buildIncludeMap(text, baseDir);
    if (Object.keys(includes).length > 0) {
      lintOptions.includes = includes;
    }
  }

  const result = falco.lint(text, lintOptions);
  return toLegacyLintResult(result, mainFile, baseDir, diagnosticsOnly);
};

// Lint a file on disk. Returns the LintResult as a JSON string (CLI parity).
const lint = async (file) => {
  const text = await readFile(file, "utf8");
  const result = await lintText(text, {
    vclFileName: file,
    diagnosticsOnly: false,
  });
  return JSON.stringify(result);
};

// Format VCL text using falco's formatter (falco fmt defaults).
const formatText = async (text) => {
  try {
    const falco = await getFalco();
    const result = falco.format(text);
    if (result.error) {
      return { formatted: null, error: result.error };
    }
    return { formatted: result.formatted, error: null };
  } catch (err) {
    return { formatted: null, error: err.message || String(err) };
  }
};

module.exports = {
  getFalco,
  lint,
  lintText,
  formatText,
};
