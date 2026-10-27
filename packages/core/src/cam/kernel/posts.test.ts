import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe } from "../../cad/recipes.ts"
import { runJob, type CamArtifact, type KernelMachine, type ManufacturingJob } from "./index.ts"
import { findMachine } from "./machines.ts"
import { interpretGcode } from "../testing/gcode-interpreter.ts"

setDefaultTimeout(100_000)

/** The LinuxCNC and Klartext posts through the whole kernel: plan, post, independent replay, claims. */
const plate = buildRecipe("mounting_plate", { width: 80, depth: 50, thickness: 10, fastener: "M5", counterbore: true })
const job = (machine: KernelMachine): ManufacturingJob => ({
  schemaVersion: 1, id: "posts plate", name: "Plate", material: "6061", machine, quality: { resolution: 0.4 },
  part: { kind: "elements", elements: [{ id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, layerId: "default", history: plate.history } as never] }
})
const ok = (r: ReturnType<typeof runJob>): CamArtifact => {
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}

describe("LinuxCNC machine in the kernel", () => {
  const machine: KernelMachine = { ...findMachine("vmc-standard")!, id: "linuxcnc-vmc", name: "LinuxCNC mill", post: "linuxcnc" }
  const a = ok(runJob(job(machine)))

  test("the NC is written by the LinuxCNC post, not the generic fallback", () => {
    expect(a.machine.post).toBe("linuxcnc")
    expect(a.nc.split("\n")[0]).toBe("%")
    expect(a.nc).toMatch(/^T\d+ M6$\n^G43 H\d+$/m)
    expect(a.nc).toMatch(/^M2$/m)
    expect(a.nc).not.toMatch(/\bG84\b/)
  })

  test("threads are milled (no rigid tapping on this post) and the replay claims hold", () => {
    expect(a.operations.some((o) => o.cut === "tap")).toBe(false)
    expect(a.claims.find((c) => c.id === "nc-replay")!.status).toBe("passed")
    expect(a.claims.find((c) => c.id === "operations-complete")!.status).toBe("passed")
  })
})

describe("Heidenhain machine in the kernel", () => {
  const machine = findMachine("vmc-standard")!
  const a = ok(runJob(job({ ...machine, id: "tnc-vmc", name: "TNC mill", post: "heidenhain" })))

  test("the NC is Klartext with native circles and no bare M blocks, and the replay reads it", () => {
    const blocks = a.nc.trimEnd().split("\n").map((l) => l.replace(/^\d+ /, ""))
    expect(blocks[0]).toBe("BEGIN PGM PLATE MM")
    expect(blocks.some((b) => b.startsWith("C ") && /DR[+-]/.test(b))).toBe(true)
    expect(blocks.some((b) => /^M\d+$/.test(b))).toBe(false)
    expect(a.claims.find((c) => c.id === "nc-replay")!.status).toBe("passed")
    const replay = interpretGcode(a.nc, { start: { x: 0, y: 0, z: 40 } })
    expect(replay.errors).toEqual([])
    expect(replay.ended).toBe(true)
  })
})
