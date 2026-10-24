/**
 * Feature fixtures shared by the exactness matrix (`history-exactness.test.ts`) and the exchange round-trip
 * (`history-roundtrip.test.ts`): one small parametric history per feature kind and option set. Each builds with the
 * scripting `model()` so it is the same history the panel and the assistant produce.
 */
import type { ModelScript } from "./script.ts"

export type Cell = { readonly id: string; readonly build: (m: ModelScript) => void; readonly meshTolerance?: number; readonly expectIssues?: boolean }

const plate = (m: ModelScript, depth = 10): string => m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth })

export const CELLS: ReadonlyArray<Cell> = [
  // extrude
  { id: "extrude.plain", build: (m) => { plate(m) } },
  { id: "extrude.down", build: (m) => { m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10, direction: "down" }) } },
  { id: "extrude.symmetric", build: (m) => { m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10, direction: "symmetric" }) } },
  { id: "extrude.edge-chamfer", build: (m) => { m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10, edge: { style: "chamfer", size: 1.5 } }) } },
  { id: "extrude.edge-fillet", build: (m) => { m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10, edge: { style: "fillet", size: 2 } }) } },
  { id: "extrude.corner-fillet", build: (m) => { m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10, corner: { style: "fillet", size: 4 } }) } },
  { id: "extrude.taper", build: (m) => { m.extrude(m.sketch("XY").rectangle([0, 0], 40, 30), { depth: 10, taper: 5 }) } },
  { id: "extrude.cylinder", build: (m) => { m.extrude(m.sketch("XY").circle([0, 0], 20), { depth: 15 }) } },
  { id: "extrude.cut", build: (m) => { const b = plate(m); m.extrude(m.sketch("XY", 10).circle([20, 15], 10), { depth: 4, direction: "down", operation: "subtract", targets: [b] }) } },
  // revolve
  { id: "revolve.full", build: (m) => { m.revolve(m.sketch("XY").rectangle([5, 0], 3, 10), { axis: "y" }) } },
  { id: "revolve.partial", build: (m) => { m.revolve(m.sketch("XY").rectangle([5, 0], 3, 10), { axis: "y", angle: 180 }) } },
  // holes
  { id: "hole.simple", build: (m) => { plate(m); m.hole({ plane: "XY", offset: 10, at: [20, 15], diameter: 8, depth: 10 }) } },
  { id: "hole.counterbore", build: (m) => { plate(m); m.hole({ plane: "XY", offset: 10, at: [20, 15], diameter: 6, depth: 10, kind: "counterbore", headDiameter: 11, headDepth: 4 }) } },
  { id: "hole.countersink", build: (m) => { plate(m); m.hole({ plane: "XY", offset: 10, at: [20, 15], diameter: 6, depth: 10, kind: "countersink", headDiameter: 12, angle: 90 }) } },
  { id: "hole.tapped", build: (m) => { plate(m); m.hole({ plane: "XY", offset: 10, at: [20, 15], diameter: 5, depth: 10, thread: { designation: "M6", depth: 8 } }) } },
  // patterns and mirrors
  { id: "pattern.linear", build: (m) => { plate(m); const h = m.hole({ plane: "XY", offset: 10, at: [6, 6], diameter: 4, depth: 10 }); m.pattern({ feature: h, kind: "linear", count: 3, step: [10, 0, 0] }) } },
  { id: "pattern.circular", build: (m) => { plate(m); const h = m.hole({ plane: "XY", offset: 10, at: [30, 15], diameter: 3, depth: 10 }); m.pattern({ feature: h, kind: "circular", count: 4, centre: [20, 15] }) } },
  { id: "pattern.grid", build: (m) => { plate(m); const h = m.hole({ plane: "XY", offset: 10, at: [6, 6], diameter: 3, depth: 10 }); m.pattern({ feature: h, kind: "grid", count: 3, step: [10, 0, 0], countB: 2, stepB: [0, 10, 0] }) } },
  { id: "pattern.bodies", build: (m) => { const b = m.extrude(m.sketch("XY").circle([0, 0], 8), { depth: 5 }); m.pattern({ bodies: [b], kind: "linear", count: 3, step: [20, 0, 0] }) } },
  { id: "mirror.feature", build: (m) => { plate(m); const h = m.hole({ plane: "XY", offset: 10, at: [6, 6], diameter: 4, depth: 10 }); m.mirror({ feature: h, plane: "ZX", offset: 15 }) } },
  { id: "mirror.bodies-join", build: (m) => { const b = m.extrude(m.sketch("XY").rectangle([0, 0], 20, 10), { depth: 5 }); m.mirror({ bodies: [b], plane: "YZ", offset: 0, join: true }) } },
  // sweep, loft
  { id: "sweep.line", build: (m) => { const p = m.sketch("XY").circle([0, 0], 6); const path = m.sketch("ZX").path([[0, 0], [30, 0]]); m.sweep(p, path) } },
  { id: "sweep.bent", build: (m) => { const p = m.sketch("XY").circle([0, 0], 4); const path = m.sketch("ZX").path([[0, 0], [30, 0], [30, 25]]); m.sweep(p, path, { bendRadius: 8 }) } },
  { id: "loft.rect-rect", build: (m) => { const a = m.sketch("XY").rectangle([0, 0], 30, 30); const b = m.sketch("XY", 25).rectangle([5, 5], 20, 20); m.loft([a, b]) } },
  { id: "loft.rect-circle", build: (m) => { const a = m.sketch("XY").rectangle([-15, -15], 30, 30); const b = m.sketch("XY", 25).circle([0, 0], 10); m.loft([a, b]) } },
  // shell
  { id: "shell.extrusion", build: (m) => { const b = plate(m, 20); m.shell(b, { thickness: 2, open: "top" }) } },
  { id: "shell.revolution", build: (m) => { const b = m.revolve(m.sketch("XY").rectangle([0, 0], 10, 20), { axis: "y" }); m.shell(b, { thickness: 2, open: "top" }) } },
  { id: "shell.boolean-result", build: (m) => { const b = plate(m, 20); m.extrude(m.sketch("XY", 20).circle([20, 15], 8), { depth: 10, operation: "union", targets: [b] }); m.shell(b, { thickness: 2, open: "bottom" }) } },
  // blends
  { id: "fillet.straight", build: (m) => { plate(m); m.fillet({ radius: 2, edges: { parallel: "z" } }) } },
  { id: "fillet.top-rim-cylinder", build: (m) => { m.extrude(m.sketch("XY").circle([0, 0], 12), { depth: 15 }); m.fillet({ radius: 2, edges: { curved: true, within: { min: [-20, -20, 14], max: [20, 20, 16] } } }) } },
  { id: "fillet.variable", build: (m) => { plate(m); m.fillet({ radius: 1, edges: { parallel: "z", within: { min: [-1, -1, -1], max: [1, 1, 11] } } }) } },
  { id: "fillet.non-coaxial", build: (m) => {
    const a = m.extrude(m.sketch("XY").circle([0, 0], 10), { depth: 40 })
    m.extrude(m.sketch("YZ", 0).circle([0, 20], 6), { depth: 20, operation: "union", targets: [a] })
    m.fillet({ radius: 1.5, edges: { curved: true, within: { min: [-12, -12, 10], max: [12, 12, 30] } } })
  }, expectIssues: true },  // known gap (spec 43 B1): the pipe T intersection curve is not found as a blend edge
  { id: "chamfer.straight", build: (m) => { plate(m); m.chamfer({ size: 1.5, edges: { parallel: "z" } }) } },
  // face edits
  { id: "pushpull.planar", build: (m) => { plate(m); m.pushPull({ near: [20, 15, 10], normal: [0, 0, 1], distance: 4 }) } },
  { id: "draft.planar", build: (m) => { plate(m); m.draft({ near: [0, 15, 5], normal: [-1, 0, 0], angle: 3, pull: [0, 0, 1], neutral: 0 }) } },
  { id: "pushpull.curved", build: (m) => { m.extrude(m.sketch("XY").circle([0, 0], 10), { depth: 15 }); m.pushPull({ near: [10, 0, 7], normal: [1, 0, 0], distance: 2 }) } },
  { id: "draft.curved", build: (m) => { m.extrude(m.sketch("XY").circle([0, 0], 10), { depth: 15 }); m.draft({ near: [10, 0, 7], normal: [1, 0, 0], angle: 3, pull: [0, 0, 1], neutral: 0 }) } },
  { id: "pushpull.hole", build: (m) => { plate(m); m.hole({ plane: "XY", offset: 10, at: [20, 15], diameter: 8, depth: 10 }); m.pushPull({ near: [24, 15, 5], distance: 1 }) } },
  { id: "pushpull.fillet", build: (m) => { plate(m); m.fillet({ radius: 3, edges: { parallel: "z" } }); m.pushPull({ near: [0.88, 0.88, 5], distance: 1 }) } },
  { id: "pushpull.fillet-open", build: (m) => { plate(m); m.fillet({ radius: 3, edges: { parallel: "z", within: { min: [-1, -1, -1], max: [1, 1, 11] } } }); m.pushPull({ near: [0.88, 0.88, 5], distance: 1 }) } },
  { id: "pushpull.boss", build: (m) => { plate(m); m.extrude(m.sketch("XY", 10).circle([20, 15], 8), { depth: 8, operation: "union" }); m.pushPull({ near: [24, 15, 14], distance: 1.5 }) } },
  { id: "draft.hole", build: (m) => { plate(m); m.hole({ plane: "XY", offset: 10, at: [20, 15], diameter: 6, depth: 10 }); m.draft({ near: [23, 15, 5], angle: 2, pull: [0, 0, 1], neutral: 10 }) } },
  { id: "draft.boss", build: (m) => { plate(m); m.extrude(m.sketch("XY", 10).circle([20, 15], 8), { depth: 8, operation: "union" }); m.draft({ near: [24, 15, 14], angle: 4, pull: [0, 0, 1], neutral: 10 }) } },
  // catalogue
  { id: "primitive.cube", build: (m) => { m.primitive({ element: "cube", params: { width: 10, height: 20, depth: 30 } }) } },
  { id: "primitive.cylinder", build: (m) => { m.primitive({ element: "cylinder", params: { radius: 5, height: 12 } }) } },
  { id: "primitive.cone", build: (m) => { m.primitive({ element: "cone", params: { radius: 5, height: 12 } }) } },
  { id: "primitive.sphere", build: (m) => { m.primitive({ element: "sphere", params: { radius: 6 } }) } },
  { id: "primitive.torus", build: (m) => { m.primitive({ element: "torus", params: { radius: 10, tubeRadius: 2 } }) } },
  { id: "primitive.prism", build: (m) => { m.primitive({ element: "prism", params: { radius: 6, height: 10, sides: 6 } }) } },
  { id: "primitive.ellipsoid", build: (m) => { m.primitive({ element: "ellipsoid", params: { radiusX: 8, radiusY: 5, radiusZ: 4 } }) } },
  { id: "primitive.gear", build: (m) => { m.primitive({ element: "gear", params: { moduleValue: 2, teeth: 16, thickness: 8 } }) } },
  { id: "primitive.capsule", build: (m) => { m.primitive({ element: "capsule", params: { radius: 3, height: 14 } }) } },
  { id: "primitive.hemisphere", build: (m) => { m.primitive({ element: "hemisphere", params: { radius: 6 } }) } },
  // other features
  { id: "coil.round", build: (m) => { m.coil({ radius: 8, pitch: 4, turns: 5, wireDiameter: 1.2 }) } },
  { id: "thread.external", build: (m) => { m.extrude(m.sketch("XY").circle([0, 0], 3), { depth: 14 }); m.thread({ kind: "external", diameter: 6, pitch: 1, length: 8, at: [0, 0], offset: 0 }) } },
  { id: "thread.internal", build: (m) => { plate(m, 12); m.thread({ kind: "internal", diameter: 6, pitch: 1, length: 8, at: [20, 15], offset: 2 }) } },
  { id: "thread.left", build: (m) => { m.extrude(m.sketch("XY").circle([0, 0], 3), { depth: 14 }); m.thread({ kind: "external", diameter: 6, pitch: 1, length: 8, at: [0, 0], offset: 0, handedness: "left" }) } },
  { id: "thread.cut", build: (m) => { m.extrude(m.sketch("XY").circle([0, 0], 3), { depth: 14 }); m.thread({ kind: "external", diameter: 6, pitch: 1, length: 8, at: [0, 0], offset: 2, cut: true }) } },
  { id: "thread.axisX", build: (m) => { m.thread({ kind: "external", diameter: 8, pitch: 1.25, length: 10, at: [0, 0], offset: 0, axis: "x" }) } },
  { id: "rib", build: (m) => { plate(m); m.rib(m.sketch("ZX", 15).path([[10, 0], [10, 40]]), { thickness: 3, depth: 10 }) } },
  { id: "sheet.flange", build: (m) => { const path = m.sketch("ZX").path([[0, 0], [40, 0]]).toString(); m.add({ id: "sheet1", type: "sheet", sketch: path, thickness: 2, width: 30, bendRadius: 2, operation: "new", flanges: [{ end: "end", length: 12, angle: 90 }] }) } },
  { id: "text", build: (m) => { plate(m, 4); m.text({ text: "AB", height: 8, depth: 1, plane: "XY", offset: 4, at: [5, 10] }) } },
  { id: "scale.uniform", build: (m) => { plate(m); m.scale({ factor: 1.5 }) } },
  { id: "scale.nonuniform", build: (m) => { plate(m); m.scale({ factor: [1, 2, 3] }) } },
  { id: "move.rotate", build: (m) => { plate(m); m.move({ rotate: { axis: "z", angle: 30 }, translate: [5, 0, 0] }) } },
  { id: "split.above", build: (m) => { plate(m); m.split({ plane: "XY", offset: 5, keep: "above" }) } },
  { id: "combine.cut", build: (m) => { const a = plate(m); const b = m.extrude(m.sketch("XY", 2).circle([20, 15], 6), { depth: 4, operation: "new" }); m.combine({ target: a, tools: [b], operation: "cut" }) } }
]

