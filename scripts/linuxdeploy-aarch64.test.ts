import { expect, test } from "bun:test"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { aarch64LinuxdeployEnv, includesAppImage } from "./linuxdeploy-aarch64.ts"

const wrapper = join(import.meta.dir, "linuxdeploy-aarch64-ldd.sh")

function fakeLdd(root: string, body: string): string {
  const path = join(root, "ldd-real")
  writeFileSync(path, body)
  chmodSync(path, 0o755)
  return path
}

function runWrapper(real: string): { code: number; out: string } {
  const result = Bun.spawnSync(["bash", wrapper, "/tmp/bin"], {
    env: { ...process.env, CADCAM_LDD: real, PATH: "/usr/bin:/bin" },
    stdout: "pipe",
    stderr: "pipe",
  })
  return { code: result.exitCode ?? 1, out: `${result.stdout.toString()}${result.stderr.toString()}` }
}

test("an AppImage is bundled unless the list leaves it out", () => {
  expect(includesAppImage(undefined)).toBe(true)
  expect(includesAppImage("deb,rpm,appimage")).toBe(true)
  expect(includesAppImage("deb, rpm")).toBe(false)
})

test("a resolved ldd trace keeps its text and exits 0 when ldd itself failed", () => {
  const root = mkdtempSync(join(tmpdir(), "cadcam-ldd-"))
  try {
    const real = fakeLdd(root, `#!/bin/sh
printf '%s\\n' '\tlibc.so.6 => /lib/libc.so.6 (0x1)'
printf '%s\\n' '\t/lib/ld-linux-aarch64.so.1 => /lib/ld-linux-aarch64.so.1 (0x2)'
exit 1
`)
    const result = runWrapper(real)
    expect(result.code).toBe(0)
    expect(result.out).toContain("libc.so.6 => /lib/libc.so.6")
    expect(result.out).toContain("ld-linux-aarch64.so.1")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("a binary that is not dynamic stays a failure", () => {
  const root = mkdtempSync(join(tmpdir(), "cadcam-ldd-static-"))
  try {
    const real = fakeLdd(root, `#!/bin/sh
printf '%s\\n' '\tnot a dynamic executable'
exit 1
`)
    expect(runWrapper(real).code).toBe(1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("a loader error with no resolved library stays a failure", () => {
  const root = mkdtempSync(join(tmpdir(), "cadcam-ldd-missing-"))
  try {
    const real = fakeLdd(root, `#!/bin/sh
printf '%s\\n' 'error while loading shared libraries: libmissing.so.1: cannot open shared object file'
exit 127
`)
    expect(runWrapper(real).code).toBe(127)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("the aarch64 bundler environment puts the wrapper first and skips strip", async () => {
  const env = await aarch64LinuxdeployEnv("/usr/bin:/bin")
  expect(env.NO_STRIP).toBe("1")
  const dir = env.PATH.split(":")[0]
  expect(dir).not.toBe("/usr/bin")
  const result = Bun.spawnSync([join(dir, "ldd"), "/bin/true"], {
    env: { ...process.env, PATH: env.PATH, CADCAM_LDD: "/usr/bin/ldd" },
    stdout: "pipe",
    stderr: "pipe",
  })
  expect(result.exitCode).toBe(0)
  expect(result.stdout.toString()).toContain("=>")
  rmSync(dir, { recursive: true, force: true })
})
