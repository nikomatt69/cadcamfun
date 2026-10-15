export const MAX_BACKGROUND_TASKS = 4;
export const MAX_QUEUED_BACKGROUND_TASKS = 16;

export interface BackgroundTaskOwner {
  readonly projectId: string;
  readonly parentSessionId: string;
}

export interface BackgroundTaskInput extends BackgroundTaskOwner {
  readonly prompt: string;
  readonly description: string;
  /** The specialist that does the work (`agents.ts`); the researcher when omitted. */
  readonly agent?: string;
  /** The task changes the document: at most one such task runs at a time per project. */
  readonly edits?: boolean;
  /** `false`: the caller waits for the result and the parent is not woken with it. Default `true`. */
  readonly background?: boolean;
}

export interface BackgroundTaskRunnerInput extends BackgroundTaskInput {
  readonly signal: AbortSignal;
  /**
   * Records the specialist's report before its native session is removed, so a crash between the two does not lose it.
   * Resolves once the journal holds it (immediately without a journal).
   */
  readonly report?: (text: string) => Promise<void>;
}

export type BackgroundTaskStatus = "queued" | "running" | "completed" | "error" | "cancelled";

export interface BackgroundTask extends BackgroundTaskInput {
  readonly id: string;
  readonly status: BackgroundTaskStatus;
  readonly text?: string;
  readonly error?: string;
  /** Epoch milliseconds: when the task was queued, when its runner started, and when it stopped. */
  readonly createdAt?: number;
  readonly startedAt?: number;
  readonly finishedAt?: number;
  /** 1 for the first run; a reader re-run after an interruption counts up to `MAX_TASK_ATTEMPTS`. */
  readonly attempt?: number;
  /** The parent has been handed the outcome (or the outcome is not for the parent). */
  readonly delivered?: boolean;
}

/** A reader interrupted by a crash or a restart runs again at most this many times in total. */
export const MAX_TASK_ATTEMPTS = 2;
/** Settled tasks kept in the journal: delivered ones older than this are dropped when the journal is recovered. */
export const TASK_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Where tasks outlive the process. The manager writes a task before its runner starts, the specialist's report before its
 * session is removed, and the outcome before it is delivered; `recover` reads it back after a restart.
 */
export interface BackgroundTaskJournal {
  write(task: BackgroundTask): Promise<void>;
  list(): Promise<ReadonlyArray<BackgroundTask>>;
  remove(id: string): Promise<void>;
}

/** What `recover` did with the tasks a previous process left behind. */
export interface BackgroundTaskRecovery {
  /** Readers queued again for another attempt. */
  readonly resumed: ReadonlyArray<string>;
  /** Editors (or readers out of attempts) that stopped mid-run: their effect on the document is uncertain, nothing is replayed. */
  readonly uncertain: ReadonlyArray<string>;
  /** Settled outcomes handed to the parent again because their delivery was not recorded. */
  readonly redelivered: ReadonlyArray<string>;
  /** Delivered records past the retention window, removed. */
  readonly pruned: number;
}

export interface BackgroundTaskManagerOptions {
  readonly runner?: (input: BackgroundTaskRunnerInput) => Promise<string>;
  readonly onCompletion?: (task: BackgroundTask) => void | Promise<void>;
  readonly journal?: BackgroundTaskJournal;
  /** Clock for tests. */
  readonly now?: () => number;
}

export interface BackgroundTaskManagerInterface {
  enqueue(input: BackgroundTaskInput): BackgroundTask;
  list(owner: BackgroundTaskOwner): readonly BackgroundTask[];
  read(owner: BackgroundTaskOwner, id: string): BackgroundTask;
  cancel(owner: BackgroundTaskOwner, id: string): BackgroundTask;
  cancelParent(owner: BackgroundTaskOwner): number;
  /** Resolves with the task once it has stopped (completed, failed or cancelled); `signal` aborting cancels it. */
  wait(owner: BackgroundTaskOwner, id: string, signal?: AbortSignal): Promise<BackgroundTask>;
  dispose(): Promise<void>;
}

export class BackgroundTaskManagerError extends Error {
  readonly _tag = "BackgroundTaskManagerError";
  constructor(readonly code: "not_found" | "queue_full" | "disposed", message: string) {
    super(message);
    this.name = "BackgroundTaskManagerError";
  }
}

