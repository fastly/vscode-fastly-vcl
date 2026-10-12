// WASI Component Model backend for falco-js.
//
// This wraps the jco-transpiled falco WASI component (../component) behind the
// same `lintText` / `formatText` facade the native (binary-spawning) backend in
// ./index.js exposes, so the LSP server can switch backends with minimal change.
//
// Unlike the native backend, the component is reactor-style: importing the
// transpiled module runs its top-level `await $init`, instantiating the
// WebAssembly reactor exactly once. The exported `lint` / `format` / `parse`
// functions are then called repeatedly on in-memory strings -- no child
// process, temp files, or filesystem. jco maps the WIT `result<string, string>`
// to "return the ok string / throw on err".
//
// The component has no filesystem, so `include` statements are resolved from an
// in-memory module map the host supplies via the lint options (`includes` +
// `includePaths`); the component itself walks the include graph transitively.
// See ../component (built with `make wasm-component` on the falco branch named
// in DEVELOPMENT.md, "Updating falco") and resolver/map.go in that repo.

import {
  lint as componentLint,
  format as componentFormat,
  parse as componentParse,
} from "../component/falco-component.js";

// Synthetic file name the component uses for the main (in-memory) source. It is
// the map key in lint output and the `Token.File` of main-source diagnostics;
// we rewrite it back to the caller's real file name. Must match `inputName` in
// cmd/falco-component/main.go on that falco branch.
const INPUT_NAME = "input.vcl";

/**
 * Rewrite the synthetic main key (`input.vcl`) back to the caller's file name,
 * in place. Include modules are already keyed by their real module names by the
 * component, so only the main key is touched.
 */
function rewriteMainName(result, vclFileName) {
  if (!vclFileName || vclFileName === INPUT_NAME) {
    return result;
  }

  for (const field of ["LintErrors", "ParseErrors"]) {
    const map = result[field];
    if (map && Object.prototype.hasOwnProperty.call(map, INPUT_NAME)) {
      map[vclFileName] = map[INPUT_NAME];
      delete map[INPUT_NAME];
    }
  }

  for (const errs of Object.values(result.LintErrors || {})) {
    for (const e of errs) {
      if (e?.Token?.File === INPUT_NAME) {
        e.Token.File = vclFileName;
      }
    }
  }
  for (const pe of Object.values(result.ParseErrors || {})) {
    if (pe?.Token?.File === INPUT_NAME) {
      pe.Token.File = vclFileName;
    }
  }
  if (result.Vcl?.File === INPUT_NAME) {
    result.Vcl.File = vclFileName;
  }

  return result;
}

/**
 * Lint VCL text via the WASI component.
 *
 * @param {string} text - Main VCL source.
 * @param {object} [opts]
 * @param {string} [opts.vclFileName] - Real name for the main source; the
 *   synthetic `input.vcl` key is rewritten to this in the result.
 * @param {boolean} [opts.diagnosticsOnly=true] - Drop the parsed AST (`Vcl`)
 *   from the result when true.
 * @param {Record<string,string>} [opts.includes] - Include module name -> source
 *   for every module reachable from the main (the component discovers the graph;
 *   the host supplies contents). Omit / empty for single-file linting.
 * @param {string[]} [opts.includePaths] - Include search-path prefixes, matching
 *   how `includes` keys are named.
 * @param {string} [opts.scope] - Optional VCL scope (recv|hash|...).
 * @param {Record<string,string>} [opts.rules] - Rule severity overrides
 *   (ERROR|WARNING|INFO|IGNORE).
 * @returns {Promise<object>} RunnerResult, shape-compatible with native
 *   `falco lint -json` (LintErrors / ParseErrors / Infos / Warnings / Errors and,
 *   unless diagnosticsOnly, Vcl.AST).
 * @throws {Error} Only on a non-parse fatal error (parse errors are reported
 *   in-band via ParseErrors, matching the native backend).
 */
export async function lintText(
  text,
  {
    vclFileName,
    diagnosticsOnly = true,
    includes,
    includePaths,
    scope,
    rules,
  } = {},
) {
  const options = {};
  if (scope) options.scope = scope;
  if (rules) options.rules = rules;
  if (includes && Object.keys(includes).length > 0) options.includes = includes;
  if (includePaths && includePaths.length > 0)
    options.includePaths = includePaths;

  const raw = componentLint(text, JSON.stringify(options));
  const result = JSON.parse(raw);

  rewriteMainName(result, vclFileName);

  if (diagnosticsOnly) {
    delete result.Vcl;
  }

  return result;
}

/**
 * Parse VCL text to an AST via the WASI component.
 *
 * @param {string} text - VCL source.
 * @returns {Promise<object>} The AST (falco `ast.VCL` serialized as JSON).
 * @throws {Error} On a parse error (the component returns `err` for parse).
 */
export async function parseAST(text) {
  return JSON.parse(componentParse(text));
}

/**
 * Format VCL text via the WASI component.
 *
 * @param {string} text - VCL source to format.
 * @param {object} [opts]
 * @param {object} [opts.config] - FormatConfig fields (indentWidth, indentStyle,
 *   lineWidth, explicitStringConcat, ...). Omit for falco defaults.
 * @returns {Promise<{formatted: string|null, error: string|null}>}
 */
export async function formatText(text, { config } = {}) {
  try {
    const formatted = componentFormat(
      text,
      config ? JSON.stringify(config) : "",
    );
    return { formatted, error: null };
  } catch (err) {
    return { formatted: null, error: err?.message ?? String(err) };
  }
}
