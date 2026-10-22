import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";import {
  assertVersionsAgree,
  bumpVersion,
  compareVersions,
  discoverVersionHolders,
  parseVersion,
  readWorkspaceVersions,
  resolveReleaseVersion,
  stampVersions,
} from "./release-version.ts";

test("a version is parsed, compared and bumped", () => {
  expect(parseVersion("v6.0.1").raw).toBe("6.0.1");
  expect(parseVersion("6.1.0-rc.1").prerelease).toBe("rc.1");
  expect(() => parseVersion("6.0")).toThrow("Invalid version");
  expect(() => parseVersion("6.0.1.2")).toThrow("Invalid version");
  expect(() => parseVersion("06.0.1")).toThrow("Invalid version");

  expect(compareVersions("6.0.1", "6.0.0")).toBeGreaterThan(0);
  expect(compareVersions("6.0.0", "6.1.0")).toBeLessThan(0);
  expect(compareVersions("6.0.0", "6.0.0")).toBe(0);
  // A prerelease is older than the release it leads to.
  expect(compareVersions("6.0.0-rc.1", "6.0.0")).toBeLessThan(0);
  expect(compareVersions("6.0.0-rc.2", "6.0.0-rc.10")).toBeLessThan(0);

  expect(bumpVersion("6.0.0", "patch")).toBe("6.0.1");
  expect(bumpVersion("6.0.0", "minor")).toBe("6.1.0");
  expect(bumpVersion("6.0.0", "major")).toBe("7.0.0");
});

test("the release version comes from the bump, or from an explicit version", () => {
  expect(resolveReleaseVersion({ bump: "patch", current: "6.0.0", latestTag: "v5.9.0" })).toBe("6.0.1");
  expect(resolveReleaseVersion({ bump: "minor", current: "6.0.0", latestTag: null })).toBe("6.1.0");
  expect(resolveReleaseVersion({ bump: "major", current: "6.0.0", latestTag: null })).toBe("7.0.0");
  expect(resolveReleaseVersion({ override: "6.2.0", current: "6.0.0", latestTag: "v6.1.0" })).toBe("6.2.0");
  // An explicit version wins over the bump.
  expect(resolveReleaseVersion({ bump: "patch", override: "6.2.0", current: "6.0.0" })).toBe("6.2.0");
  // A release never reuses a version that was already published.
  expect(() => resolveReleaseVersion({ bump: "patch", current: "6.0.0", latestTag: "v6.0.1" })).toThrow("not newer");
  expect(() => resolveReleaseVersion({ override: "6.0.0", current: "6.0.0", latestTag: "v6.0.0" })).toThrow("not newer");
  // Without a bump and without a version there is nothing to release.
  expect(() => resolveReleaseVersion({ current: "6.0.0" })).toThrow("needs a bump");
  expect(() => resolveReleaseVersion({ bump: "nonsense", current: "6.0.0" })).toThrow("needs a bump");
});

/** A checkout with the version holders a release touches. */
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "cadcam-version-"));
  await mkdir(join(root, "packages", "plugin"), { recursive: true });
  await mkdir(join(root, "apps", "desktop", "src-tauri"), { recursive: true });
  await mkdir(join(root, "apps", "mobile"), { recursive: true });
  await writeFile(join(root, "package.json"), `${JSON.stringify({ name: "cadcamfun", version: "6.0.0" }, null, 2)}\n`);
  await writeFile(join(root, "packages", "plugin", "package.json"), `${JSON.stringify({ name: "@nikoemme_/plugin", version: "0.1.0" }, null, 2)}\n`);
  await writeFile(join(root, "apps", "desktop", "src-tauri", "tauri.conf.json"), `${JSON.stringify({ productName: "CADCAM FUN", version: "6.0.0" }, null, 2)}\n`);
  await writeFile(join(root, "apps", "desktop", "src-tauri", "Cargo.toml"), '[package]\nname = "cadcamfun-desktop"\nversion = "6.0.0"\nedition = "2021"\n');
  await writeFile(join(root, "apps", "mobile", "app.json"), `${JSON.stringify({ expo: { name: "CADCAMFUN", version: "6.0.0" } }, null, 2)}\n`);
  return root;
}

