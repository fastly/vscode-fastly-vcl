/**
 * Semantic Tokens Provider for VCL files.
 *
 * Provides enhanced syntax highlighting by classifying tokens based on their
 * semantic meaning, going beyond what the TextMate grammar can achieve.
 *
 * Token classifications:
 * - Built-in functions (e.g., `digest.hash_sha256`) → function + defaultLibrary
 * - User subroutine definitions → function + declaration
 * - User subroutine calls → function
 * - Built-in variables (e.g., `req.url`) → variable + defaultLibrary (+ readonly if RO)
 * - User variables (`var.*`) → variable
 * - Backends, ACLs, tables → class + declaration (definitions) or class (references)
 * - VCL types → type
 * - Subroutine parameters → parameter
 */
import {
  SemanticTokens,
  SemanticTokensParams,
  SemanticTokensBuilder,
  SemanticTokensLegend,
} from "vscode-languageserver/node";

import { documentCache } from "../shared/documentCache";
import { walkAST, ASTNode } from "../shared/ast";
import { getSymbolInformation } from "../symbol-provider";
import vclFunctions from "../metadata/functions.json";
import vclVariables from "../metadata/variables.json";

/**
 * Semantic token types supported by this provider.
 * Order matters - index is used in the encoded tokens.
 *
 * Standard semantic token types (LSP):
 * ✅ namespace    - (not used) VCL has no namespaces
 * ✅ class        - backends, directors, ratecounters, penaltyboxes
 * ✅ enum         - (not used) VCL has no enums
 * ✅ interface    - (not used) VCL has no interfaces
 * ✅ struct       - tables (key-value data structures)
 * ✅ typeParameter- (not used) VCL has no generics
 * ✅ type         - type annotations (STRING, INTEGER, etc.) and ACLs
 * ✅ parameter    - subroutine parameters
 * ✅ variable     - local variables (var.*) and built-in variables
 * ✅ property     - HTTP headers (req.http.*, resp.http.*, etc.)
 * ✅ enumMember   - (not used) VCL has no enums
 * ✅ decorator    - (not used) VCL has no decorators
 * ✅ event        - (not used) VCL has no events
 * ✅ function     - subroutine definitions and calls, built-in functions
 * ✅ method       - (not used) VCL has no methods (use function)
 * ✅ macro        - (not used) VCL has no macros
 * ✅ label        - (not used) VCL has no labels
 * ✅ comment      - single-line (#) and multi-line comments
 * ✅ string       - string literals ("..." and {"..."})
 * ✅ keyword      - control flow (return, if, else, etc.)
 * ✅ number       - numeric literals (integers, floats, rtimes)
 * ✅ regexp       - regex patterns in ~ operator and regsub functions
 * ✅ operator     - operators (+, -, ==, ~, &&, ||, etc.)
 */
export const tokenTypes = [
  "function", // 0: Functions and subroutines
  "variable", // 1: Variables
  "parameter", // 2: Subroutine parameters
  "class", // 3: Backends, directors (service-like objects)
  "type", // 4: Type annotations (STRING, INTEGER, etc.) and ACLs
  "struct", // 5: Tables (key-value data structures)
  "property", // 6: HTTP headers
  "regexp", // 7: Regular expression patterns
  "comment", // 8: Comments
  "keyword", // 9: Control flow keywords (return, if, else, etc.)
  "string", // 10: String literals
  "number", // 11: Numeric literals (INT, FLOAT, RTIME)
  "operator", // 12: Operators (+, -, ==, ~, &&, ||, etc.)
] as const;

/**
 * Semantic token modifiers.
 * Combined as a bitmask (2^index).
 */
export const tokenModifiers = [
  "declaration", // 0: Symbol definition
  "defaultLibrary", // 1: Built-in function/variable
  "readonly", // 2: Read-only variable
] as const;

/**
 * The legend describing token types and modifiers.
 * Must be provided to the client during initialization.
 */
export const legend: SemanticTokensLegend = {
  tokenTypes: [...tokenTypes],
  tokenModifiers: [...tokenModifiers],
};

// Type indices for quick lookup
const TokenType = {
  function: 0,
  variable: 1,
  parameter: 2,
  class: 3,
  type: 4,
  struct: 5,
  property: 6,
  regexp: 7,
  comment: 8,
  keyword: 9,
  string: 10,
  number: 11,
  operator: 12,
} as const;

// Modifier bitmasks
const TokenModifier = {
  declaration: 1 << 0, // 1
  defaultLibrary: 1 << 1, // 2
  readonly: 1 << 2, // 4
} as const;

