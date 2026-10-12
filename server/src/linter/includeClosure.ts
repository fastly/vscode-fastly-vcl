/**
 * Build the include closure for a VCL document so the WASI linter component
 * (which has no filesystem) can resolve `include` statements.
 *
 * The component discovers the include graph itself -- it calls back into its
 * in-memory resolver for every `include` it parses, transitively -- so the host
 * only needs to supply the *contents* of every reachable module, keyed by the
 * name as written in the `include` statement. We walk the graph here purely to
 * collect those contents (and to enforce a size budget).
 *
 * Resolution mirrors falco's FileResolver: a module `"x"` is looked up as
 * `x.vcl` (extension optional) relative to the including file's directory and
 * each configured include path. Open/edited buffers are preferred over disk so
 * unsaved edits to an included file are linted.
 *
 * The component has no guard against cyclic includes: it recurses until the
 * JS stack overflows, which kills the language server. So after collecting the
 * modules we walk the include graph depth-first and blank out every `include`
 * that points back to a module still on the current path, and report each such
 * cycle so the caller can surface it.
 */

import { readFileSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";

import { documentCache } from "../shared/documentCache";

// Conservative cap below the component's effective per-call input limit (a
// 16 MiB bump arena, roughly halved by the canonical-ABI lowering buffer), with
// headroom. Over budget, we lint the main source alone (see linter/index.ts).
export const MAX_TOTAL_SOURCE_BYTES = 6 * 1024 * 1024;

// Matches `include "module";` -- the module name as written (slashes allowed,
// quotes excluded), plus the optional trailing semicolon so a blanked include
// leaves no stray `;`. Mirrors the pattern the native falco-js wrapper used.
const INCLUDE_RE = /include\s+"([^"]+)"(?:\s*;)?/g;

export interface IncludeCycle {
  /** Module names from the main file's `include` down to the repeated module. */
  chain: string[];
  /** Zero-based position of the main file's `include` that leads into the cycle. */
  line: number;
  character: number;
}

export interface IncludeClosure {
  /** Module name (as written in `include`) -> source, for the component. */
  includes: Record<string, string>;
  /** True when the closure exceeded MAX_TOTAL_SOURCE_BYTES; `includes` is empty. */
  overBudget: boolean;
  /** Include cycles found; the include closing each one is blanked in `includes`. */
  cycles: IncludeCycle[];
}

interface IncludeStatement {
  module: string;
  index: number;
  length: number;
}

function findIncludes(text: string): IncludeStatement[] {
  return Array.from(text.matchAll(INCLUDE_RE), (m) => ({
    module: m[1],
    index: m.index ?? 0,
    length: m[0].length,
  }));
}

/** Replace each statement with spaces, keeping newlines so positions hold. */
function blankStatements(text: string, statements: IncludeStatement[]): string {
  let out = text;
  for (const { index, length } of [...statements].sort(
    (a, b) => b.index - a.index,
  )) {
    const blanked = out.slice(index, index + length).replace(/[^\r\n]/g, " ");
    out = out.slice(0, index) + blanked + out.slice(index + length);
  }
  return out;
}

function positionOf(
  text: string,
  offset: number,
): { line: number; character: number } {
  const before = text.slice(0, offset);
  const line = before.split("\n").length - 1;
  return { line, character: offset - (before.lastIndexOf("\n") + 1) };
}

/**
 * Make the module graph acyclic for the component: depth-first from the main
 * source, blank every `include` whose target is still on the current path.
 * Mutates `includes` and returns one entry per blanked back edge.
 */
function breakCycles(
  mainText: string,
  includes: Record<string, string>,
): IncludeCycle[] {
  const has = (module: string) =>
    Object.prototype.hasOwnProperty.call(includes, module);
  const state = new Map<string, "visiting" | "done">();
  const path: string[] = [];
  const cycles: IncludeCycle[] = [];
  let anchor = { line: 0, character: 0 };

  const visit = (module: string): void => {
    state.set(module, "visiting");
    path.push(module);
    const text = includes[module];
    const backEdges: IncludeStatement[] = [];
    for (const statement of findIncludes(text)) {
      if (!has(statement.module)) {
        continue;
      }
      const seen = state.get(statement.module);
      if (seen === "visiting") {
        backEdges.push(statement);
        cycles.push({ chain: [...path, statement.module], ...anchor });
      } else if (seen === undefined) {
        visit(statement.module);
      }
    }
    if (backEdges.length > 0) {
      includes[module] = blankStatements(text, backEdges);
    }
    path.pop();
    state.set(module, "done");
  };

  for (const statement of findIncludes(mainText)) {
    if (has(statement.module) && !state.has(statement.module)) {
      anchor = positionOf(mainText, statement.index);
      visit(statement.module);
    }
  }
  return cycles;
}

/** Prefer an open/edited buffer; otherwise read a fresh copy from disk. */
function readSource(path: string): string | null {
  const cached = documentCache.findByPath(path);
  if (cached) {
    return cached.getText();
  }
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** Resolve a module name to a file, mirroring falco's FileResolver search. */
function resolveModule(
  module: string,
  includerDir: string,
  includePaths: string[],
): { path: string; content: string } | null {
  const bases = module.endsWith(".vcl") ? [module] : [`${module}.vcl`, module];

  for (const base of bases) {
    if (isAbsolute(base)) {
      const content = readSource(base);
      if (content !== null) {
        return { path: base, content };
      }
      continue;
    }
    for (const dir of [includerDir, ...includePaths]) {
      const path = join(dir, base);
      const content = readSource(path);
      if (content !== null) {
        return { path, content };
      }
    }
  }
  return null;
}

/**
 * Collect the contents of every module reachable from `mainText`.
 *
 * @param mainText - The main document's source.
 * @param mainPath - The main document's filesystem path (its directory is the
 *   primary include search root).
 * @param configuredIncludePaths - Additional include search directories.
 */
export function buildIncludeClosure(
  mainText: string,
  mainPath: string,
  configuredIncludePaths: string[] = [],
): IncludeClosure {
  const mainDir = dirname(mainPath);
  const includePaths = [mainDir, ...configuredIncludePaths];
  const includes: Record<string, string> = {};
  const seen = new Set<string>();
  let totalBytes = Buffer.byteLength(mainText, "utf8");

  const queue: Array<{ text: string; dir: string }> = [
    { text: mainText, dir: mainDir },
  ];

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) {
      break;
    }
    const { text, dir } = item;
    INCLUDE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = INCLUDE_RE.exec(text)) !== null) {
      const module = match[1];
      if (seen.has(module)) {
        continue;
      }
      seen.add(module);

      const resolved = resolveModule(module, dir, includePaths);
      if (!resolved) {
        // Unresolved: let the component report it in-band as it lints.
        continue;
      }

      totalBytes += Buffer.byteLength(resolved.content, "utf8");
      if (totalBytes > MAX_TOTAL_SOURCE_BYTES) {
        return { includes: {}, overBudget: true, cycles: [] };
      }

      includes[module] = resolved.content;
      queue.push({ text: resolved.content, dir: dirname(resolved.path) });
    }
  }

  const cycles = breakCycles(mainText, includes);
  return { includes, overBudget: false, cycles };
}
