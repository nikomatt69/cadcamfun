#!/usr/bin/env bun
/**
 * The changelog: release notes built from the commits, and the `CHANGELOG.md` file they
 * are recorded in.
 *
 * This is the cadcamfun counterpart of nikcli's `script/changelog.ts`. Nikcli groups its
 * notes by the area a commit touched and writes them into a marker-delimited "Unreleased"
 * block; the same rules are implemented here, against cadcamfun's own package layout.
 *
 * The notes are produced from the commit messages alone — no model, no network — so the
 * same text is produced in CI and on a developer machine, and the release body, the
 * `CHANGELOG.md` section and `RELEASE_NOTES.md` can never drift apart.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureCommand } from "./release-helpers.ts";
import { lastReleaseTag, latestReleaseTag } from "./release-version.ts";

export interface CommitInfo {
  hash: string;
  author: string;
  subject: string;
  files: string[];
}

export const UNRELEASED_START = "<!-- UNRELEASED:START -->";
export const UNRELEASED_END = "<!-- UNRELEASED:END -->";

/** Commits that never belong in a user-facing changelog. */
const NOISE = /^(ignore:|test:|chore:|ci:|release:|docs?: build)/i;

/**
 * The area a changed path belongs to.
 *
 * The longest matching prefix wins, so `apps/desktop/src-tauri/` is separated from the rest
 * of the desktop app. A path that matches nothing falls back to "Core" rather than being
 * dropped: a change is always worth a line.
 */
export function areaForPath(path: string): string {
  const rules: readonly (readonly [string, string])[] = [
    ["apps/desktop/src-tauri/", "Desktop (Tauri shell)"],
    ["apps/desktop/", "Desktop"],
    ["apps/sidecar/", "Sidecar"],
    ["apps/mobile/", "Mobile"],
    ["packages/core/", "Core"],
    ["packages/db/", "Database"],
    ["packages/api/", "API"],
    ["packages/httpapi-codegen/", "API"],
    ["packages/ai/", "AI"],
    ["packages/web/", "Web"],
    ["packages/vcs/", "Version control"],
    ["packages/workflow/", "Workflows"],
    ["packages/identity/", "Identity"],
    ["packages/buffer/", "Buffer"],
    ["packages/nikcli-plugin/", "Integrations"],
    ["packages/plugin-sdk/", "Integrations"],
    ["scripts/", "Build and release"],
    [".github/", "Build and release"],
    ["specs/", "Documentation"],
  ];
  for (const [prefix, area] of rules) {
    if (path.startsWith(prefix)) return area;
  }
  if (path.endsWith(".md")) return "Documentation";
  return "Core";
}

/** The order the sections appear in the notes. */
export const SECTION_ORDER: readonly string[] = [
  "Core",
  "Desktop",
  "Desktop (Tauri shell)",
  "Sidecar",
  "Mobile",
  "Database",
  "API",
  "AI",
  "Web",
  "Version control",
  "Workflows",
  "Identity",
  "Buffer",
  "Integrations",
  "Build and release",
  "Documentation",
];

/** `true` when a commit is housekeeping and does not belong in the notes. */
export function isNoiseCommit(subject: string): boolean {
  return NOISE.test(subject.trim());
}

/**
 * Turn a commit subject into one changelog line.
 *
 * A conventional-commit prefix (`feat(kernel): …`) is dropped and the sentence is
 * capitalised, so the notes read as prose instead of as a copy of the git log.
 */
export function cleanSubject(subject: string): string {
  const text = subject.trim().replace(/^(\w+)(\([^)]*\))?!?:\s*/, "");
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned === "") return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Group the commits into the sections of the notes.
 *
 * A commit that touches several areas is listed under the first area in `SECTION_ORDER`
 * that it touches, so it appears exactly once.
 */
