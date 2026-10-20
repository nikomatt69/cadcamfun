import { expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * The preview compiles its Metal shaders from source at runtime, so a syntax error only shows on the
 * device as "The preview could not be displayed" (a reserved word such as `vertex` used as a variable
 * once hid every mesh and toolpath). Compile the same source with the iOS Metal compiler here.
 */
const source = readFileSync(fileURLToPath(new URL("../modules/preview/ios/PreviewSurface.swift", import.meta.url)), "utf8")
const shader = source.match(/private let shaderSource = """\n([\s\S]*?)\n"""/)?.[1]

const metalCompiler = (): boolean => {
  if (process.platform !== "darwin") return false
  const probe = Bun.spawnSync(["xcrun", "-sdk", "iphoneos", "--find", "metal"], { stdout: "ignore", stderr: "ignore" })
  return probe.exitCode === 0
}

test("the preview shader source is embedded in the Swift view", () => {
  expect(shader).toContain("vertex MeshOut meshVertex")
  expect(shader).toContain("fragment float4 lineFragment")
  // The machine bodies (spec 31) have their own pipeline: interleaved xyz/normal/rgba and a spin about x.
  expect(shader).toContain("vertex SolidOut solidVertex")
  expect(shader).toContain("fragment float4 solidFragment")
  expect(shader).toContain("spinAboutX")
})

test("the native module draws the cutter at the playhead in its own buffer", () => {
  const module = readFileSync(fileURLToPath(new URL("../modules/preview/ios/CadPreviewModule.swift", import.meta.url)), "utf8")
  const surface = readFileSync(fileURLToPath(new URL("../modules/preview/ios/PreviewSurface.swift", import.meta.url)), "utf8")
  // The cutter moves with the playhead, so it cannot live in the static or the spinning buffer.
  expect(module).toContain("Function(\"setTool\")")
  expect(module).toContain("replaceTool")
  expect(surface).toContain("frame.tool")
})

test.skipIf(!metalCompiler())("the preview shaders compile for iOS", () => {
  const dir = mkdtempSync(join(tmpdir(), "cadcam-preview-shader-"))
  try {
    writeFileSync(join(dir, "preview.metal"), shader ?? "")
    const result = Bun.spawnSync(["xcrun", "-sdk", "iphoneos", "metal", "-c", join(dir, "preview.metal"), "-o", join(dir, "preview.air")], { stdout: "pipe", stderr: "pipe" })
    expect(result.stderr.toString()).not.toContain("error:")
    expect(result.exitCode).toBe(0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}, 60_000)
