import { describe, expect, test } from "bun:test"
import { DEFAULT_CUTTERS } from "../kernel/cutters.ts"
import { applyPresetting, fromIso13399, presetterCsv, readPresetterCsv, toIso13399 } from "./tool-exchange.ts"

describe("ISO 13399 exchange", () => {
  test("every default cutter round-trips field for field", () => {
    const xml = toIso13399(DEFAULT_CUTTERS)
    const back = fromIso13399(xml)
    expect(back.length).toBe(DEFAULT_CUTTERS.length)
    for (const c of DEFAULT_CUTTERS) {
      const b = back.find((x) => x.id === c.id)!
      const { holder: _h, number: _n, ...expected } = c
      expect(b).toEqual(expected as never)
    }
  })
  test("standard property codes are present", () => {
    const xml = toIso13399([DEFAULT_CUTTERS.find((c) => c.id === "bull-6-r0.5")!])
    for (const code of ["DC", "DCONMS", "LF", "OAL", "LU", "APMX", "ZEFP", "RE"]) expect(xml).toContain(`<Property code="${code}"`)
  })
  test("a missing property or unknown kind is refused with the tool named", () => {
    const xml = toIso13399([DEFAULT_CUTTERS[0]!])
    expect(() => fromIso13399(xml.replace(/<Property code="DC"[^\n]*\n/, ""))).toThrow(/property DC/)
    expect(() => fromIso13399(xml.replace(/>flat</, ">warp<"))).toThrow(/CAD_KIND/)
  })
})

describe("presetter", () => {
  const cutters = DEFAULT_CUTTERS.slice(0, 3)
  test("exports nominal values per pocket", () => {
    const csv = presetterCsv(cutters)
    const lines = csv.trim().split("\n")
    expect(lines.length).toBe(4)
    expect(lines[0]).toContain("nominal_diameter")
    expect(lines[1]!.split(";")[1]).toBe(cutters[0]!.id)
  })
  test("measured values come back as offsets, out-of-tolerance tools are flagged", () => {
    const [a, b] = cutters
    const csv = `ident;measured_diameter;measured_length\n${a!.id};${a!.diameter + 0.01};${a!.stickout - 0.02}\n${b!.id};${b!.diameter + 0.1};${b!.stickout}\nghost;1;1\n`
    const r = applyPresetting(cutters, readPresetterCsv(csv))
    expect(r[0]!.status).toBe("ok")
    expect(r[0]!.lengthOffset).toBeCloseTo(a!.stickout - 0.02, 9)
    expect(r[1]!.status).toBe("out-of-tolerance")
    expect(r[1]!.radiusWear).toBeCloseTo(0.05, 9)
    expect(r[2]!.status).toBe("unknown-tool")
    expect(() => readPresetterCsv("ident;foo\nx;1")).toThrow(/measured_diameter/)
  })
})
