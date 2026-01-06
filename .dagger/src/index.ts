/**
 * Dagger CI module for vscode-fastly-vcl
 *
 * This module provides CI/CD functions for the VS Code Fastly VCL extension.
 * It handles building, linting, testing, and packaging the extension in
 * containerized environments with all required dependencies.
 */
import { dag, Container, Directory, object, func } from "@dagger.io/dagger";

@object()
export class VscodeFastlyVcl {
  /**
   * Base container with Node.js 22 and VS Code test dependencies
   */
  @func()
  base(): Container {
    return dag
      .container()
      .from("node:22-bookworm-slim")
      .withExec(["apt-get", "update"])
      .withExec([
        "apt-get",
        "install",
        "-y",
        "--no-install-recommends",
        // Required for downloading falco binaries
        "ca-certificates",
        "curl",
        // VS Code extension test dependencies
        "libnspr4",
        "libnss3",
        "libatk1.0-0",
        "libatk-bridge2.0-0",
        "libgtk-3-0",
        "libgbm1",
        "libasound2",
        // Virtual display and D-Bus for headless testing
        "xvfb",
        "xauth",
        "dbus-x11",
      ])
      .withExec(["apt-get", "clean"])
      .withExec(["rm", "-rf", "/var/lib/apt/lists/*"]);
  }

  /**
   * Container with source code and dependencies installed
   */
  @func()
  install(source: Directory): Container {
    const npmCache = dag.cacheVolume("npm-cache");

    return this.base()
      .withDirectory("/app", source, {
        exclude: [
          ".dagger",
          ".git",
          ".vscode-test",
          "*.vsix",
          "client/out",
          "coverage",
          "node_modules",
          "server/out",
        ],
      })
      .withWorkdir("/app")
      .withMountedCache("/root/.npm", npmCache)
      .withExec(["npm", "install"]);
  }

  /**
   * Build the extension (compile TypeScript)
   */
  @func()
  build(source: Directory): Container {
    return this.install(source).withExec(["npm", "run", "build"]);
  }

  /**
   * Run ESLint on source files
   */
  @func()
  async lint(source: Directory): Promise<string> {
    const result = await this.install(source)
      .withExec(["npm", "run", "lint"])
      .stdout();
    return result || "Linting passed";
  }

  /**
   * Check code formatting with Prettier
   */
  @func()
  async formatCheck(source: Directory): Promise<string> {
    const result = await this.install(source)
      .withExec(["npm", "run", "format:check"])
      .stdout();
    return result || "Format check passed";
  }

  /**
   * Run all tests with xvfb for VS Code extension tests
   */
  @func()
  async test(source: Directory): Promise<string> {
    return await this.build(source)
      .withExec(["dbus-run-session", "xvfb-run", "-a", "npm", "test"])
      .stdout();
  }

  /**
   * Package the extension as a .vsix file
   */
  @func()
  async package(source: Directory): Promise<string> {
    return await this.build(source)
      .withExec(["dbus-run-session", "xvfb-run", "-a", "npm", "run", "package"])
      .stdout();
  }

  /**
   * Run all CI checks: lint, format, test, and package
   */
  @func()
  async ci(source: Directory): Promise<string> {
    const results: string[] = [];

    // Run lint and format check in parallel (these don't need xvfb)
    const [lintResult, formatResult] = await Promise.all([
      this.lint(source),
      this.formatCheck(source),
    ]);

    results.push("=== Lint ===");
    results.push(lintResult);
    results.push("\n=== Format Check ===");
    results.push(formatResult);

    // Run tests (needs xvfb)
    results.push("\n=== Tests ===");
    results.push(await this.test(source));

    // Package the extension
    results.push("\n=== Package ===");
    results.push(await this.package(source));

    results.push("\n✅ All CI checks passed!");
    return results.join("\n");
  }
}
