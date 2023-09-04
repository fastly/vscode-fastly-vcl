# Development

## What's in the folder

- `package.json` - this is the manifest file in which you declare your language support and define the location of the grammar file that has been copied into your extension.
- `syntaxes/vcl.tmLanguage.json` - this is the Text mate grammar file that is used for tokenization.
- `language-configuration.json` - this is the language configuration, defining the tokens that are used for comments and brackets.
- `client/` - this is the Language Server Protocol client that talks to the LSP server ([`fastly-vcl-lsp`](https://www.npmjs.com/package/fastly-vcl-lsp)).

## Building and running this extension

You'll need [Node.js](https://nodejs.org) and [npm](https://www.npmjs.com/): 

```term
brew install npm
npm i node@lts
```

To develop this extension on your machine, clone this repository and install its dependencies:

```term
gh repo clone fastly/vscode-fastly-vcl
cd vscode-fastly-vcl
npm i
```

### Local development server

1. Open this folder in VS Code.
1. Run `Cmd+Shift+B` to start compiling the client in watch mode.
1. Press `Cmd+Shift+D` to switch to the **Run and Debug View** in the sidebar.
1. Select `Fastly VCL Client` from the drop down.
1. Press **▷** to run the launch config with the debugger attached (`F5`).
1. In the [Extension Development Host](https://code.visualstudio.com/api/get-started/your-first-extension#:~:text=Then%2C%20inside%20the%20editor%2C%20press%20F5.%20This%20will%20compile%20and%20run%20the%20extension%20in%20a%20new%20Extension%20Development%20Host%20window.) instance of VSCode, open a document in `Fastly VCL` language mode. 
1. Save the file with a `.vcl` extension. 
1. Use it as a scratchpad to try out all the features!

### Testing

To run the grammar tests:

```bash
npm test
```

The test cases are stored as markdown files under `test/colorize-fixtures`. Grammar test results are stored under `test/colorize-results`, which are automatically generated from the fixtures.

To run the LSP tests:

```bash
npm run test-client
```

### Packaging and installation

Run the following command to compile the VSCode extension as a `.vsix` file.

```term
npm run package
```

Then, either run `code --install-extension vscode-fastly-vcl-{VERSION}.vsix` or follow the steps below to install the extension: 

1. Press `Cmd+Shift+X` to go to the VS Code extension tab.
1. Click the ellipsis (above "Search Extensions in Marketplace") and pick `Install from VSIX...` from the dropdown.
1. Install the `.vsix` file you created.

![How to install a VSIX](https://github.com/doramatadora/vscode-fastly-vcl/assets/12828487/090175b9-ae10-4982-a6b8-81f42998e587)

### Contributing

Please open a pull request with your changes.

## Functionality

### Syntax highlighting (VSCode capability)

This uses a JSON [TextMate language grammar](https://macromates.com/manual/en/language_grammars): [syntaxes/vcl.tmLanguage.json](syntaxes/vcl.tmLanguage.json), a structured collection of regular expressions, to tokenize the text into scopes such as:

- `keyword.control.vcl`
- `variable.other.vcl`
- `string.quoted.double.vcl`
- `comment.line.number-sign.vcl`

For example, the extension scopes Fastly code macros as control keywords using a regular expression in JSON:

```json
{
  "name": "keyword.control.vcl",
  "match": "^\\s*#FASTLY\\s+(deliver|error|fetch|hash|hit|log|miss|pass|recv)\\s*$"
}
```

Visual Studio Code themes such as GitHub Dark Default or the default Light+ map scopes to colours and styles.

The GitHub Dark default theme maps the keyword scope to red using a JavaScript object:

```js
{
  scope: "keyword",
  settings: {
    foreground: lightDark(scale.red[5], scale.red[3])
  }
}
```


### Fastly VCL LSP capabilities

The [Fastly VCL Language Server Protocol (LSP) server](https://www.npmjs.com/package/fastly-vcl-lsp) works for `.vcl` files. The server is still in an early state. The following list tracks the protocol features that are supported:

- [ ] `textDocument/codeAction`
- [x] `textDocument/completion` (incl. `completion/resolve`)
- [ ] `textDocument/definition`
- [x] `textDocument/didChange (incremental)`
- [x] `textDocument/didClose`
- [x] `textDocument/didOpen`
- [x] `textDocument/didSave`
- [ ] `textDocument/documentHighlight`
- [x] `textDocument/documentSymbol`
- [ ] `textDocument/executeCommand`
- [ ] `textDocument/formatting`
- [x] `textDocument/hover`
- [ ] `textDocument/inlayHint`
- [ ] `textDocument/prepareCallHierarchy`
- [ ] `callHierarchy/incomingCalls`
- [ ] `callHierarchy/outgoingCalls`
- [ ] `textDocument/prepareRename`
- [ ] `textDocument/rangeFormatting`
- [ ] `textDocument/references`
- [ ] `textDocument/rename`
- [ ] `textDocument/selectionRange`
- [x] `textDocument/signatureHelp`
- [ ] `workspace/symbol`
- [x] `workspace/didChangeConfiguration`
- [ ] `workspace/executeCommand`
