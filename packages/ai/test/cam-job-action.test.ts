/**
 * `cam.job` end to end (spec 69 C1-C5, spec 72 0.5): the assistant plans a two-setup job, adds fixtures and a bar stock, runs the verification
 * and reads the claims, the declared bounds and the failure reasons. The kernel is the real one; nothing is mocked.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { Schema } from "effect"
import { ACTION_CONTRACTS, CAM_ACTION_INPUTS } from "@cadcamfun/api"
import { runAction } from "../src/actions/catalogue.ts"
import type { ActionContext } from "../src/actions/action.ts"
import { CADCAM_SKILLS } from "../src/skills/index.ts"
import { nikcliWireSchema } from "../src/tools/wire-schema.ts"

setDefaultTimeout(100_000)

const context = { handlers: {}, projectId: "p" } as unknown as ActionContext
const call = async (input: Record<string, unknown>) => runAction("cam.job", input, context) as Promise<Record<string, any>>
const wire = (result: unknown) => Schema.decodeUnknownSync(ACTION_CONTRACTS["cam.job"]!.result! as Schema.Decoder<unknown>)(result)

const plate = { id: "plate", type: "cube", x: 0, y: 0, z: 0, width: 40, height: 30, depth: 8 }
const jaw = { id: "vise-jaw", min: { x: 100, y: -30, z: -40 }, max: { x: 120, y: 30, z: 40 } }
const base = { material: "6061", part: { elements: [plate] }, quality: { resolution: 0.4 } }

describe("cam.job: input schema", () => {
  const schema = CAM_ACTION_INPUTS["cam.job"] as never
  const accepts = (input: unknown) => Schema.decodeUnknownExit(schema)(input)._tag === "Success"
  test("accepts a plan, a run with fixtures and a bar, and refuses malformed jobs with the schema, not with a crash", () => {
    expect(accepts({ op: "plan", ...base, setups: [{ id: "a" }] })).toBe(true)
    expect(accepts({ op: "run", ...base, setups: [{ id: "a", orientation: "-Z", fixtures: [jaw], stockModel: { kind: "cylinder", center: { x: 0, y: 0 }, radius: 30, z0: -5, z1: 5 } }], nc: 20 })).toBe(true)
    expect(accepts({ op: "run", ...base, setups: [] })).toBe(false)
    expect(accepts({ op: "run", ...base, setups: [{ id: "a", orientation: "up" }] })).toBe(false)
    expect(accepts({ op: "run", ...base, part: {}, setups: [{ id: "a" }] })).toBe(false)
    expect(accepts({ op: "run", ...base, part: { elements: [plate], meshes: [{ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] }] }, setups: [{ id: "a" }] })).toBe(false)
    expect(accepts({ op: "verify", ...base, setups: [{ id: "a" }] })).toBe(false)
    expect(nikcliWireSchema(schema).safeParse({ op: "plan", ...base, setups: [{ id: "a" }] }).success).toBe(true)
  })
})

describe("cam.job: plan", () => {
  test("lists the operations of every setup and the coverage of the orientations: the one-sided job leaves the underside, the flip covers it", async () => {
    const one = await call({ op: "plan", ...base, setups: [{ id: "top" }] })
    expect(one["ok"]).toBe(true)
    wire(one)
    expect(one["setups"][0].operations.length).toBeGreaterThan(0)
    expect(one["coverage"].uncoveredMm2).toBeCloseTo(1200, 0)
    expect(one["notes"].join(" ")).toMatch(/faces away/)
    const two = await call({ op: "plan", ...base, setups: [{ id: "top" }, { id: "bottom", orientation: "-Z" }] })
    expect(two["coverage"].uncoveredMm2).toBe(0)
    expect(two["setups"]).toHaveLength(2)
  })
  test("an unknown machine is refused with the known ones named", async () => {
    const r = await call({ op: "plan", ...base, machine: "invented", setups: [{ id: "a" }] })
    expect(r["ok"]).toBe(false)
    expect(r["error"]).toMatch(/Unknown machine preset 'invented'.*vmc-standard/)
  })
})

describe("cam.job: run reads claims, bounds and failure reasons", () => {
  test("a two-setup job with a clear fixture: each setup has its offset, the coverage claim passes, the budget is returned term by term", async () => {
    const r = await call({ op: "run", ...base, setups: [{ id: "top", fixtures: [jaw] }, { id: "bottom", orientation: "-Z", fixtures: [jaw] }], nc: 3 })
    expect(r["ok"]).toBe(true)
    wire(r)
    expect(r["setups"].map((s: any) => s.workOffset)).toEqual(["G54", "G55"])
    expect(r["setups"][0].nc.split("\n")).toHaveLength(3)
    expect(r["setups"][0].ncHash).toMatch(/^[0-9a-f]{16,}/)
    const cov = r["claims"].find((c: any) => c.id === "part-coverage")
    expect(cov).toMatchObject({ status: "passed" })
    expect(r["claims"].filter((c: any) => c.id === "setup-workholding").map((c: any) => [c.setup, c.status])).toEqual([["top", "passed"], ["bottom", "passed"]])
    const t = r["setups"][0].tolerance
    expect(t.terms.map((x: any) => x.id)).toContain("stock-replay")
    expect(t.achievedMm).toBeGreaterThan(0)
    expect(r["notes"].join(" ")).toMatch(/not carried/)
  })

  test("a clamp in the tool's way fails the claim with its reason, the failure is listed first and the release is blocked", async () => {
    const slim = { id: "ext-6", name: "slim extension", kind: "flat", diameter: 6, flutes: 3, material: "carbide", coating: "none", fluteLength: 10, shankDiameter: 6, stickout: 12, holder: { diameter: 6, length: 30 } }
    const deep = { id: "slot", strategy: "pocket", tool: "ext-6", region: { boundary: [{ x: -6, y: -15 }, { x: 6, y: -15 }, { x: 6, y: 15 }, { x: -6, y: 15 }] }, top: 50, bottom: 5 }
    const block = { id: "block", type: "cube", x: 0, y: 0, z: 25, width: 100, height: 40, depth: 50 }
    const clamp = { id: "strap-clamp", min: { x: -1, y: -30, z: 55 }, max: { x: 1, y: 30, z: 62 } }
    const r = await call({ op: "run", material: "6061", part: { elements: [block] }, tools: [slim], quality: { resolution: 0.5 }, setups: [{ id: "top", operations: [deep], fixtures: [clamp] }] })
    expect(r["ok"]).toBe(true)
    wire(r)
    expect(r["release"]).toBe("blocked")
    const hit = r["failed"].find((c: any) => c.id === "setup-workholding")
    expect(hit).toBeDefined()
    expect(hit.detail).toMatch(/NC line \d+/)
    expect(r["issues"].some((i: any) => i.tag === "HolderCollision" && i.severity === "error")).toBe(true)
  })

  test("a bar stock is returned as the stock the replay started from, and enforceTolerance adds a failing claim that names the largest term", async () => {
    const r = await call({
      op: "run", ...base, quality: { resolution: 0.4, tolerance: 0.01, enforceTolerance: true },
      setups: [{ id: "top", stockModel: { kind: "cylinder", center: { x: 0, y: 0 }, radius: 28, z0: -4, z1: 5 } }]
    })
    expect(r["ok"]).toBe(true)
    const stock = r["setups"][0].stock
    expect(Math.abs(stock.initialMm3 - Math.PI * 28 * 28 * 9) / (Math.PI * 28 * 28 * 9)).toBeLessThan(0.03)
    const tol = r["claims"].find((c: any) => c.id === "tolerance")
    expect(tol.status).toBe("failed")
    expect(tol.detail).toMatch(/the largest is [a-z-]+ at/)
    expect(r["release"]).not.toBe("verified-program")
  })

  test("a part that does not fit the stock is a typed refusal with the kernel's own issue, not an exception", async () => {
    const r = await call({ op: "run", ...base, setups: [{ id: "top", stockModel: { kind: "cylinder", center: { x: 0, y: 0 }, radius: 5, z0: -4, z1: 5 } }] })
    expect(r["ok"]).toBe(false)
    expect(r["error"]).toMatch(/does not fit inside the stock/)
    expect(r["issues"][0]).toMatchObject({ severity: "error", tag: "InvalidInput" })
  })
})

describe("cam.job: the assistant is told how to use it", () => {
  test("the cam-five-axis skill exists, names the action, the claims it must report and the open limits", () => {
    const skill = CADCAM_SKILLS.find((s) => s.name === "cam-five-axis")!
    expect(skill).toBeDefined()
    for (const needle of ["op: \"plan\"", "failed", "unresolved", "setup-workholding", "part-coverage", "enforceTolerance", "not carried"]) expect(skill.body).toContain(needle)
  })
})
