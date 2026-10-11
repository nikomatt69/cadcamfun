#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { assertManifestAssets, mergeManifestValues, parseChecksums, RELEASE_PLATFORM_KEYS, validateManifest } from "./release-helpers.ts";

export async function stageRelease(installers: string, manifestPath: string, out: string, releaseUrl: string): Promise<void> {
  const raw: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
  const validated = validateManifest(raw);
  const manifest = mergeManifestValues([validated], validated.version, RELEASE_PLATFORM_KEYS);
  const assets = new Map<string, { path: string; digest: string }>();
  let notes: string | undefined;
  const directories = await readdir(installers, { withFileTypes: true });
  if (directories.length !== RELEASE_PLATFORM_KEYS.length || directories.some((entry) => !entry.isDirectory())) {
    throw new Error(`Expected ${RELEASE_PLATFORM_KEYS.length} installer artifact directories`);
  }
  for (const directory of directories.sort((a, b) => a.name.localeCompare(b.name))) {
    const root = join(installers, directory.name);
    const entries = parseChecksums(await readFile(join(root, "SHA256SUMS"), "utf8"));
    const actual = (await readdir(root)).sort();
    const expected = [...entries.map((entry) => entry.name), "SHA256SUMS", "RELEASE_NOTES.md"].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Unindexed release files in ${directory.name}`);
    const currentNotes = await readFile(join(root, "RELEASE_NOTES.md"), "utf8");
    if (notes !== undefined && notes !== currentNotes) throw new Error("Release notes disagree across targets");
    notes = currentNotes;
    for (const entry of entries) {
      if (assets.has(entry.name)) throw new Error(`Duplicate release asset: ${entry.name}`);
      const path = join(root, entry.name);
      const digest = createHash("sha256").update(await readFile(path)).digest("hex");
      if (digest !== entry.digest) throw new Error(`Checksum mismatch: ${entry.name}`);
      assets.set(entry.name, { path, digest });
    }
  }
  if (notes !== manifest.notes) throw new Error("Manifest and release notes disagree");
  assertManifestAssets(manifest, [...assets.keys()], releaseUrl);
  for (const entry of Object.values(manifest.platforms)) {
    const name = decodeURIComponent(new URL(entry.url).pathname.split("/").at(-1) ?? "");
    const signature = assets.get(`${name}.sig`);
    if (!signature || (await readFile(signature.path, "utf8")).trim() !== entry.signature) throw new Error(`Manifest signature mismatch: ${name}`);
  }
  await mkdir(out, { recursive: true });
  if ((await readdir(out)).length !== 0) throw new Error("Release staging directory must be empty");
  const checksums: string[] = [];
  for (const [name, asset] of [...assets].sort(([a], [b]) => a.localeCompare(b))) {
    await cp(asset.path, join(out, name));
    checksums.push(`${asset.digest}  ${name}`);
  }
  await writeFile(join(out, "SHA256SUMS"), `${checksums.join("\n")}\n`);
  await writeFile(join(out, "RELEASE_NOTES.md"), notes ?? "");
  await writeFile(join(out, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

if (import.meta.main) {
  try {
    const options = new Map<string, string>();
    for (const arg of process.argv.slice(2)) {
      const match = /^--(installers|manifest|out|release-url)=(.+)$/.exec(arg);
      if (!match?.[1] || !match[2]) throw new Error(`Invalid argument: ${arg}`);
      options.set(match[1], match[2]);
    }
    const required = (name: string): string => {
      const value = options.get(name);
      if (!value) throw new Error(`--${name} is required`);
      return value;
    };
    await stageRelease(resolve(required("installers")), resolve(required("manifest")), resolve(required("out")), required("release-url"));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
