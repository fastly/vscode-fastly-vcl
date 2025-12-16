declare module "falco-js" {
  interface LintOptions {
    vclFileName?: string;
    diagnosticsOnly?: boolean;
  }

  export function lintText(
    text: string,
    options?: LintOptions,
  ): Promise<unknown>;
}
