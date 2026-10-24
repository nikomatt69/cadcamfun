import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseChecksums, previousReleaseTag, RELEASE_PLATFORM_TRIPLES, UPDATER_PLATFORM_KEYS } from "./release-helpers.ts";
import { buildManifest, mergeManifests } from "./updater-manifest.ts";
import { stageRelease } from "./stage-release.ts";

const TAG = "v6.0.0";
const DOWNLOAD = "https://github.com/example/app/releases/download";
const TRIPLE = "aarch64-apple-darwin";

async function fixture(root: string) {
  const installers = join(root, "installers");
  const manifests = join(root, "manifests");
  const names: string[] = [];
  for (const [key, triple] of Object.entries(RELEASE_PLATFORM_TRIPLES)) {
    const dir = join(installers, `installers-${triple}`);
    await mkdir(dir, { recursive: true });
    const suffixes = key.startsWith("linux") ? [".deb", ".rpm"]
      : key.startsWith("darwin") ? [".app.tar.gz", ".app.tar.gz.sig", ".dmg"] : [".exe", ".exe.sig", ".msi", ".msi.sig"];
    for (const suffix of suffixes) {
      const name = `${triple}--App 6.0.0${suffix}`;
      await writeFile(join(dir, name), `payload:${triple}${suffix}`);
      names.push(name);
    }
    await refreshChecksums(dir);
    await writeFile(join(dir, "RELEASE_NOTES.md"), "Release notes\n");
    if (!key.startsWith("linux")) {
      const manifestDir = join(manifests, triple);
      await mkdir(manifestDir, { recursive: true });
      const fragment = await buildManifest(dir, triple, "6.0.0", `${DOWNLOAD}/${TAG}`, "2026-10-05T12:00:00Z");
      await writeFile(join(manifestDir, "latest.json"), JSON.stringify(fragment));
    }
  }
  const manifest = await mergeManifests(manifests, "6.0.0", UPDATER_PLATFORM_KEYS);
  const manifestPath = join(root, "latest.json");
  await writeFile(manifestPath, JSON.stringify(manifest));
  return { installers, manifest, manifestPath, names };
}

async function refreshChecksums(dir: string) {
  const entries: string[] = [];
  for (const name of (await readdir(dir)).filter((name) => name !== "SHA256SUMS" && name !== "RELEASE_NOTES.md")) {
    const digest = createHash("sha256").update(await readFile(join(dir, name))).digest("hex");
    entries.push(`${digest}  ${name}`);
  }
  await writeFile(join(dir, "SHA256SUMS"), `${entries.join("\n")}\n`);
}

