import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { LintTracker } from "../linter/lintTracker";

test("a later lint of a document supersedes an earlier one", () => {
  const tracker = new LintTracker();
  const first = tracker.start("file:///a.vcl");
  assert.equal(first(), true);
  const second = tracker.start("file:///a.vcl");
  assert.equal(first(), false);
  assert.equal(second(), true);
});

test("lints of different documents do not supersede each other", () => {
  const tracker = new LintTracker();
  const a = tracker.start("file:///a.vcl");
  const b = tracker.start("file:///b.vcl");
  assert.equal(a(), true);
  assert.equal(b(), true);
});

test("closing a document supersedes its lint in progress", () => {
  const tracker = new LintTracker();
  const lint = tracker.start("file:///a.vcl");
  tracker.forget("file:///a.vcl");
  assert.equal(lint(), false);
  assert.equal(tracker.start("file:///a.vcl")(), true);
});

test("settled waits for the latest lint of a document", async () => {
  const tracker = new LintTracker();
  let finish!: () => void;
  const done = tracker.track(
    "file:///a.vcl",
    new Promise<void>((resolve) => (finish = resolve)),
  );
  let settled = false;
  const waiting = tracker.settled("file:///a.vcl").then(() => {
    settled = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  finish();
  await done;
  await waiting;
  assert.equal(settled, true);
});

test("settled resolves when the lint fails, and when none is running", async () => {
  const tracker = new LintTracker();
  const failed = tracker.track("file:///a.vcl", Promise.reject(new Error("x")));
  await assert.rejects(failed);
  await tracker.settled("file:///a.vcl");
  await tracker.settled("file:///never-linted.vcl");
});

test("settled waits for a lint that starts while it waits", async () => {
  const tracker = new LintTracker();
  let finishFirst!: () => void;
  const first = tracker.track(
    "file:///a.vcl",
    new Promise<void>((resolve) => (finishFirst = resolve)),
  );
  let settled = false;
  const waiting = tracker.settled("file:///a.vcl").then(() => {
    settled = true;
  });
  let finishSecond!: () => void;
  const second = tracker.track(
    "file:///a.vcl",
    new Promise<void>((resolve) => (finishSecond = resolve)),
  );
  finishFirst();
  await first;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  finishSecond();
  await second;
  await waiting;
  assert.equal(settled, true);
});

test("debounce queues one lint per document", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const tracker = new LintTracker();
    const calls: string[] = [];
    tracker.debounce("file:///a.vcl", 1000, () => calls.push("a@1"));
    tracker.debounce("file:///b.vcl", 1000, () => calls.push("b@1"));
    tracker.debounce("file:///a.vcl", 1000, () => calls.push("a@2"));
    mock.timers.tick(999);
    assert.deepEqual(calls, []);
    mock.timers.tick(1);
    assert.deepEqual(calls.sort(), ["a@2", "b@1"]);
  } finally {
    mock.timers.reset();
  }
});

test("a lint queued before closing does not supersede the reopened document's lint", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const tracker = new LintTracker();
    const uri = "file:///a.vcl";
    let queuedRan = false;
    // An edit queues a lint of the document as it was...
    tracker.debounce(uri, 1000, () => {
      queuedRan = true;
      tracker.start(uri);
    });
    // ...then it is closed and reopened before the lint runs.
    tracker.forget(uri);
    const reopened = tracker.start(uri);
    mock.timers.tick(1000);
    assert.equal(queuedRan, false);
    assert.equal(reopened(), true);
  } finally {
    mock.timers.reset();
  }
});

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

test("settled waits for a queued lint to start after its delay, then for it to finish", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const tracker = new LintTracker();
    const uri = "file:///a.vcl";
    let finish!: () => void;
    let starts = 0;
    tracker.debounce(uri, 1000, () => {
      starts++;
      tracker.track(uri, new Promise<void>((resolve) => (finish = resolve)));
    });
    let settled = false;
    const waiting = tracker.settled(uri).then(() => {
      settled = true;
    });
    // Waiting does not cut the debounce short.
    mock.timers.tick(999);
    await flushMicrotasks();
    assert.equal(starts, 0);
    mock.timers.tick(1);
    await flushMicrotasks();
    assert.equal(starts, 1);
    assert.equal(settled, false);
    finish();
    await waiting;
    assert.equal(settled, true);
    // The queued lint ran once, not again when its timer would have fired.
    mock.timers.tick(10_000);
    assert.equal(starts, 1);
  } finally {
    mock.timers.reset();
  }
});

test("settled waits for a lint queued again while it waits", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const tracker = new LintTracker();
    const uri = "file:///a.vcl";
    const runs: string[] = [];
    const queue = (name: string) =>
      tracker.debounce(uri, 1000, () => {
        runs.push(name);
        tracker.track(uri, Promise.resolve());
      });
    queue("first");
    let settled = false;
    const waiting = tracker.settled(uri).then(() => {
      settled = true;
    });
    mock.timers.tick(500);
    queue("second");
    await flushMicrotasks();
    mock.timers.tick(999);
    await flushMicrotasks();
    assert.equal(settled, false);
    mock.timers.tick(1);
    await waiting;
    assert.deepEqual(runs, ["second"]);
  } finally {
    mock.timers.reset();
  }
});

test("settled stops waiting when the document's queued lint is dropped", async () => {
  const tracker = new LintTracker();
  const uri = "file:///a.vcl";
  tracker.debounce(uri, 60_000, () => {});
  const waiting = tracker.settled(uri);
  tracker.forget(uri);
  await waiting;
});

test("settled stops waiting when the request is cancelled", async () => {
  const tracker = new LintTracker();
  const uri = "file:///a.vcl";
  tracker.track(uri, new Promise<void>(() => {}));
  const listeners: Array<() => void> = [];
  let disposed = false;
  const token = {
    isCancellationRequested: false,
    onCancellationRequested(listener: () => void) {
      listeners.push(listener);
      return { dispose: () => (disposed = true) };
    },
  };
  const waiting = tracker.settled(uri, { token });
  await flushMicrotasks();
  token.isCancellationRequested = true;
  listeners.forEach((listener) => listener());
  await waiting;
  assert.equal(disposed, true);
});

test("settled returns at once for a request already cancelled", async () => {
  const tracker = new LintTracker();
  tracker.track("file:///a.vcl", new Promise<void>(() => {}));
  await tracker.settled("file:///a.vcl", {
    token: {
      isCancellationRequested: true,
      onCancellationRequested: () => ({ dispose() {} }),
    },
  });
});

test("settled does not wait for a closed document's lint", async () => {
  const tracker = new LintTracker();
  tracker.track("file:///a.vcl", new Promise<void>(() => {}));
  tracker.forget("file:///a.vcl");
  await tracker.settled("file:///a.vcl");
});

test("settled gives up on a lint that never finishes", async () => {
  const tracker = new LintTracker();
  tracker.track("file:///a.vcl", new Promise<void>(() => {}));
  await tracker.settled("file:///a.vcl", { timeout: 20 });
});
