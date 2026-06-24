import { readFileSync } from "node:fs";

import {
  TextDocumentItem,
  DidChangeTextDocumentParams,
} from "vscode-languageserver/node";

import { VclDocument } from "./vclDocument";

import { LANGUAGE_ID } from "./utils";

export class DocumentCache {
  private _documents: Map<string, VclDocument>;
  private _open: Set<string>;

  constructor() {
    this._documents = new Map();
    this._open = new Set();
  }

  private _loadContent(uri: string): VclDocument {
    const text = readFileSync(uri, "utf8");
    return new VclDocument(uri, LANGUAGE_ID, 1, text);
  }

  public isEmpty(): boolean {
    return this._documents.size === 0;
  }

  public set(document: TextDocumentItem): void {
    this._open.add(document.uri);
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

  public delete(uri: string): void {
    this._open.delete(uri);
    this._documents.delete(uri);
  }

  // Whether the URI corresponds to a document the editor has opened (as opposed
  // to one loaded on demand from disk to resolve symbols or includes).
  public isOpen(uri: string): boolean {
    return this._open.has(uri);
  }

  public all(): IterableIterator<VclDocument> {
    return this._documents.values();
  }
}

export const documentCache = new DocumentCache();
