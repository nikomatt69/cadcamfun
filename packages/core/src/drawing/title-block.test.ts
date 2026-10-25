import { describe, expect, test } from "bun:test"
import { model } from "../cad/script.ts"
import { generateSheet } from "./sheet.ts"
import {
  TITLE_BLOCK_FIELDS, completeTitleBlock, defaultTitleBlock, scaleFactorOf, sheetOptionsOfTitleBlock, titleBlockErrors, titleBlockFieldsFor, titleBlockIssues, titleBlockText, validTitleBlockFields
} from "./title-block.ts"

const context = { name: "Liquid mixer v2", projectName: "Mixers", author: "A. Rossi", organization: "ACME Machining", today: "2026-10-25", material: "Al 6061", mass: 0.5234 }

describe("the title block of a drawing", () => {
  test("a drawing nobody has described has a block a drawing office would accept as a start", () => {
    const block = defaultTitleBlock(context)
    expect(block).toMatchObject({ title: "Liquid mixer v2", number: "LIQUID-MIXER-V2-001", revision: "A", status: "draft", date: "2026-10-25", sheet: "1/1", owner: "ACME Machining", createdBy: "A. Rossi", material: "Al 6061", standard: "ISO 2768-1 m", scale: "auto", projection: "first", units: "mm" })
    expect(Object.keys(block).sort()).toEqual(TITLE_BLOCK_FIELDS.map((f) => f.key).sort())
    expect(defaultTitleBlock({}).number).toBe("DWG-001")
    // The same call gives the same block: the date is part of the context.
    expect(defaultTitleBlock(context)).toEqual(block)
  })

  test("a stored block is completed field by field: a damaged field is dropped, the others are kept", () => {
    const stored = { title: "Bracket", revision: "C", date: "25/10/2026", status: "shipped", mass: -1, projection: "third", unknownField: 1, approvedBy: "M. Bianchi" }
    expect(validTitleBlockFields(stored)).toEqual({ title: "Bracket", revision: "C", projection: "third", approvedBy: "M. Bianchi" })
    const block = completeTitleBlock(stored, context)
    expect(block).toMatchObject({ title: "Bracket", revision: "C", projection: "third", approvedBy: "M. Bianchi", date: "2026-10-25", status: "draft", mass: 0.5234 })
    for (const nothing of [undefined, null, 7, "x", []]) expect(completeTitleBlock(nothing, context)).toEqual(defaultTitleBlock(context))
  })

  test("the server's check names every field that is present and not acceptable", () => {
    expect(titleBlockErrors(undefined)).toEqual([])
    expect(titleBlockErrors({ title: "Bracket", status: "released", scale: "1:2", sheet: "2/5", mass: 0 })).toEqual([])
    const errors = titleBlockErrors({ date: "yesterday", status: "shipped", sheet: "one", scale: "big", extra: true, revision: "123456789" })
    expect(errors.map((e) => e.key).sort()).toEqual(["date", "extra", "revision", "scale", "sheet", "status"])
    expect(errors.find((e) => e.key === "status")!.message).toContain("draft, in-review, released, obsolete")
    expect(titleBlockErrors([])[0]!.key).toBe("titleBlock")
  })

  test("what a complete drawing still lacks is reported, not refused", () => {
    expect(titleBlockIssues(completeTitleBlock({}, {})).map((i) => i.key).sort()).toEqual(["createdBy"])
    expect(titleBlockIssues(completeTitleBlock({ title: "" }, context))).toEqual([{ key: "title", message: "The title block has no title" }])
    expect(titleBlockIssues(completeTitleBlock({}, context))).toEqual([])
  })

  test("the CAM fields belong to a CAM document, or to any block that holds them", () => {
    const part = completeTitleBlock({}, context)
    expect(titleBlockFieldsFor(part).some((f) => f.cam === true)).toBe(false)
    expect(titleBlockFieldsFor(completeTitleBlock({ program: "O1001" }, context)).map((f) => f.key)).toContain("program")
    expect(titleBlockFieldsFor(completeTitleBlock({ documentType: "cam-program" }, { ...context, machine: "VMC 3-axis" })).map((f) => f.key)).toEqual(expect.arrayContaining(["machine", "program", "setup"]))
  })

  test("the block prints its fields the way a drawing does", () => {
    const block = completeTitleBlock({ projection: "third", scale: "2:1" }, context)
    expect(titleBlockText(block, "mass")).toBe("0.523 kg")
    expect(titleBlockText(block, "projection")).toBe("3rd angle")
    expect(titleBlockText(completeTitleBlock({}, context), "scale")).toBe("AUTO")
    expect(titleBlockText(completeTitleBlock({ mass: 0 }, context), "mass")).toBe("")
    expect(scaleFactorOf("2:1")).toBe(2)
    expect(scaleFactorOf("1:2")).toBe(0.5)
    expect(scaleFactorOf("auto")).toBeUndefined()
    expect(scaleFactorOf("0:1")).toBeUndefined()
  })

  test("the sheet carries the block the screens show: the standard fields, the extra row, and the room it takes", () => {
    const m = model()
    m.extrude(m.sketch("XY").rectangle([0, 0], 40, 25), { depth: 10 })
    const history = m.build()
    const block = completeTitleBlock({ owner: "ACME Machining", status: "released", approvedBy: "M. Bianchi", checkedBy: "L. Verdi", scale: "2:1" }, context)
    const options = sheetOptionsOfTitleBlock(block)
    expect(options).toMatchObject({ title: "Liquid mixer v2", drawingNumber: "LIQUID-MIXER-V2-001", revision: "A", author: "A. Rossi", projection: "first", scale: 2 })
    const plain = generateSheet(history, { views: ["front", "top"] })
    const full = generateSheet(history, { views: ["front", "top"], ...options })
    const texts = (sheet: ReturnType<typeof generateSheet>): string[] => sheet.drawing.entities.flatMap((e) => (e._tag === "Text" ? [e.text] : []))
    expect(texts(full)).toEqual(expect.arrayContaining(["Liquid mixer v2", "ACME Machining", "released", "L. Verdi / M. Bianchi", "0.523 kg", "mm", "Rev. A"]))
    expect(texts(plain)).not.toContain("ACME Machining")
    // Without the block the sheet is what it was; with it the views keep clear of the taller block.
    const lowest = (sheet: ReturnType<typeof generateSheet>): number => Math.min(...sheet.views.map((v) => v.bounds.minY))
    expect(lowest(full)).toBeGreaterThanOrEqual(lowest(plain) - 1e-9)
  })
})
