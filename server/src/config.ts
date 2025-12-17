export interface ConfigSettings {
  lintingEnabled: boolean;
  maxLintingIssues: number;
}

// Global settings, used when the `workspace/configuration` request is not supported by the client.
export const CONFIG: ConfigSettings = {
  lintingEnabled: true,
  maxLintingIssues: 100,
};

// TODO: Implement workspace-contextual config changes with .vclrc
