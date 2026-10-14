import { describe, expect, test } from "bun:test"
import { circleProfileLoop, offsetLoop, polygonProfileLoop, rectangleProfileLoop, reverseLoop, roundedRectangleLoop, segmentEnd, segmentStart, type ProfileLoop } from "./sweep.ts"

const PI = Math.PI
const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol * Math.max(1, Math.abs(b)))
/** Exact signed area of a loop of lines and arcs (Green's theorem: x dy - y dx over each piece). */
const area = (l: ProfileLoop): number => l.reduce((acc, s) => {
  if (s.kind === "line") return acc + (s.a.x * s.b.y - s.b.x * s.a.y) / 2
  if (s.kind !== "arc") throw new Error("lines and arcs only")
  const { center: c, radius: r, start: a, end: e } = s
  return acc + (r * r * (e - a) + r * (c.x * (Math.sin(e) - Math.sin(a)) - c.y * (Math.cos(e) - Math.cos(a)))) / 2
}, 0)
const closed = (l: ProfileLoop) => {
  for (let i = 0; i < l.length; i++) {
    const a = segmentEnd(l[i]!), b = segmentStart(l[(i + 1) % l.length]!)
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-9)
  }
}

describe("exact profile offset", () => {
  test("a rectangle moves parallel, both ways and in either orientation", () => {
    const r = rectangleProfileLoop(0, 0, 40, 25)
    const inner = offsetLoop(r, 2)
    closed(inner)
    near(area(inner), 36 * 21)
    near(Math.abs(area(offsetLoop(reverseLoop(r), 2))), 36 * 21)
    near(area(offsetLoop(r, -3)), 46 * 31)
  })

  test("a circle keeps its centre and changes its radius", () => {
    const c = circleProfileLoop({ x: 5, y: -2 }, 10)
    const inner = offsetLoop(c, 2)
    expect(inner.length).toBe(1)
    expect(inner[0]).toMatchObject({ kind: "arc", radius: 8, center: { x: 5, y: -2 } })
    near(area(inner), PI * 64)
    expect(offsetLoop(c, -2)[0]).toMatchObject({ radius: 12 })
  })

  test("a rounded rectangle stays tangent: lines move parallel, the corner arcs shrink about their centres", () => {
    const rr = roundedRectangleLoop(0, 0, 40, 25, 5)
    const inner = offsetLoop(rr, 2)
    closed(inner)
    for (const s of inner) if (s.kind === "arc") near(s.radius, 3)
    // w h - (4 - pi) r^2 with the inset sizes; exact.
    near(area(inner), 36 * 21 - (4 - PI) * 9)
  })

  test("an L shape is mitred at its concave corner, as moveRing mitres a polygon", () => {
    const l = polygonProfileLoop([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 30 }, { x: 0, y: 30 }])
    const inner = offsetLoop(l, 1)
    closed(inner)
    near(area(inner), 28 * 8 + 8 * 20)
  })

  test("an offset that collapses the profile is refused", () => {
    expect(() => offsetLoop(rectangleProfileLoop(0, 0, 40, 25), 13)).toThrow(RangeError)
    expect(() => offsetLoop(circleProfileLoop({ x: 0, y: 0 }, 3), 3)).toThrow(RangeError)
    // The corner arcs of a rounded rectangle collapse when the wall reaches their radius.
    expect(() => offsetLoop(roundedRectangleLoop(0, 0, 40, 25, 2), 2)).toThrow(RangeError)
  })
})
