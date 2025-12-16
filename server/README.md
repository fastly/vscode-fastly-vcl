# Fastly VCL LSP Server

[Language Server Protocol (LSP)](https://github.com/Microsoft/language-server-protocol) implementation for [Fastly VCL](https://developer.fastly.com/learning/vcl/using).

> Feedback and feature requests: [Github issues](https://github.com/fastly/vscode-fastly-vcl/issues)

## Functionality

This server is still in an early state. It is usable but many advanced features have not yet been implemented. Currently supported features:

- [x] Diagnostics (via [falco](https://github.com/ysugimoto/falco))
- [x] Completions (functions, variables, headers, subroutines)
- [x] Boilerplate snippets
- [x] Signature help
- [x] Documentation on hover
- [x] Document symbols
