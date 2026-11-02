/**
 * Serve the language server's requests to read included files.
 *
 * The server builds the URIs from `include` statements in the documents, which
 * may come from an untrusted repository, and VS Code runs the extension in
 * Restricted Mode too (a browser-only extension has no `main`, so VS Code
 * ignores `capabilities.untrustedWorkspaces`). So only regular files up to the
 * linter's size budget are read, on a file system the window already uses, and
 * only inside the workspace folders when the workspace is untrusted or the
 * file system is virtual (on github.dev, `..` would reach other repositories).
 */

import { CancellationToken, FileType, Uri, workspace } from "vscode";

// Must match MAX_TOTAL_SOURCE_BYTES in server/src/linter/includeClosure.ts:
// a larger file goes over the linter's budget anyway, so the server only
// needs to know it is too large.
export const MAX_READ_BYTES = 6 * 1024 * 1024;

/** Must match ReadResult in server/src/linter/includeClosure.ts. */
export type ReadResult = string | { tooLarge: true } | null;

// File systems of a machine (local or remote). The others are virtual file
// systems, where paths outside the workspace folders can belong to someone
// else.
const MACHINE_SCHEMES = new Set(["file", "vscode-remote"]);

export interface ReadContext {
  /** The workspace folders. */
  folders: readonly Uri[];
  /** Open documents; their file systems are in use too. */
  documents: readonly Uri[];
  /** Whether the workspace is trusted. */
  trusted: boolean;
}

/** Paths of Windows drives (`/c:/...`) compare case-insensitively. */
function comparablePath(path: string): string {
  return /^\/[A-Za-z]:(\/|$)/.test(path) ? path.toLowerCase() : path;
}

function sameFileSystem(a: Uri, b: Uri): boolean {
  return a.scheme === b.scheme && a.authority === b.authority;
}

function isInside(uri: Uri, folder: Uri): boolean {
  if (!sameFileSystem(uri, folder)) {
    return false;
  }
  const path = comparablePath(uri.path);
  const root = comparablePath(folder.path).replace(/\/+$/, "");
  return path.startsWith(`${root}/`);
}

/** Whether the server may read `uri`. */
export function isReadAllowed(uri: Uri, context: ReadContext): boolean {
  // The server sends normalized paths; refuse anything else rather than
  // reason about where `..` leads.
  if (uri.path.split("/").some((s) => s === "." || s === "..")) {
    return false;
  }
  if (uri.query !== "" || uri.fragment !== "") {
    return false;
  }
  const insideFolder = context.folders.some((f) => isInside(uri, f));
  if (!context.trusted || !MACHINE_SCHEMES.has(uri.scheme)) {
    return insideFolder;
  }
  return [...context.folders, ...context.documents].some((other) =>
    sameFileSystem(uri, other),
  );
}

/** The request handler: the file's text, or null if it is not read. */
export async function readIncludedFile(
  uriString: string,
  token: CancellationToken,
): Promise<ReadResult> {
  let uri: Uri;
  try {
    uri = Uri.parse(uriString, true);
  } catch {
    return null;
  }
  const context: ReadContext = {
    folders: (workspace.workspaceFolders ?? []).map((f) => f.uri),
    documents: workspace.textDocuments.map((d) => d.uri),
    trusted: workspace.isTrusted,
  };
  if (!isReadAllowed(uri, context)) {
    return null;
  }
  try {
    // Not directories, devices or pipes, and nothing too large to lint.
    const stat = await workspace.fs.stat(uri);
    if (!(stat.type & FileType.File) || token.isCancellationRequested) {
      return null;
    }
    if (stat.size > MAX_READ_BYTES) {
      return { tooLarge: true };
    }
    const bytes = await workspace.fs.readFile(uri);
    if (token.isCancellationRequested) {
      return null;
    }
    return bytes.byteLength > MAX_READ_BYTES
      ? { tooLarge: true }
      : new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
