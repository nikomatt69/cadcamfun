import { describe, expect, test } from "bun:test"
import { DEFAULT_CUTTERS, cutterIssues } from "./cutters.ts"
import { cuttersFromCsv, cuttersFromIso13399Xml, cuttersToCsv, cuttersToIso13399Xml, presetterList } from "./tool-io.ts"

describe("tool data I/O (spec 69 D3)", () => {
  test("CSV round trip keeps every field of every default cutter", () => {
    const back = cuttersFromCsv(cuttersToCsv(DEFAULT_CUTTERS))
    expect(back.issues).toEqual([])
    expect(back.cutters).toEqual(DEFAULT_CUTTERS as never)
  })

  test("ISO 13399 XML round trip keeps every field of every default cutter", () => {
    const back = cuttersFromIso13399Xml(cuttersToIso13399Xml(DEFAULT_CUTTERS))
    expect(back.issues).toEqual([])
    expect(back.cutters).toEqual(DEFAULT_CUTTERS as never)
  })

  test("a vendor-style end-mill file with standard property codes imports with matching geometry", () => {
    const xml = `<?xml version="1.0"?>
<Iso13399Tools>
  <Tool id="EM-D8-Z4" name="Solid carbide end mill &amp; coolant D8">
    <Property code="DC" unit="mm">8</Property>
    <Property code="DCONMS" unit="mm">8</Property>
    <Property code="LF" unit="mm">63</Property>
    <Property code="APMX" unit="mm">19</Property>
    <Property code="NOF">4</Property>
    <Property code="RE" unit="mm">0.5</Property>
  </Tool>
</Iso13399Tools>`
    const r = cuttersFromIso13399Xml(xml)
    expect(r.issues).toEqual([])
    expect(r.cutters).toEqual([{ id: "EM-D8-Z4", name: "Solid carbide end mill & coolant D8", kind: "bull", diameter: 8, flutes: 4, material: "carbide", coating: "none", fluteLength: 19, shankDiameter: 8, stickout: 63, cornerRadius: 0.5 }])
  })

  test("CSV: semicolon files with decimal commas, quotes, a BOM and any column order", () => {
    const csv = '﻿kind;id;name;diameter;flutes;fluteLength;stickout;shankDiameter\nflat;a1;"End mill; ""special"" 6,5";6,5;3;16,5;40;6\n'
    const r = cuttersFromCsv(csv)
    expect(r.issues).toEqual([])
    expect(r.cutters[0]).toMatchObject({ id: "a1", name: 'End mill; "special" 6,5', diameter: 6.5, fluteLength: 16.5, stickout: 40, shankDiameter: 6, material: "carbide", coating: "none" })
  })

  test("bad rows are reported with the row and the reason, good rows are kept", () => {
    const csv = ["id,kind,diameter,flutes,fluteLength,stickout,shankDiameter,angle", "ok,flat,6,3,15,40,6,", "dup,flat,6,3,15,40,6,", "dup,flat,6,3,15,40,6,", "x,spiral,6,3,15,40,6,", "y,flat,abc,3,15,40,6,", "z,chamfer,6,3,15,40,6,", "w,flat,6,3,50,40,6,"].join("\n")
    const r = cuttersFromCsv(csv)
    expect(r.cutters.map((c) => c.id)).toEqual(["ok", "dup"])
    expect(r.issues.map((i) => i.where)).toEqual(["row 4", "row 5", "row 6", "row 7", "row 8"])
    expect(r.issues[0]!.message).toMatch(/duplicate/)
    expect(r.issues[1]!.message).toMatch(/unknown kind 'spiral'/)
    expect(r.issues[2]!.message).toMatch(/'diameter' is not a number/)
    expect(r.issues[3]!.message).toMatch(/included angle/)
    expect(r.issues[4]!.message).toMatch(/longer than the stickout/)
    for (const c of r.cutters) expect(cutterIssues(c)).toEqual([])
    expect(cuttersFromCsv("").issues[0]!.message).toMatch(/empty/)
    expect(cuttersFromCsv("a,b\n1,2").issues[0]!.message).toMatch(/id and kind/)
  })

  test("part-21 files and DTDs are refused with the reason, not half read", () => {
    expect(cuttersFromIso13399Xml("ISO-10303-21;\nHEADER;").issues[0]!.message).toMatch(/not supported/)
    expect(cuttersFromIso13399Xml('<!DOCTYPE x [<!ENTITY e "boom">]><Tool id="a"></Tool>').issues[0]!.message).toMatch(/DTDs/)
    expect(cuttersFromIso13399Xml("<x/>").issues[0]!.message).toMatch(/no <Tool>/)
  })

  test("the presetter list is ordered by pocket number with the nominal values", () => {
    const list = presetterList([{ ...DEFAULT_CUTTERS[3]!, number: 2 }, { ...DEFAULT_CUTTERS[0]!, number: 1 }, DEFAULT_CUTTERS[5]!]).trim().split("\n")
    expect(list[0]).toBe("T;ID;Name;Kind;DC;LF;APMX;NOF;Holder")
    expect(list[1]!.startsWith("1;flat-1;")).toBe(true)
    expect(list[2]!.startsWith("2;")).toBe(true)
    expect(list[3]!.startsWith(";")).toBe(true)
    expect(list[1]).toContain(`;${DEFAULT_CUTTERS[0]!.stickout};${DEFAULT_CUTTERS[0]!.fluteLength};`)
    expect(list[1]!.endsWith("D40xL50")).toBe(true)
  })
})