interface Entry {
  task: BackgroundTask;
  readonly controller: AbortController;
  /** The journal write of the enqueue; the runner starts only after it. */
  persisted: Promise<void>;
}

const owns = (owner: BackgroundTaskOwner, task: BackgroundTaskOwner): boolean =>
  owner.projectId === task.projectId && owner.parentSessionId === task.parentSessionId;

/** Create exactly one manager per host runtime, shared by all projects and parents. */
export class BackgroundTaskManager implements BackgroundTaskManagerInterface {
  private readonly entries = new Map<string, Entry>();
  private readonly queue: Entry[] = [];
  private readonly active = new Set<Promise<void>>();
  private readonly occupied = new Set<Entry>();
  private readonly deliveries = new Set<Promise<void>>();
  /** Tasks whose runner has stopped (what `wait` resolves on). */
  private readonly settled = new Set<string>();
  private readonly waiters = new Map<string, Array<(task: BackgroundTask) => void>>();
  private options: BackgroundTaskManagerOptions;
  private disposed = false;
  private disposal: Promise<void> | undefined;

  constructor(options: BackgroundTaskManagerOptions) {
    this.options = { ...options };
  }

  /** Install or replace the runner (the function that performs each task). */
  setRunner(runner: (input: BackgroundTaskRunnerInput) => Promise<string>): void {
    this.options = { ...this.options, runner };
    // Wake any task that already drained to "queued" before the runner was
    // attached — the previous `drain()` saw no runner and stopped.
    this.drain();
  }

  /** Install or replace the completion callback (the host wake-up hook). */
  setOnCompletion(callback: (task: BackgroundTask) => void | Promise<void>): void {
    this.options = { ...this.options, onCompletion: callback };
  }

  enqueue(input: BackgroundTaskInput): BackgroundTask {
    if (this.disposed) {
      throw new BackgroundTaskManagerError("disposed", "Background task manager is disposed");
    }
    if (this.queue.length >= MAX_QUEUED_BACKGROUND_TASKS) {
      throw new BackgroundTaskManagerError("queue_full", "Background task queue is full");
    }
    const entry: Entry = {
      task: {
        id: crypto.randomUUID(),
        projectId: input.projectId,
        parentSessionId: input.parentSessionId,
        prompt: input.prompt,
        description: input.description,
        ...(input.agent !== undefined ? { agent: input.agent } : {}),
        ...(input.edits === true ? { edits: true } : {}),
        background: input.background !== false,
        status: "queued",
        createdAt: this.now(),
        attempt: 1,
      },
      controller: new AbortController(),
      persisted: Promise.resolve(),
    };
    this.admit(entry);
    return { ...entry.task };
  }

  /**
   * Reads back what a previous process left in the journal. A reader that was queued or running runs again (bounded by
   * `MAX_TASK_ATTEMPTS`); an editor is never replayed: the document may hold part of its work, so it is marked uncertain
   * for the parent to reconcile against the current revision. A settled outcome whose delivery was not recorded is
   * delivered again, and old delivered records are pruned. Call it once, after the runner and the completion hook are set.
   */
  async recover(): Promise<BackgroundTaskRecovery> {
    const journal = this.options.journal;
    if (journal === undefined || this.disposed) return { resumed: [], uncertain: [], redelivered: [], pruned: 0 };
    const resumed: string[] = [];
    const uncertain: string[] = [];
    const redelivered: string[] = [];
    let pruned = 0;
    const now = this.now();
    for (const stored of await journal.list()) {
      if (this.entries.has(stored.id)) continue;
      const attempt = stored.attempt ?? 1;
      if (stored.status === "queued" || stored.status === "running") {
        if (stored.edits !== true && attempt < MAX_TASK_ATTEMPTS) {
          const { startedAt: _startedAt, text: _text, ...rest } = stored;
          const entry: Entry = { task: { ...rest, status: "queued", attempt: attempt + 1 }, controller: new AbortController(), persisted: Promise.resolve() };
          this.admit(entry);
          resumed.push(stored.id);
          continue;
        }
        const error = stored.edits === true
          ? "Interrupted while changing the document: its effect is uncertain. Inspect the document and its revision before running it again; it was not replayed."
          : `Interrupted ${attempt} times; not run again.`;
        const entry: Entry = { task: { ...stored, status: "error", error, finishedAt: now, delivered: false }, controller: new AbortController(), persisted: Promise.resolve() };
        entry.controller.abort();
        this.entries.set(stored.id, entry);
        await this.record(entry.task);
        this.notify(entry);
        uncertain.push(stored.id);
        continue;
      }
      if (stored.delivered === true || stored.background === false || stored.status === "cancelled") {
        if (stored.delivered === true && now - (stored.finishedAt ?? 0) > TASK_RETENTION_MS) {
          await journal.remove(stored.id).catch(() => undefined);
          pruned++;
          continue;
        }
        const entry: Entry = { task: stored, controller: new AbortController(), persisted: Promise.resolve() };
        entry.controller.abort();
        this.entries.set(stored.id, entry);
        this.settled.add(stored.id);
        continue;
      }
      const entry: Entry = { task: stored, controller: new AbortController(), persisted: Promise.resolve() };
      entry.controller.abort();
      this.entries.set(stored.id, entry);
      this.notify(entry);
      redelivered.push(stored.id);
    }
    return { resumed, uncertain, redelivered, pruned };
  }

