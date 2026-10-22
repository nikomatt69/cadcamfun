/**
 * The vision capture the model receives: the CAM must show the program it is looking at, not only
 * the pixels of a viewport that may not even be on screen.
 */
import { expect, test } from "bun:test"
import { runAction } from "../src/actions/catalogue.ts"
import { ToolMediaResult } from "../src/tools/define.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"
import type { VisionCapture } from "../src/vision.ts"

const capture = (over: Partial<VisionCapture> = {}): VisionCapture => ({
  requestId: "11111111-1111-4111-8111-111111111111",
  projectId: "p",
  mode: "cam",
  capturedAt: Date.now(),
  mime: "image/png",
  data: "iVBORw0KGgo=",
  kind: "viewport",
  sceneRevision: "a".repeat(64),
  width: 100,
  height: 80,
  context: {},
  ...over
})

const visionHandler = (over: Partial<VisionCapture> = {}) => ({
  projectId: "p",
  handlers: {
    vision: async (): Promise<{ ok: true; capture: VisionCapture; evidence: unknown }> => ({
      ok: true,
      capture: capture(over),
      evidence: { ok: true, image: { width: over.width ?? 100, height: over.height ?? 80, mime: "image/png", kind: over.kind ?? "viewport" } }
    })
  } as unknown as ToolHandlersShape
})

test("the CAM capture attaches the viewport and the program sheet", async () => {
  const result = await runAction("cam.vision", {}, visionHandler({
    sheet: { mime: "image/png", data: "iVBORw0KGgp=", width: 10, height: 20 }
  }))
  expect(result).toBeInstanceOf(ToolMediaResult)
  const files = (result as ToolMediaResult).files
  expect(files.map((file) => file.filename)).toEqual(["cam-viewport.png", "cam-program.png"])
  expect(files.every((file) => file.url.startsWith("data:image/png;base64,"))).toBe(true)
})

test("a program sheet on its own is the capture", async () => {
  const result = await runAction("cam.vision", {}, visionHandler({ kind: "sheet" }))
  expect(result).toBeInstanceOf(ToolMediaResult)
  expect((result as ToolMediaResult).files.map((file) => file.filename)).toEqual(["cam-program.png"])
})

test("the CAD capture is unchanged: one image of the canvas", async () => {
  const result = await runAction("cad.vision", {}, {
    projectId: "p",
    handlers: {
      vision: async (): Promise<{ ok: true; capture: VisionCapture; evidence: unknown }> => ({
        ok: true,
        capture: capture({ mode: "cad", kind: "viewport" }),
        evidence: { ok: true, image: { width: 100, height: 80, mime: "image/png", kind: "viewport" } }
      })
    } as unknown as ToolHandlersShape
  })
  expect(result).toBeInstanceOf(ToolMediaResult)
  expect((result as ToolMediaResult).files.map((file) => file.filename)).toEqual(["cad-viewport.png"])
})
