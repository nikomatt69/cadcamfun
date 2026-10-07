import { describe, expect, test } from "bun:test";
import {
  BackgroundTaskManager,
  BackgroundTaskManagerError,
  MAX_BACKGROUND_TASKS,
  type BackgroundTask,
  type BackgroundTaskOwner,
  type BackgroundTaskRunnerInput,
} from "../src/nikcli/background-tasks.ts";

const owner: BackgroundTaskOwner = { projectId: "project", parentSessionId: "parent" };
const other: BackgroundTaskOwner = { projectId: "other-project", parentSessionId: "other-parent" };
const input = (scope = owner) => ({ ...scope, prompt: "Review geometry", description: "Read-only review" });
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

function fixture(onCompletion?: (task: BackgroundTask) => void | Promise<void>) {
  const runs: {
    input: BackgroundTaskRunnerInput;
    resolve: (text: string) => void;
    reject: (error: unknown) => void;
  }[] = [];
  let active = 0;
  let peak = 0;
  const manager = new BackgroundTaskManager({
    ...(onCompletion ? { onCompletion } : {}),
    runner: (runnerInput) => {
      active++;
      peak = Math.max(peak, active);
      return new Promise<string>((resolve, reject) => {
        runs.push({ input: runnerInput, resolve, reject });
      }).finally(() => { active--; });
    },
  });
  return { manager, runs, peak: () => peak };
}

