/**
 * Track lints per document so that only the latest one publishes, and so
 * requests that read a lint's results can wait for it.
 *
 * Resolving includes makes a lint await the client, so lints of one document
 * can overlap: an edit, a settings change, or closing and reopening the
 * document starts a new one while an old one is still running. Only the
 * latest lint's results (or failure) may reach the editor.
 *
 * Edits queue a lint per document instead of starting one; closing the
 * document drops it, so it cannot start later and supersede the lint of the
 * reopened document.
 */

interface Queued {
  timer: ReturnType<typeof setTimeout>;
  lint: () => void;
  /** Settles waiters once the lint starts or is dropped or replaced. */
  release: () => void;
  released: Promise<void>;
}

/** The part of an LSP CancellationToken that settled() uses. */
export interface Cancellation {
  readonly isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): { dispose(): void };
}

export interface SettleOptions {
  /** Stop waiting after this many ms. Without it, wait until settled. */
  timeout?: number;
  /** Stop waiting when the request that waits is cancelled. */
  token?: Cancellation;
}

export class LintTracker {
  private readonly generations = new Map<string, number>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly queued = new Map<string, Queued>();
  private next = 0;

  /**
   * Start a lint of `uri`, superseding any earlier one. Returns a check that
   * stays true until a later lint of `uri` starts or `uri` is forgotten.
   */
  start(uri: string): () => boolean {
    const generation = ++this.next;
    this.generations.set(uri, generation);
    return () => this.generations.get(uri) === generation;
  }

  /**
   * Call `lint` once `delay` ms pass without another call for `uri`,
   * replacing any lint of `uri` already queued.
   */
  debounce(uri: string, delay: number, lint: () => void): void {
    const previous = this.queued.get(uri);
    const timer = setTimeout(() => this.flush(uri), delay);
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    this.queued.set(uri, { timer, lint, release, released });
    if (previous) {
      clearTimeout(previous.timer);
      previous.release();
    }
  }

  /** Start the queued lint of `uri`, if there is one. */
  private flush(uri: string): void {
    const queued = this.queued.get(uri);
    if (queued) {
      clearTimeout(queued.timer);
      this.queued.delete(uri);
      queued.lint();
      queued.release();
    }
  }

  /**
   * Supersede any lint of `uri` in progress and drop any queued one, e.g.
   * when it is closed. Nothing waits for its lint in progress any more.
   */
  forget(uri: string): void {
    const queued = this.queued.get(uri);
    if (queued) {
      clearTimeout(queued.timer);
      this.queued.delete(uri);
      queued.release();
    }
    this.generations.delete(uri);
    this.pending.delete(uri);
  }

  /** Remember `lint` as the latest lint of `uri` until it finishes. */
  track(uri: string, lint: Promise<void>): Promise<void> {
    const tracked = lint.finally(() => {
      if (this.pending.get(uri) === tracked) {
        this.pending.delete(uri);
      }
    });
    this.pending.set(uri, tracked);
    return tracked;
  }

  /**
   * Wait until no lint of `uri` is queued or running, whether they succeed or
   * not, including lints queued or started while waiting. A queued lint keeps
   * its delay, so waiting does not defeat the debounce. Stops early after
   * `timeout` ms or when `token` is cancelled.
   */
  async settled(
    uri: string,
    { timeout, token }: SettleOptions = {},
  ): Promise<void> {
    if (token?.isCancellationRequested) {
      return;
    }
    let stopped = false;
    let stop!: () => void;
    const stopping = new Promise<void>((resolve) => (stop = resolve));
    const timer = timeout === undefined ? undefined : setTimeout(stop, timeout);
    const subscription = token?.onCancellationRequested(stop);
    try {
      await Promise.race([this.drain(uri, () => stopped), stopping]);
    } finally {
      stopped = true;
      clearTimeout(timer);
      subscription?.dispose();
    }
  }

  private async drain(uri: string, isStopped: () => boolean): Promise<void> {
    while (!isStopped()) {
      const lint = this.pending.get(uri);
      if (lint) {
        try {
          await lint;
        } catch {
          // A failed lint is reported as a diagnostic; the caller uses what
          // it has.
        }
        continue;
      }
      const queued = this.queued.get(uri);
      if (!queued) {
        return;
      }
      await queued.released;
    }
  }
}
