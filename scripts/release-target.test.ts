import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyPublishLog } from "./release-publish.ts";
import { assertBunVersion, expectedBunVersion, RELEASE_REPOSITORY, RELEASE_UPDATER_ENDPOINT } from "./release-helpers.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("the updater feed points at the repository the releases are published to", async () => {
  const config = JSON.parse(await readFile(join(ROOT, "apps/desktop/src-tauri/tauri.conf.json"), "utf8")) as {
    plugins: { updater: { endpoints: string[] } };
  };
  expect(config.plugins.updater.endpoints).toContain(RELEASE_UPDATER_ENDPOINT);
  // The endpoint is the feed of the *latest* release: the version release carries the
  // merged manifest and is the one GitHub marks as the latest.
  expect(RELEASE_UPDATER_ENDPOINT).toBe(`https://github.com/${RELEASE_REPOSITORY}/releases/latest/download/latest.json`);
});

test("the publish workflow releases the same repository the feed reads", async () => {
  const workflow = await readFile(join(ROOT, ".github/workflows/publish.yml"), "utf8");
  expect(workflow).toContain(`github.repository == '${RELEASE_REPOSITORY}'`);
});

test("CI publication depends on validation and all desktop assets through separate reusable jobs", async () => {
  interface Job { needs?: string | string[]; uses?: string; steps?: { run?: string }[] }
  interface Workflow { jobs: Record<string, Job>; on: Record<string, unknown> }
  const readWorkflow = async (name: string) => Bun.YAML.parse(await readFile(join(ROOT, ".github/workflows", name), "utf8")) as Workflow;
  const pipeline = await readWorkflow("ci-pipeline.yml");
  const ancestors = (id: string): string[] => {
    const needs = pipeline.jobs[id]?.needs ?? [];
    const direct = typeof needs === "string" ? [needs] : needs;
    return [...new Set(direct.flatMap((parent) => [parent, ...ancestors(parent)]))];
  };
  expect(ancestors("publish-release").sort()).toEqual(["desktop", "publish", "validate"]);
  expect(pipeline.jobs.publish?.uses).toBe("./.github/workflows/publish.yml");
  expect(pipeline.jobs.desktop?.uses).toBe("./.github/workflows/release.yml");
  expect(pipeline.jobs["publish-release"]?.uses).toBe("./.github/workflows/publish-release.yml");
  const preparation = await readWorkflow("publish.yml");
  expect(Object.keys(preparation.jobs)).toEqual(["publish"]);
  expect(preparation.on.workflow_dispatch).toBeUndefined();
  const commands = Object.values(preparation.jobs).flatMap((job) => job.steps?.map((step) => step.run ?? "") ?? []).join("\n");
  expect(commands).toContain("--phase=start");
  expect(commands).not.toMatch(/--phase=complete|gh release create/);
  const completion = await readWorkflow("publish-release.yml");
  expect(completion.on.workflow_dispatch).toBeUndefined();
  expect(Object.values(completion.jobs).flatMap((job) => job.steps?.map((step) => step.run ?? "") ?? []).join("\n")).toContain("--phase=complete");
});

test("the published plugin points at the same repository", async () => {
  const manifest = JSON.parse(await readFile(join(ROOT, "packages/nikcli-plugin/package.json"), "utf8")) as {
    repository: { url: string };
  };
  expect(manifest.repository.url).toContain(`github.com/${RELEASE_REPOSITORY}.git`);
  expect(manifest.repository.url).not.toContain("cadcamfun-tauri");
});

test("macOS installers and their signed-sidecar smoke run on matching native architectures", async () => {
  for (const name of ["release.yml", "build-platforms.yml"]) {
    const workflow = Bun.YAML.parse(await readFile(join(ROOT, ".github/workflows", name), "utf8")) as {
      jobs: { build: { strategy: { matrix: { include: { os: string; target: string }[] } }; steps: { run?: string; if?: string; "continue-on-error"?: boolean }[] } };
    };
    const targets = workflow.jobs.build.strategy.matrix.include;
    expect(targets).toHaveLength(6);
    expect(targets.find((target) => target.target === "x86_64-apple-darwin")?.os).toBe("macos-15-intel");
    expect(targets.find((target) => target.target === "aarch64-apple-darwin")?.os).toBe("macos-15");
    if (name === "release.yml") {
      const smoke = workflow.jobs.build.steps.find((step) => step.run?.includes("smoke-macos-bundle.ts"));
      expect(smoke?.if).toBe("runner.os == 'macOS'");
      expect(smoke?.["continue-on-error"]).not.toBe(true);
    }
  }
});

test("the release refuses a Bun the workspace does not support", async () => {
  const root = await mkdtemp(join(tmpdir(), "cadcam-bun-"));
  try {
    await writeFile(join(root, "package.json"), `${JSON.stringify({ name: "x", engines: { bun: ">=9.9.9" } })}\n`);
    expect(expectedBunVersion(root)).toBe(">=9.9.9");
    expect(() => assertBunVersion(root)).toThrow("needs bun@>=9.9.9");
    // The workspace itself declares a version the running Bun satisfies.
    expect(expectedBunVersion(ROOT)).toBe(">=1.4.4");
    expect(() => assertBunVersion(ROOT)).not.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("npm's answer about a publish is read as an outcome", () => {
  expect(classifyPublishLog("npm notice Publishing to https://registry.npmjs.org/")).toBe("failed");
  expect(classifyPublishLog("npm error code E409\nnpm error You cannot publish over the previously published versions: 6.0.0.")).toBe("already-published");
  expect(classifyPublishLog("npm error code E429\nnpm error Too Many Requests - retry later")).toBe("rate-limited");
  expect(classifyPublishLog("npm error code E403\nnpm error 403 Forbidden - PUT https://registry.npmjs.org/@nikoemme_%2Fcadcamfun-nikcli-plugin")).toBe("failed");
});
