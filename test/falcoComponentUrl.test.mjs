// Loading the falco component from a URL, as the language server does in a
// Web Worker. Run with: node --test test/falcoComponentUrl.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import http from "node:http";
import test from "node:test";

import { lintText, setComponentBaseUrl } from "../falco-js/src/wasm.mjs";

const componentDir = new URL("../falco-js/component/", import.meta.url);
const clean = 'sub vcl_recv {\n#FASTLY RECV\n  set req.http.X = "1";\n}\n';

test("loads the component from a URL and retries a failed load", async (t) => {
  let failing = true;
  const server = http.createServer(async (req, res) => {
    const file = new URL(`.${req.url}`, componentDir);
    if (failing || !file.href.startsWith(componentDir.href)) {
      res.statusCode = 404;
      return res.end();
    }
    try {
      res.setHeader("content-type", "application/wasm");
      res.end(await readFile(file));
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  setComponentBaseUrl(`http://127.0.0.1:${server.address().port}`);

  await assert.rejects(lintText(clean), /HTTP 404/);

  failing = false;
  const result = await lintText(clean);
  assert.equal(result.Errors, 0);
});

test("gives up on a stalled component download and retries it", async (t) => {
  let stalling = true;
  const server = http.createServer(async (req, res) => {
    const file = new URL(`.${req.url}`, componentDir);
    if (!file.href.startsWith(componentDir.href)) {
      res.statusCode = 404;
      return res.end();
    }
    if (stalling) {
      // Accept the request but never answer, like a stalled connection.
      return;
    }
    try {
      res.setHeader("content-type", "application/wasm");
      res.end(await readFile(file));
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });

  setComponentBaseUrl(`http://127.0.0.1:${server.address().port}`, {
    loadTimeout: 200,
  });

  await assert.rejects(lintText(clean), /Timed out loading/);

  stalling = false;
  const result = await lintText(clean);
  assert.equal(result.Errors, 0);
});
