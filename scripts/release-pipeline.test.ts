import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { platformReleaseTag, previousReleaseTag, RELEASE_PLATFORM_SLUGS, RELEASE_PLATFORM_TRIPLES } from "./release-helpers.ts";
import { buildManifest, mergeManifests } from "./updater-manifest.ts";
import { stageIndexRelease, stagePlatformRelease } from "./stage-release.ts";

const TAG = "v6.0.0";
const DOWNLOAD = "https://github.com/example/app/releases/download";
const SUFFIX: Record<string, string> = { darwin: ".app.tar.gz", windows: ".exe", linux: ".AppImage" };

test("every platform gets its own verified release and the index only carries the merged manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "cadcam-release-"));
  try {
    const manifests = join(root, "manifests");
    const staged: Record<string, string> = {};
    for (const [key, triple] of Object.entries(RELEASE_PLATFORM_TRIPLES)) {
      const dir = join(root, "installers", `installers-${triple}`);
      const manifestDir = join(manifests, triple);
      await mkdir(dir, { recursive: true });
      await mkdir(manifestDir, { recursive: true });
      const name = `${triple}--App 6.0.0${SUFFIX[key.split("-")[0] ?? ""]}`;
      const checksums: string[] = [];
      for (const [file, content] of [[name, `installer:${triple}`], [`${name}.sig`, `signature:${triple}\n`]] as const) {
        await writeFile(join(dir, file), content);
        checksums.push(`${createHash("sha256").update(content).digest("hex")}  ${file}`);
      }
      await writeFile(join(dir, "SHA256SUMS"), `${checksums.join("\n")}\n`);
      await writeFile(join(dir, "RELEASE_NOTES.md"), "Release notes\n");
      const releaseUrl = `${DOWNLOAD}/${platformReleaseTag(TAG, triple)}`;
      const manifest = await buildManifest(dir, triple, "6.0.0", releaseUrl, "2026-10-05T12:00:00Z");
      expect(Object.values(manifest.platforms)[0]?.url).toStartWith(`${releaseUrl}/`);
      const manifestPath = join(manifestDir, "latest.json");
      await writeFile(manifestPath, JSON.stringify(manifest));

      const out = join(root, "dist", RELEASE_PLATFORM_SLUGS[triple] ?? "");
      await stagePlatformRelease(dir, manifestPath, out, releaseUrl);
      expect((await readdir(out)).sort()).toEqual(["RELEASE_NOTES.md", "SHA256SUMS", name, `${name}.sig`].sort());
      staged[triple] = dir;
    }

    const merged = await mergeManifests(manifests, "6.0.0", Object.keys(RELEASE_PLATFORM_TRIPLES));
    const mergedPath = join(root, "latest.json");
    await writeFile(mergedPath, JSON.stringify(merged));
    const index = join(root, "index");
    await stageIndexRelease(mergedPath, index, DOWNLOAD, TAG);
    expect((await readdir(index)).sort()).toEqual(["RELEASE_NOTES.md", "latest.json"]);
    expect(JSON.parse(await readFile(join(index, "latest.json"), "utf8"))).toEqual(merged);
    const notes = await readFile(join(index, "RELEASE_NOTES.md"), "utf8");
    for (const slug of Object.values(RELEASE_PLATFORM_SLUGS)) expect(notes).toContain(`v6.0.0-${slug}`);
    await expect(stageIndexRelease(mergedPath, index, DOWNLOAD, TAG)).rejects.toThrow("empty");

    // A manifest URL that points into the wrong platform release (or the old unified one) is refused before publishing.
    const first = merged.platforms["darwin-aarch64"];
    if (!first) throw new Error("Missing fixture platform");
    const wrong = { ...merged, platforms: { ...merged.platforms, "darwin-aarch64": { ...first, url: first.url.replace("macos-arm64", "linux-x64") } } };
    await writeFile(mergedPath, JSON.stringify(wrong));
    await expect(stageIndexRelease(mergedPath, join(root, "wrong-url"), DOWNLOAD, TAG)).rejects.toThrow("Wrong release URL");

    // A tampered signature or installer never reaches a platform release.
    const triple = "x86_64-pc-windows-msvc";
    const dir = staged[triple] ?? "";
    const releaseUrl = `${DOWNLOAD}/${platformReleaseTag(TAG, triple)}`;
    const manifestPath = join(manifests, triple, "latest.json");
    const own = JSON.parse(await readFile(manifestPath, "utf8"));
    await writeFile(manifestPath, JSON.stringify({ ...own, platforms: { "windows-x86_64": { ...own.platforms["windows-x86_64"], signature: "wrong" } } }));
    await expect(stagePlatformRelease(dir, manifestPath, join(root, "bad-signature"), releaseUrl)).rejects.toThrow("signature mismatch");
    await writeFile(manifestPath, JSON.stringify(own));
    await writeFile(join(dir, `${triple}--App 6.0.0.exe`), "tampered");
    await expect(stagePlatformRelease(dir, manifestPath, join(root, "bad"), releaseUrl)).rejects.toThrow("Checksum mismatch");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("platform release tags are never taken for the previous version tag", () => {
  expect(platformReleaseTag(TAG, "aarch64-apple-darwin")).toBe("v6.0.0-macos-arm64");
  expect(previousReleaseTag(["v6.0.1-linux-x64", "v6.0.1", "v6.0.0-windows-arm64", "v6.0.0"], "v6.0.2")).toBe("v6.0.1");
  expect(previousReleaseTag(["v6.0.1-linux-x64", "v6.0.0-rc.1"], "v6.0.2")).toBe("v6.0.0-rc.1");
});
