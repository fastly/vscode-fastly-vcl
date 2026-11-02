# Development

## What's in the folder

- `package.json` - this is the manifest file in which you declare your language support and define the location of the grammar file that has been copied into your extension.
- `syntaxes/vcl.tmLanguage.json` - this is the Text mate grammar file that is used for tokenization.
- `language-configuration.json` - this is the language configuration, defining the tokens that are used for comments and brackets.
- `client/` - this is the Language Server Protocol client, which starts the server as a Web Worker.
- `server/` - this is the Language Server Protocol server that provides completions, hover, diagnostics, and other IDE features.
- `falco-js/` - a wrapper around falco's WASI component, which lints and formats VCL.
- `scripts/bundle.mjs` - bundles the client, the server and the e2e tests with esbuild, and writes `ThirdPartyNotices.txt` (shipped in the package, not committed) with the licenses of the npm packages bundled into the client and server, followed by `falco-js/component/THIRD_PARTY_LICENSES.txt`.
- `scripts/falco-licenses.mjs` - writes `falco-js/component/THIRD_PARTY_LICENSES.txt`, the licenses of the software in the falco component (see "Updating falco").

## Architecture

The extension is browser-only: its `package.json` has a `browser` entry point and no `main`, so VS Code runs it in the web worker extension host, on the desktop as well as on [vscode.dev](https://vscode.dev) and [github.dev](https://github.dev).

- The client (`client/dist/extension.js`) starts the language server (`server/dist/server.js`) as a Web Worker using `vscode-languageclient/browser`. VS Code loads the worker with `importScripts()` from a `blob:` URL, so the server bundle is a classic script, not an ES module.
- The server has no file system. It works on URIs, and reads files that are not open in the editor (`include`d modules) by sending a `fastly.vcl/readFile` request to the client, which reads them with `workspace.fs` (`client/src/readFile.ts`). VS Code runs browser-only extensions in Restricted Mode too, so the client decides what may be read: regular files up to the linter's budget, on a file system the window uses, and only inside the workspace folders when the workspace is untrusted or the file system is virtual.
- falco's core wasm modules are not bundled. The worker cannot locate them itself, so the client passes their location in `initializationOptions.falcoComponentUrl`, and the server fetches them from `falco-js/component/`.
- Client and server code must not use Node APIs (`fs`, `path`, `url`, `process`, `Buffer`). The server is type-checked against the WebWorker library, without Node types.

## Building and running this extension

To build and test the extension you'll need [Node.js](https://nodejs.org) and [npm](https://www.npmjs.com/) (the extension itself does not need them):

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

falco ships as a WASI Component Model module vendored at `falco-js/component/` (including `falco-component.core.wasm`), so no separate download step is needed.

### Local development server

1. Open this folder in VS Code.
1. Run `Cmd+Shift+B` to start type-checking and bundling in watch mode (`npm run dev`).
1. Press `Cmd+Shift+D` to switch to the **Run and Debug View** in the sidebar.
1. Select `Fastly VCL Client` from the drop down.
1. Press **▷** to run the launch config with the debugger attached to the web worker extension host (`F5`).
1. In the [Extension Development Host](https://code.visualstudio.com/api/get-started/your-first-extension#:~:text=Then%2C%20inside%20the%20editor%2C%20press%20F5.%20This%20will%20compile%20and%20run%20the%20extension%20in%20a%20new%20Extension%20Development%20Host%20window.) instance of VSCode, open a document in `Fastly VCL` language mode.
1. Save the file with a `.vcl` extension.
1. Use it as a scratchpad to try out all the features!

### Testing

To run the language server's unit tests (Node's test runner, via tsx):

```bash
npm run test:unit
```

To run the grammar tests:

```bash
npm run test:colorization
```

The test cases are stored as markdown files under `test/colorize-fixtures`. Grammar test results are stored under `test/colorize-results`, which are automatically generated from the fixtures. A run that finds different tokens or colors rewrites the results and fails; review the diff and commit it if the change is intended. Themes new in VS Code are added to the results without failing.

To run the semantic tokens tests:

```bash
npm run test:semantic-tokens
```

The test renders `client/testFixture/semanticTokens.vcl` with XML tags showing token types and compares against `test/semantic-tokens-results/semanticTokens.vcl.xml`. To update the expected output after changes:

```bash
npx tsx server/src/test/renderSemanticTokens.ts client/testFixture/semanticTokens.vcl > test/semantic-tokens-results/semanticTokens.vcl.xml
```

To check that selection ranges are properly nested (each parent contains its child) at every position in every fixture under `client/testFixture`:

```bash
npm run test:selection-ranges
```

To check that the falco wrapper recovers after the component fails, for example after a stack overflow on deeply nested VCL, and that it loads the component from a URL, retrying failed and stalled downloads:

```bash
npm run test:falco
```

To run the LSP tests in desktop VS Code:

```bash
npm run test:e2e
```

To run the same tests in VS Code for the Web, in Chromium (default), Firefox or WebKit:

```bash
npm run test:e2e:web
BROWSER=firefox npm run test:e2e:web
```

The first run downloads VS Code for the Web; install the browsers once with `npx playwright install chromium firefox webkit`.

The LSP tests run in the same web worker extension host as the extension, so:

- test code cannot use Node APIs; tests find their fixtures through the workspace folder (`client/testFixture`, opened by the test runners) and write files with `workspace.fs`
- `scripts/bundle.mjs` bundles every `client/src/test/*.test.ts` into `client/dist/test/index.js`, using mocha's browser build
- mocha must stay on version 11: mocha 12's browser build never finishes a run in VS Code's web worker extension host, so VS Code never exits
- on macOS, desktop runs create a socket at `.vscode-test/user-data/1.14-main.sock` inside the checkout, which must stay under 104 bytes: run them from a checkout with a short path

### Updating LSP metadata

The LSP server uses JSON metadata files in `server/src/metadata/` for completions, hover, and other features. To regenerate these from upstream source definitions:

```bash
./scripts/generate-metadata.sh <path-to-source-json-dir>
```

This requires `jq` to be installed. The jq filters are in `jq-filters/`.

### Updating falco

falco is vendored as a WASI Component Model build at `falco-js/component/`, transpiled to JavaScript with [jco](https://github.com/bytecodealliance/jco).

The component build target is not in upstream falco yet. It lives on the `acme/add-wasi-component` branch of [acme/falco](https://github.com/acme/falco/tree/acme/add-wasi-component), proposed upstream in [ysugimoto/falco#622](https://github.com/ysugimoto/falco/pull/622). Building it needs Go and [`wasm-tools`](https://github.com/bytecodealliance/wasm-tools).

The vendored build:

|              |                                                                        |
| ------------ | ---------------------------------------------------------------------- |
| falco commit | `55de21f67377d024b910586876d764089e8f9654` (`acme/add-wasi-component`) |
| jco          | 1.24.3                                                                 |

To update it, build the component in a falco checkout, then transpile it straight into `falco-js/component/`. This overwrites the generated files and keeps `falco-js/component/package.json`:

```bash
# In the falco checkout
git checkout acme/add-wasi-component
make wasm-component            # writes wasm/falco-component.wasm

# In this repository
npx @bytecodealliance/jco@1.24.3 transpile <falco-checkout>/wasm/falco-component.wasm --instantiation async -o falco-js/component
node scripts/falco-licenses.mjs <falco-checkout> 1.24.3
```

The `--instantiation async` flag is required: `falco-js/src/wasm.mjs` creates instances itself, so it can replace one after a failed call. `scripts/falco-licenses.mjs` regenerates `falco-js/component/THIRD_PARTY_LICENSES.txt`, the licenses shipped for the component: falco, the Go modules it links (as `go list` resolves them in the checkout, including its `go.work`), the Go standard library, the WASI adapter (fetched from wasmtime on GitHub at the version the falco Makefile pins) and jco (from npm). Run it in the same checkout, with the same Go toolchain, as the build. Then update the commit in the table above, run `npm test`, and note the new falco build in `CHANGELOG.md`. Keep the jco version in step with `@bytecodealliance/preview2-shim` in `package.json` and `falco-js/package.json`, since the generated code imports it at runtime.

### Linting and formatting

To check for lint errors:

```bash
npm run lint
```

To check code formatting:

```bash
npm run format:check
```

To auto-fix formatting:

```bash
npm run format
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

### Continuous Integration

CI runs automatically on all pull requests via GitHub Actions with [Dagger](https://dagger.io/), a containerized CI/CD engine. The pipeline runs:

- Linting (`npm run lint`)
- Formatting checks (`npm run format:check`)
- Colorization tests (`npm run test:colorization`)
- Semantic tokens tests (`npm run test:semantic-tokens`)
- falco recovery tests (`npm run test:falco`)
- Selection ranges tests (`npm run test:selection-ranges`)
- Unit tests (`npm run test:unit`)
- LSP e2e tests (`npm run test:e2e`)
- LSP e2e tests in VS Code for the Web, in Chromium, Firefox and WebKit (`npm run test:e2e:web`)
- Package building (`npm run package`)

#### Running CI locally with Dagger

Dagger lets you run the exact same CI pipeline locally that runs in GitHub Actions. Install the Dagger CLI:

```bash
brew install dagger/tap/dagger
```

Run the full CI pipeline:

```bash
npm run dagger:ci
# or directly: dagger call ci --source=.
```

Run individual steps:

```bash
npm run dagger:lint          # Run linting
npm run dagger:test          # Run tests
npm run dagger:test-web      # Run the e2e tests in VS Code for the Web
dagger call format-check --source=.
dagger call package --source=.
```

List all available Dagger functions:

```bash
dagger functions
```

The Dagger module is defined in `.dagger/src/index.ts`.

### Contributing

Please open a pull request with your changes.

### Releasing

To publish a new version to the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=fastly.vscode-fastly-vcl):

1. **Prerequisites**
   - You must be a member of the `fastly` publisher on the VS Code Marketplace

2. **Prepare the release**
   - Update `version` in `package.json`
   - npm install
   - Run `npx vsce ls --tree`, check if all files are needed in the extension, otherwise add them to .vscodeignore
   - Move items from "Unreleased" to a new version section in `CHANGELOG.md`
   - Commit these changes: `git commit -am "chore: prepare release v2.0.X"`

3. **Run all checks**

   ```bash
   npm run lint
   npm run format:check
   npm test
   ```

4. **Publish**
   Using the UI:
   - Visit https://marketplace.visualstudio.com/vscode
   - Select "Publish extensions"
   - Log in as your personal account and authenticate.
   - Select the three dots near the extension and select Update
   - Upload the new .vsix

5. **Tag the release**

   ```bash
   git tag vX.Y.Z
   git push origin main --tags
   ```

6. **Upload a new GitHub release**
   Visit https://github.com/fastly/vscode-fastly-vcl/releases and upload the
   .vsix file with a changelog.

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

The Fastly VCL Language Server Protocol (LSP) server (in `server/`) works for `.vcl` files. The server is still in an early state. The following list tracks the protocol features that are supported:

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
