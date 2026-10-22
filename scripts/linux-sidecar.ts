/**
 * Keeps a Bun `--compile` standalone out of linuxdeploy's ELF pass.
 *
 * linuxdeploy runs `ldd` and then patchelf on every ELF in the AppDir's `usr/bin`.
 * On the standalone that `ldd` exits 1 (`Failed to run ldd`) and patchelf can drop
 * the bunfs trailer, so the AppImage build aborts and a "successful" bundle can
 * still ship a dead sidecar. `usr/share` is not scanned. The externalBin is therefore
 * a shell script; the standalone is installed at {@link LINUX_SIDECAR_DEST}.
 */
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Absolute path inside the deb, rpm and AppImage. */
export const LINUX_SIDECAR_DEST = "/usr/share/cadcamfun/sidecar";
/** Path of the standalone relative to `apps/desktop/src-tauri/tauri.conf.json`. */
export const LINUX_SIDECAR_PAYLOAD = "linux-share/sidecar";

const MARKER = "# cadcamfun-linux-sidecar-wrapper";
const LINUX_PACKAGE_BUNDLES = ["deb", "rpm", "appimage"] as const;

export type LinuxPackageBundle = (typeof LINUX_PACKAGE_BUNDLES)[number];

/** The AppImage bundler is the pass that invokes linuxdeploy. */
export function appImageNeedsSidecarShelter(bundles: string | undefined): boolean {
  if (bundles === undefined) return true;
  return bundles.split(",").some((name) => name.trim().toLowerCase() === "appimage");
}

/** Linux packages this invocation actually builds. The wrapper replaces the externalBin for all of them. */
export function linuxPackagesInBuild(bundles: string | undefined): LinuxPackageBundle[] {
  if (bundles === undefined) return [...LINUX_PACKAGE_BUNDLES];
  const wanted = new Set(bundles.split(",").map((name) => name.trim().toLowerCase()));
  return LINUX_PACKAGE_BUNDLES.filter((name) => wanted.has(name));
}

/** Tauri `bundle.linux` fragment: each package receives the standalone under `usr/share`. */
export function linuxSidecarBundleConfig(bundles: string | undefined): {
  linux: Record<string, { files: Record<string, string> }>;
} {
  const files = { [LINUX_SIDECAR_DEST]: LINUX_SIDECAR_PAYLOAD };
  const linux: Record<string, { files: Record<string, string> }> = {};
  for (const name of linuxPackagesInBuild(bundles)) linux[name] = { files };
  return { linux };
}

/**
 * externalBin stand-in. `exec` keeps the process Tauri spawned, so stdin, stdout
 * and the ready-line handshake still belong to the Bun standalone.
 */
export function sidecarWrapperScript(): string {
  return `#!/bin/sh
${MARKER}
# The Bun standalone cannot live in usr/bin: linuxdeploy's ldd/patchelf pass rejects it.
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
payload="$here/../share/cadcamfun/sidecar"
if [ ! -f "$payload" ]; then
  echo "cadcamfun: sidecar payload is missing ($payload)" >&2
  exit 127
fi
exec "$payload" "$@"
`;
}

export function isSidecarWrapper(bytes: Uint8Array | string): boolean {
  const text = typeof bytes === "string" ? bytes : new TextDecoder().decode(bytes.subarray(0, 160));
  return text.startsWith(`#!/bin/sh\n${MARKER}\n`);
}

/**
 * Swaps the compiled sidecar for the wrapper and writes the original bytes to `payloadPath`.
 * The returned function puts the compiled sidecar back and deletes the payload.
 */
export async function shelterCompiledSidecar(sidecarPath: string, payloadPath: string): Promise<() => Promise<void>> {
  const original = await readFile(sidecarPath);
  if (isSidecarWrapper(original)) {
    throw new Error(`refusing to wrap ${sidecarPath}: it is already the linux sidecar wrapper`);
  }
  await mkdir(dirname(payloadPath), { recursive: true });
  await writeFile(payloadPath, original);
  await chmod(payloadPath, 0o755);
  try {
    await writeFile(sidecarPath, sidecarWrapperScript());
    await chmod(sidecarPath, 0o755);
  } catch (error) {
    await writeFile(sidecarPath, original);
    await chmod(sidecarPath, 0o755);
    await rm(payloadPath, { force: true });
    throw error;
  }
  let restored = false;
  return async () => {
    if (restored) return;
    restored = true;
    await writeFile(sidecarPath, original);
    await chmod(sidecarPath, 0o755);
    await rm(payloadPath, { force: true });
  };
}
