/**
 * The desktop half of the vision exchange: the CAM page answers a capture request with what the
 * user is looking at — the program sheet and the program text — so the assistant can see the CAM.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"
import { useDocumentStore } from "../src/features/cad/store/documentStore.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>

beforeAll(async () => {
  app = await bootLiveApp()
  // happy-dom draws no canvas: the sheet is drawn on a recording double.
  const proto = Object.getPrototypeOf(document.createElement("canvas")) as {
    getContext: (type: string) => unknown
    toDataURL: (type?: string) => string
  }
  proto.getContext = function (type: string): unknown {
    if (type !== "2d") return null
    return {
      fillStyle: "", strokeStyle: "", font: "", textAlign: "", textBaseline: "", lineWidth: 1,
      fillRect: () => undefined,
      fillText: () => undefined,
      measureText: (text: string) => ({ width: text.length * 8 }),
      drawImage: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => undefined
    }
  }
  proto.toDataURL = () => "data:image/png;base64,iVBORw0KGgo="
})
afterAll(async () => { await app.dispose() })

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))

describe("the CAM answers a capture request", () => {
  test("the reply carries the program sheet and the program text", async () => {
    const { dispose } = app.visit("/cam")
    try {
      const editor = await app.wait(() => document.querySelector<HTMLTextAreaElement>("textarea"), 30000)
      editor.value = "G21\nG0 X0 Y0\nG1 X25 Y0 F600\nM30"
      editor.dispatchEvent(new window.Event("input", { bubbles: true }))
      await app.wait(() => (document.querySelector<HTMLTextAreaElement>("textarea")?.value.includes("G1 X25 Y0 F600") ? true : undefined), 30000)
      await settle(200)

      const projectId = "project-vision"
      useDocumentStore.getState().setDocument({ projectId, drawingId: "drawing-vision", name: "Bracket" })
      const requestId = crypto.randomUUID()
      await app.state.runtime.run(app.client.kv.set({
        params: { key: `ai.vision.request.${projectId}.${requestId}` },
        payload: { value: { requestId, projectId, mode: "cam", requestedAt: Date.now(), focus: "" } }
      }))

      const replyKey = `ai.vision.reply.${projectId}.${requestId}`
      let captured: Record<string, unknown> | undefined
      const deadline = Date.now() + 30_000
      while (captured === undefined && Date.now() < deadline) {
        const row = await app.state.runtime.run(app.client.kv.get({ params: { key: replyKey } })).catch(() => undefined) as { value?: unknown } | undefined
        if (row?.value !== undefined) captured = row.value as Record<string, unknown>
        else await settle(100)
      }
      expect(captured).toBeDefined()
      if (captured === undefined) return
      // The capture says what it is, and it is the program the editor shows.
      expect(captured["kind"]).toBe("sheet")
      expect(String(captured["gcode"])).toContain("G1 X25 Y0 F600")
      expect(captured["mime"]).toBe("image/png")
      expect(typeof captured["sceneRevision"]).toBe("string")
    } finally {
      useDocumentStore.getState().clear()
      dispose()
    }
  }, 60000)
})
