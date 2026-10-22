import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyChangelogSection,
  areaForPath,
  cleanSubject,
  groupCommits,
  isNoiseCommit,
  latestReleaseTag,
  parseCommits,
  renderChangelogSection,
  renderNotes,
  UNRELEASED_END,
  UNRELEASED_START,
  writeUnreleased,
  type CommitInfo,
} from "./changelog.ts";

function commit(subject: string, files: string[]): CommitInfo {
  return { hash: "abc1234", author: "nikomatt69", subject, files };
}

test("a changed path belongs to the area it was changed in", () => {
  expect(areaForPath("packages/core/src/cam/kernel/execute.ts")).toBe("Core");
  expect(areaForPath("apps/desktop/src/features/cam/screens/CamPage.tsx")).toBe("Desktop");
  expect(areaForPath("apps/desktop/src-tauri/src/lib.rs")).toBe("Desktop (Tauri shell)");
  expect(areaForPath("apps/sidecar/src/services/ai.ts")).toBe("Sidecar");
  expect(areaForPath("apps/mobile/app.json")).toBe("Mobile");
  expect(areaForPath("packages/db/src/schema.ts")).toBe("Database");
  expect(areaForPath("packages/api/src/index.ts")).toBe("API");
  expect(areaForPath("packages/ai/src/service.ts")).toBe("AI");
  expect(areaForPath("packages/nikcli-plugin/src/index.ts")).toBe("Integrations");
  expect(areaForPath(".github/workflows/release.yml")).toBe("Build and release");
  expect(areaForPath("scripts/build.ts")).toBe("Build and release");
  expect(areaForPath("specs/10-release-sync.md")).toBe("Documentation");
  expect(areaForPath("README.md")).toBe("Documentation");
  // A path that belongs nowhere is still worth a line.
  expect(areaForPath("LICENSE")).toBe("Core");
});

test("a commit subject becomes one changelog line", () => {
  expect(cleanSubject("feat(kernel): add a five-axis preset")).toBe("Add a five-axis preset");
  expect(cleanSubject("fix(core)!: the tolerance budget timed out")).toBe("The tolerance budget timed out");
  expect(cleanSubject("CAM kernel: the profile is the one place that reads a configuration")).toBe(
    "CAM kernel: the profile is the one place that reads a configuration",
  );
  expect(cleanSubject("   ")).toBe("");
});

test("housekeeping commits stay out of the notes", () => {
  expect(isNoiseCommit("release: v6.0.1")).toBe(true);
  expect(isNoiseCommit("ignore: update download stats")).toBe(true);
  expect(isNoiseCommit("test: cover the kernel budget")).toBe(true);
  expect(isNoiseCommit("chore: bump the lockfile")).toBe(true);
  expect(isNoiseCommit("ci: cache the cargo registry")).toBe(true);
  expect(isNoiseCommit("CAM kernel: the budget runs the whole kernel")).toBe(false);
});

test("the notes are grouped by area, in a fixed order, and a commit appears once", () => {
  const notes = renderNotes([
    commit("Add a five-axis machine preset", ["packages/core/src/cam/machines.ts"]),
    commit("Show the machine profile in the desktop", ["apps/desktop/src/features/cam/screens/CamPage.tsx"]),
    commit("Add a five-axis machine preset", ["packages/api/src/groups/machine-configs.ts"]),
    commit("release: v6.0.1", ["package.json"]),
    commit("ignore: update download stats", ["stats.yml"]),
  ]);
  expect(notes.join("\n")).toBe(
    [
      "## Core",
      "",
      "- Add a five-axis machine preset",
      "",
      "## Desktop",
      "",
      "- Show the machine profile in the desktop",
      "",
      "## API",
      "",
      "- Add a five-axis machine preset",
    ].join("\n"),
  );
  // A commit that touches several areas is listed under the first one it touches.
  const grouped = groupCommits([commit("Touch everything", ["packages/api/src/index.ts", "packages/core/src/index.ts"])]);
  expect([...grouped.keys()]).toEqual(["Core"]);
});

