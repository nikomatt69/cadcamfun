/**
 * Kernel finding of the AI-to-kernel audit (2026-11-02): a fillet whose radius is larger than half of an adjacent edge is accepted
 * silently and returns a WRONG solid instead of a refusal. A 60 x 40 x 8 plate with its four vertical edges filleted at R30 cannot
 * exist (two R30 arcs need 60 mm on the 40 mm side); the history builds, `ok` is true, no issue is raised, and the plate comes out
 * 56.55 mm long instead of 60 (the four corners are cut as if the arcs overlapped).
 *
 * `test.failing` documents the defect without breaking the suite: when the kernel refuses the radius (an error issue) or builds the
 * correct overlapping-free solid, these tests start to "pass unexpectedly" and must be turned into plain `test`s.
 */
import { describe, expect, test } from "bun:test"
import { rebuild, type History } from "./history.ts"

const plate = (radius: number): History => ({
  parameters: { w: 60, h: 40, t: 8, r: radius },
  features: [
    { id: "s", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: "w", height: "h" }] } },
    { id: "plate", type: "extrude", sketch: "s", depth: "t", operation: "new" },
    { id: "round", type: "fillet", radius: "r", edges: { parallel: "z" } }
  ]
} as unknown as History)

const extent = (history: History) => {
  const out = rebuild(history)
  let min = Infinity, max = -Infinity
  for (const body of out.bodies) for (let i = 0; i < body.mesh.positions.length; i += 3) { min = Math.min(min, body.mesh.positions[i]!); max = Math.max(max, body.mesh.positions[i]!) }
  return { issues: out.issues, length: max - min }
}

describe("a fillet larger than the faces it rounds", () => {
  test("R5 is fine: the plate keeps its 60 mm length", () => {
    const { issues, length } = extent(plate(5))
    expect(issues.filter((i) => i.severity === "error")).toEqual([])
    expect(length).toBeCloseTo(60, 3)
  })

  test.failing("R30 on a 40 mm side is refused with an error, or builds the 60 mm plate: it must not silently shorten the part", () => {
    const { issues, length } = extent(plate(30))
    const refused = issues.some((i) => i.severity === "error")
    expect(refused || Math.abs(length - 60) < 1e-3).toBe(true)
  })
})
