import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { compareVersions, parseVersion } from "./release-version.ts";

/**
 * Run a command and capture its output.
 *
 * Bun's shell prints what a command writes even when the output is captured, which puts
 * the raw `git log` of a release into the middle of the release notes. This spawns the
 * process quietly instead and hands back what it wrote.
 */
export async function captureCommand(
  command: readonly string[],
  options: { cwd?: string } = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  const child = Bun.spawn([...command], {
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout as ReadableStream).text(),
    new Response(child.stderr as ReadableStream).text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}

/**
 * The repository the releases are published to.
 *
 * Installers for all six targets and the updater feed live on one release here, so
 * the name is written once and checked against the publish workflow and the Tauri
 * configuration: a feed that points at another repository resolves to nothing.
 */
export const RELEASE_REPOSITORY = "nikomatt69/cadcamfun";

/** The updater feed: the `latest.json` of the release GitHub marks as the latest one. */
export const RELEASE_UPDATER_ENDPOINT = `https://github.com/${RELEASE_REPOSITORY}/releases/latest/download/latest.json`;

/**
 * The Bun version the workspace expects.
 *
 * It is read from the `engines` field of the root manifest, so the version lives in
 * one place: the release scripts write the lockfile and compile the sidecar, and a
 * different Bun writes a different lockfile.
 */
export function expectedBunVersion(root: string): string | null {
  const manifest = join(root, "package.json");
  let parsed: { engines?: { bun?: unknown } };
  try {
    parsed = JSON.parse(readFileSync(manifest, "utf8")) as { engines?: { bun?: unknown } };
  } catch {
    return null;
  }
  const range = parsed.engines?.bun;
  return typeof range === "string" ? range : null;
}

/**
 * Refuse to publish with the wrong Bun.
 *
 * The range is the `>=` form the workspace declares; a narrower range is accepted as
 * long as the running version satisfies it.
 */
export function assertBunVersion(root: string): void {
  const range = expectedBunVersion(root);
  if (range === null) return;
  const minimum = />=\s*(\d+)\.(\d+)\.(\d+)/.exec(range);
  if (!minimum) return;
  const [, major, minor, patch] = minimum;
  const actual = Bun.version.split(".").map((part) => Number(part) || 0);
  const expected = [Number(major), Number(minor), Number(patch)];
  for (let index = 0; index < 3; index++) {
    const difference = (actual[index] ?? 0) - (expected[index] ?? 0);
    if (difference > 0) return;
    if (difference < 0) {
      throw new Error(`The release needs bun@${range}, but it runs on bun@${Bun.version}`);
    }
  }
}

export const RELEASE_PLATFORM_TRIPLES: Readonly<Record<string, string>> = {
  "darwin-aarch64": "aarch64-apple-darwin",
  "darwin-x86_64": "x86_64-apple-darwin",
  "windows-aarch64": "aarch64-pc-windows-msvc",
  "windows-x86_64": "x86_64-pc-windows-msvc",
  "linux-aarch64": "aarch64-unknown-linux-gnu",
  "linux-x86_64": "x86_64-unknown-linux-gnu",
};

export const RELEASE_PLATFORM_KEYS = Object.freeze(Object.keys(RELEASE_PLATFORM_TRIPLES));

/** Package-specific keys let Tauri retain the installed package manager/type. */
export const UPDATER_PLATFORM_ASSETS: Readonly<Record<string, { readonly triple: string; readonly suffix: string }>> = Object.freeze(
  Object.fromEntries(Object.entries(RELEASE_PLATFORM_TRIPLES).flatMap(([key, triple]) => {
    const formats = key.startsWith("linux-") ? [[`${key}-deb`, ".deb"], [`${key}-rpm`, ".rpm"]]
      : key.startsWith("windows-") ? [[key, ".exe"], [`${key}-msi`, ".msi"]] : [[key, ".app.tar.gz"]];
    return formats.map(([platform, suffix]) => [platform!, { triple, suffix: suffix! }]);
  }))
);
export const UPDATER_PLATFORM_KEYS = Object.freeze(Object.keys(UPDATER_PLATFORM_ASSETS));

// Ignore historical per-platform tags when discovering application versions.
const PLATFORM_TAG = /-(?:macos|windows|linux)-(?:arm64|x64)$/;

export function targetInfo(triple: string): { platform: "darwin" | "linux" | "windows"; arch: "aarch64" | "x86_64"; bunTarget: string } {
  const arch = triple.split("-")[0];
  if (arch !== "aarch64" && arch !== "x86_64") throw new Error(`Unsupported target: ${triple}`);
  const platform = triple.endsWith("-apple-darwin") ? "darwin"
    : /-unknown-linux-(gnu|musl)$/.test(triple) ? "linux"
    : triple.endsWith("-pc-windows-msvc") ? "windows" : null;
  if (platform === null) throw new Error(`Unsupported target: ${triple}`);
  const bunArch = arch === "x86_64" ? "x64" : "arm64";
  return { platform, arch, bunTarget: `bun-${platform}-${bunArch}${triple.endsWith("-musl") ? "-musl" : ""}` };
}

export function bundleRoot(srcTauri: string, triple: string, cargoTargetDir?: string): string {
  return join(cargoTargetDir ?? join(srcTauri, "target"), triple, "release", "bundle");
}

const INSTALLER = /(?:\.app\.tar\.gz|\.AppImage(?:\.tar\.gz)?|\.dmg|\.exe|\.msi|\.deb|\.rpm)(?:\.sig)?$/i;

export function indexArtifacts(paths: readonly string[], triple: string): { source: string; name: string }[] {
  targetInfo(triple);
  const indexed = paths.filter((path) => INSTALLER.test(path)).map((source) => ({
    source, name: `${triple}--${basename(source)}`,
  })).sort((a, b) => a.name.localeCompare(b.name));
  const names = new Set<string>();
  for (const entry of indexed) {
    if (names.has(entry.name)) throw new Error(`Duplicate release asset: ${entry.name}`);
    names.add(entry.name);
  }
  for (const entry of indexed) {
    if (entry.name.endsWith(".sig") && !names.has(entry.name.slice(0, -4))) {
      throw new Error(`Orphan signature: ${entry.name}`);
    }
  }
  return indexed;
}

export function releaseVersion(raw: string): string {
  const version = raw.replace(/^v/, "");
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid release version: ${raw}`);
  }
  const [base, build] = version.split("+");
  const prerelease = base?.slice(base.indexOf("-") + 1);
  if (build?.split(".").some((part) => !part) || (base?.includes("-") && prerelease?.split(".").some((part) => !part || (/^\d+$/.test(part) && part.length > 1 && part.startsWith("0"))))) throw new Error(`Invalid release version: ${raw}`);
  return version;
}

/**
 * The release gate: the tag the release is made from.
 *
 * Three ways in, all of them naming the tag explicitly: a tag push, a manual dispatch
 * and the `workflow_call` the publish pipeline makes (the release of one version is
 * built by the workflow that owns the release). A reusable workflow keeps the caller's
 * event, so a push to main that calls this workflow still looks like `push` and the
 * tag arrives as the input, not as `refs/tags/…`.
 */
export function selectReleaseRef(event: string, ref: string, input: string | undefined, configuredVersion: string): { tag: string; version: string } {
  if (event !== "push" && event !== "workflow_dispatch" && event !== "workflow_call") throw new Error("Release requires a tag push, a manual dispatch or the publish pipeline");
  const explicit = input?.trim() ?? "";
  const pushedTag = event === "push" && ref.startsWith("refs/tags/") ? ref.slice("refs/tags/".length) : "";
  if (event === "push" && explicit === "" && pushedTag === "") throw new Error("Release push must reference a tag");
  const tag = explicit !== "" ? explicit : pushedTag;
  if (!tag.startsWith("v")) throw new Error("Release ref must be an existing v-prefixed version tag");
  const version = releaseVersion(tag);
  if (version !== releaseVersion(configuredVersion)) throw new Error("Release tag and application version disagree");
  return { tag, version };
}

/**
 * The release before the current one.
 *
 * The newest tag wins, not the first one in the list: `git tag --list` sorts
 * lexicographically, and `v9.0.0` sorts before `v10.0.0`.
 */
export function previousReleaseTag(tags: readonly string[], currentTag: string | null): string | null {
  const candidates = tags.filter((tag) => {
    if (tag === currentTag || !tag.startsWith("v") || PLATFORM_TAG.test(tag)) return false;
    try { parseVersion(tag); } catch { return false; }
    return currentTag === null || compareVersions(tag, currentTag) < 0;
  });
  let newest: string | null = null;
  for (const tag of candidates) {
    if (newest === null || compareVersions(tag, newest) > 0) newest = tag;
  }
  return newest;
}

/** The environment that signs and notarises a macOS build. */
export const APPLE_SIGNING_ENV = ["APPLE_CERTIFICATE", "APPLE_CERTIFICATE_PASSWORD", "APPLE_ID", "APPLE_PASSWORD", "APPLE_TEAM_ID"] as const;

/** The environment that signs a Windows build. */
export const WINDOWS_SIGNING_ENV = ["WINDOWS_CERTIFICATE", "WINDOWS_CERTIFICATE_PASSWORD"] as const;

/** How a platform build is signed. */
export interface SigningPlan {
  /** `certificate` when the Apple environment is complete, `ad-hoc` otherwise. */
  apple: "certificate" | "ad-hoc";
  /** `certificate` when the Windows environment is complete, `unsigned` otherwise. */
  windows: "certificate" | "unsigned";
}

/** Same text on every builder: updater fragments must agree on their release notes. */
export function signingStatement(plan: SigningPlan): string {
  return [
    plan.apple === "certificate"
      ? "macOS: signed with an Apple Developer certificate and notarised."
      : "macOS: ad-hoc signed and **not notarised**; confirm the app on first launch.",
    plan.windows === "certificate"
      ? "Windows: signed with a code-signing certificate."
      : "Windows: **not signed**; SmartScreen may require confirmation on first launch.",
    "Linux: packages are not code-signed.",
    "Updater bundles on every platform have a verified Tauri signature.",
  ].join("\n\n");
}

function hasAll(env: Readonly<Record<string, string | undefined>>, names: readonly string[]): boolean {
  return names.every((name) => (env[name] ?? "").trim() !== "");
}

/**
 * Check the signing configuration and say how the build will be signed.
 *
 * The updater key is required: without it the release cannot be verified by the
 * application that downloads it. The platform certificates are not: like nikcli, a build
 * without them is ad-hoc signed on macOS and unsigned on Windows, and the release notes
 * say so. A certificate that is *partly* configured is still an error, because that is a
 * mistake rather than a choice.
 */
export function assertSigningConfig(config: unknown, env: Readonly<Record<string, string | undefined>>, platform: string, release: boolean): SigningPlan {
  if (!isRecord(config) || !isRecord(config.plugins) || !isRecord(config.plugins.updater)) throw new Error("Missing updater configuration");
  const key = config.plugins.updater.pubkey;
  if (typeof key !== "string" || key.trim() === "" || /REPLACE|PLACEHOLDER/i.test(key)) throw new Error("Configure a real Tauri updater public key before bundling");
  if (!env.TAURI_SIGNING_PRIVATE_KEY?.trim()) throw new Error("TAURI_SIGNING_PRIVATE_KEY is required before bundling");

  const apple = hasAll(env, APPLE_SIGNING_ENV) ? "certificate" : "ad-hoc";
  const windows = hasAll(env, WINDOWS_SIGNING_ENV) ? "certificate" : "unsigned";
  if (release) {
    const partly = (names: readonly string[]) => names.some((name) => (env[name] ?? "").trim() !== "") && !hasAll(env, names);
    const appleRequested = APPLE_SIGNING_ENV.some((name) => name !== "APPLE_TEAM_ID" && (env[name] ?? "").trim() !== "");
    if (appleRequested && apple === "ad-hoc") throw new Error("APPLE_CERTIFICATE and the Apple signing environment must be configured together");
    if (partly(WINDOWS_SIGNING_ENV)) throw new Error("WINDOWS_CERTIFICATE and WINDOWS_CERTIFICATE_PASSWORD must be configured together");
  }
  void platform;
  return { apple, windows };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface PlatformEntry { signature: string; url: string }
export interface Manifest { version: string; pub_date: string; notes?: string; platforms: Record<string, PlatformEntry> }

export function validateManifest(value: unknown): Manifest {
  if (!isRecord(value) || typeof value.version !== "string" || typeof value.pub_date !== "string"
    || !Number.isFinite(Date.parse(value.pub_date)) || !isRecord(value.platforms) || Object.keys(value.platforms).length === 0) {
    throw new Error("Invalid updater manifest shape");
  }
  const version = releaseVersion(value.version);
  const platforms: Record<string, PlatformEntry> = {};
  for (const [key, entry] of Object.entries(value.platforms)) {
    if (!Object.hasOwn(UPDATER_PLATFORM_ASSETS, key) || !isRecord(entry)
      || typeof entry.signature !== "string" || !entry.signature.trim() || typeof entry.url !== "string"
      || !isHttpsUrl(entry.url)) throw new Error(`Invalid updater platform entry: ${key}`);
    platforms[key] = { signature: entry.signature, url: entry.url };
  }
  if (value.notes !== undefined && typeof value.notes !== "string") throw new Error("Invalid manifest notes");
  return { version, pub_date: value.pub_date, platforms, ...(typeof value.notes === "string" ? { notes: value.notes } : {}) };
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname !== "" && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

export function parseChecksums(text: string): { digest: string; name: string }[] {
  const names = new Set<string>();
  const entries = text.trim().split("\n").map((line) => {
    const match = /^([a-f0-9]{64})  ([^/\\\r\n]+)$/.exec(line);
    const digest = match?.[1];
    const name = match?.[2];
    if (!digest || !name || name === "." || name === ".." || names.has(name)) throw new Error("Invalid or duplicate checksum entry");
    names.add(name);
    return { digest, name };
  });
  return entries;
}

export function assertManifestAssets(manifest: Manifest, names: readonly string[], releaseUrl: string): void {
  if (!isHttpsUrl(releaseUrl)) throw new Error("Invalid release asset URL");
  for (const [platform, entry] of Object.entries(manifest.platforms)) {
    const prefix = `${releaseUrl.replace(/\/$/, "")}/`;
    if (!entry.url.startsWith(prefix)) throw new Error(`Wrong release URL for ${platform}`);
    const name = decodeURIComponent(entry.url.slice(prefix.length));
    const asset = UPDATER_PLATFORM_ASSETS[platform];
    if (!asset || !name.startsWith(`${asset.triple}--`) || !name.endsWith(asset.suffix) || !names.includes(name) || !names.includes(`${name}.sig`)) {
      throw new Error(`Missing or mismatched release assets for ${platform}`);
    }
  }
}

export function mergeManifestValues(values: readonly unknown[], version: string, expectedKeys: readonly string[] = []): Manifest {
  const platforms: Record<string, PlatformEntry> = {};
  const manifests = values.map(validateManifest);
  if (manifests.length === 0) throw new Error("No manifests to merge");
  const first = manifests[0];
  if (first === undefined) throw new Error("No manifests to merge");
  for (const manifest of manifests) {
    if (manifest.version !== releaseVersion(version) || manifest.pub_date !== first.pub_date || manifest.notes !== first.notes) throw new Error("Manifest release metadata disagree");
    for (const key of Object.keys(manifest.platforms).sort()) {
      const entry = manifest.platforms[key];
      if (entry === undefined) throw new Error(`Missing platform ${key}`);
      if (platforms[key]) throw new Error(`Duplicate updater platform: ${key}`);
      platforms[key] = entry;
    }
  }
  if (expectedKeys.length && (expectedKeys.length !== Object.keys(platforms).length || expectedKeys.some((key) => !platforms[key]))) throw new Error("Incomplete release platform set");
  return { version: releaseVersion(version), pub_date: first.pub_date, ...(first.notes === undefined ? {} : { notes: first.notes }), platforms: Object.fromEntries(Object.entries(platforms).sort(([a], [b]) => a.localeCompare(b))) };
}
