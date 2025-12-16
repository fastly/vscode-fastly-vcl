import { readFileSync } from "node:fs";

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

  public delete(uri: string): void {
    this._documents.delete(uri);
  }

  public all(): IterableIterator<VclDocument> {
    return this._documents.values();
  }
}

export const documentCache = new DocumentCache();
