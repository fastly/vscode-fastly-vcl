// Recovery from falco component failures.
// Run with: node test/falcoRecovery.test.mjs
//
// A stack overflow inside the falco WASI component can leave its Go runtime
// corrupted: later calls trap ("unreachable") or the runtime calls WASI exit,
// which ends the whole process. The wrapper must recover by starting a fresh
// component after any failure.

import assert from "node:assert/strict";
import test from "node:test";

import { lintText } from "../falco-js/src/wasm.mjs";

// falco exiting the process mid-test (even with code 0) must count as failure.
let finished = false;
process.on("exit", (code) => {
  if (!finished) {
    console.error(`falco ended the process (exit code ${code}) mid-test`);
    process.exitCode = 1;
  }
});

const wrap = (body) => `sub vcl_recv {\n#FASTLY RECV\n${body}\n}\n`;
const deeplyNested = (depth) =>
  wrap(`set req.http.X = ${"(".repeat(depth)}"a"${")".repeat(depth)};`);
const ordinary = wrap('set req.http.X = "1";');

test("lints normally after repeated stack overflows", async () => {
  // Overflows at varying depths reliably corrupt the runtime within this range.
  // The exact depth that overflows varies, so count overflows instead.
  let overflows = 0;
  for (let depth = 1500; depth <= 6000; depth += 37) {
    try {
      await lintText(deeplyNested(depth));
    } catch (e) {
      assert.match(String(e?.message), /call stack/);
      overflows++;
    }
    const result = await lintText(ordinary);
    assert.equal(result.Errors, 0, `lint after nesting depth ${depth}`);
  }
  assert.ok(overflows >= 50, `expected many overflows, got ${overflows}`);
  finished = true;
});
