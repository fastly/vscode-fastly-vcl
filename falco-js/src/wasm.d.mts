// Type declarations for the WASI Component Model backend (./wasm.mjs).

export interface WasmLintOptions {
  /** Real name for the main source; the synthetic `input.vcl` key is rewritten to this. */
  vclFileName?: string;
  /** Drop the parsed AST (`Vcl`) from the result when true (default: true). */
  diagnosticsOnly?: boolean;
  /** Include module name -> source for every module reachable from the main. */
  includes?: Record<string, string>;
  /** Include search-path prefixes, matching how `includes` keys are named. */
  includePaths?: string[];
  /** Optional VCL scope (recv|hash|hit|miss|pass|fetch|error|deliver|log|pipe). */
  scope?: string;
  /** Rule severity overrides (ERROR|WARNING|INFO|IGNORE). */
  rules?: Record<string, string>;
}

export interface FormatResult {
  formatted: string | null;
  error: string | null;
}

export interface WasmFormatOptions {
  /** FormatConfig fields (indentWidth, indentStyle, lineWidth, ...). */
  config?: Record<string, unknown>;
}

export function lintText(
  text: string,
  options?: WasmLintOptions,
): Promise<unknown>;

export function parseAST(text: string): Promise<unknown>;

export function formatText(
  text: string,
  options?: WasmFormatOptions,
): Promise<FormatResult>;
