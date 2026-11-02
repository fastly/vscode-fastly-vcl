import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  buildIncludeClosure,
  MAX_TOTAL_SOURCE_BYTES,
} from "../linter/includeClosure";
import { documentCache } from "../shared/documentCache";

function fakeFiles(files: Record<string, string>, delayMs = 0) {
  const reads: string[] = [];
  const readFile = async (uri: string) => {
    reads.push(uri);
    if (delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return files[uri] ?? null;
  };
  return { readFile, reads };
}

beforeEach(() => {
  for (const doc of [...documentCache.all()]) {
    documentCache.delete(doc.uri);
  }
});

test("resolves includes relative to the including file", async () => {
  const { readFile } = fakeFiles({
    "file:///p/mod.vcl": 'include "sub/inner";\n',
    "file:///p/sub/inner.vcl": "sub inner {\n}\n",
  });
  const closure = await buildIncludeClosure(
    'include "mod";\n',
    "file:///p/main.vcl",
    readFile,
  );
  assert.deepEqual(Object.keys(closure.includes).sort(), ["mod", "sub/inner"]);
  assert.equal(closure.overBudget, false);
});

test("leaves missing modules for the linter to report", async () => {
  const { readFile } = fakeFiles({});
  const closure = await buildIncludeClosure(
    'include "nope";\n',
    "file:///p/main.vcl",
    readFile,
  );
  assert.deepEqual(closure.includes, {});
});

test("treats a failing reader as a missing file", async () => {
  const readFile = async () => {
    throw new Error("connection closed");
  };
  const closure = await buildIncludeClosure(
    'include "mod";\n',
    "file:///p/main.vcl",
    readFile,
  );
  assert.deepEqual(closure.includes, {});
});

test("prefers an open buffer, matching differently encoded URIs", async () => {
  documentCache.set({
    uri: "file:///p/a%2Bb%20(1).vcl",
    languageId: "vcl",
    version: 1,
    text: "# unsaved\n",
  });
  const { readFile, reads } = fakeFiles({
    "file:///p/a+b%20(1).vcl": "# on disk\n",
  });
  const closure = await buildIncludeClosure(
    'include "a+b (1)";\n',
    "file:///p/main.vcl",
    readFile,
  );
  assert.equal(closure.includes["a+b (1)"], "# unsaved\n");
  assert.deepEqual(reads, []);
});

test("documents without a directory resolve nothing and do not throw", async () => {
  const { readFile, reads } = fakeFiles({});
  const closure = await buildIncludeClosure(
    'include "mod";\n',
    "untitled:Untitled-1",
    readFile,
  );
  assert.deepEqual(closure.includes, {});
  assert.deepEqual(reads, []);
});

test("breaks include cycles and reports them", async () => {
  const { readFile } = fakeFiles({
    "file:///p/a.vcl": 'include "b";\n',
    "file:///p/b.vcl": 'include "a";\n',
  });
  const closure = await buildIncludeClosure(
    'include "a";\n',
    "file:///p/main.vcl",
    readFile,
  );
  assert.equal(closure.cycles.length, 1);
  assert.deepEqual(closure.cycles[0].chain, ["a", "b", "a"]);
});

test("gives up on includes over the size budget", async () => {
  const { readFile } = fakeFiles({
    "file:///p/big.vcl": "#".repeat(MAX_TOTAL_SOURCE_BYTES + 1),
  });
  const closure = await buildIncludeClosure(
    'include "big";\n',
    "file:///p/main.vcl",
    readFile,
  );
  assert.equal(closure.overBudget, true);
  assert.deepEqual(closure.includes, {});
});

test("goes over budget when the client says a file is too large to read", async () => {
  const readFile = async (uri: string) =>
    uri === "file:///p/big.vcl" ? { tooLarge: true as const } : null;
  const closure = await buildIncludeClosure(
    'include "big";\n',
    "file:///p/main.vcl",
    readFile,
  );
  assert.equal(closure.overBudget, true);
  assert.deepEqual(closure.includes, {});
});

test("reads each candidate file at most once", async () => {
  const { readFile, reads } = fakeFiles({});
  await buildIncludeClosure(
    'include "mod";\ninclude "mod.vcl";\n',
    "file:///p/main.vcl",
    readFile,
  );
  // The main file's directory is both the includer's directory and the first
  // search directory, and "mod.vcl" is the first candidate for both includes.
  assert.deepEqual([...reads].sort(), ["file:///p/mod", "file:///p/mod.vcl"]);
});

test("resolves the includes of a file concurrently", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const readFile = async (uri: string) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight--;
    return uri.endsWith(".vcl") ? "# module\n" : null;
  };
  const closure = await buildIncludeClosure(
    'include "a";\ninclude "b";\ninclude "c";\n',
    "file:///p/main.vcl",
    readFile,
  );
  assert.deepEqual(Object.keys(closure.includes), ["a", "b", "c"]);
  assert.equal(maxInFlight, 3);
});

test("treats includes not read before the deadline as missing", async () => {
  const signals: AbortSignal[] = [];
  const readFile = (uri: string, signal: AbortSignal) => {
    signals.push(signal);
    if (uri === "file:///p/fast.vcl") {
      return Promise.resolve("# fast\n");
    }
    // A stalled read that never settles.
    return new Promise<string | null>(() => {});
  };
  const started = Date.now();
  const closure = await buildIncludeClosure(
    'include "fast";\ninclude "stalled";\n',
    "file:///p/main.vcl",
    readFile,
    [],
    { deadline: 50 },
  );
  assert.ok(Date.now() - started < 1000, "the deadline bounds the closure");
  assert.deepEqual(Object.keys(closure.includes), ["fast"]);
  // Reads still in flight are cancelled.
  assert.ok(signals.length > 0);
  assert.ok(signals.every((signal) => signal.aborted));
});

test("concurrent closures do not interfere", async () => {
  const { readFile } = fakeFiles(
    {
      "file:///one/x.vcl": 'include "y";\n',
      "file:///one/y.vcl": "# y\n",
      "file:///one/z.vcl": "# z\n",
      "file:///two/x.vcl": "# x\n",
    },
    5,
  );
  const [one, two] = await Promise.all([
    buildIncludeClosure(
      'include "x";\ninclude "z";\n',
      "file:///one/main.vcl",
      readFile,
    ),
    buildIncludeClosure(
      '# a longer first line than the other main file\ninclude "x";\n',
      "file:///two/main.vcl",
      readFile,
    ),
  ]);
  assert.deepEqual(Object.keys(one.includes).sort(), ["x", "y", "z"]);
  assert.deepEqual(Object.keys(two.includes), ["x"]);
});
