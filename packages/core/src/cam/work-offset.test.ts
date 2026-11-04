import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { evalCondition, evalExpr, num } from "./macro.ts"
import {
  OffsetEntrySchema, UPDATE_MODES, WorkOffsetRefSchema, addressOf, applyCorrection, formatOffsetRef, getOffset, machineToWork, offsetKey, parseOffsetRef,
  policyCondition, policyProblem, refOf, withOffset, workToMachine, type OffsetAddress, type UpdatePolicy, type WorkOffsetRef
} from "./work-offset.ts"

const address = (r: ReturnType<typeof addressOf>): OffsetAddress => {
  if ("refused" in r) throw new Error(r.refused)
  return r
}

describe("work offset references", () => {
  test("parse and format round trip", () => {
    for (const text of ["G54", "G59", "G54.1 P3", "G505", "G599", "G59.1", "G59.3", "preset 4"]) {
      const ref = parseOffsetRef(text)!
      expect(formatOffsetRef(ref)).toBe(text)
      expect(refOf(offsetKey(ref))).toEqual(ref)
    }
    expect(parseOffsetRef("g154p7")).toEqual({ kind: "extended", p: 7 })
    expect(parseOffsetRef("G60")).toBeUndefined()
    expect(parseOffsetRef("G54.1 P301")).toBeUndefined()
    expect(offsetKey({ kind: "linuxcnc", p: 2 })).toBe("G55")
    expect(offsetKey({ kind: "frame", n: 1 })).toBe("G54")
  })

  test("schema accepts the five kinds and refuses out of range", () => {
    const decode = Schema.decodeUnknownSync(WorkOffsetRefSchema)
    expect(decode({ kind: "extended", p: 48 })).toEqual({ kind: "extended", p: 48 })
    expect(() => decode({ kind: "linuxcnc", p: 10 })).toThrow()
    expect(() => decode({ kind: "g5x", code: "G60" })).toThrow()
  })
})

describe("addresses per family", () => {
  test("fanuc-like variables", () => {
    const g55 = address(addressOf({ kind: "g5x", code: "G55" }, "fanuc"))
    expect([g55.select, g55.read("X"), g55.read("Y"), g55.read("Z"), g55.read("A"), g55.read("R")]).toEqual(["G55", "#5241", "#5242", "#5243", "#5244", undefined])
    const p3 = address(addressOf({ kind: "extended", p: 3 }, "fanuc"))
    expect([p3.select, p3.read("X")]).toEqual(["G54.1 P3", "#7041"])
    expect(addressOf({ kind: "extended", p: 49 }, "fanuc")).toHaveProperty("refused")
    expect(address(addressOf({ kind: "extended", p: 49 }, "fanuc", { extended: 300 })).read("X")).toBe(`#${14001 + 20 * 48}`)
    const haas = address(addressOf({ kind: "extended", p: 21 }, "haas"))
    expect([haas.select, haas.read("X")]).toEqual(["G154 P21", `#${14001 + 20 * 20}`])
    expect(address(addressOf({ kind: "extended", p: 20 }, "haas")).read("Z")).toBe(`#${7001 + 20 * 19 + 2}`)
    expect(address(addressOf({ kind: "g5x", code: "G54" }, "mazak")).write).toBe("variable")
  })

  test("okuma, siemens, linuxcnc, heidenhain, grbl", () => {
    const ok = address(addressOf({ kind: "g5x", code: "G56" }, "okuma"))
    expect([ok.select, ok.read("X"), ok.read("Z"), ok.read("A")]).toEqual(["G15 H3", "VZOFX[3]", "VZOFZ[3]", undefined])
    const s = address(addressOf({ kind: "g5x", code: "G55" }, "siemens"))
    expect([s.select, s.read("X"), s.read("R"), s.reselect]).toEqual(["G55", "$P_UIFR[2,X,TR]", "$P_UIFR[2,Z,RT]", true])
    expect(address(addressOf({ kind: "frame", n: 7 }, "siemens")).select).toBe("G507")
    const g58 = addressOf({ kind: "g5x", code: "G58" }, "siemens")
    expect("refused" in g58 && /programmable/.test(g58.refused)).toBe(true)
    const l = address(addressOf({ kind: "linuxcnc", p: 8 }, "linuxcnc"))
    expect([l.select, l.write, l.g10P, l.read("X"), l.read("R")]).toEqual(["G59.2", "g10", 8, "#5361", "#5370"])
    const h = address(addressOf({ kind: "preset", row: 4 }, "heidenhain"))
    expect([h.write, h.read("X")]).toEqual(["native-only", undefined])
    expect(address(addressOf({ kind: "g5x", code: "G54" }, "grbl")).write).toBe("l20-only")
    expect(addressOf({ kind: "extended", p: 1 }, "grbl")).toHaveProperty("refused")
  })
})

