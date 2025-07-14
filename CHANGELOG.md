# Change Log

All notable changes to the "vscode-fastly-vcl" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## Unreleased

### Changed

- Update @vscode/test-electron to handle new VS Code builds
- Update development dependencies
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
