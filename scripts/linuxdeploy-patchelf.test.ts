import { describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { linuxBundleEnv } from "./build.ts";

const script = new URL("./linuxdeploy-patchelf.sh", import.meta.url).pathname;

async function runWrapper(args: string[], env: Record<string, string>, file: string): Promise<{ code: number; stderr: string; bytes: string }> {
  const child = Bun.spawn(["sh", script, ...args], {
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const [stderr, code] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  return { code, stderr, bytes: await readFile(file, "utf8") };
}

describe("linuxdeploy patchelf wrapper", () => {
  test("the linux bundle points PATCHELF at the wrapper", () => {
    const env = linuxBundleEnv({ KEEP: "1" }, "/repo");
    expect(env.KEEP).toBe("1");
    expect(env.APPIMAGE_EXTRACT_AND_RUN).toBe("1");
    expect(env.NO_STRIP).toBe("1");
    expect(env.PATCHELF).toBe("/repo/scripts/linuxdeploy-patchelf.sh");
  });

  test("the wrapper is executable", async () => {
    const mode = (await stat(script)).mode;
    expect(mode & 0o111).not.toBe(0);
  });

  test("restores the original bytes when ldd fails after the rewrite", async () => {
    const root = await mkdtemp(join(tmpdir(), "patchelf-fail-"));
    try {
      const bin = join(root, "bin");
      const app = join(root, "CADCAM FUN.AppDir", "usr", "bin");
      await mkdir(bin, { recursive: true });
      await mkdir(app, { recursive: true });
      const patchelf = join(bin, "patchelf");
      const ldd = join(bin, "ldd");
      await writeFile(patchelf, "#!/bin/sh\nprintf 'PATCHED %s\\n' \"$2\" > \"$3\"\n");
      await writeFile(ldd, "#!/bin/sh\ngrep -q PATCHED \"$1\" && exit 1\nexit 0\n");
      await chmod(patchelf, 0o755);
      await chmod(ldd, 0o755);
      const file = join(app, "sidecar");
      await writeFile(file, "ORIGINAL\n");
      const result = await runWrapper(["--set-rpath", "$ORIGIN/../lib", file], {
        LINUXDEPLOY_REAL_PATCHELF: patchelf,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
      }, file);
      expect(result.code).toBe(0);
      expect(result.bytes).toBe("ORIGINAL\n");
      expect(result.stderr).toContain("restored the original file");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("keeps a rewrite that ldd still accepts and forwards other patchelf calls", async () => {
    const root = await mkdtemp(join(tmpdir(), "patchelf-ok-"));
    try {
      const source = join(root, "main.c");
      const file = join(root, "main");
      await writeFile(source, "int main(void){return 0;}\n");
      const compiled = Bun.spawn(["gcc", "-o", file, source], { stdout: "pipe", stderr: "pipe" });
      expect(await compiled.exited).toBe(0);

      const kept = Bun.spawn(["sh", script, "--set-rpath", "$ORIGIN/../lib", file], {
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
      });
      const [stderr, code] = await Promise.all([new Response(kept.stderr).text(), kept.exited]);
      expect(stderr).toBe("");
      expect(code).toBe(0);
      const printed = Bun.spawn(["patchelf", "--print-rpath", file], { stdout: "pipe", stderr: "pipe" });
      const [rpath, printCode] = await Promise.all([new Response(printed.stdout).text(), printed.exited]);
      expect(printCode).toBe(0);
      expect(rpath.trim()).toBe("$ORIGIN/../lib");

      const forwarded = Bun.spawn(["sh", script, "--print-rpath", file], { stdout: "pipe", stderr: "pipe" });
      const [forwardedRpath, forwardedCode] = await Promise.all([new Response(forwarded.stdout).text(), forwarded.exited]);
      expect(forwardedCode).toBe(0);
      expect(forwardedRpath.trim()).toBe("$ORIGIN/../lib");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("propagates a patchelf failure and leaves the file untouched", async () => {
    const root = await mkdtemp(join(tmpdir(), "patchelf-err-"));
    try {
      const patchelf = join(root, "patchelf");
      await writeFile(patchelf, "#!/bin/sh\nexit 4\n");
      await chmod(patchelf, 0o755);
      const file = join(root, "sidecar");
      await writeFile(file, "ORIGINAL\n");
      const result = await runWrapper(["--set-rpath", "$ORIGIN/../lib", file], {
        LINUXDEPLOY_REAL_PATCHELF: patchelf,
      }, file);
      expect(result.code).toBe(4);
      expect(result.bytes).toBe("ORIGINAL\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
