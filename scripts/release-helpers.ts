import { basename, join } from "node:path";

export function targetInfo(triple: string): { platform: "darwin" | "linux" | "windows"; arch: "aarch64" | "x86_64"; bunTarget: string } {
  const arch = triple.split("-")[0];
  if (arch !== "aarch64" && arch !== "x86_64") throw new Error(`Unsupported target: ${triple}`);
  const platform = triple.endsWith("-apple-darwin") ? "darwin"
    : /-unknown-linux-(gnu|musl)$/.test(triple) ? "linux"
    : triple.endsWith("-pc-windows-msvc") ? "windows" : null;
  if (platform === null) throw new Error(`Unsupported target: ${triple}`);
  return { platform, arch, bunTarget: `bun-${platform}-${arch === "x86_64" ? "x64" : arch}${triple.endsWith("-musl") ? "-musl" : ""}` };
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

export function selectReleaseRef(event: string, ref: string, input: string | undefined, configuredVersion: string): { tag: string; version: string } {
  if (event !== "push" && event !== "workflow_dispatch") throw new Error("Release requires a tag push or manual dispatch");
  if (event === "push" && !ref.startsWith("refs/tags/")) throw new Error("Release push must reference a tag");
  const tag = event === "workflow_dispatch" ? input : ref.slice("refs/tags/".length);
  if (!tag || !tag.startsWith("v")) throw new Error("Release ref must be an existing v-prefixed version tag");
  const version = releaseVersion(tag);
  if (version !== releaseVersion(configuredVersion)) throw new Error("Release tag and application version disagree");
  return { tag, version };
}

export function previousReleaseTag(tags: readonly string[], currentTag: string | null): string | null {
  return tags.find((tag) => tag !== currentTag && /^v\d+\.\d+\.\d+/.test(tag)) ?? null;
}

export function assertSigningConfig(config: unknown, env: Readonly<Record<string, string | undefined>>, platform: string, release: boolean): void {
  if (!isRecord(config) || !isRecord(config.plugins) || !isRecord(config.plugins.updater)) throw new Error("Missing updater configuration");
  const key = config.plugins.updater.pubkey;
  if (typeof key !== "string" || key.trim() === "" || /REPLACE|PLACEHOLDER/i.test(key)) throw new Error("Configure a real Tauri updater public key before bundling");
  if (!env.TAURI_SIGNING_PRIVATE_KEY?.trim()) throw new Error("TAURI_SIGNING_PRIVATE_KEY is required before bundling");
  if (!release) return;
  const required = platform === "darwin"
    ? ["APPLE_CERTIFICATE", "APPLE_CERTIFICATE_PASSWORD", "APPLE_ID", "APPLE_PASSWORD", "APPLE_TEAM_ID"]
    : platform === "windows" ? ["WINDOWS_CERTIFICATE", "WINDOWS_CERTIFICATE_PASSWORD"] : [];
  for (const name of required) if (!env[name]?.trim()) throw new Error(`${name} is required for a signed release`);
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
    if (!/^(darwin|linux|windows)-(aarch64|x86_64)$/.test(key) || !isRecord(entry)
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
    const triple = platform === "darwin-aarch64" ? "aarch64-apple-darwin"
      : platform === "darwin-x86_64" ? "x86_64-apple-darwin"
      : platform === "windows-x86_64" ? "x86_64-pc-windows-msvc"
      : platform === "linux-x86_64" ? "x86_64-unknown-linux-gnu" : null;
    const suffix = platform.startsWith("darwin-") ? ".app.tar.gz" : platform.startsWith("windows-") ? ".exe" : ".AppImage";
    if (!triple || !name.startsWith(`${triple}--`) || !name.endsWith(suffix) || !names.includes(name) || !names.includes(`${name}.sig`)) {
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