  private admit(entry: Entry): void {
    this.entries.set(entry.task.id, entry);
    entry.persisted = this.record(entry.task, true);
    this.queue.push(entry);
    this.drain();
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  /** Writes a snapshot to the journal. With `strict` a failure rejects (the enqueue must be durable before the run). */
  private async record(task: BackgroundTask, strict = false): Promise<void> {
    const journal = this.options.journal;
    if (journal === undefined) return;
    try {
      await journal.write({ ...task });
    } catch (cause) {
      if (strict) throw cause;
    }
  }

  list(owner: BackgroundTaskOwner): readonly BackgroundTask[] {
    return [...this.entries.values()].filter((entry) => owns(owner, entry.task))
      .map((entry) => ({ ...entry.task }));
  }

  read(owner: BackgroundTaskOwner, id: string): BackgroundTask {
    return { ...this.ownedEntry(owner, id).task };
  }

  cancel(owner: BackgroundTaskOwner, id: string): BackgroundTask {
    const entry = this.ownedEntry(owner, id);
    this.cancelEntry(entry);
    return { ...entry.task };
  }

  wait(owner: BackgroundTaskOwner, id: string, signal?: AbortSignal): Promise<BackgroundTask> {
    const entry = this.ownedEntry(owner, id);
    return new Promise<BackgroundTask>((resolve) => {
      if (this.settled.has(id)) return resolve({ ...entry.task });
      const onAbort = () => this.cancelEntry(entry);
      const finish = (task: BackgroundTask) => {
        signal?.removeEventListener("abort", onAbort);
        resolve(task);
      };
      this.waiters.set(id, [...(this.waiters.get(id) ?? []), finish]);
      if (signal?.aborted) this.cancelEntry(entry);
      else signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  cancelParent(owner: BackgroundTaskOwner): number {
    const entries = [...this.entries.values()].filter((entry) => owns(owner, entry.task));
    let count = 0;
    for (const entry of entries) {
      if (this.cancelEntry(entry)) count++;
    }
    return count;
  }

  /**
   * Stops every queued or running task of the parent and waits (at most `timeoutMs`) for the runners to wind down; returns how many
   * were stopped. Unlike a retiring cancel the parent can start new tasks afterwards: this is what stopping a turn or compacting a
   * conversation does, since a task belongs to the conversation that started it and must not outlive its intent.
   */
  async stopParent(owner: BackgroundTaskOwner, timeoutMs = 10_000): Promise<number> {
    const active = this.list(owner).filter((task) => task.status === "queued" || task.status === "running");
    if (active.length === 0) return 0;
    this.cancelParent(owner);
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.all(active.map((task) => this.wait(owner, task.id))),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); })
    ]);
    if (timer !== undefined) clearTimeout(timer);
    return active.length;
  }

  /** Aborts immediately; resolves only when all occupied runner slots settle. */
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    for (const entry of this.entries.values()) this.cancelEntry(entry);
    this.disposal = (async () => {
      await Promise.all([...this.active]);
      await Promise.all([...this.deliveries]);
    })();
    return this.disposal;
  }

  private ownedEntry(owner: BackgroundTaskOwner, id: string): Entry {
    const entry = this.entries.get(id);
    if (!entry || !owns(owner, entry.task)) {
      throw new BackgroundTaskManagerError("not_found", "Background task not found for this owner");
    }
    return entry;
  }

  private cancelEntry(entry: Entry): boolean {
    const status = entry.task.status;
    if (status !== "queued" && status !== "running") return false;
    entry.task = { ...entry.task, status: "cancelled", finishedAt: this.now() };
    if (status === "queued") {
      const index = this.queue.indexOf(entry);
      if (index >= 0) this.queue.splice(index, 1);
    }
    entry.controller.abort();
    if (status === "queued") void this.record(entry.task).then(() => this.notify(entry));
    return true;
  }

  private drain(): void {
    while (!this.disposed && this.active.size < MAX_BACKGROUND_TASKS) {
      const index = this.queue.findIndex((candidate) => this.runnable(candidate));
      if (index < 0) break;
      const entry = this.queue.splice(index, 1)[0]!;
      const runner = this.options.runner;
      if (runner === undefined) {
        // No runner installed yet: push the entry back and wait for setRunner().
        this.queue.unshift(entry);
        break;
      }
      entry.task = { ...entry.task, status: "running", startedAt: this.now() };
      this.occupied.add(entry);
      // The task is in the journal before anything runs; a failed write means it never starts. Cancelled before the
      // runner got to start: there is nothing to run, and the abort event has already fired.
      const work = entry.persisted.then(() => this.record(entry.task)).then(() => entry.controller.signal.aborted ? "" : runner({
        projectId: entry.task.projectId,
        parentSessionId: entry.task.parentSessionId,
        prompt: entry.task.prompt,
        description: entry.task.description,
        ...(entry.task.agent !== undefined ? { agent: entry.task.agent } : {}),
        ...(entry.task.edits === true ? { edits: true } : {}),
        background: entry.task.background !== false,
        signal: entry.controller.signal,
        report: (text) => this.record({ ...entry.task, text }),
      })).then(
        (text) => {
          if (entry.task.status !== "cancelled") {
            entry.task = { ...entry.task, status: "completed", text, finishedAt: this.now() };
          }
        },
        (error: unknown) => {
          if (entry.task.status !== "cancelled") {
            entry.task = { ...entry.task, status: "error", error: error instanceof Error ? error.message : String(error), finishedAt: this.now() };
          }
        },
      ).then(() => {
        // The outcome is durable before anyone is told about it.
        if (entry.task.background === false || entry.task.status === "cancelled") entry.task = { ...entry.task, delivered: true };
        return this.record(entry.task);
      }).finally(() => {
        // Abort is only a request: release capacity after the actual runner settles.
        this.active.delete(work);
        this.occupied.delete(entry);
        this.drain();
        this.notify(entry);
      });
      this.active.add(work);
    }
  }

  /** A task that changes the document waits while another one for the same project is changing it. */
  private runnable(entry: Entry): boolean {
    if (entry.task.edits !== true) return true;
    for (const other of this.occupied) {
      if (other !== entry && other.task.edits === true && other.task.projectId === entry.task.projectId) return false;
    }
    return true;
  }

  private notify(entry: Entry): void {
    this.settled.add(entry.task.id);
    const waiting = this.waiters.get(entry.task.id);
    if (waiting) {
      this.waiters.delete(entry.task.id);
      for (const resolve of waiting) resolve({ ...entry.task });
    }
    const callback = this.options.onCompletion;
    if (!callback || this.disposed) return;
    const snapshot = { ...entry.task };
    // Host wake failures must not strand scheduler slots or reject runner cleanup. A delivery that went through is
    // recorded, so a restart hands over only what never reached the parent.
    const delivery = Promise.resolve().then(async () => {
      if (this.disposed) return;
      await callback(snapshot);
      if (entry.task.delivered !== true && snapshot.status !== "queued" && snapshot.status !== "running") {
        entry.task = { ...entry.task, delivered: true };
        await this.record(entry.task);
      }
    }).catch(() => undefined).finally(() => this.deliveries.delete(delivery));
    this.deliveries.add(delivery);
  }
}
