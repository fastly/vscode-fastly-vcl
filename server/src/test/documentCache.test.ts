import assert from "node:assert/strict";
import { test } from "node:test";

import { DocumentCache } from "../shared/documentCache";

const open = (cache: DocumentCache, uri: string, text: string) =>
  cache.set({ uri, languageId: "vcl", version: 1, text });

test("get returns undefined for documents that are not open", () => {
  assert.equal(new DocumentCache().get("file:///nope.vcl"), undefined);
});

test("findByUri finds an open document whatever the encoding", () => {
  const cache = new DocumentCache();
  open(cache, "file:///c%3A/vcl/a%2Bb.vcl", "unsaved");
  assert.equal(cache.findByUri("file:///C:/vcl/a+b.vcl")?.getText(), "unsaved");
});

test("findByUri does not match other documents", () => {
  const cache = new DocumentCache();
  open(cache, "file:///vcl/a.vcl", "a");
  assert.equal(cache.findByUri("file:///vcl/b.vcl"), undefined);
});
