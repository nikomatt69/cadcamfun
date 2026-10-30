/**
 * `post.options.tcp: true` on a five-axis job (spec 72 step 0.2): the post writes the tool tip in part coordinates under the control's own
 * tip-control word, and the replay carries it back to machine coordinates, so every verdict is the one the machine-coordinate job gets.
 *
 * Declared tolerances: the post splits turning moves at 0.01 mm of the tip path, so volumes of the tri-dexel replay move by the volume of a
 * 0.01 mm skin (compared at 1 %), counts of moves differ (more pieces) and are not compared. Statuses, error tags, the release and the depth of
 * the gouge are compared exactly. A rapid that turns the table follows the tip path under the tip-control word and the machine-axis line without
 * it, so the clearance minimum differs between the two; both are verdicts, only the numbers move.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { rebuildExact } from "../../cad/history-brep.ts"
import { model } from "../../cad/script.ts"
import { fiveAxisKinematic } from "../five-axis.ts"
import { swarfWalls } from "../swarf-walls.ts"
import type { PostId, PostOptions } from "../post/types.ts"
import { DEFAULT_CUTTERS, findCutter, runJob, type CamArtifact, type ManufacturingJob, type OperationSpec } from "./index.ts"
import { findMachine } from "./machines.ts"

setDefaultTimeout(300_000)

// Fixture 1: the dome on a base of the trunnion (A/C table), finished with a ball cutter along the normal.
const base = { id: "base", type: "cube", x: 0, y: 0, z: 4, width: 40, height: 40, depth: 8 }
const dome = { id: "dome", type: "sphere", x: 0, y: 0, z: 8, radius: 8 }
const ball = findCutter(DEFAULT_CUTTERS, "ball-10")!
const trunnion = findMachine("trunnion-5ax")!
const domeJob = (post: PostId, options?: Partial<PostOptions>, machine = trunnion): ManufacturingJob => ({
  schemaVersion: 1, id: "five", name: "Five-axis dome", material: "6061", part: { kind: "elements", elements: [base, dome] },
  stock: { min: { x: -22, y: -22, z: 0 }, max: { x: 22, y: 22, z: 17 } }, tools: [ball],
  operations: [{ id: "five-finish", strategy: "multiaxis", tool: ball.id, top: 17, stepover: 20, toolAxis: "normal" }],
  machine: { ...machine, post }, quality: { resolution: 0.4 }, ...(options !== undefined ? { post: { options } } : {})
})

// Fixture 2: a swarf flank cut of a conical wall (the table winds past a full turn on a continuous C axis).
const m = model()
m.extrude(m.sketch("XY").circle([0, 0], 20), { depth: 30, taper: 5 })
const history = m.build()
const cone = { id: "cone", type: "parametric", name: "Cone", x: 0, y: 0, z: 0, history }
const exact = rebuildExact(history).bodies[0]!.brep!
const wall = swarfWalls(exact).walls.find((w) => exact.faces[w.face]!.surface.kind === "cone")!.wall
const flat = findCutter(DEFAULT_CUTTERS, "flat-10")!
const winding = { ...trunnion, fiveAxis: { ...trunnion.fiveAxis!, rotation: [-720, 720] as const } }
const swarf: OperationSpec = { id: "swarf-cone", strategy: "multiaxis", mode: "swarf", tool: flat.id, top: 30, stepover: 20, walls: [wall] }
const swarfJob = (post: PostId, options?: Partial<PostOptions>): ManufacturingJob => ({
  schemaVersion: 1, id: "swarf", name: "Swarf cone", material: "6061", part: { kind: "elements", elements: [cone] },
  stock: { min: { x: -24, y: -24, z: 0 }, max: { x: 24, y: 24, z: 31 } }, tools: [flat], operations: [swarf],
  machine: { ...winding, post }, quality: { resolution: 0.5 }, ...(options !== undefined ? { post: { options } } : {})
})

const run = (j: ManufacturingJob): CamArtifact => {
  const r = runJob(j)
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}

/** The tip-control word each dialect writes, and the one the machine-coordinate program must not contain. */
const WORDS: Readonly<Record<string, RegExp>> = { fanuc: /^G43\.4 H\d+$/m, mazak: /^G43\.4 H\d+$/m, haas: /^G234 H\d+$/m, siemens: /^TRAORI$/m, heidenhain: /\bM128\b/ }
const ANY_WORD = /G43\.4|G234|TRAORI|M128/

