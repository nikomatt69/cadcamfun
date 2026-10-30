/**
 * CAD workflow hot paths of `bun run bench` (spec 45 K6/K7): the sketch solver on a 529-constraint sketch and one interactive
 * drag step on a compiled 200-entity sketch. Each returns a checksum.
 */
import { createSketchSession, solveSketch, type Constraint, type Sketch, type SketchEntity } from "../../src/cad/sketch.ts"

/** An n x n grid of points joined by horizontal and vertical lines, each with H/V + length: a rigid sketch (2n(n-1) lines). */
export const sketchGrid = (n: number): Sketch => {
  let seed = 7
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const entities: SketchEntity[] = []
  const constraints: Constraint[] = []
  const id = (i: number, j: number) => `p${i}_${j}`
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) entities.push({ id: id(i, j), kind: "point", x: i * 10 + (rand() - 0.5) * 0.6, y: j * 10 + (rand() - 0.5) * 0.6 })
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i + 1 < n) { entities.push({ id: `h${i}_${j}`, kind: "line", p1: id(i, j), p2: id(i + 1, j) }); constraints.push({ type: "horizontal", line: `h${i}_${j}` }, { type: "length", line: `h${i}_${j}`, value: 10 }) }
    if (j + 1 < n) { entities.push({ id: `v${i}_${j}`, kind: "line", p1: id(i, j), p2: id(i, j + 1) }); constraints.push({ type: "vertical", line: `v${i}_${j}` }, { type: "length", line: `v${i}_${j}`, value: 10 }) }
  }
  constraints.push({ type: "fixed", point: id(0, 0), x: 0, y: 0 })
  return { entities, constraints }
}

let dragSession: ReturnType<typeof createSketchSession> | undefined
let dragStep = 0

export const CAD_WORKFLOW_WORKLOADS: Readonly<Record<string, () => number>> = {
  /** Cold solve of 529 constraints (288 unknowns), analysed (rank, null space, redundancy). */
  "sketch.solve-529": () => solveSketch(sketchGrid(12)).iterations,
  /** The same sketch solved without the rank analysis: the Newton iterations alone. */
  "sketch.solve-529-newton": () => solveSketch(sketchGrid(12), { analyze: false }).iterations,
  /** One drag step of the free end of a chain of 100 points joined by 99 fixed-length lines (199 entities). */
  "sketch.drag-200": () => {
    if (dragSession === undefined) {
      const entities: SketchEntity[] = []
      const constraints: Constraint[] = []
      for (let i = 0; i < 100; i++) entities.push({ id: `p${i}`, kind: "point", x: i * 5, y: Math.sin(i / 7) * 3 })
      for (let i = 0; i < 99; i++) { entities.push({ id: `l${i}`, kind: "line", p1: `p${i}`, p2: `p${i + 1}` }); constraints.push({ type: "length", line: `l${i}`, value: 5 }) }
      constraints.push({ type: "fixed", point: "p0", x: 0, y: 0 })
      dragSession = createSketchSession({ entities, constraints })
      dragSession.solve({ analyze: false })
    }
    const r = dragSession.drag("p99", { x: 400 + 6 * Math.sin(dragStep++ / 5), y: 100 })
    return r.iterations
  }
}
