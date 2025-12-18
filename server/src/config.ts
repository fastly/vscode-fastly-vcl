export interface ConfigSettings {
  lintingEnabled: boolean;
  maxLintingIssues: number;
  falcoPath: string;
}

// Global settings, used when the `workspace/configuration` request is not supported by the client.
export const CONFIG: ConfigSettings = {
  lintingEnabled: true,
  maxLintingIssues: 100,
  falcoPath: "",
};