// Built-in function names for quick lookup
const builtinFunctions = new Set(Object.keys(vclFunctions));

// Built-in variable info for quick lookup
const builtinVariables = new Map<string, { readonly: boolean }>();
for (const [name, info] of Object.entries(
  vclVariables as Record<string, { access?: string }>,
)) {
  builtinVariables.set(name, { readonly: info.access === "RO" });
}

// VCL types
const vclTypes = new Set([
  "STRING",
  "INTEGER",
  "FLOAT",
  "BOOL",
  "BOOLEAN",
  "TIME",
  "RTIME",
  "IP",
  "BACKEND",
  "ACL",
]);

interface TokenInfo {
  line: number;
  character: number;
  length: number;
  tokenType: number;
  tokenModifiers: number;
}

/**
 * Resolves semantic tokens for the given document.
 */
export function resolve(params: SemanticTokensParams): SemanticTokens {
  const doc = documentCache.get(params.textDocument.uri);
  if (!doc || !doc.AST) {
    return { data: [] };
  }

  const tokens: TokenInfo[] = [];
  const symbols = getSymbolInformation(doc);

  // Create a set of user-defined symbol names for quick lookup
  const userSubroutines = new Set<string>();
  const userObjects = new Set<string>(); // backends, ACLs, tables, directors

  for (const symbol of symbols) {
    if (symbol.detail === "SUBROUTINE") {
      userSubroutines.add(symbol.name);
    } else if (
      symbol.detail &&
      [
        "BACKEND",
        "ACL",
        "TABLE",
        "DIRECTOR",
        "RATECOUNTER",
        "PENALTYBOX",
      ].includes(symbol.detail)
    ) {
      userObjects.add(symbol.name);
    }
  }

  // Walk the AST and collect tokens
  walkAST(doc.AST, (node: ASTNode) => {
    const nodeTokens = extractTokens(node, userSubroutines, userObjects);
    tokens.push(...nodeTokens);
  });

  // Sort tokens by position (required for delta encoding)
  tokens.sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    return a.character - b.character;
  });

  // Remove duplicate/overlapping tokens at the same position
  // When a token has multiple classifications (e.g., string that's also a regex),
  // prefer the more specific type (regexp over string)
  const deduped: TokenInfo[] = [];
  for (const token of tokens) {
    const last = deduped[deduped.length - 1];
    if (
      last &&
      last.line === token.line &&
      last.character === token.character
    ) {
      // Same position - keep the more specific token type
      // regexp (7) is more specific than string (10) for regex patterns
      if (token.tokenType === TokenType.regexp) {
        deduped[deduped.length - 1] = token;
      }
      // Otherwise keep the existing token
    } else {
      deduped.push(token);
    }
  }

  // Build the semantic tokens using delta encoding
  const builder = new SemanticTokensBuilder();
  for (const token of deduped) {
    builder.push(
      token.line,
      token.character,
      token.length,
      token.tokenType,
      token.tokenModifiers,
    );
  }

  return builder.build();
}

/**
 * Extracts semantic tokens from an AST node.
 */
