/**
 * macOS disk images for the release.
 *
 * Tauri's `bundle_dmg.sh` attaches the image and lays the window out through
 * Finder. On the GitHub `macos-15-intel` runner that script exits while
 * `diskimages-help` is still running (runs 42439299315 and 42561044422), after
 * the `.app` itself has already been signed. The image is built here with
 * `hdiutil` and is never attached, so Finder is not involved.
 */
import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

const ARCH_SUFFIX = { aarch64: "aarch64", x86_64: "x64" } as const;

export function configuredBundleTargets(config: unknown): string[] {
  if (typeof config !== "object" || config === null) return [];
  const targets = (config as { bundle?: { targets?: unknown } }).bundle?.targets;
  return Array.isArray(targets) ? targets.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Tauri must not receive `dmg`. An explicit list keeps every other requested
 * bundle; the default config list keeps only `app`, because the other configured
 * targets belong to Windows and Linux.
 */
export function darwinBundleArgument(
  explicit: string | undefined,
  configured: readonly string[],
): { argument: string | undefined; packageDmg: boolean } {
  const requested = explicit === undefined
    ? [...configured]
    : explicit.split(",").map((part) => part.trim()).filter((part) => part !== "");
  if (!requested.includes("dmg")) return { argument: explicit, packageDmg: false };
  const kept = requested.filter((part) => part !== "dmg" && (explicit !== undefined || part === "app"));
  if (!kept.includes("app")) kept.push("app");
  return { argument: kept.join(","), packageDmg: true };
}

export function darwinDmgLayout(options: {
  productName: string;
  version: string;
  arch: keyof typeof ARCH_SUFFIX;
  bundleDir: string;
}): { dmgPath: string; stageDir: string; volumeName: string } {
  return {
    dmgPath: join(options.bundleDir, "dmg", `${options.productName}_${options.version}_${ARCH_SUFFIX[options.arch]}.dmg`),
    stageDir: join(options.bundleDir, "dmg", ".stage"),
    volumeName: options.productName,
  };
}

/** Create `dmgPath` from a staging directory that already holds the `.app`. */
export async function createDarwinDiskImage(options: {
  dmgPath: string;
  stageDir: string;
  volumeName: string;
  scratchPath: string;
  run: (command: readonly string[]) => Promise<void>;
  detachVolumes: () => Promise<void>;
  attempts?: number;
  wait?: (milliseconds: number) => Promise<void>;
}): Promise<void> {
  const attempts = options.attempts ?? 3;
  const wait = options.wait ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  await mkdir(dirname(options.dmgPath), { recursive: true });
  let failure: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await rm(options.scratchPath, { force: true });
    await rm(options.dmgPath, { force: true });
    await rm(`${options.dmgPath}.dmg`, { force: true });
    try {
      // A volume left mounted by a previous attempt makes hdiutil report "Resource busy".
      await options.detachVolumes();
      // UDRW from a folder copies the files. It does not attach the image, which
      // is the step that leaves diskimages-help running inside bundle_dmg.sh.
      await options.run([
        "hdiutil", "create",
        "-volname", options.volumeName,
        "-srcfolder", options.stageDir,
        "-ov",
        "-fs", "HFS+",
        "-format", "UDRW",
        options.scratchPath,
      ]);
      await options.run([
        "hdiutil", "convert",
        options.scratchPath,
        "-format", "UDZO",
        "-ov",
        "-o", options.dmgPath,
      ]);
      // Some hdiutil versions append a second `.dmg` when `-o` already has one.
      if (!existsSync(options.dmgPath) && existsSync(`${options.dmgPath}.dmg`)) {
        await rename(`${options.dmgPath}.dmg`, options.dmgPath);
      }
      if (!existsSync(options.dmgPath)) throw new Error(`hdiutil produced no disk image at ${options.dmgPath}`);
      return;
    } catch (error) {
      failure = error;
    } finally {
      await rm(options.scratchPath, { force: true });
    }
    if (attempt < attempts) await wait(3_000);
  }
  throw failure instanceof Error ? failure : new Error("hdiutil failed to create the disk image");
}
