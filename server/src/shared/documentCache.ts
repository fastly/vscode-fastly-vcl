import {
  TextDocumentItem,
  DidChangeTextDocumentParams,
} from "vscode-languageserver/browser";

import { VclDocument } from "./vclDocument";

import { uriKey } from "./uri";

export class DocumentCache {
  private _documents: Map<string, VclDocument>;

  constructor() {
    this._documents = new Map();
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

  /** An open document; the cache holds only documents the client has opened. */
  public get(uri: string): VclDocument | undefined {
    return this._documents.get(uri);
  }

  /**
   * Find an open document by URI, however it is encoded (see uriKey): the
   * client's URIs encode characters differently from URIs built here
   * (`c%3A` and lowercase drive letters on Windows, `%2B` for `+`, and so on).
   */
  public findByUri(uri: string): VclDocument | undefined {
    const target = uriKey(uri);
    for (const [docUri, doc] of this._documents) {
      if (uriKey(docUri) === target) {
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

export const documentCache = new DocumentCache();
