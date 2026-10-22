import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const wrapper = join(import.meta.dir, "linuxdeploy-patchelf.sh");

async function fixture(): Promise<{ dir: string; patchelf: string; bin: string }> {
  const dir = await mkdtemp(join(tmpdir(), "patchelf-wrap-"));
  const bin = join(dir, "bin");
  const patchelf = join(bin, "patchelf");
  const ldd = join(bin, "ldd");
  await mkdir(bin, { recursive: true });
  await writeFile(patchelf, "#!/bin/sh\nif [ \"$1\" = \"--print-rpath\" ]; then echo printed; exit 0; fi\nif [ \"$1\" = \"--set-rpath\" ]; then printf 'patched:%s' \"$2\" > \"$3\"; exit 0; fi\nexit 1\n");
  await writeFile(ldd, "#!/bin/sh\nexit \"${LDD_EXIT:-0}\"\n");
  await chmod(patchelf, 0o755);
  await chmod(ldd, 0o755);
  return { dir, patchelf, bin };
}

async function run(bin: string, patchelf: string, args: string[], lddExit = "0"): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = Bun.spawn(["bash", wrapper, ...args], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}`, PATCHELF_REAL: patchelf, LDD_EXIT: lddExit },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, stdout, stderr };
}

describe("linuxdeploy patchelf wrapper", () => {
  test("keeps a sidecar whose rewritten form does not load", async () => {
    const { dir, patchelf, bin } = await fixture();
    const file = join(dir, "sidecar");
    await writeFile(file, "original");
    const result = await run(bin, patchelf, ["--set-rpath", "$ORIGIN/../lib", file], "1");
    expect(result.code).toBe(0);
    expect(await readFile(file, "utf8")).toBe("original");
    expect(result.stderr).toContain("unchanged");
    await rm(dir, { recursive: true, force: true });
  });

  test("keeps a rewritten sidecar when it still loads", async () => {
    const { dir, patchelf, bin } = await fixture();
    const file = join(dir, "sidecar-aarch64-unknown-linux-gnu");
    await writeFile(file, "original");
    const result = await run(bin, patchelf, ["--set-rpath", "$ORIGIN/../lib", file], "0");
    expect(result.code).toBe(0);
    expect(await readFile(file, "utf8")).toBe("patched:$ORIGIN/../lib");
    await rm(dir, { recursive: true, force: true });
  });

  test("patches every other file even when ldd would fail", async () => {
    const { dir, patchelf, bin } = await fixture();
    const file = join(dir, "libwebkit2gtk-4.1.so.0");
    await writeFile(file, "original");
    const result = await run(bin, patchelf, ["--set-rpath", "$ORIGIN", file], "1");
    expect(result.code).toBe(0);
    expect(await readFile(file, "utf8")).toBe("patched:$ORIGIN");
    await rm(dir, { recursive: true, force: true });
  });

  test("prints the existing rpath through the real patchelf", async () => {
    const { dir, patchelf, bin } = await fixture();
    const file = join(dir, "sidecar");
    await writeFile(file, "original");
    const result = await run(bin, patchelf, ["--print-rpath", file]);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe("printed");
    expect(await readFile(file, "utf8")).toBe("original");
    await rm(dir, { recursive: true, force: true });
  });
});