export function groupCommits(commits: readonly CommitInfo[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const commit of commits) {
    if (isNoiseCommit(commit.subject)) continue;
    const text = cleanSubject(commit.subject);
    if (text === "") continue;
    const areas = commit.files.map(areaForPath);
    const area = SECTION_ORDER.find((candidate) => areas.includes(candidate)) ?? "Core";
    const entries = grouped.get(area) ?? [];
    entries.push(text);
    grouped.set(area, entries);
  }
  return grouped;
}

/** The release notes: one section per area, in `SECTION_ORDER`. */
export function renderNotes(commits: readonly CommitInfo[]): string[] {
  const grouped = groupCommits(commits);
  const lines: string[] = [];
  for (const section of SECTION_ORDER) {
    const entries = grouped.get(section);
    if (!entries || entries.length === 0) continue;
    if (lines.length > 0) lines.push("");
    lines.push(`## ${section}`, "");
    for (const entry of entries) lines.push(`- ${entry}`);
  }
  return lines;
}

// ─────────────────────────────── CHANGELOG.md ───────────────────────────────

/** The `## vX (Month YYYY)` section of `CHANGELOG.md` for a release. */
export function renderChangelogSection(version: string, date: string, notes: readonly string[]): string {
  const body = notes.length > 0 ? notes.join("\n") : "- No notable changes";
  return `## v${version.replace(/^v/, "")} (${date})\n\n${body}\n`;
}

/**
 * Put a release section into the changelog.
 *
 * The file keeps a marker-delimited "Unreleased" block at the top and one section per
 * released version below it. Writing the same version twice replaces the earlier section
 * instead of adding a second one, so a re-run of the release never duplicates it.
 */
export function applyChangelogSection(content: string, section: string): string {
  let result = content;
  const heading = /^## v(\S+?) \(/m.exec(section);
  const version = heading?.[1];

  if (version !== undefined) {
    const pattern = new RegExp(`^## v${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\([^\\n]*\\n`, "m");
    const match = pattern.exec(result);
    if (match?.index !== undefined) {
      const start = match.index;
      const rest = result.slice(start + match[0].length);
      const next = /^## /m.exec(rest);
      const end = next?.index === undefined ? result.length : start + match[0].length + next.index;
      result = result.slice(0, start) + section + "\n" + result.slice(end);
      return collapseBlankLines(result);
    }
  }

  // The commits of the "Unreleased" block are shipped by this release, so the block is
  // emptied: what is in the version section below is now the history of that version.
  const start = result.indexOf(UNRELEASED_START);
  const end = result.indexOf(UNRELEASED_END);
  if (start !== -1 && end !== -1 && end > start) {
    result = result.slice(0, start) + `${UNRELEASED_START}\n${UNRELEASED_END}` + result.slice(end + UNRELEASED_END.length);
  }

  const endMarker = result.indexOf(UNRELEASED_END);
  if (endMarker !== -1) {
    const insertAt = endMarker + UNRELEASED_END.length;
    result = result.slice(0, insertAt) + `\n\n${section}` + result.slice(insertAt);
    return collapseBlankLines(result);
  }

  const title = /^#\s+Changelog\s*$/m.exec(result);
  if (title?.index !== undefined) {
    const insertAt = title.index + title[0].length;
    result = result.slice(0, insertAt) + `\n\n${section}` + result.slice(insertAt);
    return collapseBlankLines(result);
  }

  return `# Changelog\n\n${section}\n${result}`;
}

/** Keep at most one blank line between blocks. */
function collapseBlankLines(content: string): string {
  return content.replace(/\n{3,}/g, "\n\n");
}

// ─────────────────────────────────── git ───────────────────────────────────

/** Parse the output of `git log --name-only --pretty=format:%H%x00%an%x00%s`. */
export function parseCommits(text: string): CommitInfo[] {
  const commits: CommitInfo[] = [];
  let current: CommitInfo | null = null;
  for (const line of text.split("\n")) {
    if (line.includes("\0")) {
      const [hash = "", author = "", ...rest] = line.split("\0");
      current = { hash: hash.trim(), author: author.trim(), subject: rest.join("\0").trim(), files: [] };
      commits.push(current);
      continue;
    }
    const file = line.trim();
    if (file === "" || current === null) continue;
    current.files.push(file);
  }
  return commits;
}

