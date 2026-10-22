/**
 * Release version resolution and workspace stamping.
 *
 * A release has exactly one version. It lives in `apps/desktop/src-tauri/tauri.conf.json`
 * (the file Tauri itself reads) and every other holder mirrors it: the workspace
 * `package.json` files that carry a version, the Rust crate, and the Expo companion.
 *
 * This module is the only place that decides which version a release gets and writes it
 * everywhere. It mirrors two pieces of nikcli's release machinery: the version resolution
 * in `packages/script` and the workspace-wide stamping in `script/publish-start.ts`.
 *
 * The functions are pure where they can be, so the rules are testable without a checkout.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export type Bump = "major" | "minor" | "patch";

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
  build: string | null;
  raw: string;
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

/** Parse a semantic version, tolerating the `v` prefix used by tags. */
export function parseVersion(raw: string): ParsedVersion {
  const value = raw.trim().replace(/^v/, "");
  const match = SEMVER.exec(value);
  if (!match) throw new Error(`Invalid version: ${raw}`);
  const [, major, minor, patch, prerelease, build] = match;
  if (prerelease !== undefined && prerelease.split(".").some((part) => part === "" || (/^\d+$/.test(part) && part.length > 1 && part.startsWith("0")))) {
    throw new Error(`Invalid version: ${raw}`);
  }
  if (build !== undefined && build.split(".").some((part) => part === "")) {
    throw new Error(`Invalid version: ${raw}`);
  }
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: prerelease ?? null,
    build: build ?? null,
    raw: value,
  };
}

/** Compare two versions: negative when `a` is older, positive when it is newer, 0 when equal. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  if (left.patch !== right.patch) return left.patch - right.patch;
  // A prerelease is older than its release (`1.0.0-rc.1` < `1.0.0`).
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  const leftParts = left.prerelease.split(".");
  const rightParts = right.prerelease.split(".");
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index++) {
    const l = leftParts[index];
    const r = rightParts[index];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const lNumeric = /^\d+$/.test(l);
    const rNumeric = /^\d+$/.test(r);
    if (lNumeric && rNumeric) {
      const diff = Number(l) - Number(r);
      if (diff !== 0) return diff;
      continue;
    }
    if (lNumeric !== rNumeric) return lNumeric ? -1 : 1;
    if (l !== r) return l < r ? -1 : 1;
  }
  return 0;
}

/** Apply a bump to a version. A prerelease base is bumped as its release version. */
export function bumpVersion(current: string, bump: Bump): string {
  const version = parseVersion(current);
  if (bump === "major") return `${version.major + 1}.0.0`;
  if (bump === "minor") return `${version.major}.${version.minor + 1}.0`;
  if (bump === "patch") return `${version.major}.${version.minor}.${version.patch + 1}`;
  throw new Error(`Unknown bump: ${bump}`);
}

export interface ReleaseVersionInput {
  /** `major`, `minor` or `patch`. */
  bump?: string | undefined;
  /** An explicit version, which wins over the bump. */
  override?: string | undefined;
  /** The version currently configured in the tree. */
  current: string;
  /** The newest release tag in the repository, if any. */
  latestTag?: string | null | undefined;
}

/**
 * Decide the version of the release that is about to be made.
 *
 * An explicit version wins. Otherwise the bump is applied to the version the release
 * moves forward from — the newer of the version in the tree and the newest release tag —
 * so a release never reuses a version that was already published, even when the tree
 * lags behind it.
 */
export function resolveReleaseVersion(input: ReleaseVersionInput): string {
  if (input.override !== undefined && input.override.trim() !== "") {
    const version = parseVersion(input.override).raw;
    assertNewerThanLatest(version, input.latestTag ?? null);
    return version;
  }
  const bump = input.bump?.trim().toLowerCase();
  if (bump !== "major" && bump !== "minor" && bump !== "patch") {
    throw new Error(`A release needs a bump (major, minor, patch) or an explicit version, got: ${input.bump ?? "(none)"}`);
  }
  const version = bumpVersion(releaseBase(input.current, input.latestTag), bump);
  assertNewerThanLatest(version, input.latestTag ?? null);
  return version;
}

/**
 * The version the bump is applied to.
 *
 * The release moves forward from what was published: the newer of the version in the
 * tree and the newest release tag. A tree that lags behind a published release — a
 * reverted branch, a release made from another one — still moves forward.
 */
export function releaseBase(current: string, latestTag: string | null | undefined): string {
  const tree = parseVersion(current).raw;
  if (latestTag === null || latestTag === undefined || latestTag.trim() === "") return tree;
  const tag = latestTag.trim().replace(/^v/, "");
  return compareVersions(tree, tag) >= 0 ? tree : tag;
}

function assertNewerThanLatest(version: string, latestTag: string | null): void {
  if (latestTag === null || latestTag === "") return;
  const latest = latestTag.replace(/^v/, "");
  if (compareVersions(version, latest) <= 0) {
    throw new Error(`Release version ${version} is not newer than the latest release ${latestTag}`);
  }
}