test("every version holder of the workspace is found and stamped", async () => {
  const root = await fixture();
  try {
    const holders = await discoverVersionHolders(root);
    expect(holders.map((holder) => holder.path).sort()).toEqual([
      "apps/desktop/src-tauri/Cargo.toml",
      "apps/desktop/src-tauri/tauri.conf.json",
      "apps/mobile/app.json",
      "package.json",
      "packages/plugin/package.json",
    ]);

    const versions = await readWorkspaceVersions(root);
    expect(versions["apps/desktop/src-tauri/tauri.conf.json"]).toBe("6.0.0");
    expect(versions["packages/plugin/package.json"]).toBe("0.1.0");
    // The plugin carries its own version, so the holders do not agree yet.
    expect(() => assertVersionsAgree(versions)).toThrow("Version mismatch");

    const changed = await stampVersions(root, "6.0.1");
    expect(changed.sort()).toEqual([
      "apps/desktop/src-tauri/Cargo.toml",
      "apps/desktop/src-tauri/tauri.conf.json",
      "apps/mobile/app.json",
      "package.json",
      "packages/plugin/package.json",
    ]);

    const stamped = await readWorkspaceVersions(root);
    assertVersionsAgree(stamped);
    expect(stamped["packages/plugin/package.json"]).toBe("6.0.1");
    expect(stamped["apps/desktop/src-tauri/tauri.conf.json"]).toBe("6.0.1");
    expect(stamped["apps/mobile/app.json"]).toBe("6.0.1");
    expect(await readFile(join(root, "apps", "desktop", "src-tauri", "Cargo.toml"), "utf8")).toContain('version = "6.0.1"');
    // The rest of the file survives the rewrite.
    expect(await readFile(join(root, "apps", "desktop", "src-tauri", "Cargo.toml"), "utf8")).toContain('name = "cadcamfun-desktop"');

    // Stamping the same version again changes nothing.
    expect(await stampVersions(root, "6.0.1")).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a package without a version is left alone", async () => {
  const root = await fixture();
  try {
    await mkdir(join(root, "packages", "core"), { recursive: true });
    await writeFile(join(root, "packages", "core", "package.json"), `${JSON.stringify({ name: "@cadcamfun/core", private: true }, null, 2)}\n`);
    const holders = await discoverVersionHolders(root);
    expect(holders.map((holder) => holder.path)).not.toContain("packages/core/package.json");
    await stampVersions(root, "6.0.1");
    const content = await readFile(join(root, "packages", "core", "package.json"), "utf8");
    expect(content).not.toContain("version");
    expect(JSON.parse(content).name).toBe("@cadcamfun/core");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the workspace of this repository carries one version", async () => {
  const root = new URL("..", import.meta.url).pathname;
  const versions = await readWorkspaceVersions(root);
  expect(versions["apps/desktop/src-tauri/tauri.conf.json"]).toBeDefined();
  expect(versions["package.json"]).toBe(versions["apps/desktop/src-tauri/tauri.conf.json"]);
  expect(versions["apps/mobile/app.json"]).toBe(versions["apps/desktop/src-tauri/tauri.conf.json"]);
  expect(versions["apps/desktop/src-tauri/Cargo.toml"]).toBe(versions["apps/desktop/src-tauri/tauri.conf.json"]);
});

test("a holder without a version is an error, not a silent skip", async () => {
  const root = await fixture();
  try {
    await writeFile(join(root, "apps", "desktop", "src-tauri", "tauri.conf.json"), `${JSON.stringify({ productName: "CADCAM FUN" }, null, 2)}\n`);
    await expect(readWorkspaceVersions(root)).rejects.toThrow("has no version");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
