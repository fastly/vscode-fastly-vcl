export interface ConfigSettings {
  lintingEnabled: boolean;
  maxLinterIssues: number;
}

// Global settings, used when the `workspace/configuration` request is not supported by the client.
export const CONFIG: ConfigSettings = {
  lintingEnabled: true,
  maxLinterIssues: 1000,
};

// TODO: Implement workspace-contextual config changes with .vclrc
