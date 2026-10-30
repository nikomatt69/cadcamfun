import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { DEFAULT_CUTTERS, findCutter, runJob, type CamArtifact, type ManufacturingJob, type OperationSpec } from "./index.ts"
import { findMachine } from "./machines.ts"
import type { PostId, PostOptions } from "../post/types.ts"

setDefaultTimeout(200_000)

const base = { id: "base", type: "cube", x: 0, y: 0, z: 4, width: 40, height: 40, depth: 8 }
const dome = { id: "dome", type: "sphere", x: 0, y: 0, z: 8, radius: 8 }
const ball = findCutter(DEFAULT_CUTTERS, "ball-10")!
const stock = { min: { x: -22, y: -22, z: 0 }, max: { x: 22, y: 22, z: 17 } }
const finish: OperationSpec = { id: "five-finish", strategy: "multiaxis", tool: ball.id, top: 17, stepover: 20, toolAxis: "normal" }

const job = (post: PostId, options: Partial<PostOptions> | undefined, operations: ReadonlyArray<OperationSpec> = [finish]): ManufacturingJob => ({
  schemaVersion: 1, id: "five", name: "Five-axis dome", material: "6061", part: { kind: "elements", elements: [base, dome] },
  stock, tools: [ball], operations, machine: { ...findMachine("trunnion-5ax")!, post }, quality: { resolution: 0.4 },
  ...(options !== undefined ? { post: { options } } : {})
})

const summary = (a: CamArtifact) => ({
  errors: a.issues.filter((i) => i.severity === "error").map((i) => i.tag).sort(),
  claims: Object.fromEntries(a.claims.map((c) => [c.id, c.status])),
  removed: a.operations.map((o) => o.removedVolume),
  stock: a.stock
})

describe("explore", () => {
  for (const post of ["fanuc", "mazak", "haas", "siemens", "heidenhain"] as const) {
    test(post, () => {
      const off = runJob(job(post, undefined)), on = runJob(job(post, { tcp: true }))
      if (off.status !== "ok" || on.status !== "ok") { console.log(post, off.status, on.status); return }
      console.log(post, JSON.stringify(summary(off.value).errors), JSON.stringify(summary(on.value).errors))
      console.log(JSON.stringify(summary(off.value).claims), "\n", JSON.stringify(summary(on.value).claims))
      console.log(summary(off.value).removed, summary(on.value).removed)
      console.log(on.value.nc.split("\n").filter((l) => /G43\.4|G234|TRAORI|TRAFOOF|M128|M129/.test(l)).join(" | "))
      for (const c of off.value.claims) { const d = on.value.claims.find((x) => x.id === c.id)!; if (d.detail !== c.detail) console.log("DIFF", c.id, "\n  off:", c.detail, "\n  on: ", d.detail) }
      console.log(JSON.stringify(off.value.stock), "\n", JSON.stringify(on.value.stock))
      const m = (a: CamArtifact) => a.issues.map((i) => `${i.severity} ${i.tag}: ${i.message}`)
      console.log("ISSUE DIFF", m(off.value).filter((x) => !m(on.value).includes(x)), m(on.value).filter((x) => !m(off.value).includes(x)))
    })
  }
})