describe("BackgroundTaskManager", () => {
  test("shares four slots across owners, bounds FIFO queue at sixteen, and returns findings", async () => {
    const { manager, runs, peak } = fixture();
    expect(MAX_BACKGROUND_TASKS).toBe(4);
    const tasks = Array.from({ length: 20 }, (_, i) => manager.enqueue(input(i % 2 ? other : owner)));
    expect(new Set(tasks.map((task) => task.id)).size).toBe(20);
    expect(tasks.filter((task) => task.status === "running")).toHaveLength(4);
    expect(tasks.filter((task) => task.status === "queued")).toHaveLength(16);
    expect(() => manager.enqueue(input())).toThrow(BackgroundTaskManagerError);
    await flush();
    expect(runs).toHaveLength(4);
    expect(runs[0]?.input).toMatchObject(input());
    runs[0]?.resolve("No collisions");
    await flush();
    expect(runs).toHaveLength(5);
    const first = tasks[0];
    const fifth = tasks[4];
    if (!first || !fifth) throw new Error("Missing task fixture");
    expect(manager.read(owner, first.id)).toMatchObject({ status: "completed", text: "No collisions" });
    expect(manager.read(owner, fifth.id).status).toBe("running");
    for (let i = 1; i < 20; i++) {
      const run = runs[i];
      if (!run) throw new Error("Missing runner fixture");
      run.resolve("Done");
      await flush();
    }
    expect(peak()).toBe(4);
    await manager.dispose();
  });

  test("running cancellation retains capacity through settlement and suppresses late results", async () => {
    const completions: BackgroundTask[] = [];
    const { manager, runs, peak } = fixture((task) => { completions.push(task); });
    const tasks = Array.from({ length: 6 }, () => manager.enqueue(input()));
    await flush();
    const first = tasks[0];
    const queued = tasks[4];
    if (!first || !queued) throw new Error("Missing task fixture");
    expect(manager.cancel(owner, first.id).status).toBe("cancelled");
    expect(runs[0]?.input.signal.aborted).toBe(true);
    manager.cancel(owner, first.id);
    manager.cancel(owner, queued.id);
    await flush();
    expect(runs).toHaveLength(4);
    expect(completions.map((task) => task.id)).toEqual([queued.id]);
    runs[0]?.resolve("Must not be published");
    await flush();
    expect(runs).toHaveLength(5);
    expect(manager.read(owner, first.id)).not.toHaveProperty("text");
    expect(completions.filter((task) => task.id === first.id)).toHaveLength(1);
    expect(peak()).toBe(4);
    const disposal = manager.dispose();
    for (const run of runs.slice(1)) run.reject(new Error("Aborted"));
    await disposal;
  });

  test("enforces both ownership fields for list, read, cancel and parent cancellation", async () => {
    const { manager, runs } = fixture();
    const task = manager.enqueue(input());
    const foreign = manager.enqueue(input(other));
    for (const scope of [other, { ...owner, projectId: "wrong" }, { ...owner, parentSessionId: "wrong" }]) {
      expect(manager.list(scope)).not.toContainEqual(task);
      expect(() => manager.read(scope, task.id)).toThrow(BackgroundTaskManagerError);
      expect(() => manager.cancel(scope, task.id)).toThrow(BackgroundTaskManagerError);
    }
    expect(() => manager.read(owner, "missing")).toThrow(BackgroundTaskManagerError);
    expect(manager.cancelParent(owner)).toBe(1);
    expect(manager.cancelParent(owner)).toBe(0);
    expect(manager.read(other, foreign.id).status).toBe("running");
    await flush();
    const disposal = manager.dispose();
    for (const run of runs) run.resolve("Done");
    await disposal;
  });

  test("reports runner failures and isolates throwing or rejecting wake callbacks", async () => {
    let calls = 0;
    const { manager, runs } = fixture(() => {
      calls++;
      if (calls === 1) throw new Error("Wake failed");
      return Promise.reject(new Error("Async wake failed"));
    });
    const failed = manager.enqueue(input());
    const completed = manager.enqueue(input());
    await flush();
    runs[0]?.reject(new Error("Worker failed"));
    runs[1]?.resolve("Findings");
    await flush();
    expect(manager.read(owner, failed.id)).toMatchObject({ status: "error", error: "Worker failed" });
    expect(manager.cancel(owner, completed.id)).toMatchObject({ status: "completed", text: "Findings" });
    expect(calls).toBe(2);
    await manager.dispose();
    const sync = new BackgroundTaskManager({ runner: () => { throw new Error("Sync failure"); } });
    const syncTask = sync.enqueue(input());
    await flush();
    expect(sync.read(owner, syncTask.id).status).toBe("error");
    await sync.dispose();
  });

  test("shutdown cancels every owner, never launches queued work, and waits for runners", async () => {
    const { manager, runs } = fixture();
    for (let i = 0; i < 8; i++) manager.enqueue(input(i % 2 ? owner : other));
    await flush();
    let settled = false;
    const disposal = manager.dispose();
    expect(manager.dispose()).toBe(disposal);
    void disposal.then(() => { settled = true; });
    expect(() => manager.enqueue(input())).toThrow(BackgroundTaskManagerError);
    expect([...manager.list(owner), ...manager.list(other)].every((task) => task.status === "cancelled")).toBe(true);
    expect(runs.every((run) => run.input.signal.aborted)).toBe(true);
    await flush();
    expect(settled).toBe(false);
    for (const run of runs) run.resolve("Late output");
    await disposal;
    expect(runs).toHaveLength(4);
    expect(settled).toBe(true);
  });

  test("queued cancellation immediately restores queue capacity without starting a runner", async () => {
    const { manager, runs } = fixture();
    const tasks = Array.from({ length: 20 }, () => manager.enqueue(input()));
    const queued = tasks[4];
    if (!queued) throw new Error("Missing task fixture");
    manager.cancel(owner, queued.id);
    const replacement = manager.enqueue(input());
    expect(replacement.status).toBe("queued");
    expect(() => manager.enqueue(input())).toThrow(BackgroundTaskManagerError);
    await flush();
    expect(runs).toHaveLength(4);
    expect(manager.cancelParent(owner)).toBe(20);
    for (const run of runs) run.resolve("Cancelled");
    await manager.dispose();
    expect(runs).toHaveLength(4);
  });
});
