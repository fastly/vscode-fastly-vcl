export interface LintOptions {
  vclFileName?: string;
  autoAddIncludes?: boolean;
  diagnosticsOnly?: boolean;
}

export interface FormatResult {
  formatted: string | null;
  error: string | null;
}

export interface FalcoVCL {
  parse(vcl: string): { ast?: unknown; error?: string };
  tokenize(vcl: string): { tokens?: unknown[]; error?: string };
  format(
    vcl: string,
    options?: Record<string, unknown>,
  ): { formatted?: string; error?: string };
  lint(
    vcl: string,
    options?: {
      scope?: string;
      includes?: Record<string, string>;
      mainFile?: string;
    },
  ): { errors?: unknown[]; ast?: unknown; error?: string };
}

export function getFalco(): Promise<FalcoVCL>;
export function lint(file: string): Promise<string>;
export function lintText(text: string, options?: LintOptions): Promise<unknown>;
export function formatText(text: string): Promise<FormatResult>;
