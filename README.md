# vscode-fastly-vcl

![.vcl icon](icon.png)

A Visual Studio Code extension which adds syntax highlighting for Fastly Varnish Configuration Language (VCL) files.

![Dark and light screenshots](screenshots.png)

## Features

This uses a JSON [TextMate language grammar](https://macromates.com/manual/en/language_grammars): [syntaxes/vtc.tmLanguage.json](syntaxes/vtc.tmLanguage.json), a structured collection of regular expressions, to tokenize the text into scopes. Visual Studio Code themes map scopes to colours and styles.

This was built entirely from the public [VCL reference](https://developer.fastly.com/reference/vcl/).

The screenshots above are of [VCL boilerplate](https://developer.fastly.com/learning/vcl/using/#adding-vcl-to-your-service-configuration) using the [GitHub Dark Default](https://marketplace.visualstudio.com/items?itemName=GitHub.github-vscode-theme) theme and the [JetBrains Mono](https://www.jetbrains.com/lp/mono/) font and using Visual Studio Code's default Light+ theme and the [Cascadia Code](https://github.com/microsoft/cascadia-code) font.

## Installation

Uninstall (or disable) any previously-enabled VCL extensions.

Download the [latest GitHub release](https://github.com/fastly/vscode-fastly-vcl/releases/) and then run:

```bash
code --install-extension vscode-fastly-vcl-1.0.1.vsix
```

## Development

### Contributing
Please open a pull request with your changes.

### Dependencies

Install NPM - Node.js Package Manager

```bash
brew install npm
```

Install VSCE - Visual Studio Code Extensions is a command-line tool for packaging, publishing and managing VS Code extensions
```bash
npm install -g vsce
```

Install Electron - Node module helps you test VS Code extensions
```bash
npm i @vscode/test-electron
```

### Building and Installing

```bash
vsce package && code --install-extension vscode-fastly-vcl-1.0.2.vsix
```

## Testing

To run the grammar tests:

```bash
npm test
```

The test cases are stored as markdown files under `test/colorize-fixtures`. Grammar test results are stored under `test/colorize-results`, which are automatically generated from the fixtures.

## Requirements

None.

## Extension Settings

None.

## Known Issues

None.

## Release Notes

## [1.0.2] - UNRELEASED

### Changed

- Note that previously-enabled VCL extensions can be disabled as well as uninstalled.
- Clarify that this is an extension specifically for Fastly VCL, not general VCL.
- Rename from vscode-vcl to vscode-fastly-vcl.

## [1.0.1] - 2022-09-07

### Added

- Documented that only one VCL extension should be installed.

### Changed

- Tighten up `#FASTLY` macro matching.

## [1.0.0] - 2022-09-06

- Initial release.

---

## TODO

- Syntax highlight VCL embedded into Markdown documents.
- Syntax highlight regular expressions.

## Future

Is this useful? Let me know! Leon Brocard <<leon@fastly.com>>
