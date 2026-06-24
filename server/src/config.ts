export interface ConfigSettings {
  lintingEnabled: boolean;
  maxLintingIssues: number;
  inlayHintsEnabled: boolean;
  formattingEnabled: boolean;
}

// Global settings, used when the `workspace/configuration` request is not supported by the client.
export const CONFIG: ConfigSettings = {
  lintingEnabled: true,
  maxLintingIssues: 100,
  inlayHintsEnabled: true,
  formattingEnabled: true,
};
