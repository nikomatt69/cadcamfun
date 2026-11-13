import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { companionListedProjects } from "./ios-companion-listed.ts";

const httpResponse = (method: string, url: string, status: number) =>
  JSON.stringify({
    message: "Sent HTTP response",
    level: "INFO",
    annotations: { "http.method": method, "http.url": url, "http.status": status },
    spans: { "http.span": 34 },
  });

const companionRequest = (method: string, path: string) =>
  JSON.stringify({
    message: "Companion request",
    level: "INFO",
    annotations: {
      "companion.device": "fixture",
      "companion.ip": "127.0.0.1",
      "http.method": method,
      "http.path": path,
      "http.status": 200,
    },
  });

test("a compact HTTP server GET lists projects", () => {
  const line = httpResponse("GET", "/api/projects", 200);
  expect(line.includes('"http.url": "/api/projects"')).toBe(false);
  expect(companionListedProjects(`${line}\n`)).toBe(true);
});

test("a compact companion gateway GET lists projects", () => {
  expect(companionListedProjects(companionRequest("GET", "/api/projects"))).toBe(true);
});

test("the setup POST that creates the fixture project does not count", () => {
  const log = [
    httpResponse("POST", "/api/projects", 201),
    httpResponse("GET", "/api/health", 200),
    companionRequest("GET", "/api/health"),
  ].join("\n");
  expect(companionListedProjects(log)).toBe(false);
});

test("a GET after the setup POST counts", () => {
  const log = [
    httpResponse("POST", "/api/projects", 201),
    httpResponse("GET", "/api/projects", 200),
  ].join("\n");
  expect(companionListedProjects(log)).toBe(true);
});

test("spaced JSON from an older logger still counts", () => {
  const line = '{ "annotations": { "http.method": "GET", "http.url": "/api/projects" } }';
  expect(companionListedProjects(line)).toBe(true);
});

test("a broken line does not hide a later GET", () => {
  const log = `not json\n{broken\n${httpResponse("GET", "/api/projects", 200)}`;
  expect(companionListedProjects(log)).toBe(true);
});

test("an empty log does not list projects", () => {
  expect(companionListedProjects("")).toBe(false);
});

test("the CLI exits 0 only when the log contains the GET", async () => {
  const root = await mkdtemp(join(tmpdir(), "cadcam-ios-listed-"));
  try {
    const listed = join(root, "listed.err");
    const posted = join(root, "posted.err");
    await writeFile(listed, `${httpResponse("GET", "/api/projects", 200)}\n`);
    await writeFile(posted, `${httpResponse("POST", "/api/projects", 201)}\n`);
    const script = join(import.meta.dir, "ios-companion-listed.ts");
    const run = (file: string) => Bun.spawn([process.execPath, "--no-env-file", script, file], { stdout: "pipe", stderr: "pipe" }).exited;
    expect(await run(listed)).toBe(0);
    expect(await run(posted)).toBe(1);
    expect(await run(join(root, "missing.err"))).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
