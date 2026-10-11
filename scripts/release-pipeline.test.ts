import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildManifest, mergeManifests } from "./updater-manifest.ts";
import { stageRelease } from "./stage-release.ts";

test("six targets produce verified flat draft assets and matching manifest URLs", async () => {
  const root = await mkdtemp(join(tmpdir(), "cadcam-release-"));
  try {
    const installers = join(root, "installers");
    const manifests = join(root, "manifests");
    const releaseUrl = "https://github.com/example/app/releases/download/v6.0.0";
    const platforms = ["darwin-aarch64", "darwin-x86_64", "windows-aarch64", "windows-x86_64", "linux-aarch64", "linux-x86_64"];
    const targets = [
      ["aarch64-apple-darwin", ".app.tar.gz"], ["x86_64-apple-darwin", ".app.tar.gz"],
      ["aarch64-pc-windows-msvc", ".exe"], ["x86_64-pc-windows-msvc", ".exe"],
      ["aarch64-unknown-linux-gnu", ".AppImage"], ["x86_64-unknown-linux-gnu", ".AppImage"],
    ];
    for (const [triple, suffix] of targets) {
      if (!triple || !suffix) throw new Error("Missing test target");
      const dir = join(installers, `installers-${triple}`);
      const manifestDir = join(manifests, triple);
      await mkdir(dir, { recursive: true });
      await mkdir(manifestDir, { recursive: true });
      const name = `${triple}--App 6.0.0${suffix}`;
      const checksums: string[] = [];
      for (const [file, content] of [[name, `installer:${triple}`], [`${name}.sig`, `signature:${triple}\n`]]) {
        if (!file || !content) throw new Error("Missing fixture");
        await writeFile(join(dir, file), content);
        checksums.push(`${createHash("sha256").update(content).digest("hex")}  ${file}`);
      }
      await writeFile(join(dir, "SHA256SUMS"), `${checksums.join("\n")}\n`);
      await writeFile(join(dir, "RELEASE_NOTES.md"), "Release notes\n");
      const manifest = await buildManifest(dir, triple, "6.0.0", releaseUrl, "2026-10-05T12:00:00Z");
      expect(Object.values(manifest.platforms)[0]?.url).toContain("App%206.0.0");
      await writeFile(join(manifestDir, "latest.json"), JSON.stringify(manifest));
    }
    const merged = await mergeManifests(manifests, "6.0.0", platforms);
    const manifestPath = join(root, "latest.json");
    await writeFile(manifestPath, JSON.stringify(merged));
    const out = join(root, "out");
    await stageRelease(installers, manifestPath, out, releaseUrl);
    expect((await readdir(out)).length).toBe(15);
    expect((await readFile(join(out, "SHA256SUMS"), "utf8")).trim().split("\n").length).toBe(12);
    expect(JSON.parse(await readFile(join(out, "latest.json"), "utf8"))).toEqual(merged);
    await expect(stageRelease(installers, manifestPath, out, releaseUrl)).rejects.toThrow("empty");
    const first = merged.platforms["darwin-aarch64"];
    if (!first) throw new Error("Missing fixture platform");
    await writeFile(manifestPath, JSON.stringify({ ...merged, platforms: { ...merged.platforms, "darwin-aarch64": { ...first, signature: "wrong" } } }));
    await expect(stageRelease(installers, manifestPath, join(root, "wrong-signature"), releaseUrl)).rejects.toThrow("signature mismatch");
    await writeFile(manifestPath, JSON.stringify(merged));
    const corrupt = join(installers, "installers-x86_64-pc-windows-msvc", "x86_64-pc-windows-msvc--App 6.0.0.exe");
    await writeFile(corrupt, "tampered");
    await expect(stageRelease(installers, manifestPath, join(root, "bad"), releaseUrl)).rejects.toThrow("Checksum mismatch");
  } finally { await rm(root, { recursive: true, force: true }); }
});
