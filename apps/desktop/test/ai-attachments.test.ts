import { describe, expect, test } from "bun:test"
import { ACCEPT, MAX_FILE_BYTES, readAttachment } from "../src/features/ai/lib/attachments.ts"
import { opsFor } from "../src/features/ai/lib/editor-sync.ts"

describe("chat attachments (desktop)", () => {
  test("a DXF is read as text, an image as base64", async () => {
    const dxf = await readAttachment(new File(["0\nSECTION\n"], "plate.dxf", { type: "" }))
    expect(dxf).toEqual({ ok: true, attachment: { name: "plate.dxf", data: "0\nSECTION\n", encoding: "text" } })
    const png = await readAttachment(new File([new Uint8Array([137, 80, 78, 71])], "sketch.png", { type: "image/png" }))
    expect(png).toEqual({ ok: true, attachment: { name: "sketch.png", mime: "image/png", data: btoa(String.fromCharCode(137, 80, 78, 71)), encoding: "base64" } })
  })

  test("a file that is too big is refused with its name and the reason", async () => {
    const big = new File([new Uint8Array(MAX_FILE_BYTES + 1)], "huge.png", { type: "image/png" })
    const out = await readAttachment(big)
    expect(out).toMatchObject({ ok: false, name: "huge.png" })
  })

  test("the picker offers drawings and images", () => {
    for (const ext of [".dxf", ".svg", "image/png", ".gcode"]) expect(ACCEPT).toContain(ext)
  })

  test("an imported drawing shows in the editor like any other added element", () => {
    const ops = opsFor("cad_edit.import", JSON.stringify({ ok: true, ids: ["a"], elements: [{ id: "a", type: "extrusion", name: "Plate 1" }] }))
    expect(ops).toEqual([{ kind: "add", elements: [{ id: "a", type: "extrusion", name: "Plate 1" }] }])
  })
})
