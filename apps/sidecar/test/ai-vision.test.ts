import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { sceneGeometryText } from "@cadcamfun/core"
import { captureViewport } from "../src/services/ai-vision.ts"
const elements = [{ id: "e", type: "cube", x: 2, width: 10 }]
const evidence = async () => ({ elements, drawing: { id: "d" }, operations: null })
const exchangeFor = (revision: string, extra: Record<string, unknown> = {}) => {
  const data = new Map<string, unknown>()
  return { data, exchange: {
    set: async (key: string, raw: unknown) => {
      data.set(key, raw)
      const request = raw as { requestId: string; projectId: string; mode: string }
      data.set(key.replace("request", "reply"), { ...request, capturedAt: Date.now(), sceneRevision: revision, width: 1, height: 1, mime: "image/png", data: "iVBORw0KGgo=", context: {}, ...extra })
    },
    get: async (key: string) => data.get(key), delete: async (key: string) => data.delete(key)
  } }
}
test("vision exchange correlates request, geometry and cleanup", async () => {
  const revision = createHash("sha256").update(sceneGeometryText(elements)).digest("hex")
  const { exchange, data } = exchangeFor(revision)
  const result = await captureViewport(exchange, { projectId: "p", mode: "cad" }, evidence)
  expect(result.ok).toBe(true)
  expect(data.size).toBe(0)
})
test("a stale viewport image never becomes evidence for changed geometry", async () => {
  const { exchange, data } = exchangeFor("0".repeat(64))
  const result = await captureViewport(exchange, { projectId: "p", mode: "cad" }, evidence)
  expect(result.ok).toBe(false)
  expect(data.size).toBe(0)
})
test("a matching drawing cannot conceal a stale rendered CAM program", async () => {
  const revision = createHash("sha256").update(sceneGeometryText(elements)).digest("hex")
  const { exchange, data } = exchangeFor(revision)
  const result = await captureViewport(exchange, { projectId: "p", mode: "cam" }, async () => ({ ...(await evidence()), programRevision: "1".repeat(64) }))
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error).toContain("rendered toolpath")
  expect(data.size).toBe(0)
})
test("the CAM capture carries the program, the toolpaths and the program sheet", async () => {
  const revision = createHash("sha256").update(sceneGeometryText(elements)).digest("hex")
  const { exchange } = exchangeFor(revision, {
    kind: "viewport",
    gcode: "G21\nG0 X0 Y0\nM30",
    sheet: { mime: "image/png", data: "iVBORw0KGgp=", width: 10, height: 20 }
  })
  const result = await captureViewport(exchange, { projectId: "p", mode: "cam" }, async () => ({
    ...(await evidence()),
    toolpaths: [{ id: "t1", name: "Contour", toolId: "T1", moveCount: 3 }]
  }))
  expect(result.ok).toBe(true)
  if (!result.ok) return
  const value = result.evidence as Record<string, unknown>
  expect((value["image"] as Record<string, unknown>)["kind"]).toBe("viewport")
  expect((value["program"] as Record<string, unknown>)["gcode"]).toContain("M30")
  expect((value["sheet"] as Record<string, unknown>)["width"]).toBe(10)
  expect(value["toolpaths"]).toEqual([{ id: "t1", name: "Contour", toolId: "T1", moveCount: 3 }])
})
test("a program sheet capture says what it shows", async () => {
  const revision = createHash("sha256").update(sceneGeometryText(elements)).digest("hex")
  const { exchange } = exchangeFor(revision, { kind: "sheet", gcode: "M30" })
  const result = await captureViewport(exchange, { projectId: "p", mode: "cam" }, evidence)
  expect(result.ok).toBe(true)
  if (!result.ok) return
  const value = result.evidence as Record<string, unknown>
  expect((value["image"] as Record<string, unknown>)["kind"]).toBe("sheet")
  expect(String(value["note"])).toContain("program sheet")
})