describe("the table", () => {
  test("work <-> machine round trip with rotation", () => {
    const e = { x: 120.5, y: -40.25, z: -300, rotation: 0.3 }
    const p = { x: 12.3, y: -4.5, z: 6.7 }
    const m = workToMachine(e, p)
    const back = machineToWork(e, m)
    expect(back.x).toBeCloseTo(p.x, 12)
    expect(back.y).toBeCloseTo(p.y, 12)
    expect(back.z).toBeCloseTo(p.z, 12)
    expect(Math.hypot(m.x - e.x, m.y - e.y)).toBeCloseTo(Math.hypot(p.x, p.y), 12)
    const t = withOffset({ entries: {} }, { kind: "g5x", code: "G55" }, e)
    expect(getOffset(t, { kind: "linuxcnc", p: 2 })).toEqual(e)
    expect(getOffset(t, { kind: "g5x", code: "G54" })).toEqual({ x: 0, y: 0, z: 0 })
  })

  test("entry schema converts degrees", () => {
    const decoded = Schema.decodeUnknownSync(OffsetEntrySchema)({ x: 1, y: 2, z: 3, rotation: 90, c: 180 })
    expect(decoded.rotation).toBeCloseTo(Math.PI / 2, 12)
    expect(decoded.c).toBeCloseTo(Math.PI, 12)
    expect(Schema.encodeSync(OffsetEntrySchema)(decoded)).toEqual({ x: 1, y: 2, z: 3, rotation: 90, c: 180 })
  })
})

describe("update policy", () => {
  const ref: WorkOffsetRef = { kind: "g5x", code: "G54" }
  const base = { entries: { G54: { x: 10, y: 20, z: 30 } } }
  const run = (policy: UpdatePolicy, d: number) => applyCorrection(base, { ref, delta: { X: d } }, policy)

  test("4 modes x 4 cases", () => {
    const tol = 0.1, deadband = 0.005, limit = 2
    const cases = [0.001, 0.05, 0.5, 3] // inside deadband, inside tolerance, outside tolerance, beyond limit
    const expected: Record<string, Array<[boolean, boolean]>> = {
      "set": [[false, false], [true, false], [true, false], [false, true]],
      "report": [[false, false], [false, false], [false, false], [false, false]],
      "update-within-tolerance": [[false, false], [true, false], [false, false], [false, true]],
      "alarm-outside-tolerance": [[true, false], [true, false], [false, true], [false, true]]
    }
    for (const mode of UPDATE_MODES) {
      cases.forEach((d, i) => {
        const r = run({ mode, tolerance: tol, deadband, limit }, d)
        expect([r.applied, r.alarm !== undefined]).toEqual(expected[mode]![i]!)
        if (r.applied) expect(r.table.entries["G54"]!.x).toBeCloseTo(10 + d, 12)
        else expect(r.table).toBe(base)
      })
    }
  })

  test("problems", () => {
    expect(policyProblem({ mode: "update-within-tolerance" })).toMatch(/tolerance/)
    expect(policyProblem({ mode: "set", deadband: 1, tolerance: 0.1 })).toMatch(/deadband/)
    expect(policyProblem({ mode: "report" })).toBeUndefined()
  })

  test("rotation judged on the angle tolerance", () => {
    const r = applyCorrection(base, { ref, delta: { X: 0.01, R: 0.002 } }, { mode: "update-within-tolerance", tolerance: 0.1, angleTolerance: 0.001 })
    expect(r.applied).toBe(true)
    expect(r.table.entries["G54"]!.x).toBeCloseTo(10.01, 12)
    expect(r.table.entries["G54"]!.rotation).toBeUndefined()
  })

  test("policyCondition decides as applyCorrection on 1000 seeded cases", () => {
    let seed = 12345
    const rnd = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
    for (let i = 0; i < 1000; i++) {
      const mode = UPDATE_MODES[Math.floor(rnd() * 4)]!
      const tolerance = 0.02 + rnd() * 0.2
      const policy: UpdatePolicy = {
        mode, tolerance,
        ...(rnd() < 0.6 ? { deadband: rnd() * 0.01 } : {}),
        ...(rnd() < 0.6 ? { limit: tolerance + rnd() * 2 } : {})
      }
      const m = rnd() * 3
      const host = run(policy, m)
      const c = policyCondition(policy, num(m))
      const lookup = () => 0
      const alarm = c.alarm !== undefined && evalCondition(c.alarm, lookup)
      const write = !alarm && (c.write === true || (c.write !== undefined && evalCondition(c.write, lookup)))
      expect([write, alarm]).toEqual([host.applied, host.alarm !== undefined])
    }
    expect(evalExpr(num(1), () => 0)).toBe(1)
  })
})
