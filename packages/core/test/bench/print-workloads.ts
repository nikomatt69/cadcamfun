/**
 * Print kernel bench workloads (spec 55 E2): the slicer on a dense mesh. Inputs are built once, lazily. A workload returns a checksum
 * that depends on the work so it cannot be skipped.
 */
import { repairMesh } from "../../src/cam/print/repair.ts"
import { slicePrint } from "../../src/cam/print/index.ts"
import { sliceMesh } from "../../src/cam/print/slice.ts"

/** A UV sphere of radius r whose centre is at z = r, with about 2 * nu * (nv - 1) triangles. */
const sphere = (nu: number, nv: number, r: number): { positions: Float64Array; indices: Uint32Array } => {
  const pos: number[] = [0, 0, 0]
  for (let j = 1; j < nv; j++) for (let i = 0; i < nu; i++) {
    const phi = (Math.PI * j) / nv, th = (2 * Math.PI * i) / nu
    pos.push(r * Math.sin(phi) * Math.cos(th), r * Math.sin(phi) * Math.sin(th), r - r * Math.cos(phi))
  }
  pos.push(0, 0, 2 * r)
  const ring = (j: number, i: number) => 1 + (j - 1) * nu + (i % nu)
  const idx: number[] = []
  for (let i = 0; i < nu; i++) idx.push(0, ring(1, i + 1), ring(1, i))
  for (let j = 1; j < nv - 1; j++) for (let i = 0; i < nu; i++) {
    const a = ring(j, i), b = ring(j, i + 1), c = ring(j + 1, i), d = ring(j + 1, i + 1)
    idx.push(a, b, d, a, d, c)
  }
  const top = 1 + (nv - 1) * nu
  for (let i = 0; i < nu; i++) idx.push(top, ring(nv - 1, i), ring(nv - 1, i + 1))
  return { positions: Float64Array.from(pos), indices: Uint32Array.from(idx) }
}

const once = <T>(build: () => T): (() => T) => {
  let value: T | undefined
  return () => (value ??= build())
}

/** 499 000 triangles, 80 mm across. */
const dense = once(() => sphere(500, 500, 40))
/** 20 000 triangles for the whole pipeline (walls, skin, infill, G-code, evidence). */
const medium = once(() => sphere(100, 100, 20))

const planes = once(() => Array.from({ length: 400 }, (_, i) => 0.1 + i * 0.2))

const SETTINGS = { layerHeight: 0.2, printSpeed: 60, printTemperature: 200, bedTemperature: 60, extrusionWidth: 0.4, filamentDiameter: 1.75, infillDensity: 15, infillPattern: "lines", shellCount: 2, supportType: "none", nozzleDiameter: 0.4, bedWidth: 220, bedDepth: 220 }

export const PRINT_WORKLOADS: Readonly<Record<string, () => number>> = {
  /** Cutting 499k triangles into 400 layers: the sorted-plane sweep, segment chaining and ring nesting. */
  "slice-499k-triangles": () => sliceMesh(dense(), planes()).regions.reduce((n, r) => n + r.length, 0),
  /** Repair pre-pass (weld, orientation, manifold test) of 499k triangles, self-intersection search off. */
  "repair-499k-triangles": () => repairMesh(dense(), { checkSelfIntersections: false }).report.outputTriangles,
  /** The whole pipeline on a 20k-triangle ball: planning, G-code, planner time and the independent evidence. */
  "pipeline-20k-triangles": () => slicePrint([medium()], SETTINGS as never).stats.layers
}
