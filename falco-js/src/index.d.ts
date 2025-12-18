export interface LintOptions {
  vclFileName?: string;
  autoAddIncludes?: boolean;
  diagnosticsOnly?: boolean;
  deserialize?: boolean;
  falcoPath?: string;
}

export interface FalcoOptions {
  falcoPath?: string;
}

export function falco(args: string[], options?: FalcoOptions): Promise<string>;
export function lint(file: string): Promise<string>;
export function lintText(text: string, options?: LintOptions): Promise<unknown>;
