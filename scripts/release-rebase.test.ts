import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureCommand } from "./release-helpers.ts";
import { resolveReleaseConflicts } from "./release-publish.ts";
import { assertVersionsAgree, readWorkspaceVersions, stampVersions } from "./release-version.ts";

const SECTION = "## v6.0.2 — October 2026\n\n- Queued changes.\n";

async function git(root: string, ...args: string[]) {
  const result = await captureCommand(["git", ...args], { cwd: root });
  if (result.code !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

test.each(["owned metadata", "unrelated source"])("a queued release resolves every stamped holder, refusing conflicts in %s", async (scenario) => {
  const unrelated = scenario === "unrelated source";
  const root = await mkdtemp(join(tmpdir(), "cadcam-release-rebase-"));
  try {
    await mkdir(join(root, "apps/desktop/src-tauri"), { recursive: true });
    await mkdir(join(root, "packages/companion"), { recursive: true });
    await writeFile(join(root, "package.json"), '{"name":"fixture","version":"6.0.0","workspaces":["packages/*"],"dependencies":{"@fixture/companion":"workspace:*"}}\n');
    await writeFile(join(root, "packages/companion/package.json"), '{"name":"@fixture/companion","version":"6.0.0","private":true}\n');
    await writeFile(join(root, "apps/desktop/src-tauri/tauri.conf.json"), '{"version":"6.0.0"}\n');
    await writeFile(join(root, "apps/desktop/src-tauri/Cargo.toml"), '[package]\nname = "cadcamfun-desktop"\nversion = "6.0.0"\n');
    await writeFile(join(root, "apps/desktop/src-tauri/Cargo.lock"), 'version = 4\n\n[[package]]\nname = "cadcamfun-desktop"\nversion = "6.0.0"\n\n[[package]]\nname = "dependency"\nversion = "1.2.3"\n');
    await writeFile(join(root, "CHANGELOG.md"), "# Changelog\n\n## v6.0.0 — October 2026\n\n- Initial release.\n");
    await writeFile(join(root, "domain.ts"), "export const value = 0;\n");
    const refreshLockfile = async () => {
      const result = await captureCommand([process.execPath, "--no-env-file", "install", "--lockfile-only"], { cwd: root });
      if (result.code !== 0) throw new Error(result.stderr);
    };
    await refreshLockfile();
    await git(root, "init", "--initial-branch=main");
    await git(root, "config", "user.name", "Release test");
    await git(root, "config", "user.email", "release@example.invalid");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "initial");
    await git(root, "checkout", "-b", "queued-release");
    const releaseFiles = [...await stampVersions(root, "6.0.2"), "CHANGELOG.md", "bun.lock"];
    await refreshLockfile();
    await writeFile(join(root, "CHANGELOG.md"), `# Changelog\n\n${SECTION}\n## v6.0.0 — October 2026\n\n- Initial release.\n`);
    if (unrelated) await writeFile(join(root, "domain.ts"), "export const value = 2;\n");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "release: v6.0.2");
    await git(root, "checkout", "main");
    await stampVersions(root, "6.0.1");
    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    manifest.description = "Remote configuration is preserved";
    await writeFile(join(root, "package.json"), `${JSON.stringify(manifest)}\n`);
    const remoteLock = join(root, "apps/desktop/src-tauri/Cargo.lock");
    await writeFile(remoteLock, (await readFile(remoteLock, "utf8")).replace('name = "dependency"\nversion = "1.2.3"', 'name = "dependency"\nversion = "2.0.0"'));
    await refreshLockfile();
    await writeFile(join(root, "CHANGELOG.md"), "# Changelog\n\n## v6.0.1 — October 2026\n\n- Previous release.\n\n## v6.0.0 — October 2026\n\n- Initial release.\n");
    await writeFile(join(root, "remote-only.ts"), "export const preserved = true;\n");
    if (unrelated) await writeFile(join(root, "domain.ts"), "export const value = 1;\n");
    await git(root, "add", ".");
    await git(root, "commit", "-m", "release: v6.0.1");
    await git(root, "checkout", "queued-release");
    expect((await captureCommand(["git", "rebase", "main"], { cwd: root })).code).not.toBe(0);
    expect(await git(root, "diff", "--name-only", "--diff-filter=U")).toContain("Cargo.lock");
    expect(await resolveReleaseConflicts(SECTION, releaseFiles, "6.0.2", root)).toBe(!unrelated);
    if (unrelated) {
      expect(await git(root, "diff", "--name-only", "--diff-filter=U")).toContain("domain.ts");
      return;
    }
    const versions = await readWorkspaceVersions(root);
    assertVersionsAgree(versions);
    expect(Object.values(versions).every((version) => version === "6.0.2")).toBe(true);
    expect(await readFile(join(root, "apps/desktop/src-tauri/Cargo.lock"), "utf8")).toContain('name = "dependency"\nversion = "2.0.0"');
    expect(JSON.parse(await readFile(join(root, "package.json"), "utf8")).description).toBe("Remote configuration is preserved");
    const lockfile = await readFile(join(root, "bun.lock"), "utf8");
    // Bun records the companion workspace version; the root version is in package.json.
    expect(lockfile).toContain('"version": "6.0.2"');
    expect(lockfile).not.toContain('"version": "6.0.1"');
    const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");
    expect(changelog).toContain("v6.0.2");
    expect(changelog).toContain("v6.0.1");
    expect(changelog).toContain("v6.0.0");
    expect(await readFile(join(root, "remote-only.ts"), "utf8")).toContain("preserved = true");
    expect(await git(root, "status", "--porcelain")).toBe("");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