function extractTokens(
  node: ASTNode,
  userSubroutines: Set<string>,
  userObjects: Set<string>,
): TokenInfo[] {
  const tokens: TokenInfo[] = [];

  if (!node.Token) return tokens;

  const nodeType = node.Token.Type;

  switch (nodeType) {
    // Statement keywords (no associated name)
    case "ADD":
    case "REMOVE":
    // Control flow keywords
    case "BREAK":
    case "ELSE":
    case "ELSEIF":
    case "ELSIF":
    case "ERROR":
    case "FALLTHROUGH":
    case "GOTO":
    case "IF":
    case "INCLUDE":
    case "IMPORT":
    case "LOG":
    case "RESTART":
    case "RETURN":
    case "SYNTHETIC":
    case "SYNTHETIC_BASE64":
      tokens.push({
        line: node.Token.Line - 1,
        character: node.Token.Position - 1,
        length: node.Token.Literal.length,
        tokenType: TokenType.keyword,
        tokenModifiers: 0,
      });
      break;

    // Call statement: keyword + subroutine name
    case "CALL":
      tokens.push({
        line: node.Token.Line - 1,
        character: node.Token.Position - 1,
        length: node.Token.Literal.length,
        tokenType: TokenType.keyword,
        tokenModifiers: 0,
      });
      if (node.Subroutine?.Token) {
        tokens.push({
          line: node.Subroutine.Token.Line - 1,
          character: node.Subroutine.Token.Position - 1,
          length: node.Subroutine.Value.length,
          tokenType: TokenType.function,
          tokenModifiers: 0,
        });
      }
      break;

    // Subroutine declaration: keyword + function name + parameters
    case "SUBROUTINE":
      tokens.push({
        line: node.Token.Line - 1,
        character: node.Token.Position - 1,
        length: node.Token.Literal.length,
        tokenType: TokenType.keyword,
        tokenModifiers: 0,
      });
      if (node.Name?.Token && !node.Nest) {
        tokens.push({
          line: node.Name.Token.Line - 1,
          character: node.Name.Token.Position - 1,
          length: node.Name.Value.length,
          tokenType: TokenType.function,
          tokenModifiers: TokenModifier.declaration,
        });

        // Add parameter tokens
        if (Array.isArray(node.Parameters)) {
          for (const param of node.Parameters) {
            // Parameter type
            if (param.Type?.Token) {
              tokens.push({
                line: param.Type.Token.Line - 1,
                character: param.Type.Token.Position - 1,
                length: param.Type.Value.length,
                tokenType: TokenType.type,
                tokenModifiers: 0,
              });
            }
            // Parameter name
            if (param.Name?.Token) {
              tokens.push({
                line: param.Name.Token.Line - 1,
                character: param.Name.Token.Position - 1,
                length: param.Name.Value.length,
                tokenType: TokenType.parameter,
                tokenModifiers: TokenModifier.declaration,
              });
            }
          }
        }
      }
      break;

    // Backend/director declaration: keyword + class name
    case "BACKEND":
    case "DIRECTOR":
    case "RATECOUNTER":
    case "PENALTYBOX":
      tokens.push({
        line: node.Token.Line - 1,
        character: node.Token.Position - 1,
        length: node.Token.Literal.length,
        tokenType: TokenType.keyword,
        tokenModifiers: 0,
      });
      if (node.Name?.Token) {
        tokens.push({
          line: node.Name.Token.Line - 1,
          character: node.Name.Token.Position - 1,
          length: node.Name.Value.length,
          tokenType: TokenType.class,
          tokenModifiers: TokenModifier.declaration,
        });
      }
      break;

    // ACL declaration: keyword + type name
    case "ACL":
      tokens.push({
        line: node.Token.Line - 1,
        character: node.Token.Position - 1,
        length: node.Token.Literal.length,
        tokenType: TokenType.keyword,
        tokenModifiers: 0,
      });
      if (node.Name?.Token) {
        tokens.push({
          line: node.Name.Token.Line - 1,
          character: node.Name.Token.Position - 1,
          length: node.Name.Value.length,
          tokenType: TokenType.type,
          tokenModifiers: TokenModifier.declaration,
        });
      }
      break;

    // Table declaration: keyword + struct name
    case "TABLE":
      tokens.push({
        line: node.Token.Line - 1,
        character: node.Token.Position - 1,
        length: node.Token.Literal.length,
        tokenType: TokenType.keyword,
        tokenModifiers: 0,
      });
      if (node.Name?.Token) {
        tokens.push({
          line: node.Name.Token.Line - 1,
          character: node.Name.Token.Position - 1,
          length: node.Name.Value.length,
          tokenType: TokenType.struct,
          tokenModifiers: TokenModifier.declaration,
        });
      }
      break;

    // Declare statement: keyword + variable name + type
    case "DECLARE":
      tokens.push({
        line: node.Token.Line - 1,
        character: node.Token.Position - 1,
        length: node.Token.Literal.length,
        tokenType: TokenType.keyword,
        tokenModifiers: 0,
      });
      // Type annotation
      if (node.ValueType?.Token) {
        tokens.push({
          line: node.ValueType.Token.Line - 1,
          character: node.ValueType.Token.Position - 1,
          length: node.ValueType.Value.length,
          tokenType: TokenType.type,
          tokenModifiers: 0,
        });
      }
      // Variable name
      if (node.Name?.Token) {
        tokens.push({
          line: node.Name.Token.Line - 1,
          character: node.Name.Token.Position - 1,
          length: node.Name.Value.length,
          tokenType: TokenType.variable,
          tokenModifiers: TokenModifier.declaration,
        });
      }
      break;

    // String literals
    case "STRING": {
      // Token.Offset accounts for quote characters (2 for "...", 4 for {...})
      // Token.Position points to the opening quote
      // Total length includes the literal plus all quote characters
      const offset = node.Token.Offset || 0;
      const totalLength = node.Token.Literal.length + offset;
      tokens.push({
        line: node.Token.Line - 1,
        character: node.Token.Position - 1,
        length: totalLength,
        tokenType: TokenType.string,
        tokenModifiers: 0,
      });
      break;
    }

    // Numeric literals (integers, floats, relative times)
    case "INT":
    case "FLOAT":
    case "RTIME":
      tokens.push({
        line: node.Token.Line - 1,
        character: node.Token.Position - 1,
        length: node.Token.Literal.length,
        tokenType: TokenType.number,
        tokenModifiers: 0,
      });
      break;

    // Arithmetic operators with explicit tokens
    case "PLUS":
    case "MINUS":
      tokens.push({
        line: node.Token.Line - 1,
        character: node.Token.Position - 1,
        length: node.Token.Literal.length,
        tokenType: TokenType.operator,
        tokenModifiers: 0,
      });
      break;

    // SET statements - keyword + variable being set
    case "SET":
      tokens.push({
        line: node.Token.Line - 1,
        character: node.Token.Position - 1,
        length: node.Token.Literal.length,
        tokenType: TokenType.keyword,
        tokenModifiers: 0,
      });
      if (node.Ident?.Token) {
        const varName = node.Ident.Value;
        const tokenInfo = getVariableToken(node.Ident, varName, userObjects);
        if (tokenInfo) {
          tokens.push(tokenInfo);
        }
      }
      break;

    // UNSET statements - keyword + variable being unset
    case "UNSET":
      tokens.push({
        line: node.Token.Line - 1,
        character: node.Token.Position - 1,
        length: node.Token.Literal.length,
        tokenType: TokenType.keyword,
        tokenModifiers: 0,
      });
      if (node.Ident?.Token) {
        const varName = node.Ident.Value;
        const tokenInfo = getVariableToken(node.Ident, varName, userObjects);
        if (tokenInfo) {
          tokens.push(tokenInfo);
        }
      }
      break;

    // Identifiers in expressions - variables, headers, references
    case "IDENT": {
      const name = node.Value || node.Token.Literal;
      // Skip if this is a function name (handled by function call detection)
      if (name && builtinFunctions.has(name)) {
        break;
      }
      // Check if this looks like a variable (contains a dot or is a known variable)
      if (name && (name.includes(".") || builtinVariables.has(name))) {
        const tokenInfo = getVariableToken(node, name, userObjects);
        if (tokenInfo) {
          tokens.push(tokenInfo);
        }
      }
      break;
    }
  }

  // Handle function calls - identified by having a Function property with Arguments
  // The Token.Type is IDENT for the function name, but we detect function calls
  // by checking for the Function and Arguments properties
  if (node.Function?.Token && Array.isArray(node.Arguments)) {
    const funcName = node.Function.Value;
    const isBuiltin = builtinFunctions.has(funcName);
    tokens.push({
      line: node.Function.Token.Line - 1,
      character: node.Function.Token.Position - 1,
      length: funcName.length,
      tokenType: TokenType.function,
      tokenModifiers: isBuiltin ? TokenModifier.defaultLibrary : 0,
    });

    // For regsub/regsuball, the second argument (index 1) is a regex pattern
    if (
      (funcName === "regsub" || funcName === "regsuball") &&
      node.Arguments.length >= 2
    ) {
      const regexArg = node.Arguments[1];
      if (regexArg?.Token?.Type === "STRING") {
        const regexValue = regexArg.Value;
        tokens.push({
          line: regexArg.Token.Line - 1,
          character: regexArg.Token.Position - 1,
          length: regexValue.length + 2, // +2 for the surrounding quotes
          tokenType: TokenType.regexp,
          tokenModifiers: 0,
        });
      }
    }
  }

  // Handle regex patterns - identified by infix expressions with ~ or !~ operator
  // The Right side of these expressions is a regex pattern (stored as STRING token)
  if (
    (node.Operator === "~" || node.Operator === "!~") &&
    node.Right?.Token?.Type === "STRING"
  ) {
    const regexValue = node.Right.Value;
    // Account for the quotes around the string literal
    // Position points to the opening quote, length is the literal + 2 quotes
    tokens.push({
      line: node.Right.Token.Line - 1,
      character: node.Right.Token.Position - 1,
      length: regexValue.length + 2, // +2 for the surrounding quotes
      tokenType: TokenType.regexp,
      tokenModifiers: 0,
    });
  }

  // Handle infix operators (comparison, logical, regex match)
  // These don't have their own Token, but we can compute position from Left.EndPosition
  // The operator is between Left and Right operands
  if (
    node.Operator &&
    node.Left?.EndPosition &&
    node.Right?.Token?.Position &&
    node.Left.EndLine === node.Right.Token.Line // Same line for simple calculation
  ) {
    const operator = node.Operator;
    // Skip operators already handled by explicit tokens (PLUS, MINUS handled in switch)
    // and skip string concatenation (implicit)
    if (
      !node.Explicit ||
      ["~", "!~", "==", "!=", ">", "<", ">=", "<=", "&&", "||"].includes(
        operator,
      )
    ) {
      // Position calculation:
      // AST positions are 1-based, semantic tokens are 0-based
      // Right.Token.Position points to start of right operand (1-based)
      // Example: "req.url ~ "test"" where Right.Position = 26 for the "
      // In 0-based: " is at 25, space at 24, ~ at 23
      // Formula: operatorStart = Right.Position - 1 (0-based) - 1 (space) - operator.length
      const operatorStart = node.Right.Token.Position - 1 - 1 - operator.length;

      // Only add if position seems valid (operator has room after Left)
      if (operatorStart > node.Left.EndPosition - 1) {
        tokens.push({
          line: node.Left.EndLine - 1,
          character: operatorStart,
          length: operator.length,
          tokenType: TokenType.operator,
          tokenModifiers: 0,
        });
      }
    }
  }

  // Handle IDENT nodes (variable references) that aren't captured above
  if (node.Token?.Type === "IDENT" && node.Value) {
    const tokenInfo = getVariableTokenFromIdent(node, userObjects);
    if (tokenInfo) {
      tokens.push(tokenInfo);
    }
  }

  // Handle comments - they appear in Leading, Trailing, and Infix arrays
  const commentArrays = [node.Leading, node.Trailing, node.Infix].filter(
    Array.isArray,
  );
  for (const commentArray of commentArrays) {
    for (const comment of commentArray) {
      if (comment?.Token?.Type === "COMMENT") {
        tokens.push({
          line: comment.Token.Line - 1,
          character: comment.Token.Position - 1,
          length: comment.Value.length,
          tokenType: TokenType.comment,
          tokenModifiers: 0,
        });
      }
    }
  }

  return tokens;
}

