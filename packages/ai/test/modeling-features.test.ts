import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { historyVolume, rebuild, type History } from "@cadcamfun/core"
import { historySchema, parametricReport } from "../src/parametric.ts"
import { CADCAM_SKILLS } from "../src/skills/index.ts"

setDefaultTimeout(60_000)

const plate = { id: "s", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: 40, height: 30 }] } }
const base = [plate, { id: "e", type: "extrude", sketch: "s", depth: 10, operation: "new" }]
const line = (id: string, offset: number, pts: Array<[number, number]>) => ({
  id, type: "sketch", plane: "XY", offset,
  sketch: {
    entities: [...pts.map(([x, y], k) => ({ id: `${id}p${k}`, kind: "point", x, y })), ...pts.slice(1).map((_, k) => ({ id: `${id}l${k}`, kind: "line", p1: `${id}p${k}`, p2: `${id}p${k + 1}` }))],
    constraints: pts.map(([x, y], k) => ({ type: "fixed", point: `${id}p${k}`, x, y }))
  }
})
const parse = (features: unknown[]) => historySchema.safeParse({ parameters: {}, features })

describe("rib, sheet metal, thread, text and press/pull reach the assistant", () => {
  test("each passes the schema and builds the part it describes", () => {
    const cases: Array<{ name: string; features: unknown[]; volume: number }> = [
      { name: "rib", features: [...base, line("w", 10, [[5, 15], [35, 15]]), { id: "rib", type: "rib", sketch: "w", thickness: 3, depth: 8 }], volume: 40 * 30 * 10 + 30 * 3 * 8 },
      { name: "pushpull", features: [...base, { id: "pp", type: "pushpull", near: [20, 15, 10], normal: [0, 0, 1], distance: 5 }], volume: 40 * 30 * 15 },
      { name: "text", features: [...base, { id: "t", type: "text", text: "A", height: 8, depth: 1, plane: "XY", offset: 10, at: [10, 10], operation: "union" }], volume: 12000 }
    ]
    for (const c of cases) {
      const parsed = parse(c.features)
      expect(parsed.success, c.name).toBe(true)
      if (!parsed.success) continue
      const built = rebuild(parsed.data as History)
      expect(built.issues.filter((i) => i.severity === "error"), c.name).toEqual([])
      if (c.name === "text") expect(historyVolume(built)).toBeGreaterThan(c.volume)
      else expect(Math.abs(historyVolume(built) - c.volume) / c.volume, c.name).toBeLessThan(1e-4)
    }
  })

  test("a sheet-metal strip reports its flat pattern in the validation report", () => {
    const parsed = parse([line("p", 0, [[0, 0], [30, 0], [30, 20]]), { id: "sh", type: "sheet", sketch: "p", thickness: 2, width: 25, bendRadius: 3, operation: "new" }])
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const report = parametricReport(parsed.data as History)
    expect(report.ok).toBe(true)
    expect(report.flatPatterns["sh"]!.lengthMm).toBeCloseTo(42 + (Math.PI / 2) * 3.88, 4)
    expect(report.flatPatterns["sh"]!.bends).toBe(1)
  })

  test("an internal thread cuts a tapped hole and an external one is a rod, both sized in the report", () => {
    const parsed = parse([...base, { id: "tap", type: "thread", kind: "internal", diameter: 8, pitch: 1.25, length: 6, at: [20, 15], offset: 2 }, { id: "stud", type: "thread", kind: "external", diameter: 6, pitch: 1, length: 8, at: [5, 5], offset: 10, operation: "union" }])
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const report = parametricReport(parsed.data as History)
    expect(report.issues.filter((i) => i.severity === "error")).toEqual([])
    expect(report.bodyCount).toBe(1)
    expect(report.bounds!.max.z).toBeCloseTo(18, 1)
  })

  test("patterns and mirrors may copy a rib, a thread or a text", () => {
    const parsed = parse([...base, line("w", 10, [[5, 5], [10, 5]]), { id: "rib", type: "rib", sketch: "w", thickness: 2, depth: 4 }, { id: "pat", type: "pattern", feature: "rib", kind: "linear", count: 3, step: [0, 8, 0] }])
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const built = rebuild(parsed.data as History)
    expect(built.issues).toEqual([])
    expect(historyVolume(built)).toBeCloseTo(40 * 30 * 10 + 3 * 5 * 2 * 4, 3)
  })

  test("references are checked: a rib needs an earlier sketch, a push/pull needs a body", () => {
    expect(parse([...base, { id: "rib", type: "rib", sketch: "nope", thickness: 2, depth: 4 }]).success).toBe(false)
    expect(parse([plate, { id: "pp", type: "pushpull", near: [0, 0, 0], distance: 1 }]).success).toBe(false)
    expect(parse([...base, { id: "t", type: "text", text: "", height: 5, depth: 1, plane: "XY", operation: "union" }]).success).toBe(false)
  })

  test("the Fusion skill documents them and no longer lists them as missing", () => {
    const skill = CADCAM_SKILLS.find((s) => s.name === "fusion-360-modelling")!
    for (const word of ["`rib`", "`sheet`", "`thread`", "`text`", "`pushpull`"]) expect(skill.body).toContain(word)
    const missing = skill.body.slice(skill.body.indexOf("## What is not there"))
    expect(missing).not.toMatch(/rib and web|emboss, thread modelling/)
  })

  test("draft and mate pass the schema, build, and are checked", () => {
    const second = [{ id: "s2", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "r2", kind: "rectangle", at: [100, 100], width: 20, height: 20 }] } }, { id: "e2", type: "extrude", sketch: "s2", depth: 10, operation: "new" }]
    const parsed = parse([...base, ...second,
      { id: "d", type: "draft", near: [40, 15, 5], normal: [1, 0, 0], angle: 5, body: "e" },
      { id: "j", type: "mate", body: "e2", face: { near: [110, 110, 0], normal: [0, 0, -1] }, to: { body: "e", near: [20, 15, 10], normal: [0, 0, 1] } }])
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const built = rebuild(parsed.data as History)
    expect(built.issues).toEqual([])
    expect(built.bodies).toHaveLength(2)
    expect(parse([plate, { id: "d", type: "draft", near: [0, 0, 0], angle: 3 }]).success).toBe(false)
    expect(parse([...base, ...second, { id: "j", type: "mate", body: "e", face: { near: [0, 0, 0] }, to: { body: "e", near: [0, 0, 0] } }]).success).toBe(false)
    expect(parse([...base, ...second, { id: "j", type: "mate", body: "e2", face: { near: [0, 0, 0] }, to: { body: "ghost", near: [0, 0, 0] } }]).success).toBe(false)
  })

  test("work planes, a sketch on a face and a hole on a plane pass the schema and build", () => {
    const parsed = parse([...base,
      { id: "top", type: "plane", from: { kind: "face", near: [20, 15, 10], normal: [0, 0, 1] } },
      { id: "tilt", type: "plane", from: { kind: "angle", base: "top", angle: 30, about: "u" } },
      { id: "s3", type: "sketch", plane: "top", sketch: { shapes: [{ id: "c", kind: "circle", at: [0, 0], diameter: 10 }] } },
      { id: "boss", type: "extrude", sketch: "s3", depth: 4, operation: "union" },
      { id: "h", type: "hole", plane: "top", at: [12, 0], diameter: 4, depth: 6 }])
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const built = rebuild(parsed.data as History)
    expect(built.issues).toEqual([])
    expect(Math.abs(historyVolume(built) - (12000 + Math.PI * 25 * 4 - Math.PI * 4 * 6)) / 12000).toBeLessThan(0.01)
    expect(parse([...base, { id: "s3", type: "sketch", plane: "nowhere", sketch: { shapes: [{ id: "c", kind: "circle", at: [0, 0], diameter: 10 }] } }]).success).toBe(false)
    expect(parse([plate, { id: "p", type: "plane", from: { kind: "face", near: [0, 0, 0] } }]).success).toBe(false)
    expect(parse([...base, { id: "p", type: "plane", from: { kind: "offset", base: "ghost", distance: 1 } }]).success).toBe(false)
  })

  test("a thread cut into a shaft and a slider joint with limits pass the schema and build", () => {
    const shaft = [{ id: "c", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "o", kind: "circle", at: [0, 0], diameter: 10 }] } }, { id: "rod", type: "extrude", sketch: "c", depth: 20, operation: "new" }]
    const cut = parse([...shaft, { id: "t", type: "thread", kind: "external", diameter: 10, pitch: 1.5, length: 12, offset: 8, cut: true }])
    expect(cut.success).toBe(true)
    if (cut.success) expect(rebuild(cut.data as History).issues).toEqual([])
    const second = [{ id: "s2", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "r2", kind: "rectangle", at: [100, 100], width: 20, height: 20 }] } }, { id: "e2", type: "extrude", sketch: "s2", depth: 10, operation: "new" }]
    const joint = parse([...base, ...second, { id: "j", type: "mate", body: "e2", face: { near: [110, 110, 0], normal: [0, 0, -1] }, to: { body: "e", near: [20, 15, 10], normal: [0, 0, 1] }, slide: [5, 0], limits: { slide: [[0, 10], [-5, 5]] } }])
    expect(joint.success).toBe(true)
    if (joint.success) expect(rebuild(joint.data as History).issues).toEqual([])
  })
})
