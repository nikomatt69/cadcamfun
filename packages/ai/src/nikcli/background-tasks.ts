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
}

export type BackgroundTaskStatus = "queued" | "running" | "completed" | "error" | "cancelled";

export interface BackgroundTask extends BackgroundTaskInput {
  readonly id: string;
  readonly status: BackgroundTaskStatus;
  readonly text?: string;
  readonly error?: string;
}

export interface BackgroundTaskManagerOptions {
  readonly runner?: (input: BackgroundTaskRunnerInput) => Promise<string>;
  readonly onCompletion?: (task: BackgroundTask) => void | Promise<void>;
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
      },
      controller: new AbortController(),
    };
    this.entries.set(entry.task.id, entry);
    this.queue.push(entry);
    this.drain();
    return { ...entry.task };
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
    entry.task = { ...entry.task, status: "cancelled" };
    if (status === "queued") {
      const index = this.queue.indexOf(entry);
      if (index >= 0) this.queue.splice(index, 1);
    }
    entry.controller.abort();
    if (status === "queued") this.notify(entry);
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
      entry.task = { ...entry.task, status: "running" };
      this.occupied.add(entry);
      // Cancelled before the runner got to start: there is nothing to run, and the abort event has already fired.
      const work = Promise.resolve().then(() => entry.controller.signal.aborted ? "" : runner({
        projectId: entry.task.projectId,
        parentSessionId: entry.task.parentSessionId,
        prompt: entry.task.prompt,
        description: entry.task.description,
        ...(entry.task.agent !== undefined ? { agent: entry.task.agent } : {}),
        ...(entry.task.edits === true ? { edits: true } : {}),
        background: entry.task.background !== false,
        signal: entry.controller.signal,
      })).then(
        (text) => {
          if (entry.task.status !== "cancelled") {
            entry.task = { ...entry.task, status: "completed", text };
          }
        },
        (error: unknown) => {
          if (entry.task.status !== "cancelled") {
            entry.task = { ...entry.task, status: "error", error: error instanceof Error ? error.message : String(error) };
          }
        },
      ).finally(() => {
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
    // Host wake failures must not strand scheduler slots or reject runner cleanup.
    const delivery = Promise.resolve().then(() => this.disposed ? undefined : callback(snapshot))
      .catch(() => undefined).finally(() => this.deliveries.delete(delivery));
    this.deliveries.add(delivery);
  }
}
