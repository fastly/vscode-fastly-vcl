import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  TextDocumentItem,
  DidChangeTextDocumentParams,
} from "vscode-languageserver/node";

import { VclDocument } from "./vclDocument";

import { LANGUAGE_ID } from "./utils";

export class DocumentCache {
  private _documents: Map<string, VclDocument>;

  constructor() {
    this._documents = new Map();
  }

  private _loadContent(uri: string): VclDocument {
    const text = readFileSync(uri, "utf8");
    return new VclDocument(uri, LANGUAGE_ID, 1, text);
  }

  public isEmpty(): boolean {
    return this._documents.size === 0;
  }

  public set(document: TextDocumentItem): void {
    this._documents.set(
      document.uri,
      new VclDocument(
        document.uri,
        document.languageId,
        document.version,
        document.text,
      ),
    );
  }

  public applyChanges({
    textDocument,
    contentChanges,
  }: DidChangeTextDocumentParams): void {
    const doc = this._documents.get(textDocument.uri);
    doc?.update(contentChanges, textDocument.version);
  }

  public get(
    uri: string,
    alwaysCache: boolean = true,
  ): VclDocument | undefined {
    let doc = this._documents.get(uri);
    if (!doc && alwaysCache) {
      doc = this._loadContent(uri);
      this._documents.set(uri, doc);
    }
    return doc;
  }

  /**
   * Find a cached document by filesystem path. Compares decoded paths rather
   * than URI strings, because the client's URIs encode characters differently
   * from Node's pathToFileURL (`c%3A` and lowercase drive letters on Windows,
   * `%2B` for `+`, and so on).
   */
  public findByPath(path: string): VclDocument | undefined {
    const target = normalizePath(path);
    for (const [uri, doc] of this._documents) {
      let docPath: string;
      try {
        docPath = fileURLToPath(uri);
      } catch {
        continue; // Not a file: URI.
      }
      if (normalizePath(docPath) === target) {
        return doc;
      }
    }
    return undefined;
  }

  public delete(uri: string): void {
    this._documents.delete(uri);
  }

  public all(): IterableIterator<VclDocument> {
    return this._documents.values();
  }
}

// Windows paths are case-insensitive, and drive letters arrive in either case.
function normalizePath(path: string): string {
  const resolved = resolve(path);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export const documentCache = new DocumentCache();
