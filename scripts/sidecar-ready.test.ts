import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSidecarReady } from "./sidecar-ready.ts";

const stream = (...chunks: string[]) => new ReadableStream<Uint8Array>({
  start(controller) {
    for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
    controller.close();
  },
});

test("accepts a ready event split across stdout chunks", async () => {
  expect(await readSidecarReady(stream('{"event":"rea', 'dy","port":43111}\n'))).toEqual({ event: "ready", port: 43111 });
});

test("a silent child times out and releases its pending reader", async () => {
  let cancelled = false;
  const output = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  await expect(readSidecarReady(output, 20)).rejects.toThrow("did not become ready within 20 ms");
  expect(cancelled).toBe(true);
  expect(output.locked).toBe(false);
});

test("an early exit is reported instead of parsing an empty object", async () => {
  await expect(readSidecarReady(stream())).rejects.toThrow("closed stdout before its ready event");
});

test("startup errors retain the sidecar's diagnostic", async () => {
  await expect(readSidecarReady(stream('{"event":"error","message":"migration failed"}\n'))).rejects.toThrow("migration failed");
});

test.each(['not json\n', '{"event":"ready","port":0}\n', '{"event":"ready","port":65536}\n', '{"event":"ready","port":"43111"}\n'])("rejects malformed ready output: %s", async (line) => {
  await expect(readSidecarReady(stream(line))).rejects.toThrow("invalid sidecar");
});

test("startup output is bounded", async () => {
  await expect(readSidecarReady(stream("x".repeat(65_537)))).rejects.toThrow("exceeds 64 KiB");
});

test("the smoke CLI reports the actual child failure and cleans its temporary data", async () => {
  const root = await mkdtemp(join(tmpdir(), "cadcam-smoke-failure-"));
  try {
    const binary = join(root, "failed-sidecar");
    await writeFile(binary, '#!/bin/sh\necho "intentional startup failure; smoke-work=$PWD" >&2\nexit 42\n');
    await chmod(binary, 0o755);
    const child = Bun.spawn([process.execPath, "--no-env-file", join(import.meta.dir, "smoke-sidecar.ts"), "--binary", binary, "--json"], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(code).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("intentional startup failure");
    expect(stderr).toContain("exit code=42");
    const work = /smoke-work=([^\r\n]+)/.exec(stderr)?.[1];
    expect(work).toBeDefined();
    expect(existsSync(work!)).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
