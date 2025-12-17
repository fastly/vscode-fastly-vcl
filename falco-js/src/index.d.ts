export interface LintOptions {
  vclFileName?: string;
  autoAddIncludes?: boolean;
  diagnosticsOnly?: boolean;
  deserialize?: boolean;
}

export function falco(args: string[]): Promise<string>;
export function lint(file: string): Promise<string>;
export function lintText(text: string, options?: LintOptions): Promise<unknown>;
