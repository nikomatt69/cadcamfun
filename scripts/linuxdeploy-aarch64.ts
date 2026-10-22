import { chmod, copyFile, mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const wrapper = join(import.meta.dir, "linuxdeploy-aarch64-ldd.sh")

/** Tauri builds an AppImage unless the bundle list says otherwise. */
export function includesAppImage(bundles: string | undefined): boolean {
  if (bundles === undefined) return true
  return bundles.split(",").some((name) => name.trim() === "appimage")
}

/**
 * Environment for the aarch64 AppImage bundle.
 *
 * `ldd` is wrapped so a resolved trace with a non-zero status does not abort
 * linuxdeploy. `NO_STRIP` skips the bundled `strip`, which fails the whole
 * bundle when a single library disagrees with it.
 */
export async function aarch64LinuxdeployEnv(basePath: string | undefined): Promise<{ PATH: string; NO_STRIP: string }> {
  const dir = await mkdtemp(join(tmpdir(), "cadcam-linuxdeploy-ldd-"))
  const installed = join(dir, "ldd")
  await copyFile(wrapper, installed)
  await chmod(installed, 0o755)
  const path = basePath !== undefined && basePath !== "" ? `${dir}:${basePath}` : dir
  return { PATH: path, NO_STRIP: "1" }
}
