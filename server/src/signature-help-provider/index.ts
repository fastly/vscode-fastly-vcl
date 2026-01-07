/**
 * Signature Help Provider for Fastly VCL
 *
 * This module provides signature help (parameter hints) when users type function
 * calls in VCL files. As the user types a function name followed by an opening
 * parenthesis, a tooltip appears showing the function's signature, parameter
 * types, and documentation.
 *
 * ## How it works
 *
 * 1. **Metadata Loading**: On startup, function signatures are loaded from
 *    `metadata/functions.json` and pre-processed into a map of `SignatureInformation`
 *    objects for fast lookup.
 *
 * 2. **Trigger Detection**: When the user types `(` or `,`, VS Code sends a
 *    `textDocument/signatureHelp` request to the LSP server.
 *
 * 3. **Function Identification**: The provider extracts the current line up to
 *    the cursor position and uses a regex to find function call patterns
 *    (e.g., `function_name(`). The last match is used to handle nested calls.
 *
 * 4. **Active Parameter Tracking**: By counting commas after the function name,
 *    the provider determines which parameter the user is currently typing,
 *    highlighting that parameter in the signature tooltip.
 *
 * 5. **Documentation**: Each signature includes Markdown documentation with
 *    the function description, available subroutine scope, and a link to the
 *    Fastly documentation.
 */
import { SignatureHelpParams, SignatureHelp } from "vscode-languageserver/node";

import * as functions from "./functions";

export function help(params: SignatureHelpParams): SignatureHelp | undefined {
  return functions.signatureHelpProvider(params);
}
