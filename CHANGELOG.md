# Change Log

All notable changes to the "vscode-fastly-vcl" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## Unreleased

### Added

- Add "Go to Definition" support for ACLs, tables, and backends (Ctrl/Cmd+Click to navigate)

### Fixed

- Bump qs dependency from 6.14.0 to 6.14.1

## [2.0.5] - 2026-01-05

### Added

- Add tests for deprecated variable warnings (`client.display.width`, `client.display.height`)
- Add test for `header.set` function not producing false lint errors
- Add test for subroutines with parameters
- Add `fastly.vcl.falcoPath` setting to specify a custom falco binary path

### Changed

- Upgrade falco to v2.0.0 and embed the falco-js library and falco binaries
- Remove "Experimental:" prefix from `lintingEnabled` setting description
- Reduce extension package size by excluding source maps, unused icon.svg, and schema files

### Fixed

- Fix slow tests caused by waiting for diagnostics on files with no lint warnings
- Fix TypeScript type resolution for vscode, mocha, and node in client tests
- Sort diagnostics in tests for stable comparison order
- Increase document symbols test timeouts for slow CI environments (60s + 30s)

## [2.0.4] - 2025-12-17

### Changed

- Embed LSP server source directly in extension (previously depended on external `fastly-vcl-lsp` npm package)
- Enable TypeScript strict mode for server
- Add script to regenerate LSP metadata from upstream JSON definitions
- Move subroutine availability info directly after the name to function and variable hover, completion, and signature help
- Ensure all descriptions end with a full stop
- Use inline code formatting instead of headings in hover popups
- Reduce extension package size by excluding unnecessary files (test files, build artifacts, development scripts)

### Fixed

- Fix document symbols crashing when subroutine closing brace not found
- Include parameter types in function signatures for hover and completion
- Fix function and variable documentation URLs to include category in path
- Fix `maxLintingIssues` setting not being applied (property name mismatch)

### Added

- Add test for `maxLintingIssues` setting
- Add test for `lintingEnabled` setting

### Removed

- Remove unimplemented `.vclrc` file watcher

## [2.0.3] - 2025-12-16

### Changed

- Syntax highlighting improvements:
  - Add 'w' (week) time unit to duration pattern
  - Add std.strcasecmp to function pattern
  - Add hit_for_pass to return statements
  - Fix operator pattern to correctly handle -=
  - Add support for digest.ecdsa_verify function
  - Add support for fastly.try_select_shield function
  - Add support for UUID version 7 functions
  - Add support for time.interval_elapsed_ratio variable
  - Add support for header manipulation functions
  - Add deliver_stale to return statements
  - Fix ordering in some variable patterns

### Fixed

- Refactor npm scripts and GitHub workflow configuration
- Update @vscode/test-electron to handle new VS Code builds
- Update development dependencies
- Remove development husky git hooks
- Approach VS Code's linting rules
- Enforce code style with Prettier
- Enable TypeScript strict mode
- Add error handling for LSP server startup failures
- Fix VS Code default build task to use existing `dev` script
- Replace hard-coded sleep in tests with LSP readiness polling
- Enable stricter TypeScript ESLint rules (no-unused-vars, no-explicit-any, no-non-null-assertion)
- Add startup message to output channel for debugging visibility
- Synchronize extension configuration settings to the language server
- Add hover, signature help, document symbols, and configuration test coverage
- Update CI to use Node 22 (matching package.json requirement) and actions/setup-node@v6
- Update TypeScript to 5.9.3 and typescript-eslint to 8.49.0
- Add code coverage reporting with c8
- Add release instructions to DEVELOPMENT.md

## [2.0.2] - 2023-10-06

### Changed

- Optimize image screenshots

## [2.0.1] - 2023-10-03

### Changed

- "Toggle Line Comment" now adds `#` rather than `//`.

## [2.0.0] - 2023-09-23

### Added

- Integration with [`fastly-vcl-lsp`](https://www.npmjs.com/package/fastly-vcl-lsp).
- Support for completions, including context-aware completions (functions, variables, headers, Fastly macros).
- Signature help for functions.
- Boilerplate snippets for subroutines.
- Show documentation on hover.
- Diagnostics (using [`falco`](https://github.com/ysugimoto/falco) – Linux & Darwin, ARM/AMD64 only).
- Indentation and folding range directives in the language configuration.

### Changed

- Comments must start with `//`.

## [1.0.4] - 2022-11-03

### Changed

- Document that the extension in now in the Visual Studio Marketplace.
- Add a beautiful new icon.
- Document how the extension works.
- Fix link to the language file in the README.

## [1.0.3] - 2022-10-10

### Added

- Add highlighting for elseif and elsif.

## [1.0.2] - 2022-10-04

### Changed

- Note that previously-enabled VCL extensions can be disabled as well as uninstalled.
- Clarify that this is an extension specifically for Fastly VCL, not general VCL.
- Rename from vscode-vcl to vscode-fastly-vcl.
- Colorize "#" and "//" as comments even if there are no letters behind.
- Add more dependencies to the README.
- Add list of contributors.

## [1.0.1] - 2022-09-07

### Added

- Documented that only one VCL extension should be installed.

### Changed

- Tighten up `#FASTLY` macro matching.

## [1.0.0] - 2022-09-06

- Initial release.