/** The commits between two refs. `from` may be `null` for the whole history. */
export async function gitCommits(from: string | null, to = "HEAD"): Promise<CommitInfo[]> {
  const range = from === null ? to : `${from}..${to}`;
  const result = await captureCommand(["git", "log", "--no-merges", "--name-only", "--pretty=format:%H%x00%an%x00%s", range]);
  if (result.code !== 0) throw new Error(`git log failed: ${result.stderr.trim()}`);
  return parseCommits(result.stdout);
}

/**
 * The newest release tag.
 *
 * The per-platform tags (`v6.0.0-macos-arm64`) are releases of one platform, not versions
 * of the application, so they are not version numbers and are skipped.
 */
export { latestReleaseTag, lastReleaseTag };

/** Write the changelog file, creating it with the marker block when it does not exist. */
export async function writeChangelog(root: string, section: string): Promise<string> {
  const path = join(root, "CHANGELOG.md");
  let content = "# Changelog\n";
  try {
    content = await readFile(path, "utf8");
  } catch {
    // The file is created below with the marker block.
  }
  if (!content.includes(UNRELEASED_START) || !content.includes(UNRELEASED_END)) {
    const title = /^#\s+Changelog\s*$/m.exec(content);
    const block = `${UNRELEASED_START}\n${UNRELEASED_END}`;
    if (title?.index !== undefined) {
      const insertAt = title.index + title[0].length;
      content = content.slice(0, insertAt) + `\n\n${block}\n` + content.slice(insertAt);
    } else {
      content = `# Changelog\n\n${block}\n\n${content}`;
    }
  }
  const updated = collapseBlankLines(applyChangelogSection(content, section));
  await writeFile(path, updated, "utf8");
  return path;
}

/** Replace the notes of the "Unreleased" block. */
export async function writeUnreleased(root: string, notes: readonly string[], date: string): Promise<string> {
  const path = join(root, "CHANGELOG.md");
  let content = "# Changelog\n";
  try {
    content = await readFile(path, "utf8");
  } catch {
    // The file is created below with the marker block.
  }
  const body = notes.length > 0 ? `## Unreleased (${date})\n\n${notes.join("\n")}\n` : "";
  const block = `${UNRELEASED_START}\n${body}${UNRELEASED_END}`;
  const start = content.indexOf(UNRELEASED_START);
  const end = content.indexOf(UNRELEASED_END);
  if (start !== -1 && end !== -1 && end > start) {
    content = content.slice(0, start) + block + content.slice(end + UNRELEASED_END.length);
  } else {
    const title = /^#\s+Changelog\s*$/m.exec(content);
    if (title?.index !== undefined) {
      const insertAt = title.index + title[0].length;
      content = content.slice(0, insertAt) + `\n\n${block}\n` + content.slice(insertAt);
    } else {
      content = `# Changelog\n\n${block}\n\n${content}`;
    }
  }
  await writeFile(path, collapseBlankLines(content), "utf8");
  return path;
}

// ─────────────────────────────────── cli ───────────────────────────────────

if (import.meta.main) {
  const options = new Map<string, string>();
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (!match?.[1]) throw new Error(`Invalid argument: ${arg}`);
    options.set(match[1], match[2] ?? "");
  }
  const root = fileURLToPath(new URL("..", import.meta.url));
  const from = options.get("from") ?? (await lastReleaseTag());
  const commits = await gitCommits(from);
  const notes = renderNotes(commits);
  const date = options.get("date") ?? new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  if (options.has("unreleased")) {
    const path = await writeUnreleased(root, notes, date);
    process.stdout.write(`wrote ${path}\n`);
  } else if (options.has("write")) {
    const version = options.get("version");
    if (version === undefined) throw new Error("--write needs --version");
    const path = await writeChangelog(root, renderChangelogSection(version, date, notes));
    process.stdout.write(`wrote ${path}\n`);
  } else {
    process.stdout.write(`${notes.join("\n")}\n`);
  }
}