test("one release contains every target, signatures, combined checksums, notes and updater manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "cadcam-release-"));
  try {
    const { installers, manifest, manifestPath, names } = await fixture(root);
    const out = join(root, "dist");
    await stageRelease(installers, manifestPath, out, DOWNLOAD, TAG);
    expect((await readdir(out)).sort()).toEqual([...names, "SHA256SUMS", "RELEASE_NOTES.md", "latest.json"].sort());
    expect(JSON.parse(await readFile(join(out, "latest.json"), "utf8"))).toEqual(manifest);
    expect(await readFile(join(out, "RELEASE_NOTES.md"), "utf8")).toBe("Release notes\n");
    const checksums = parseChecksums(await readFile(join(out, "SHA256SUMS"), "utf8"));
    expect(checksums.map((entry) => entry.name).sort()).toEqual(names.sort());
    for (const entry of checksums) {
      expect(createHash("sha256").update(await readFile(join(out, entry.name))).digest("hex")).toBe(entry.digest);
    }
    for (const entry of Object.values(manifest.platforms)) {
      expect(entry.url).toStartWith(`${DOWNLOAD}/${TAG}/`);
      expect(names).toContain(decodeURIComponent(new URL(entry.url).pathname.split("/").at(-1) ?? ""));
    }
    expect(Object.keys(manifest.platforms).sort()).toEqual([...UPDATER_PLATFORM_KEYS].sort());
    await expect(stageRelease(installers, manifestPath, out, DOWNLOAD, TAG)).rejects.toThrow("empty");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test.each([
  ["missing target", "Incomplete or unexpected release target set"],
  ["unexpected target", "Incomplete or unexpected release target set"],
  ["missing package", "Missing .dmg installer"],
  ["tampered installer", "Checksum mismatch"],
  ["unindexed file", "Unindexed release files"],
  ["wrong target asset", "Unexpected release asset"],
  ["different notes", "Manifest and release notes disagree"],
  ["wrong signature", "Manifest signature mismatch"],
  ["missing signature", "Missing or mismatched release assets"],
  ["legacy platform URL", "Wrong release URL"],
  ["wrong version", "Manifest release metadata disagree"],
  ["missing updater target", "Incomplete release platform set"],
])("publication refuses %s", async (scenario, message) => {
  const root = await mkdtemp(join(tmpdir(), "cadcam-release-invalid-"));
  try {
    const { installers, manifest, manifestPath } = await fixture(root);
    const dir = join(installers, `installers-${TRIPLE}`);
    const installer = `${TRIPLE}--App 6.0.0.app.tar.gz`;
    const entry = manifest.platforms["darwin-aarch64"];
    if (!entry) throw new Error("Missing fixture entry");
    if (scenario === "missing target") await rm(dir, { recursive: true });
    if (scenario === "unexpected target") await mkdir(join(installers, "installers-other"));
    if (scenario === "missing package") {
      await rm(join(dir, `${TRIPLE}--App 6.0.0.dmg`));
      await refreshChecksums(dir);
    }
    if (scenario === "tampered installer") await writeFile(join(dir, installer), "tampered");
    if (scenario === "unindexed file") await writeFile(join(dir, "extra.txt"), "unexpected");
    if (scenario === "wrong target asset") {
      await rename(join(dir, `${TRIPLE}--App 6.0.0.dmg`), join(dir, "x86_64-apple-darwin--App.dmg"));
      await refreshChecksums(dir);
    }
    if (scenario === "different notes") await writeFile(join(dir, "RELEASE_NOTES.md"), "Different release");
    if (scenario === "wrong signature") entry.signature = "wrong";
    if (scenario === "missing signature") {
      await rm(join(dir, `${installer}.sig`));
      await refreshChecksums(dir);
    }
    if (scenario === "legacy platform URL") entry.url = entry.url.replace(`${TAG}/`, `${TAG}-macos-arm64/`);
    if (scenario === "wrong version") manifest.version = "6.0.1";
    if (scenario === "missing updater target") delete manifest.platforms["windows-x86_64"];
    await writeFile(manifestPath, JSON.stringify(manifest));
    const out = join(root, "dist");
    await expect(stageRelease(installers, manifestPath, out, DOWNLOAD, TAG)).rejects.toThrow(message);
    expect(await readdir(out).catch(() => [])).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("historical platform tags remain excluded from version discovery", () => {
  expect(previousReleaseTag(["v6.0.1-linux-x64", "v6.0.1", "v6.0.0-windows-arm64", "v6.0.0"], "v6.0.2")).toBe("v6.0.1");
  expect(previousReleaseTag(["v6.0.1-linux-x64", "v6.0.0-rc.1"], "v6.0.2")).toBe("v6.0.0-rc.1");
});

test.each(["patch", "99.0.0", "--dry-run"])("release command dispatches the full CI pipeline: %s", async (argument) => {
  const root = await mkdtemp(join(tmpdir(), "cadcam-dispatch-"));
  try {
    const log = join(root, "gh.jsonl");
    const gh = join(root, "gh");
    await writeFile(gh, `#!/bin/sh
printf '%s\\n' "$*" >> "$RELEASE_TEST_LOG"
if [ "$1" = "repo" ]; then printf 'example/app\\n'; fi
`);
    await chmod(gh, 0o755);
    const child = Bun.spawn(["/bin/bash", "scripts/release", argument], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: { PATH: `${root}:${dirname(process.execPath)}:/usr/bin:/bin`, RELEASE_TEST_LOG: log },
      stdout: "pipe", stderr: "pipe", stdin: "ignore",
    });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(code).toBe(0);
    expect(stderr).toBe("");
    const calls = (await readFile(log, "utf8")).trim().split("\n");
    const dispatches = calls.filter((line) => line.startsWith("workflow "));
    if (argument === "--dry-run") {
      expect(dispatches).toEqual([]);
      expect(stdout).toContain("would release example/app");
    } else {
      expect(dispatches).toEqual([`workflow run ci-pipeline.yml -f release=true -f ${argument === "patch" ? "bump=patch" : "version=99.0.0"}`]);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test.each(["success", "existing draft", "invalid assets", "published release", "lookup failure", "failed creation", "failed upload", "prerelease"])("publish completion: %s", async (scenario) => {
  const root = await mkdtemp(join(tmpdir(), "cadcam-publish-"));
  try {
    const { installers, manifest, manifestPath, names } = await fixture(root);
    let tag = TAG;
    if (scenario === "prerelease") {
      tag = `${TAG}-rc.1`;
      manifest.version = "6.0.0-rc.1";
      for (const entry of Object.values(manifest.platforms)) entry.url = entry.url.replace(`${TAG}/`, `${tag}/`);
      await writeFile(manifestPath, JSON.stringify(manifest));
    }
    if (scenario === "invalid assets") await rm(join(installers, `installers-${TRIPLE}`), { recursive: true });
    const log = join(root, "gh.jsonl");
    const gh = join(root, "gh");
    await writeFile(gh, `#!${process.execPath} --no-env-file
const args = process.argv.slice(2);
const { appendFileSync } = require("node:fs");
appendFileSync(process.env.RELEASE_TEST_LOG, JSON.stringify(args) + "\\n");
if (args[0] === "release" && args[1] === "view") {
  if (args.includes("isDraft") && !["existing draft", "published release"].includes(process.env.RELEASE_TEST_SCENARIO)) {
    process.stderr.write(process.env.RELEASE_TEST_SCENARIO === "lookup failure" ? "connection failed" : "release not found");
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(args.includes("isDraft") ? { isDraft: process.env.RELEASE_TEST_SCENARIO !== "published release" } : { databaseId: 42 }));
} else if (args[0] === "release" && args[1] === "create" && process.env.RELEASE_TEST_SCENARIO === "failed creation") {
  process.exit(1);
} else if (args[0] === "release" && args[1] === "upload" && process.env.RELEASE_TEST_SCENARIO === "failed upload") {
  process.exit(1);
}
`);
    await chmod(gh, 0o755);
    const child = Bun.spawn([process.execPath, "--no-env-file", "scripts/release-publish.ts", "--phase=complete", `--tag=${tag}`, `--manifest=${manifestPath}`, `--installers=${installers}`], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: {
        PATH: `${root}:${dirname(process.execPath)}:/usr/bin:/bin`,
        GITHUB_REPOSITORY: "example/app", GITHUB_SERVER_URL: "https://github.com",
        RELEASE_TEST_LOG: log, RELEASE_TEST_SCENARIO: scenario,
      },
      stdout: "pipe", stderr: "pipe", stdin: "ignore",
    });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    const calls = (await readFile(log, "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as string[]);
    const uploads = calls.filter((args) => args[0] === "release" && args[1] === "upload");
    const creations = calls.filter((args) => args[0] === "release" && args[1] === "create");
    const publications = calls.filter((args) => args[0] === "api");
    if (["invalid assets", "published release", "lookup failure", "failed creation"].includes(scenario)) {
      expect(code).toBe(1);
      if (scenario !== "failed creation") expect(stderr).toContain(scenario === "invalid assets" ? "release target set" : scenario === "lookup failure" ? "Cannot inspect the release" : "already published");
      expect(creations).toHaveLength(scenario === "failed creation" ? 1 : 0);
      expect(uploads).toEqual([]);
      expect(publications).toEqual([]);
    } else {
      expect(uploads).toHaveLength(1);
      const upload = uploads[0] ?? [];
      expect(upload[2]).toBe(tag);
      expect(upload.slice(3, upload.indexOf("--clobber")).map((path) => basename(path)).sort()).toEqual([...names, "latest.json", "SHA256SUMS", "RELEASE_NOTES.md"].sort());
      if (scenario === "failed upload") {
        expect(code).toBe(1);
        expect(publications).toEqual([]);
      } else {
        expect(code).toBe(0);
        expect(stderr).toBe("");
        expect(stdout).toContain(`published the release ${tag}`);
        expect(publications).toHaveLength(1);
        expect(publications[0]).toContain("draft=false");
        expect(publications[0]).toContain(`prerelease=${scenario === "prerelease"}`);
        expect(publications[0]).toContain(`make_latest=${scenario !== "prerelease"}`);
        expect(calls.indexOf(publications[0] ?? [])).toBeGreaterThan(calls.indexOf(upload));
      }
    }
    if (scenario === "invalid assets") expect(calls).toEqual([]);
    if (["success", "prerelease", "failed upload", "existing draft"].includes(scenario)) {
      expect(creations).toHaveLength(scenario === "existing draft" ? 0 : 1);
      if (scenario !== "existing draft") {
        expect(creations[0]?.[2]).toBe(tag);
        expect(creations[0]).toContain("--verify-tag");
        expect(creations[0]).toContain("--draft");
        expect(calls.indexOf(creations[0] ?? [])).toBeLessThan(calls.indexOf(uploads[0] ?? []));
      }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("the build planner completes for all six release targets without installing or writing", async () => {
  const cwd = fileURLToPath(new URL("..", import.meta.url));
  await Promise.all(Object.values(RELEASE_PLATFORM_TRIPLES).map(async (triple) => {
    const child = Bun.spawn([process.execPath, "--no-env-file", "scripts/build.ts", "--dry-run", `--target=${triple}`], {
      cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore",
    });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(stdout).toContain(`sidecar-${triple}${triple.includes("windows") ? ".exe" : ""}`);
    expect(stdout).toContain(`--target ${triple}`);
    expect(stdout).toContain("bun packages/web/script/generate-api-reference.mjs");
    expect(stdout).toContain("bun run typecheck");
    expect(stdout).not.toMatch(/\bbun (?:--no-env-file )?(?:run )?test\b/);
    expect(stdout).toContain('"beforeBuildCommand":""');
    expect(stdout).toContain("nothing was changed");
  }));
}, 20_000);
