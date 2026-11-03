/**
 * The kernel's own program, replayed by the independent tri-dexel verifier (`verifyNc`): the two replays must agree. Found 2026-11-03: the
 * 3D finishing of a plain 40 x 30 x 8 plate sat 2.914 mm from a wall a 3 mm radius ball must stay 3 mm from, because the part's outer walls
 * fell inside a cell of the height-field grid; the height-field `no-gouge` claim could not see it and the tri-dexel replay reported a gouge.
 */
import { expect, setDefaultTimeout, test } from "bun:test"
import { partMeshes } from "../model/model.ts"
import { runJob } from "./execute.ts"
import { jobOfSnapshot } from "./snapshot.ts"
import { verifyNc } from "./verify-nc.ts"

setDefaultTimeout(180_000)

const plate = { id: "plate", type: "cube", width: 40, height: 30, depth: 8, x: 0, y: 0, z: 0 }

test("the kernel's face, roughing and 3D finishing of a plain plate verify clean in the independent replay, and the wall passes keep the ball radius", () => {
  const job = jobOfSnapshot({ schemaVersion: 1, id: "plate", name: "Plate", material: "6061", machine: "vmc-standard", elements: [plate] } as never)
  if (job.status !== "ok") throw new Error(job.issues.map((i) => i.message).join("; "))
  const run = runJob(job.value)
  if (run.status !== "ok") throw new Error(run.issues.map((i) => i.message).join("; "))
  const artifact = run.value
  const o = artifact.origin
  const part = partMeshes([plate] as never)!.meshes.map((m) => ({ positions: Float64Array.from(m.positions, (v, i) => v - [o.x, o.y, o.z][i % 3]!), indices: m.indices }))
  const stock = {
    min: { x: artifact.stockBounds.min.x - o.x, y: artifact.stockBounds.min.y - o.y, z: artifact.stockBounds.min.z - o.z },
    max: { x: artifact.stockBounds.max.x - o.x, y: artifact.stockBounds.max.y - o.y, z: artifact.stockBounds.max.z - o.z }
  }
  const result = verifyNc({ nc: artifact.nc, part, stock, tools: artifact.tools.map((t) => ({ number: t.number, cutter: t })), tolerance: 0.01, allowance: 0.3, cell: 0.3 })
  expect(result.findings.filter((f) => f.kind === "gouge")).toEqual([])
  expect(result.gouge.depth).toBe(0)

  // From the NC text alone: below the part's top the ball passes never come closer than its radius minus a hundredth of a millimetre.
  const lines = artifact.nc.split("\n")
  const finish = lines.findIndex((l) => l.includes("SURFACE-FINISH"))
  let z = Number.NaN, y = Number.NaN, x = Number.NaN, closest = Infinity
  for (const line of lines.slice(finish)) {
    const mz = /Z(-?[\d.]+)/.exec(line), my = /Y(-?[\d.]+)/.exec(line), mx = /X(-?[\d.]+)/.exec(line)
    if (mz) z = Number(mz[1]); if (my) y = Number(my[1]); if (mx) x = Number(mx[1])
    if (/^G0/.test(line) || !/^(G1|[XYZ])/.test(line)) continue
    if (z < -4.5 && Math.abs(x) <= 20) closest = Math.min(closest, Math.abs(y) - 15)
  }
  expect(closest).toBeGreaterThanOrEqual(3 - 0.01)
})
