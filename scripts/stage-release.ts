#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { assertManifestAssets, mergeManifestValues, parseChecksums, RELEASE_PLATFORM_TRIPLES, releaseVersion, UPDATER_PLATFORM_KEYS, validateManifest } from "./release-helpers.ts";

function assetName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.split("/").at(-1) ?? "");
}

async function emptyDirectory(out: string): Promise<void> {
  await mkdir(out, { recursive: true });
  if ((await readdir(out)).length !== 0) throw new Error("Release staging directory must be empty");
}

async function indexedInstallers(installers: string): Promise<{ notes: string; assets: Map<string, { path: string; digest: string }> }> {
  const entries = parseChecksums(await readFile(join(installers, "SHA256SUMS"), "utf8"));
  const actual = (await readdir(installers)).sort();
  const expected = [...entries.map((entry) => entry.name), "SHA256SUMS", "RELEASE_NOTES.md"].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Unindexed release files");
  const notes = await readFile(join(installers, "RELEASE_NOTES.md"), "utf8");
  const assets = new Map<string, { path: string; digest: string }>();
  for (const entry of entries) {
    const path = join(installers, entry.name);
    const digest = createHash("sha256").update(await readFile(path)).digest("hex");
    if (digest !== entry.digest) throw new Error(`Checksum mismatch: ${entry.name}`);
    assets.set(entry.name, { path, digest });
  }
  return { notes, assets };
}

async function writeStaged(out: string, notes: string, assets: Map<string, { path: string; digest: string }>): Promise<void> {
  await emptyDirectory(out);
  const checksums: string[] = [];
  for (const [name, asset] of [...assets].sort(([a], [b]) => a.localeCompare(b))) {
    await cp(asset.path, join(out, name));
    checksums.push(`${asset.digest}  ${name}`);
  }
  await writeFile(join(out, "SHA256SUMS"), `${checksums.join("\n")}\n`);
  await writeFile(join(out, "RELEASE_NOTES.md"), notes);
}

/** Verify all six build artifacts and stage one release with a combined checksum index. */
export async function stageRelease(installers: string, manifestPath: string, out: string, downloadUrl: string, tag: string): Promise<void> {
  const validated = validateManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  const manifest = mergeManifestValues([validated], releaseVersion(tag), UPDATER_PLATFORM_KEYS);
  const triples = Object.values(RELEASE_PLATFORM_TRIPLES);
  const expected = triples.map((triple) => `installers-${triple}`).sort();
  if (JSON.stringify((await readdir(installers)).sort()) !== JSON.stringify(expected)) {
    throw new Error("Incomplete or unexpected release target set");
  }
  const assets = new Map<string, { path: string; digest: string }>();
  for (const triple of triples) {
    const platform = await indexedInstallers(join(installers, `installers-${triple}`));
    if (platform.notes !== manifest.notes) throw new Error(`Manifest and release notes disagree: ${triple}`);
    const suffixes = triple.includes("darwin") ? [".app.tar.gz", ".dmg"]
      : triple.includes("windows") ? [".exe", ".msi"] : [".deb", ".rpm"];
    for (const suffix of suffixes) {
      if (![...platform.assets.keys()].some((name) => name.endsWith(suffix))) {
        throw new Error(`Missing ${suffix} installer: ${triple}`);
      }
    }
    for (const [name, asset] of platform.assets) {
      if (!name.startsWith(`${triple}--`) || !suffixes.some((suffix) => name.endsWith(suffix) || name.endsWith(`${suffix}.sig`))) {
        throw new Error(`Unexpected release asset for ${triple}: ${name}`);
      }
      if (name.endsWith(".sig") && !platform.assets.has(name.slice(0, -4))) throw new Error(`Orphan signature: ${name}`);
      if (assets.has(name)) throw new Error(`Duplicate release asset: ${name}`);
      assets.set(name, asset);
    }
  }
  assertManifestAssets(manifest, [...assets.keys()], `${downloadUrl.replace(/\/$/, "")}/${tag}`);
  for (const entry of Object.values(manifest.platforms)) {
    const name = assetName(entry.url);
    const signature = assets.get(`${name}.sig`);
    if (!signature || (await readFile(signature.path, "utf8")).trim() !== entry.signature) throw new Error(`Manifest signature mismatch: ${name}`);
  }
  await writeStaged(out, manifest.notes ?? "", assets);
  await writeFile(join(out, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

if (import.meta.main) {
  try {
    const options = new Map<string, string>();
    for (const arg of process.argv.slice(2)) {
      const match = /^--(installers|manifest|out|download-url|tag)=(.+)$/.exec(arg);
      if (!match?.[1] || !match[2]) throw new Error(`Invalid argument: ${arg}`);
      options.set(match[1], match[2]);
    }
    const required = (name: string): string => {
      const value = options.get(name);
      if (!value) throw new Error(`--${name} is required`);
      return value;
    };
    await stageRelease(resolve(required("installers")), resolve(required("manifest")), resolve(required("out")), required("download-url"), required("tag"));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
