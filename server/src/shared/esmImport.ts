/**
 * Load an ES module from CommonJS-emitted code.
 *
 * The server is compiled with `module: commonjs`, so TypeScript downlevels a
 * literal `import(...)` expression to `require(...)`. That cannot load an ES
 * module -- and the falco WASI component backend (falco-js/src/wasm.mjs) is ESM
 * with top-level await, so `require()` throws `ERR_REQUIRE_ASYNC_MODULE`.
 *
 * Wrapping `import()` in a `Function` keeps it out of TypeScript's reach so it
 * survives as a real dynamic import at runtime. Pass an absolute path or a
 * `file://` URL: a runtime-built importer resolves bare/relative specifiers
 * against the process, not this file.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const importESM = new Function(
  "specifier",
  "return import(specifier);",
) as (specifier: string) => Promise<any>;
