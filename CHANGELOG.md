# Change Log

All notable changes to the "vscode-fastly-vcl" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added

- Add a WASI Component Model linting backend (`falco-js/src/wasm.mjs`) wrapping the jco-transpiled falco component: reactor-style (instantiated once, called repeatedly on in-memory strings, no child process or temp files), platform-independent, and resolving `include` statements from a host-supplied in-memory module map (`includes` + `includePaths`)
- Resolve `include`d modules for linting by walking the include graph and supplying each reachable module's contents to the linter (preferring open/edited buffers over disk, matched by file path so this also works on Windows and for file names containing characters such as `+` or parentheses), with a size budget that falls back to linting the main file alone (reported as a single notice, without flagging each `include` as unresolvable)
- Warm the linter's wasm component at server startup so the first document lint is not delayed by the one-time module compile
- Lint VCL snippets annotated with `# @scope: <subroutine>` (e.g. `# @scope: deliver`) in that subroutine's scope, with end-to-end tests and README documentation
- Add a selection ranges test (`npm run test:selection-ranges`) that checks every parent range contains its child at every position in every test fixture

### Changed

- Update dev dependencies to latest versions (eslint 10, @eslint/js 10, typescript 6, typescript-eslint 8.62, c8 11, @vscode/test-electron 3, @vscode/vsce 3.9.2, mocha 11.7.6, prettier 3.8.4); kept @types/node on v22 to match the Node engine target
- Adopt TypeScript 6: enable `esModuleInterop` for the client, set explicit `rootDir` and `ignoreDeprecations: "6.0"` for the server, and switch the Mocha test runner to a default import
- Switch the linting backend from the native falco binary to the WASI component; this updates falco to a newer build, which no longer reports unused subroutine parameters (`Variable "…" is unused`) as warnings
- Switch document formatting (`falco fmt`) to the WASI component backend; the newer falco collapses consecutive blank lines between top-level declarations
- Update @vscode/test-electron to 3.1.0 so tests can launch VS Code 1.110 and later on macOS, where the app executable was renamed from `Electron` to `Code`
- Rebuild the bundled falco component from falco commit `55de21f6` and transpile it with jco 1.24.3; `DEVELOPMENT.md` now records the exact source and the commands to reproduce it
- Update dependencies: @vscode/vsce 4, mocha 12 and c8 12 (clears all `npm audit` findings, all in dev tooling), eslint 10.12, typescript-eslint 8.71, prettier 3.9, vscode-languageserver-textdocument 1.0.15; ignore the generated Dagger SDK in Prettier

### Removed

- Remove the native falco binary backend entirely: the platform-specific binaries, the `postinstall` download script (`scripts/download-falco.sh`), the `falco-js` native CLI wrapper, and the `fastly.vcl.falcoPath` setting. falco now ships solely as the bundled WASI component (works on all platforms, including Windows)
- Remove the stale `server/package-lock.json`; the server is an npm workspace and installs from the root lockfile

### Fixed

- Exclude server test output (`server/out/test/**`) from the packaged extension
- Fix a language server crash on cyclic `include`s: the include that closes a cycle is now skipped when linting and reported as a warning on the main file's `include` that leads into it
- Fix a language server crash when the linter fails on a file, for example a stack overflow on very deeply nested expressions: the failure is now reported as a warning on that file, the falco component is replaced with a fresh instance (a stack overflow can corrupt it, and its runtime could then end the server process), and unhandled promise rejections are logged instead of exiting the server
- Fix document symbols (Outline, breadcrumbs, Go to Symbol) being empty for any file containing an `include` statement; includes now appear as module symbols
- Fix documentation links for names containing underscores (e.g. `std.replace_prefix`) or placeholders (e.g. `backend.{NAME}.healthy`)
- Fix intermittent CI failures where VS Code's renderer crashed during the end-to-end tests: the Dagger test container now has a 1 GiB `/dev/shm` instead of the default 64 MiB, which the renderer could exhaust
- Fix stale version numbers in the README's install command and DEVELOPMENT.md's `vsce ls` step (which takes no `.vsix` argument)
- Fix `fastly.vcl.lintingEnabled` and `fastly.vcl.maxLintingIssues` changes not applying to already-open documents: changing a setting now re-lints every open document, and disabling linting clears its diagnostics; re-enable the previously skipped configuration test
- Fix Expand Selection being silently replaced by VS Code's generic word/bracket selection: the language server sometimes returned ranges that did not nest (string literals were two characters short, and ranges that only touched the cursor or partially overlapped were chained as parents), so VS Code rejected the whole response
- Fix the end column of blocks whose closing brace follows a string literal on the same line (e.g. `acl internal { "10.0.0.0"/8; }`), which affected selection ranges and document symbol ranges

## [2.0.8] - 2026-01-30

### Changed

- Update dependencies to latest versions (prettier 3.8.1, typescript-eslint 8.54.0, vscode-languageclient 9.0.1, vscode-languageserver 9.0.1, vscode-languageserver-textdocument 1.0.12)
- Fix security vulnerabilities in transitive dependencies (lodash, undici)

### Fixed

- Fix semantic token length calculation for long strings (`{"..."}`) in regex patterns
- Increase LSP readiness timeout from 5s to 30s for slow CI environments

## [2.0.7] - 2026-01-09

### Added

- Add "Workspace Symbols" support for cross-file symbol search (Cmd+T / Ctrl+T)
- Add "Selection Ranges" support for smart expanding selection (Cmd+Shift+→ / Ctrl+Shift+→)
- Add "Semantic Tokens" support for enhanced syntax highlighting of keywords, strings, numbers, operators, regex patterns, and comments; distinguishes built-in vs user-defined symbols, read-only vs read-write variables; classifies backends/directors as class, ACLs as type, tables as struct
- Add "Document Formatting" support using `falco fmt` (Shift+Alt+F / Shift+Option+F)
- Add `fastly.vcl.formattingEnabled` setting to enable/disable document formatting (default: enabled)

## [2.0.6] - 2026-01-08

### Added

- Add "Go to Definition" support for ACLs, tables, backends, local variables and parameters (Ctrl/Cmd+Click to navigate)
- Add "Find References" support for ACLs, tables, backends, subroutines, local variables and parameters
- Add "Folding Ranges" support for collapsing subroutines, ACLs, tables, backends, if/else blocks, and comments
- Add "Document Highlights" support using falco AST for accurate highlighting of symbols, headers (`req.http.X-Custom`), and variables (`var.count`)
- Add "Rename Symbol" support for safely renaming ACLs, tables, backends, subroutines, local variables, parameters, and HTTP headers
- Add "Inlay Hints" support showing type annotations on variable assignments (`set var.x = ...` shows `: TYPE`, `set beresp.ttl = ...` shows `: RTIME`)
- Add `fastly.vcl.inlayHintsEnabled` setting to enable/disable inlay hints (default: enabled)
- Add documentation for symbol outline and breadcrumbs feature
- Add Dagger CI module for containerized, reproducible CI pipelines

### Fixed

- Bump qs dependency from 6.14.0 to 6.14.1
- Fix word selection to include dots for VCL identifiers like `var.result` and `req.http.X-Header`

### Changed

- Replace GitHub Actions shell commands with Dagger CI pipeline
- Updated the documentation, including animated GIFs

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
