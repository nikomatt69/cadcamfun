export const MAX_BACKGROUND_TASKS = 4;
export const MAX_QUEUED_BACKGROUND_TASKS = 16;

export interface BackgroundTaskOwner {
  readonly projectId: string;
  readonly parentSessionId: string;
}

export interface BackgroundTaskInput extends BackgroundTaskOwner {
  readonly prompt: string;
  readonly description: string;
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
  readonly runner: (input: BackgroundTaskRunnerInput) => Promise<string>;
  readonly onCompletion?: (task: BackgroundTask) => void | Promise<void>;
}

export interface BackgroundTaskManagerInterface {
  enqueue(input: BackgroundTaskInput): BackgroundTask;
  list(owner: BackgroundTaskOwner): readonly BackgroundTask[];
  read(owner: BackgroundTaskOwner, id: string): BackgroundTask;
  cancel(owner: BackgroundTaskOwner, id: string): BackgroundTask;
  cancelParent(owner: BackgroundTaskOwner): number;
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
  private readonly options: BackgroundTaskManagerOptions;
  private disposed = false;
  private disposal: Promise<void> | undefined;

  constructor(options: BackgroundTaskManagerOptions) {
    this.options = { ...options };
  }

  enqueue(input: BackgroundTaskInput): BackgroundTask {
    if (this.disposed) {
      throw new BackgroundTaskManagerError("disposed", "Background task manager is disposed");
    }
    if (this.active.size >= MAX_BACKGROUND_TASKS && this.queue.length >= MAX_QUEUED_BACKGROUND_TASKS) {
      throw new BackgroundTaskManagerError("queue_full", "Background task queue is full");
    }
    const entry: Entry = {
      task: {
        id: crypto.randomUUID(),
        projectId: input.projectId,
        parentSessionId: input.parentSessionId,
        prompt: input.prompt,
        description: input.description,
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

  cancelParent(owner: BackgroundTaskOwner): number {
    const entries = [...this.entries.values()].filter((entry) => owns(owner, entry.task));
    let count = 0;
    for (const entry of entries) {
      if (this.cancelEntry(entry)) count++;
    }
    return count;
  }

  /** Aborts immediately; resolves only when all occupied runner slots settle. */
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposed = true;
    for (const entry of this.entries.values()) this.cancelEntry(entry);
    this.disposal = Promise.all([...this.active]).then(() => undefined);
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
      const entry = this.queue.shift();
      if (!entry) break;
      entry.task = { ...entry.task, status: "running" };
      const work = Promise.resolve().then(() => this.options.runner({
        projectId: entry.task.projectId,
        parentSessionId: entry.task.parentSessionId,
        prompt: entry.task.prompt,
        description: entry.task.description,
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
        this.drain();
        this.notify(entry);
      });
      this.active.add(work);
    }
  }

  private notify(entry: Entry): void {
    const callback = this.options.onCompletion;
    if (!callback) return;
    const snapshot = { ...entry.task };
    // Host wake failures must not strand scheduler slots or reject runner cleanup.
    void Promise.resolve().then(() => callback(snapshot)).catch(() => undefined);
  }
}