/**
 * Creates a token info for a variable access.
 */
function getVariableToken(
  identNode: ASTNode,
  varName: string,
  userObjects: Set<string>,
): TokenInfo | null {
  if (!identNode.Token) return null;

  // Check if it's an HTTP header (e.g., req.http.Host)
  if (/^(req|resp|bereq|beresp|obj)\.http\./i.test(varName)) {
    return {
      line: identNode.Token.Line - 1,
      character: identNode.Token.Position - 1,
      length: varName.length,
      tokenType: TokenType.property,
      tokenModifiers: 0,
    };
  }

  // Check if it's a user-defined object reference (backend assignment)
  if (userObjects.has(varName)) {
    return {
      line: identNode.Token.Line - 1,
      character: identNode.Token.Position - 1,
      length: varName.length,
      tokenType: TokenType.class,
      tokenModifiers: 0,
    };
  }

  // Check if it's a user variable (var.*)
  if (varName.startsWith("var.")) {
    return {
      line: identNode.Token.Line - 1,
      character: identNode.Token.Position - 1,
      length: varName.length,
      tokenType: TokenType.variable,
      tokenModifiers: 0,
    };
  }

  // Check if it's a built-in variable
  const builtinInfo = builtinVariables.get(varName);
  if (builtinInfo) {
    let modifiers = TokenModifier.defaultLibrary;
    if (builtinInfo.readonly) {
      modifiers |= TokenModifier.readonly;
    }
    return {
      line: identNode.Token.Line - 1,
      character: identNode.Token.Position - 1,
      length: varName.length,
      tokenType: TokenType.variable,
      tokenModifiers: modifiers,
    };
  }

  // Default: treat as variable
  return {
    line: identNode.Token.Line - 1,
    character: identNode.Token.Position - 1,
    length: varName.length,
    tokenType: TokenType.variable,
    tokenModifiers: 0,
  };
}

/**
 * Creates a token info from an IDENT node.
 */
function getVariableTokenFromIdent(
  node: ASTNode,
  userObjects: Set<string>,
): TokenInfo | null {
  const value = node.Value;
  if (!value || !node.Token) return null;

  // Skip if this looks like a keyword or literal
  if (typeof value !== "string") return null;

  // Check for ACL match operator usage (word after ~ or !~)
  // This is handled by parent context, skip here
  if (userObjects.has(value)) {
    return {
      line: node.Token.Line - 1,
      character: node.Token.Position - 1,
      length: value.length,
      tokenType: TokenType.class,
      tokenModifiers: 0,
    };
  }

  return null;
}