// ──────────────────────────────── release tags ────────────────────────────────

/**
 * The newest release tag.
 *
 * The per-platform tags (`v6.0.0-macos-arm64`) are releases of one platform, not
 * versions of the application, so they are not version numbers and are skipped.
 */
export function latestReleaseTag(tags: readonly string[]): string | null {
  const candidates = tags.filter((tag) => {
    if (!tag.startsWith("v") || /-(?:macos|windows|linux)-(?:arm64|x64)$/.test(tag)) return false;
    try { parseVersion(tag); return true; } catch { return false; }
  });
  let newest: string | null = null;
  for (const tag of candidates) {
    if (newest === null || compareVersions(tag, newest) > 0) newest = tag;
  }
  return newest;
}

/** The tags of the repository. */
export function repositoryTags(root?: string): string[] {
  const child = Bun.spawnSync(["git", "tag", "--list"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  if (child.exitCode !== 0) return [];
  return child.stdout.toString().split("\n").map((tag) => tag.trim()).filter((tag) => tag !== "");
}

/** The newest release tag in the repository, or `null` when it has never been released. */
export async function lastReleaseTag(root?: string): Promise<string | null> {
  return latestReleaseTag(repositoryTags(root));
}

// ───────────────────────────── version holders ─────────────────────────────

export type HolderKind = "package-json" | "tauri-config" | "cargo-toml" | "cargo-lock" | "expo-config";

export interface VersionHolder {
  /** Path relative to the repository root. */
  path: string;
  kind: HolderKind;
}

/** The holders that are not `package.json` files, in a fixed order. */
export const FIXED_VERSION_HOLDERS: readonly VersionHolder[] = [
  { path: "apps/desktop/src-tauri/tauri.conf.json", kind: "tauri-config" },
  { path: "apps/desktop/src-tauri/Cargo.toml", kind: "cargo-toml" },
  { path: "apps/desktop/src-tauri/Cargo.lock", kind: "cargo-lock" },
  { path: "apps/mobile/app.json", kind: "expo-config" },
];

/**
 * Every `package.json` in the workspace that carries a version, plus the fixed holders.
 *
 * Private workspace packages have no version field; they are not published and must not
 * grow one, so they are left alone.
 */
export async function discoverVersionHolders(root: string): Promise<VersionHolder[]> {
  const holders: VersionHolder[] = [];
  const manifests = [join(root, "package.json")];
  for (const workspace of ["packages", "apps"]) {
    const directory = join(root, workspace);
    let entries: string[] = [];
    try {
      entries = (await readdir(directory)).sort();
    } catch {
      continue;
    }
    for (const entry of entries) manifests.push(join(directory, entry, "package.json"));
  }
  for (const manifest of manifests) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(manifest, "utf8"));
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    const version = (parsed as { version?: unknown }).version;
    if (typeof version !== "string") continue;
    holders.push({ path: relative(root, manifest).split(sep).join("/"), kind: "package-json" });
  }
  for (const holder of FIXED_VERSION_HOLDERS) {
    try {
      await readFile(join(root, holder.path), "utf8");
    } catch {
      // The holder is not part of this checkout.
      continue;
    }
    holders.push(holder);
  }
  return holders;
}

/** The version a holder currently declares. */
export async function readHolderVersion(root: string, holder: VersionHolder): Promise<string> {
  const text = await readFile(join(root, holder.path), "utf8");
  switch (holder.kind) {
    case "package-json": {
      const parsed = JSON.parse(text) as { version?: unknown };
      if (typeof parsed.version !== "string") throw new Error(`${holder.path} has no version`);
      return parsed.version;
    }
    case "tauri-config": {
      const parsed = JSON.parse(text) as { version?: unknown };
      if (typeof parsed.version !== "string") throw new Error(`${holder.path} has no version`);
      return parsed.version;
    }
    case "expo-config": {
      const parsed = JSON.parse(text) as { expo?: { version?: unknown } };
      const version = parsed.expo?.version;
      if (typeof version !== "string") throw new Error(`${holder.path} has no expo.version`);
      return version;
    }
    case "cargo-toml": {
      const match = /^version\s*=\s*"([^"]*)"/m.exec(text);
      if (!match?.[1]) throw new Error(`${holder.path} has no [package] version`);
      return match[1];
    }
    case "cargo-lock": {
      const match = /\[\[package\]\]\r?\nname = "cadcamfun-desktop"\r?\nversion = "([^"]+)"/.exec(text);
      if (!match?.[1]) throw new Error(`${holder.path} has no cadcamfun-desktop package version`);
      return match[1];
    }
  }
}

/**
 * The application version: the one the release is about.
 *
 * It lives in `tauri.conf.json` — the file Tauri itself reads — and the other holders
 * mirror it. The published plugin carries its own line until the first release stamps
 * it, so the reference is the application and not the first holder found.
 */
export const APPLICATION_VERSION_PATH = "apps/desktop/src-tauri/tauri.conf.json";

