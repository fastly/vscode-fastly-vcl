/**
 * URI helpers for the language server. It runs in a Web Worker with no Node
 * `path` or `url` modules, and documents can come from any file system
 * provider (`file:`, `vscode-vfs:` on github.dev, `vscode-test-web:`), so
 * everything works on URIs rather than file paths.
 */

/** The directory containing `uri` (trailing slash), or null if it has no path (e.g. `untitled:`). */
export function dirnameUri(uri: string): string | null {
  try {
    const url = new URL(uri);
    if (!url.pathname.startsWith("/")) {
      return null;
    }
    return new URL(".", url).href;
  } catch {
    return null;
  }
}

const DRIVE = /^[A-Za-z]:$/;
const DRIVE_PATH = /^([A-Za-z]:)[\\/]/;

/** Split a file path into segments; both separators count, repeats collapse. */
function segmentsOf(path: string): string[] {
  return path.split(/[\\/]+/).filter((segment) => segment !== "");
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Resolve an `include` target against a directory URI, staying on the
 * directory's scheme and authority (so in a remote window the include is read
 * on the remote machine). `.` and `..` are resolved as a file system would,
 * never climbing above the root or a Windows drive (`c:`). Absolute POSIX
 * paths keep the directory's drive; Windows drive paths (`C:\x`) replace it,
 * and become `file:` URIs when there is no directory. Null if the target is
 * relative and `dir` is null.
 *
 * Include names are file names, so `%`, `#`, `?` and `:` in them stay part of
 * the name rather than become escapes, fragments, queries or schemes.
 */
export function resolveUri(target: string, dir: string | null): string | null {
  let prefix: string;
  let base: string[];
  if (dir === null) {
    if (!DRIVE_PATH.test(target)) {
      return null;
    }
    prefix = "file://";
    base = [];
  } else {
    let url: URL;
    try {
      url = new URL(dir);
    } catch {
      return null;
    }
    prefix = url.href.startsWith(`${url.protocol}//`)
      ? `${url.protocol}//${url.host}`
      : url.protocol;
    base = segmentsOf(url.pathname).map(decode);
  }

  const drive = DRIVE_PATH.exec(target);
  let segments: string[];
  if (drive) {
    segments = [drive[1]];
  } else if (/^[\\/]/.test(target)) {
    segments = base.length > 0 && DRIVE.test(base[0]) ? [base[0]] : [];
  } else {
    segments = base;
  }
  // The drive stays put: `..` cannot climb above it.
  const root = segments.length > 0 && DRIVE.test(segments[0]) ? 1 : 0;
  segments = [...segments];
  for (const segment of segmentsOf(drive ? target.slice(2) : target)) {
    if (segment === "..") {
      if (segments.length > root) {
        segments.pop();
      }
    } else if (segment !== ".") {
      segments.push(segment);
    }
  }

  const path = segments
    .map((segment, i) =>
      i === 0 && root === 1 ? segment : encodeURIComponent(segment),
    )
    .join("/");
  return `${prefix}/${path}`;
}

/** True for an absolute POSIX, root-relative Windows or Windows drive path. */
export function isAbsolutePath(path: string): boolean {
  return /^[\\/]/.test(path) || DRIVE_PATH.test(path);
}

/**
 * A comparison key for a URI. VS Code and the URL parser encode the same path
 * differently (`c%3A` vs `c:`, `%2B` vs `+`), so compare decoded paths; Windows
 * drive paths are case-insensitive, on any scheme (e.g. a Windows remote).
 */
export function uriKey(uri: string): string {
  try {
    const url = new URL(uri);
    let path = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:(\/|$)/.test(path)) {
      path = path.toLowerCase();
    }
    return `${url.protocol}//${url.host}${path}`;
  } catch {
    return uri;
  }
}
