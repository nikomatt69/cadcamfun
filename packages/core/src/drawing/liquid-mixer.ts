/**
 * The "Liquid mixer v2" part of the reference sheet (`specs/assets/reference-drawing-liquid-mixer.png`), as a feature history: the
 * acceptance fixture of the drawing generator and a worked example for the assistant.
 *
 *   block        120 x 70 x 35 with R10 corners, a figure-eight boss 10 high on top (overall height 45)
 *   Ø8 THRU ALL  2 x, counterbored Ø13.5 depth 8.5, on one diagonal of the block
 *   Ø8.1 ±0.1    2 x, countersunk 10 x 90 degrees, on the other diagonal
 *   Ø3.3 depth 12, M4-6H depth 8    3 on a Ø24 circle round each boss centre (6 in all)
 *   Ø12 +0.3/-0, depth 100          a bore into the +x side
 *   Ø18.63 depth 18, G1/2"-6H       a pipe-thread port in the +y side
 */
import { model } from "../cad/script.ts"
import type { History } from "../cad/history.ts"

export const liquidMixerHistory = (): History => {
  const m = model()
  m.extrude(m.sketch("XY", undefined, { id: "block" }).rectangle([0, 0], 120, 70), { depth: 35, corner: { style: "fillet", size: 10 }, id: "base" })
  m.extrude(m.sketch("XY", 35, { id: "bosses" }).circle([36, 35], 44).circle([77, 35], 44), { depth: 10, id: "boss" })
  // Ø8 THRU ALL with a Ø13.5 x 8.5 counterbore: top-left and bottom-right.
  const cb = m.hole({ plane: "XY", offset: 35, at: [10, 60], diameter: 8, depth: 35, kind: "counterbore", headDiameter: 13.5, headDepth: 8.5, id: "cbore" })
  m.pattern({ feature: cb, kind: "linear", count: 2, step: [100, -50, 0], id: "cbore-pair" })
  // Ø8.1 ±0.1, 10 x 90 degrees countersink: the other diagonal.
  const cs = m.hole({ plane: "XY", offset: 35, at: [10, 10], diameter: 8.1, depth: 35, kind: "countersink", headDiameter: 10, angle: 90, tolerance: { upper: 0.1, lower: -0.1 }, id: "csink" })
  m.pattern({ feature: cs, kind: "linear", count: 2, step: [100, 50, 0], id: "csink-pair" })
  // Ø3.3 depth 12 with an M4 thread: three round each boss centre on a Ø24 circle.
  const tap = (id: string, cx: number): void => {
    const h = m.hole({ plane: "XY", offset: 45, at: [cx + 12, 35], diameter: 3.3, depth: 12, thread: { designation: "M4", depth: 8, fit: "6H" }, id })
    m.pattern({ feature: h, kind: "circular", count: 3, centre: [cx, 35], id: `${id}-ring` })
  }
  tap("tap-left", 36)
  tap("tap-right", 77)
  // Side bores.
  m.hole({ plane: "YZ", offset: 120, at: [35, 17.5], diameter: 12, depth: 100, tolerance: { upper: 0.3, lower: 0 }, id: "bore" })
  m.hole({ plane: "ZX", offset: 70, at: [17.5, 60], diameter: 18.63, depth: 18, thread: { designation: "G1/2\"", depth: 18, fit: "6H" }, id: "port" })
  return m.build()
}

/** The sheet options of the reference drawing. */
export const liquidMixerSheetOptions = {
  size: "A3", projection: "first", title: "Liquid mixer Version 2", drawingNumber: "1", material: "Al 6061", colour: "N.A.", finish: "As-machined", standard: "ISO 2768-1",
  revision: "3", sheet: "1/1", author: "Hubs", date: "06/03/2018", iso: true,
  section: { axis: "y", at: 35, from: "-", letter: "B", parent: "top" },
  detail: { view: "top", centre: { x: 36, y: 35, z: 45 }, radius: 20, factor: 2, letter: "A" },
  flatness: { value: 0.01, view: "right" }
} as const
