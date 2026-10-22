import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  LINUX_SIDECAR_DEST,
  LINUX_SIDECAR_PAYLOAD,
  appImageNeedsSidecarShelter,
  isSidecarWrapper,
  linuxPackagesInBuild,
  linuxSidecarBundleConfig,
  shelterCompiledSidecar,
  sidecarWrapperScript,
} from "./linux-sidecar.ts";

describe("linux sidecar shelter", () => {
  test("wraps only builds that produce an AppImage", () => {
    expect(appImageNeedsSidecarShelter(undefined)).toBe(true);
    expect(appImageNeedsSidecarShelter("deb,rpm,appimage")).toBe(true);
    expect(appImageNeedsSidecarShelter("deb")).toBe(false);
    expect(appImageNeedsSidecarShelter(" AppImage ")).toBe(true);
  });

  test("ships the standalone to every linux package in the same invocation", () => {
    expect(linuxPackagesInBuild(undefined)).toEqual(["deb", "rpm", "appimage"]);
    expect(linuxPackagesInBuild("appimage")).toEqual(["appimage"]);
    expect(linuxPackagesInBuild("deb,rpm,appimage")).toEqual(["deb", "rpm", "appimage"]);
    const config = linuxSidecarBundleConfig("deb,appimage");
    expect(config.linux.deb?.files[LINUX_SIDECAR_DEST]).toBe(LINUX_SIDECAR_PAYLOAD);
    expect(config.linux.appimage?.files[LINUX_SIDECAR_DEST]).toBe(LINUX_SIDECAR_PAYLOAD);
    expect(config.linux.rpm).toBeUndefined();
  });

  test("the wrapper is a script that execs the share payload", () => {
    const script = sidecarWrapperScript();
    expect(isSidecarWrapper(script)).toBe(true);
    expect(script).toContain('payload="$here/../share/cadcamfun/sidecar"');
    expect(script).toContain('exec "$payload" "$@"');
    expect(isSidecarWrapper(new TextEncoder().encode(script))).toBe(true);
    expect(isSidecarWrapper(new Uint8Array([0x7f, 0x45, 0x4c, 0x46]))).toBe(false);
  });

  test("shelter swaps the sidecar and restore puts the original bytes back", async () => {
    const root = await mkdtemp(join(tmpdir(), "cadcamfun-sidecar-"));
    try {
      const sidecar = join(root, "sidecar-aarch64-unknown-linux-gnu");
      const payload = join(root, LINUX_SIDECAR_PAYLOAD);
      const original = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 1, 2, 3]);
      await writeFile(sidecar, original);
      const restore = await shelterCompiledSidecar(sidecar, payload);
      expect(isSidecarWrapper(await readFile(sidecar))).toBe(true);
      expect(new Uint8Array(await readFile(payload))).toEqual(original);
      await restore();
      expect(new Uint8Array(await readFile(sidecar))).toEqual(original);
      expect(await readFile(payload).then(() => true, () => false)).toBe(false);
      await expect(shelterCompiledSidecar(sidecar, payload)).resolves.toBeTypeOf("function");
      await writeFile(sidecar, sidecarWrapperScript());
      await expect(shelterCompiledSidecar(sidecar, payload)).rejects.toThrow("already the linux sidecar wrapper");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("the installed wrapper forwards the environment and stdin to the payload", async () => {
    const root = await mkdtemp(join(tmpdir(), "cadcamfun-sidecar-run-"));
    try {
      const bin = join(root, "usr", "bin");
      const share = join(root, "usr", "share", "cadcamfun");
      const { mkdir } = await import("node:fs/promises");
      await mkdir(bin, { recursive: true });
      await mkdir(share, { recursive: true });
      const payload = join(share, "sidecar");
      await writeFile(payload, "#!/bin/sh\nprintf 'ready:%s\\n' \"$CADCAMFUN_TOKEN\"\ncat\n");
      await chmod(payload, 0o755);
      const wrapper = join(bin, "sidecar");
      await writeFile(wrapper, sidecarWrapperScript());
      await chmod(wrapper, 0o755);
      const proc = Bun.spawn([wrapper], {
        env: { ...process.env, CADCAMFUN_TOKEN: "tok" },
        stdin: new Blob(["hello\n"]),
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      expect(stderr).toBe("");
      expect(code).toBe(0);
      expect(stdout).toBe("ready:tok\nhello\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
