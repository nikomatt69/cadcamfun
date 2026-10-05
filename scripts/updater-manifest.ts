#!/usr/bin/env bun
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { mergeManifestValues, releaseVersion, targetInfo, validateManifest, type Manifest } from "./release-helpers.ts";

export async function buildManifest(dir: string, triple: string, version: string, releaseUrl: string, pubDate: string): Promise<Manifest> {
  const { platform, arch } = targetInfo(triple);
  const suffix = platform === "darwin" ? ".app.tar.gz" : platform === "linux" ? ".AppImage" : ".exe";
  const files = (await readdir(dir)).sort();
  const candidates = files.filter((name) => name.startsWith(`${triple}--`) && name.toLowerCase().endsWith(suffix.toLowerCase()));
  if (candidates.length !== 1) throw new Error(`Expected exactly one ${triple} updater asset, found ${candidates.length}`);
  const name = candidates[0];
  if (name === undefined) throw new Error("Missing updater asset");
  const signature = (await readFile(join(dir, `${name}.sig`), "utf8")).trim();
  const notes = await readFile(join(dir, "RELEASE_NOTES.md"), "utf8");
  return validateManifest({ version: releaseVersion(version), pub_date: pubDate, notes,
    platforms: { [`${platform}-${arch}`]: { signature, url: `${releaseUrl.replace(/\/$/, "")}/${encodeURIComponent(name)}` } } });
}

export async function mergeManifests(dir: string, version: string, expected: readonly string[]): Promise<Manifest> {
  const values: unknown[] = [];
  async function walk(current: string): Promise<void> {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name === "latest.json") values.push(JSON.parse(await readFile(path, "utf8")));
    }
  }
  await walk(dir);
  return mergeManifestValues(values, version, expected);
}

async function main(): Promise<void> {
  const options = new Map<string, string>();
  for (const arg of process.argv.slice(2)) {
    const match = /^--(collect-dir|arch|version|out|merge|release-url|pub-date|expected-platforms)=(.+)$/.exec(arg);
    if (!match?.[1] || !match[2]) throw new Error(`Invalid argument: ${arg}`);
    options.set(match[1], match[2]);
  }
  function required(name: string): string {
    const value = options.get(name);
    if (!value) throw new Error(`--${name} is required`);
    return value;
  }
  const version = required("version");
  const dir = resolve(options.get("collect-dir") ?? "release");
  const manifest = options.has("merge")
    ? await mergeManifests(required("merge"), version, (options.get("expected-platforms") ?? "").split(",").filter(Boolean))
    : await buildManifest(dir, required("arch"), version, required("release-url"), required("pub-date"));
  const out = resolve(options.get("out") ?? join(dir, "latest.json"));
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Wrote ${out}: ${Object.keys(manifest.platforms).join(", ")}\n`);
}

if (import.meta.main) {
  try { await main(); } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
