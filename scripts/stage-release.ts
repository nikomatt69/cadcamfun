#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { assertManifestAssets, mergeManifestValues, parseChecksums, platformReleaseTag, RELEASE_PLATFORM_KEYS, RELEASE_PLATFORM_SLUGS, RELEASE_PLATFORM_TRIPLES, validateManifest } from "./release-helpers.ts";

function assetName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.split("/").at(-1) ?? "");
}

async function emptyDirectory(out: string): Promise<void> {
  await mkdir(out, { recursive: true });
  if ((await readdir(out)).length !== 0) throw new Error("Release staging directory must be empty");
}

/**
 * One platform's release: its installers and signatures, checked against the SHA256SUMS the build wrote and against the
 * platform's own updater manifest. `installers` is the artifact directory of a single target.
 */
export async function stagePlatformRelease(installers: string, manifestPath: string, out: string, releaseUrl: string): Promise<void> {
  const manifest = validateManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  const entries = parseChecksums(await readFile(join(installers, "SHA256SUMS"), "utf8"));
  const actual = (await readdir(installers)).sort();
  const expected = [...entries.map((entry) => entry.name), "SHA256SUMS", "RELEASE_NOTES.md"].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Unindexed release files");
  const notes = await readFile(join(installers, "RELEASE_NOTES.md"), "utf8");
  if (notes !== manifest.notes) throw new Error("Manifest and release notes disagree");
  const assets = new Map<string, { path: string; digest: string }>();
  for (const entry of entries) {
    const path = join(installers, entry.name);
    const digest = createHash("sha256").update(await readFile(path)).digest("hex");
    if (digest !== entry.digest) throw new Error(`Checksum mismatch: ${entry.name}`);
    assets.set(entry.name, { path, digest });
  }
  assertManifestAssets(manifest, [...assets.keys()], releaseUrl);
  for (const entry of Object.values(manifest.platforms)) {
    const name = assetName(entry.url);
    const signature = assets.get(`${name}.sig`);
    if (!signature || (await readFile(signature.path, "utf8")).trim() !== entry.signature) throw new Error(`Manifest signature mismatch: ${name}`);
  }
  await emptyDirectory(out);
  const checksums: string[] = [];
  for (const [name, asset] of [...assets].sort(([a], [b]) => a.localeCompare(b))) {
    await cp(asset.path, join(out, name));
    checksums.push(`${asset.digest}  ${name}`);
  }
  await writeFile(join(out, "SHA256SUMS"), `${checksums.join("\n")}\n`);
  await writeFile(join(out, "RELEASE_NOTES.md"), notes);
}

/**
 * The index release (`v6.0.0`): only the merged `latest.json` the in-app updater reads, plus notes that link the six platform
 * releases. Every manifest URL must point into that platform's own release, so the updater never resolves to a missing asset.
 */
export async function stageIndexRelease(manifestPath: string, out: string, downloadUrl: string, tag: string): Promise<void> {
  const validated = validateManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  const manifest = mergeManifestValues([validated], validated.version, RELEASE_PLATFORM_KEYS);
  const base = downloadUrl.replace(/\/$/, "");
  const rows: string[] = [];
  for (const [key, triple] of Object.entries(RELEASE_PLATFORM_TRIPLES)) {
    const entry = manifest.platforms[key];
    if (!entry) throw new Error(`Missing updater platform: ${key}`);
    const platformTag = platformReleaseTag(tag, triple);
    const name = assetName(entry.url);
    assertManifestAssets({ ...manifest, platforms: { [key]: entry } }, [name, `${name}.sig`], `${base}/${platformTag}`);
    rows.push(`| ${RELEASE_PLATFORM_SLUGS[triple]} | [${platformTag}](${base.replace(/\/download$/, "")}/tag/${platformTag}) |`);
  }
  await emptyDirectory(out);
  const notes = `${manifest.notes ?? ""}\n\n## Downloads\n\nEach platform has its own release.\n\n| Platform | Release |\n| --- | --- |\n${rows.join("\n")}\n`;
  await writeFile(join(out, "RELEASE_NOTES.md"), notes);
  await writeFile(join(out, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

if (import.meta.main) {
  try {
    const options = new Map<string, string>();
    for (const arg of process.argv.slice(2)) {
      const match = /^--(mode|installers|manifest|out|release-url|download-url|tag)=(.+)$/.exec(arg);
      if (!match?.[1] || !match[2]) throw new Error(`Invalid argument: ${arg}`);
      options.set(match[1], match[2]);
    }
    const required = (name: string): string => {
      const value = options.get(name);
      if (!value) throw new Error(`--${name} is required`);
      return value;
    };
    const mode = required("mode");
    if (mode === "platform") await stagePlatformRelease(resolve(required("installers")), resolve(required("manifest")), resolve(required("out")), required("release-url"));
    else if (mode === "index") await stageIndexRelease(resolve(required("manifest")), resolve(required("out")), required("download-url"), required("tag"));
    else throw new Error("--mode must be platform or index");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
