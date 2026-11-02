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
 * each configured include path. Open/edited buffers are preferred over the
 * file system so unsaved edits to an included file are linted. Other files are
 * read by the caller-supplied `readFile` (the client, via `workspace.fs`), and
 * all locations are URIs.
 *
 * Reads go to the client and can be slow (a remote or network file system), so
 * each file is read at most once per closure, the includes of a file are
 * resolved concurrently, and reads not finished by a deadline count as
 * missing files and are cancelled.
 *
 * The component has no guard against cyclic includes: it recurses until the
 * JS stack overflows, which kills the language server. So after collecting the
 * modules we walk the include graph depth-first and blank out every `include`
 * that points back to a module still on the current path, and report each such
 * cycle so the caller can surface it.
 */

import { documentCache } from "../shared/documentCache";
import { dirnameUri, isAbsolutePath, resolveUri, uriKey } from "../shared/uri";

/** The result of reading a file that is too large to lint. */
export interface TooLarge {
  tooLarge: true;
}

/** A file's text, TooLarge, or null if it cannot be read. */
export type ReadResult = string | TooLarge | null;

/**
 * Read a file by URI. `signal` aborts when the result is no longer needed.
 */
export type ReadFile = (
  uri: string,
  signal: AbortSignal,
) => Promise<ReadResult>;

const isTooLarge = (result: unknown): result is TooLarge =>
  typeof result === "object" &&
  result !== null &&
  (result as TooLarge).tooLarge === true;

/** Default time, in ms, for reading all of a closure's files. */
export const INCLUDE_READ_DEADLINE = 5000;

const encoder = new TextEncoder();
const byteLength = (text: string) => encoder.encode(text).length;

// Conservative cap below the component's effective per-call input limit (a
// 16 MiB bump arena, roughly halved by the canonical-ABI lowering buffer), with
// headroom. Over budget, we lint the main source alone (see linter/index.ts).
export const MAX_TOTAL_SOURCE_BYTES = 6 * 1024 * 1024;

// Matches `include "module";` -- the module name as written (slashes allowed,
// quotes excluded), plus the optional trailing semicolon so a blanked include
// leaves no stray `;`. Mirrors the pattern the native falco-js wrapper used.
// Only use it through matchAll (findIncludes), which iterates a copy: closures
// are built concurrently and must not share its lastIndex.
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

type Read = (uri: string) => Promise<ReadResult>;

/**
 * A reader for one closure: prefers an open/edited buffer, otherwise reads a
 * fresh copy, at most once per file. Once `signal` aborts, reads in flight and
 * later ones count as missing.
 */
function closureReader(readFile: ReadFile, signal: AbortSignal): Read {
  const results = new Map<string, Promise<ReadResult>>();
  const aborted = new Promise<null>((resolve) => {
    if (signal.aborted) {
      resolve(null);
    } else {
      signal.addEventListener("abort", () => resolve(null), { once: true });
    }
  });

  const read = async (uri: string): Promise<ReadResult> => {
    const cached = documentCache.findByUri(uri);
    if (cached) {
      return cached.getText();
    }
    if (signal.aborted) {
      return null;
    }
    try {
      const result = await Promise.race([readFile(uri, signal), aborted]);
      return typeof result === "string" || isTooLarge(result) ? result : null;
    } catch {
      return null;
    }
  };

  return (uri) => {
    const key = uriKey(uri);
    let result = results.get(key);
    if (!result) {
      result = read(uri);
      results.set(key, result);
    }
    return result;
  };
}

/** Resolve a module name to a file, mirroring falco's FileResolver search. */
async function resolveModule(
  module: string,
  includerDir: string | null,
  includeDirs: string[],
  read: Read,
): Promise<{ uri: string; content: string } | TooLarge | null> {
  const bases = module.endsWith(".vcl") ? [module] : [`${module}.vcl`, module];

  // The includer's directory is often also a search directory.
  const candidates = new Map<string, string>();
  for (const base of bases) {
    const dirs = isAbsolutePath(base)
      ? [includerDir]
      : [includerDir, ...includeDirs];
    for (const dir of dirs) {
      const uri = resolveUri(base, dir);
      if (uri !== null && !candidates.has(uriKey(uri))) {
        candidates.set(uriKey(uri), uri);
      }
    }
  }

  // In order: the first candidate that exists wins.
  for (const uri of candidates.values()) {
    const content = await read(uri);
    if (isTooLarge(content)) {
      return content;
    }
    if (content !== null) {
      return { uri, content };
    }
  }
  return null;
}

export interface IncludeClosureOptions {
  /** Time in ms for all reads; later ones count as missing files. */
  deadline?: number;
}

/**
 * Collect the contents of every module reachable from `mainText`.
 *
 * @param mainText - The main document's source.
 * @param mainUri - The main document's URI (its directory is the primary
 *   include search root).
 * @param readFile - Reads files that are not open in the editor.
 * @param configuredIncludeDirs - Additional include search directory URIs.
 * @param options - See IncludeClosureOptions.
 */
export async function buildIncludeClosure(
  mainText: string,
  mainUri: string,
  readFile: ReadFile,
  configuredIncludeDirs: string[] = [],
  { deadline = INCLUDE_READ_DEADLINE }: IncludeClosureOptions = {},
): Promise<IncludeClosure> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadline);
  try {
    return await collect(
      mainText,
      mainUri,
      closureReader(readFile, controller.signal),
      configuredIncludeDirs,
    );
  } finally {
    clearTimeout(timer);
    // Cancel reads still in flight, e.g. after going over budget.
    controller.abort();
  }
}

async function collect(
  mainText: string,
  mainUri: string,
  read: Read,
  configuredIncludeDirs: string[],
): Promise<IncludeClosure> {
  const mainDir = dirnameUri(mainUri);
  const includeDirs = [
    ...(mainDir === null ? [] : [mainDir]),
    ...configuredIncludeDirs,
  ];
  const includes: Record<string, string> = {};
  const seen = new Set<string>();
  let totalBytes = byteLength(mainText);

  // Breadth-first, one level of the include graph at a time: the modules a
  // level includes are resolved concurrently, then taken in order, so the
  // first include of a module name wins as in a sequential walk.
  let level: Array<{ text: string; dir: string | null }> = [
    { text: mainText, dir: mainDir },
  ];

  while (level.length > 0) {
    const wanted: Array<{ module: string; dir: string | null }> = [];
    for (const { text, dir } of level) {
      for (const { module } of findIncludes(text)) {
        if (!seen.has(module)) {
          seen.add(module);
          wanted.push({ module, dir });
        }
      }
    }
    const resolved = await Promise.all(
      wanted.map(({ module, dir }) =>
        resolveModule(module, dir, includeDirs, read),
      ),
    );

    level = [];
    for (const [i, { module }] of wanted.entries()) {
      const found = resolved[i];
      if (!found) {
        // Unresolved: let the component report it in-band as it lints.
        continue;
      }

      if (isTooLarge(found)) {
        return { includes: {}, overBudget: true, cycles: [] };
      }
      totalBytes += byteLength(found.content);
      if (totalBytes > MAX_TOTAL_SOURCE_BYTES) {
        return { includes: {}, overBudget: true, cycles: [] };
      }

      includes[module] = found.content;
      level.push({ text: found.content, dir: dirnameUri(found.uri) });
    }
  }

  const cycles = breakCycles(mainText, includes);
  return { includes, overBudget: false, cycles };
}