/** The version every holder declares, keyed by path. */
export async function readWorkspaceVersions(root: string): Promise<Record<string, string>> {
  const holders = await discoverVersionHolders(root);
  const versions: Record<string, string> = {};
  for (const holder of holders) versions[holder.path] = await readHolderVersion(root, holder);
  return versions;
}

/** The holders that must carry the application version, and the published plugin. */
export function versionHolders(versions: Readonly<Record<string, string>>): { path: string; version: string }[] {
  return Object.entries(versions).map(([path, version]) => ({ path, version }));
}

/** The holders whose version differs from the application version. */
export function versionMismatches(
  versions: Readonly<Record<string, string>>,
): { path: string; version: string; expected: string }[] {
  const expected = versions[APPLICATION_VERSION_PATH];
  if (expected === undefined) return [];
  return versionHolders(versions)
    .filter((holder) => holder.version !== expected)
    .map((holder) => ({ ...holder, expected }));
}

/**
 * Fail when the holders disagree.
 *
 * A release that ships one version in the app and another in the plugin or the crate is
 * broken in a way no test would catch, so the mismatch is refused before anything is built.
 * The application version is the reference: it is the one the release is about.
 */
export function assertVersionsAgree(versions: Readonly<Record<string, string>>): void {
  const reference = versions[APPLICATION_VERSION_PATH];
  if (reference === undefined) throw new Error(`The application version is missing from ${APPLICATION_VERSION_PATH}`);
  for (const holder of versionHolders(versions)) {
    if (holder.version !== reference) {
      throw new Error(`Version mismatch: ${holder.path} is ${holder.version} but ${APPLICATION_VERSION_PATH} is ${reference}`);
    }
  }
}

/** The indentation a JSON file uses, so rewriting it does not reformat the whole file. */
function detectIndent(text: string): string | number {
  const match = /^\{\s*\n(\s+)"/.exec(text);
  if (!match?.[1]) return 2;
  return match[1].includes("\t") ? "\t" : match[1].length;
}

/** Write a JSON file back with the indentation it already used. */
async function writeJson(path: string, value: unknown, original: string): Promise<void> {
  const indent = detectIndent(original);
  await writeFile(path, `${JSON.stringify(value, null, indent)}\n`, "utf8");
}

/**
 * Write `version` into every holder.
 *
 * Returns the paths that actually changed, so the caller can stage exactly those files
 * into the release commit instead of sweeping in unrelated working-tree changes.
 */
export async function stampVersions(root: string, version: string): Promise<string[]> {
  const parsed = parseVersion(version).raw;
  const holders = await discoverVersionHolders(root);
  const changed: string[] = [];
  for (const holder of holders) {
    const path = join(root, holder.path);
    const original = await readFile(path, "utf8");
    if ((await readHolderVersion(root, holder)) === parsed) continue;
    switch (holder.kind) {
      case "package-json":
      case "tauri-config": {
        const value = JSON.parse(original) as Record<string, unknown>;
        value["version"] = parsed;
        await writeJson(path, value, original);
        break;
      }
      case "expo-config": {
        const value = JSON.parse(original) as { expo: Record<string, unknown> };
        value.expo["version"] = parsed;
        await writeJson(path, value, original);
        break;
      }
      case "cargo-toml": {
        const updated = original.replace(/^(version\s*=\s*)"[^"]*"/m, `$1"${parsed}"`);
        await writeFile(path, updated, "utf8");
        break;
      }
      case "cargo-lock": {
        const updated = original.replace(/(\[\[package\]\]\r?\nname = "cadcamfun-desktop"\r?\nversion = )"[^"]*"/, `$1"${parsed}"`);
        await writeFile(path, updated, "utf8");
        break;
      }
    }
    changed.push(holder.path);
  }
  return changed;
}

// ─────────────────────────────────── cli ───────────────────────────────────

if (import.meta.main) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const options = new Map<string, string>();
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (!match?.[1]) throw new Error(`Invalid argument: ${arg}`);
    options.set(match[1], match[2] ?? "");
  }
  const bump = options.get("bump");
  const override = options.get("version");
  const versions = await readWorkspaceVersions(root);
  const current = versions[APPLICATION_VERSION_PATH];
  if (current === undefined) throw new Error(`The application version is missing from ${APPLICATION_VERSION_PATH}`);
  // The tag the release moves forward from: the newest one in the repository, unless
  // the caller names one.
  const latestTag = options.get("latest-tag") ?? (await lastReleaseTag(root));

  if (options.has("check")) {
    // The holders must agree: a release that ships two versions is broken.
    assertVersionsAgree(versions);
    process.stdout.write(`the workspace carries one version: ${current}\n`);
  } else if (options.has("stamp")) {
    // Stamping is what makes the holders agree, so it may not require it.
    const changed = await stampVersions(root, override ?? current);
    process.stdout.write(`stamped ${changed.length} file(s): ${changed.join(", ") || "(none)"}\n`);
  } else {
    const resolved = resolveReleaseVersion({ bump, override, current, latestTag });
    process.stdout.write(`${resolved}\n`);
  }
}
