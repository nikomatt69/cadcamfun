/**
 * The fixed bench list (spec 55 §3, E2). A case builds its input once (`setup`, not timed) and `run` is timed; it returns a
 * checksum so the work cannot be skipped and two runs can be told apart when the result changes.
 */
import { booleanBrep } from "../../src/cad/brep/boolean.ts"
import { massProperties } from "../../src/cad/brep/mass.ts"
import { frame } from "../../src/cad/brep/math.ts"
import { makeBox, makeCylinder, makeSphere } from "../../src/cad/brep/primitives.ts"
import { readStepBreps, writeStepBreps } from "../../src/cad/brep/step.ts"
import { tessellateBrep } from "../../src/cad/brep/tessellate.ts"
import type { Brep } from "../../src/cad/brep/topology.ts"
import { rebuildExact } from "../../src/cad/history-brep.ts"
import { rebuild } from "../../src/cad/history.ts"
import { historyOf } from "../corpus/fixtures.ts"
import { CAM_WORKLOADS } from "./cam-workloads.ts"
import { CAM_BREADTH_WORKLOADS } from "./cam-breadth-workloads.ts"
import { CAD_WORKFLOW_WORKLOADS } from "./cad-workflow-workloads.ts"

export interface BenchCase {
  readonly id: string
  readonly run: () => number
}

const exactOf = (source: Parameters<typeof historyOf>[0]): Brep => {
  const history = historyOf(source)
  const brep = rebuildExact(history, rebuild(history)).bodies[0]?.brep
  if (brep === undefined) throw new Error("bench input has no exact model")
  return brep
}
const flange = { recipe: "flange", input: { outerDiameter: 120, boreDiameter: 40, thickness: 14, boltCount: 6, fastener: "M10" } }

/** Inputs are built lazily, once, when a case first runs (a filtered run does not pay for the others). */
const once = <T>(build: () => T): (() => T) => {
  let value: T | undefined
  return () => (value ??= build())
}
const roundedBox = once(() => exactOf({ fixture: "rounded-box" }))
const flangeBrep = once(() => exactOf(flange))
const flangeStep = once(() => writeStepBreps([{ name: "flange", brep: flangeBrep() }]))

export const BENCH_CASES: ReadonlyArray<BenchCase> = [
  { id: "boolean.box-minus-cylinder", run: () => massProperties(booleanBrep(makeBox(20, 20, 10), makeCylinder(3, 10, frame({ x: 10, y: 10, z: 0 })), "subtract").brep).volume },
  { id: "boolean.box-and-sphere", run: () => massProperties(booleanBrep(makeBox(20, 20, 20), makeSphere(12, frame({ x: 10, y: 10, z: 10 })), "intersect").brep).volume },
  { id: "history.exact-flange", run: () => { const h = historyOf(flange); return rebuildExact(h, rebuild(h)).bodies.length } },
  { id: "history.exact-rounded-box", run: () => { const h = historyOf({ fixture: "rounded-box" }); return rebuildExact(h, rebuild(h)).bodies.length } },
  { id: "tessellate.rounded-box", run: () => tessellateBrep(roundedBox()).indices.length },
  { id: "step.write-flange", run: () => writeStepBreps([{ name: "flange", brep: flangeBrep() }]).length },
  { id: "step.read-flange", run: () => readStepBreps(flangeStep()).parts.reduce((n, p) => n + p.brep.faces.length, 0) },
  ...Object.entries(CAM_WORKLOADS).map(([id, run]) => ({ id: `cam.${id}`, run })),
  ...Object.entries(CAM_BREADTH_WORKLOADS).map(([id, run]) => ({ id: `cam.${id}`, run })),
  ...Object.entries(CAD_WORKFLOW_WORKLOADS).map(([id, run]) => ({ id, run }))
]