test("the changelog keeps one section per version and does not duplicate it", () => {
  const section = renderChangelogSection("6.0.1", "October 2026", ["## Core", "", "- A change"]);
  const empty = `# Changelog\n\n${UNRELEASED_START}\n${UNRELEASED_END}\n`;
  const once = applyChangelogSection(empty, section);
  expect(once).toContain("## v6.0.1 (October 2026)");
  expect(once.indexOf("## v6.0.1")).toBeGreaterThan(once.indexOf(UNRELEASED_END));

  // Writing the same version again replaces the section instead of adding a second one.
  const twice = applyChangelogSection(once, section);
  expect(twice.split("## v6.0.1").length - 1).toBe(1);

  // A second version goes above the first one: the newest release is on top.
  const other = applyChangelogSection(once, renderChangelogSection("6.0.2", "November 2026", ["## Core", "", "- Another change"]));
  expect(other.indexOf("## v6.0.2")).toBeLessThan(other.indexOf("## v6.0.1"));
});

test("the unreleased block is emptied when its commits are released", () => {
  const section = renderChangelogSection("6.0.1", "October 2026", ["## Core", "", "- A change"]);
  const content = `# Changelog\n\n${UNRELEASED_START}\n## Unreleased (October 22, 2026)\n\n## Core\n\n- A change\n${UNRELEASED_END}\n`;
  const updated = applyChangelogSection(content, section);
  const block = updated.slice(updated.indexOf(UNRELEASED_START), updated.indexOf(UNRELEASED_END) + UNRELEASED_END.length);
  expect(block).toBe(`${UNRELEASED_START}\n${UNRELEASED_END}`);
  expect(updated).toContain("- A change");
});

test("the git log is parsed into commits with their files", () => {
  const raw = [
    "c0f7b0d55d7041d0f1dee2dfb36287b6a254dadc\u0000nikomatt69\u0000Implement cross-compilation",
    ".github/workflows/release.yml",
    "",
    "9ed5282354453556b7924a66e3dff22eb4495645\u0000nikomatt69\u0000Remove flutes rendering",
    "apps/desktop/src/viewport/view3d/tool-object.ts",
    "",
  ].join("\n");
  const commits = parseCommits(raw);
  expect(commits.length).toBe(2);
  expect(commits[0]?.hash).toBe("c0f7b0d55d7041d0f1dee2dfb36287b6a254dadc");
  expect(commits[0]?.author).toBe("nikomatt69");
  expect(commits[0]?.subject).toBe("Implement cross-compilation");
  expect(commits[0]?.files).toEqual([".github/workflows/release.yml"]);
  expect(commits[1]?.files).toEqual(["apps/desktop/src/viewport/view3d/tool-object.ts"]);
});

test("the newest release tag ignores the per-platform tags", () => {
  expect(latestReleaseTag(["v6.0.1-macos-arm64", "v6.0.0", "v5.9.0"])).toBe("v6.0.0");
  expect(latestReleaseTag(["v6.0.1-windows-x64", "v6.0.1"])).toBe("v6.0.1");
  expect(latestReleaseTag(["v6.0.2", "v6.1.0"])).toBe("v6.1.0");
  expect(latestReleaseTag([])).toBeNull();
});

test("the unreleased notes are written into the changelog file", async () => {
  const root = await mkdtemp(join(tmpdir(), "cadcam-changelog-"));
  try {
    const path = await writeUnreleased(root, ["## Core", "", "- A change"], "October 22, 2026");
    const content = await readFile(path, "utf8");
    expect(content).toContain("# Changelog");
    expect(content).toContain(UNRELEASED_START);
    expect(content).toContain("## Unreleased (October 22, 2026)");
    expect(content).toContain("- A change");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