/** The measures in a text (a number followed by mm, mm² or mm³); counts of moves are not measures, they grow with the pieces. */
const numbersIn = (text: string): number[] => [...text.matchAll(/(\d+(?:\.\d+)?) mm/g)].map((m) => Number(m[1]))
const near = (a: number, b: number, relative: number, absolute = 0): boolean => Math.abs(a - b) <= Math.max(absolute, relative * Math.max(Math.abs(a), Math.abs(b)))
/** The claim texts hold the replay's figures; they agree number by number within `relative`, the words around them exactly. */
const sameFigures = (a: string, b: string, relative: number): boolean => {
  const words = (t: string) => t.replace(/\d+(?:\.\d+)?/g, "#")
  const x = numbersIn(a), y = numbersIn(b)
  return words(a) === words(b) && x.length === y.length && x.every((v, i) => near(v, y[i]!, relative, 0.01))
}

const errorTags = (a: CamArtifact): string[] => a.issues.filter((i) => i.severity === "error").map((i) => i.tag).sort()
const gouge = (a: CamArtifact) => a.issues.find((i) => i.tag === "Gouge")

/** The verdicts of the two programs: exact where they are statuses, tags and depths, within 1 % where they are volumes of the replay. */
const expectSameVerdicts = (off: CamArtifact, on: CamArtifact): void => {
  expect(errorTags(on)).toEqual(errorTags(off))
  expect(on.release).toBe(off.release)
  expect(on.claims.map((c) => [c.id, c.status])).toEqual(off.claims.map((c) => [c.id, c.status]))
  expect(on.operations.map((o) => [o.id, o.status])).toEqual(off.operations.map((o) => [o.id, o.status]))
  for (const [i, o] of off.operations.entries()) expect(near(on.operations[i]!.removedVolume, o.removedVolume, 0.01, 1)).toBe(true)
  for (const id of ["no-gouge", "material-removed", "part-coverage"]) {
    const a = off.claims.find((c) => c.id === id), b = on.claims.find((c) => c.id === id)
    if (a === undefined || b === undefined) continue
    expect(sameFigures(a.detail, b.detail, 0.01)).toBe(true)
  }
  expect(near(on.stock.finalVolume, off.stock.finalVolume, 0.01, 2)).toBe(true)
  expect(near(on.stock.remainingVolume, off.stock.remainingVolume, 0.01, 2)).toBe(true)
  const f = off.stock.fiveAxis, g = on.stock.fiveAxis
  expect(g === undefined).toBe(f === undefined)
  if (f !== undefined && g !== undefined) {
    for (const k of ["removedLower", "removedUpper", "remainingLower", "remainingUpper"] as const) expect(near(g[k], f[k], 0.01, 2)).toBe(true)
  }
  // The depth of the gouge is the same to a hundredth of a millimetre; the volume of its rays moves with the skin of the path.
  const a = gouge(off), b = gouge(on)
  expect(b === undefined).toBe(a === undefined)
  if (a !== undefined && b !== undefined) {
    const depth = (t: string) => Number(/cuts (\d+\.\d+) mm below/.exec(t)?.[1])
    expect(Math.abs(depth(b.message) - depth(a.message))).toBeLessThanOrEqual(0.011)
    expect(sameFigures(a.message, b.message, 0.01)).toBe(true)
  }
}

describe("tcp: true gives the verdicts of the machine-coordinate job", () => {
  for (const post of ["fanuc", "mazak", "haas", "siemens", "heidenhain"] as const) {
    test(`${post}: dome finish on the A/C trunnion`, () => {
      const off = run(domeJob(post)), on = run(domeJob(post, { tcp: true }))
      expect(on.nc).toMatch(WORDS[post]!)
      expect(off.nc).not.toMatch(ANY_WORD)
      expect(on.nc).not.toBe(off.nc)
      // The replay carried the tip: it says so, and nothing in it was turned away.
      expect(on.claims.find((c) => c.id === "nc-replay")!.detail).toMatch(/tool-centre-point control and were carried to machine coordinates/)
      expect(on.claims.find((c) => c.id === "nc-replay")!.status).toBe("passed")
      expect(errorTags(on)).not.toContain("ReplayMismatch")
      expectSameVerdicts(off, on)
    })

    test(`${post}: swarf flank cut with the table winding past a full turn`, () => {
      const off = run(swarfJob(post)), on = run(swarfJob(post, { tcp: true }))
      expect(on.nc).toMatch(WORDS[post]!)
      expect(off.nc).not.toMatch(ANY_WORD)
      expect(on.claims.find((c) => c.id === "nc-replay")!.status).toBe("passed")
      expect(errorTags(on)).not.toContain("ReplayMismatch")
      // The flank cut does not gouge, within the declared error, in either frame: a verdict the old reading of part coordinates as machine
      // coordinates could not give.
      expect(on.claims.find((c) => c.id === "no-gouge")!.status).toBe("passed")
      expectSameVerdicts(off, on)
    })
  }

  test("the dome on the B/C trunnion carries B and C the same way", () => {
    const bc = findMachine("trunnion-5ax-bc")!
    const mk = (options?: Partial<PostOptions>): ManufacturingJob => ({ ...domeJob("fanuc", options, bc) })
    const off = run(mk()), on = run(mk({ tcp: true }))
    expect(on.nc).toMatch(/\bB-?\d/)
    expect(on.nc).toMatch(WORDS.fanuc!)
    expect(errorTags(on)).not.toContain("ReplayMismatch")
    expectSameVerdicts(off, on)
  })
})

