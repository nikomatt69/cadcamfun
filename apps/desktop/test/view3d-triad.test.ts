/** The shared triad (spec 73 §4): named arrows and labels, a right-handed frame from X and Y. */
import { expect, test } from "bun:test"
import * as THREE from "three"
import { frameAxes, triad } from "../src/viewport/view3d/triad.ts"

test("a triad names its arrows and labels; frameAxes is right handed", () => {
  const s = Math.SQRT1_2
  const axes = frameAxes({ x: 1, y: 0, z: 0 }, { x: 0, y: s, z: s })
  expect(axes.map((a) => a.name)).toEqual(["X", "Y", "Z"])
  const z = axes[2]!.direction
  expect(z.x).toBeCloseTo(0, 12)
  expect(z.y).toBeCloseTo(-s, 12)
  expect(z.z).toBeCloseTo(s, 12)
  const group = triad(axes, 40, "probe:wcs:before", { opacity: 0.4 })
  expect(group.name).toBe("probe:wcs:before")
  const arrow = group.getObjectByName("axis:Z") as THREE.ArrowHelper
  expect(arrow).toBeDefined()
  expect((arrow.cone.material as THREE.Material).opacity).toBeCloseTo(0.4)
  expect(group.getObjectByName("label:X+")?.position.x).toBeCloseTo(40 * 1.18)
})