describe("tcp: true is refused, never approximated", () => {
  const refused = (a: CamArtifact): string => a.issues.filter((i) => i.severity === "error" && i.tag === "UnsupportedCapability").map((i) => i.message).join(" ")

  test("a post without a tool-centre-point word", () => {
    for (const post of ["okuma", "generic", "linuxcnc"] as const) {
      const a = run(domeJob(post, { tcp: true }))
      expect(refused(a)).toMatch(/tcp: true refused: post \w+ has no tool-centre-point word/)
      expect(a.nc).toBe("")
      expect(a.release).toBe("blocked")
    }
  })

  test("a machine without a five-axis table", () => {
    const a = run(domeJob("fanuc", { tcp: true }, { ...trunnion, fiveAxis: undefined }))
    expect(refused(a)).toMatch(/has no five-axis table/)
    expect(a.nc).toBe("")
  })

  test("a three-axis machine and a three-axis job: refused too, the option says what the caller wants", () => {
    const vmc = findMachine("vmc-standard")!
    const a = run({ ...domeJob("fanuc", { tcp: true }, vmc), operations: [{ id: "face", strategy: "face", tool: flat.id, bottom: 16, stepover: 50 }], tools: [flat] })
    expect(refused(a)).toMatch(/has no five-axis table/)
  })
})

describe("the default is untouched", () => {
  test("without tcp no tip-control word is written and the NC is the one tcp: false gives", () => {
    const absent = run(domeJob("fanuc")), off = run(domeJob("fanuc", { tcp: false }))
    expect(absent.nc).not.toMatch(ANY_WORD)
    expect(absent.nc).toBe(off.nc)
    expect(absent.claims.find((c) => c.id === "nc-replay")!.detail).not.toMatch(/tool-centre-point/)
  })
})

describe("a wrong pivot is detected", () => {
  test("a program written for another pivot than the machine's fails the replay with a ReplayMismatch", () => {
    const right = trunnion.fiveAxis!
    const wrong = fiveAxisKinematic({ layout: right.layout, limits: { tilt: right.tilt }, pivot: { x: right.pivot.x, y: right.pivot.y, z: right.pivot.z + 4 }, tcp: "program" })
    const good = run(domeJob("fanuc", { tcp: true }))
    const bad = run(domeJob("fanuc", { tcp: true, kinematics: wrong }))
    expect(errorTags(good)).not.toContain("ReplayMismatch")
    expect(errorTags(bad)).toContain("ReplayMismatch")
    expect(bad.claims.find((c) => c.id === "nc-replay")!.status).toBe("failed")
    expect(bad.release).toBe("blocked")
  })

  test("the right pivot given by the caller is the same program as the one the kernel builds", () => {
    const right = trunnion.fiveAxis!
    const given = fiveAxisKinematic({ layout: right.layout, limits: { tilt: right.tilt }, pivot: right.pivot, tcp: "program" })
    expect(run(domeJob("fanuc", { tcp: true, kinematics: given })).nc).toBe(run(domeJob("fanuc", { tcp: true })).nc)
  })
})

describe("a post definition with its own tip-control blocks", () => {
  test("the blocks are read as the mode and the replay carries the tip", () => {
    const definition = { schemaVersion: 1, name: "Custom TCP", base: "fanuc", tcp: { kind: "blocks", on: "TCPMODE ON {tool}", off: "TCPMODE OFF" } }
    const mk = (options?: Partial<PostOptions>): ManufacturingJob => ({ ...domeJob("fanuc"), post: { definition, ...(options !== undefined ? { options } : {}) } })
    const off = run(mk({ tcp: false })), on = run(mk({ tcp: true }))
    expect(on.nc).toMatch(/^TCPMODE ON 1$/m)
    expect(on.claims.find((c) => c.id === "nc-replay")!.detail).toMatch(/carried to machine coordinates/)
    expect(errorTags(on)).not.toContain("ReplayMismatch")
    expectSameVerdicts(off, on)
  })
})
