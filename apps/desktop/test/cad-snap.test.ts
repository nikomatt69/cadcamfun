/**
 * Snap points: every kind of the Snap Settings panel, on the elements the editor draws, with the tolerance, the priorities
 * and the anchor that perpendicular, tangent and parallel need, and the hook that publishes the indicator.
 */
import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { SnapType, defaultSnapSettings, snapPoint, snapPointAlongAxes } from "../src/features/cad/lib/enanchedSnapService.ts"
import { createSnap } from "../src/features/cad/hooks/createSnap.ts"
import { useElementsStore } from "../src/features/cad/store/elementsStore.ts"

const none = Object.fromEntries(Object.values(SnapType).map((type) => [type, false])) as Record<SnapType, boolean>
/** Only the given kinds on, with a tolerance of 10 units. */
const only = (...kinds: SnapType[]) => ({ ...defaultSnapSettings, tolerance: 10, types: { ...none, ...Object.fromEntries(kinds.map((kind) => [kind, true])) } })
const at = (x: number, y: number, z = 0) => ({ x, y, z })
const line = (x1: number, y1: number, x2: number, y2: number) => ({ id: `l${x1}${y1}${x2}${y2}`, type: "line", x1, y1, z1: 0, x2, y2, z2: 0 })
const circle = (x: number, y: number, radius: number) => ({ id: `c${x}${y}`, type: "circle", x, y, z: 0, radius })
const rectangle = (x: number, y: number, width: number, height: number) => ({ id: `r${x}${y}`, type: "rectangle", x, y, z: 0, width, height })
const snapOf = (point: ReturnType<typeof at>, elements: any[], settings = only(), anchor?: ReturnType<typeof at>) => snapPoint(point, elements, settings, anchor)
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6)

describe("snap points: the plane", () => {
  test("disabled, or nothing within tolerance, leaves the point alone", () => {
    const off = { ...only(SnapType.GRID, SnapType.ENDPOINT), enabled: false }
    expect(snapOf(at(13, 27), [line(0, 0, 100, 0)], off)).toMatchObject({ x: 13, y: 27, type: SnapType.NEAREST })
    const far = snapOf(at(500, 500), [line(0, 0, 100, 0)], only(SnapType.ENDPOINT, SnapType.MIDPOINT))
    expect(far).toMatchObject({ x: 500, y: 500, type: SnapType.NEAREST })
    expect(far.source).toBeUndefined()
  })

  test("grid rounds to the grid size", () => {
    expect(snapOf(at(13, 27), [], { ...only(SnapType.GRID), gridSize: 10, tolerance: 20 })).toMatchObject({ x: 10, y: 30, type: SnapType.GRID })
    expect(snapOf(at(13, 27), [], { ...only(SnapType.GRID), gridSize: 5, tolerance: 20 })).toMatchObject({ x: 15, y: 25, type: SnapType.GRID })
  })

  test("a line offers its two ends and its middle", () => {
    const l = line(0, 0, 100, 0)
    expect(snapOf(at(98, 3), [l], only(SnapType.ENDPOINT))).toMatchObject({ x: 100, y: 0, type: SnapType.ENDPOINT })
    expect(snapOf(at(2, -3), [l], only(SnapType.ENDPOINT))).toMatchObject({ x: 0, y: 0, type: SnapType.ENDPOINT })
    expect(snapOf(at(52, 4), [l], only(SnapType.MIDPOINT))).toMatchObject({ x: 50, y: 0, type: SnapType.MIDPOINT })
    // A kind that is off does not snap.
    expect(snapOf(at(52, 4), [l], only(SnapType.ENDPOINT)).type).toBe(SnapType.NEAREST)
  })

  test("a circle offers its centre and four quadrants", () => {
    const c = circle(0, 0, 50)
    expect(snapOf(at(1, 2), [c], only(SnapType.CENTER))).toMatchObject({ x: 0, y: 0, type: SnapType.CENTER })
    for (const [x, y] of [[50, 0], [-50, 0], [0, 50], [0, -50]] as const) {
      expect(snapOf(at(x + 2, y - 2), [c], only(SnapType.QUADRANT))).toMatchObject({ x, y, type: SnapType.QUADRANT })
    }
  })

  test("a rectangle offers corners, side midpoints and its centre, rotated or not", () => {
    const r = rectangle(0, 0, 40, 20)
    expect(snapOf(at(21, 11), [r], only(SnapType.ENDPOINT))).toMatchObject({ x: 20, y: 10, type: SnapType.ENDPOINT })
    expect(snapOf(at(1, 11), [r], only(SnapType.MIDPOINT))).toMatchObject({ x: 0, y: 10, type: SnapType.MIDPOINT })
    expect(snapOf(at(2, 2), [r], only(SnapType.CENTER))).toMatchObject({ x: 0, y: 0, type: SnapType.CENTER })
    const turned = snapOf(at(-9, 19), [{ ...r, angle: 90 }], only(SnapType.ENDPOINT))
    expect(turned.type).toBe(SnapType.ENDPOINT)
    near(turned.x, -10); near(turned.y, 20)
  })

  test("the nearest point on an edge: line, circle and rectangle outline", () => {
    const onLine = snapOf(at(30, 4), [line(0, 0, 100, 0)], only(SnapType.NEAREST))
    expect(onLine).toMatchObject({ x: 30, y: 0, type: SnapType.NEAREST })
    expect(onLine.source).toBeDefined()
    const onCircle = snapOf(at(60, 0), [circle(0, 0, 55)], only(SnapType.NEAREST))
    near(onCircle.x, 55); near(onCircle.y, 0)
    const onRect = snapOf(at(5, 12), [rectangle(0, 0, 40, 20)], only(SnapType.NEAREST))
    expect(onRect).toMatchObject({ x: 5, y: 10, type: SnapType.NEAREST })
    expect(onRect.source).toBeDefined()
    // It never beats a real snap: the endpoint wins over the point on the edge next to it.
    expect(snapOf(at(98, 1), [line(0, 0, 100, 0)], only(SnapType.NEAREST, SnapType.ENDPOINT))).toMatchObject({ x: 100, y: 0, type: SnapType.ENDPOINT })
  })

  test("crossings: line with line, line with circle, circle with circle", () => {
    const x = only(SnapType.INTERSECTION)
    expect(snapOf(at(52, 49), [line(0, 0, 100, 100), line(0, 100, 100, 0)], x)).toMatchObject({ x: 50, y: 50, type: SnapType.INTERSECTION })
    const lc = snapOf(at(29, 2), [line(-100, 0, 100, 0), circle(0, 0, 30)], x)
    expect(lc.type).toBe(SnapType.INTERSECTION); near(Math.abs(lc.x), 30); near(lc.y, 0)
    const cc = snapOf(at(25, 21), [circle(0, 0, 30), circle(40, 0, 30)], x)
    expect(cc.type).toBe(SnapType.INTERSECTION); near(cc.x, 20)
    // Parallel lines never cross.
    expect(snapOf(at(50, 5), [line(0, 0, 100, 0), line(0, 10, 100, 10)], x).type).toBe(SnapType.NEAREST)
  })

  test("crossings at the edge of a segment and with a rectangle are not lost", () => {
    const x = only(SnapType.INTERSECTION)
    // A vertical line met exactly at its end, and an axis-aligned cross: no rounding slack needed.
    expect(snapOf(at(31, 1), [line(30, 0, 30, 50), line(0, 0, 60, 0)], x)).toMatchObject({ x: 30, y: 0, type: SnapType.INTERSECTION })
    expect(snapOf(at(30, 26), [line(30, 0, 30, 50), line(0, 25, 60, 25)], x)).toMatchObject({ x: 30, y: 25 })
    // Segments that only meet when extended do not cross.
    expect(snapOf(at(60, 60), [line(0, 0, 40, 40), line(100, 0, 60, 40)], x).type).toBe(SnapType.NEAREST)
    // A line through a rectangle crosses both sides.
    const r = rectangle(0, 0, 40, 20)
    expect(snapOf(at(21, 1), [r, line(-50, 0, 50, 0)], x)).toMatchObject({ x: 20, y: 0, type: SnapType.INTERSECTION })
    expect(snapOf(at(-21, -1), [r, line(-50, 0, 50, 0)], x)).toMatchObject({ x: -20, y: 0 })
    // A line that stops short of the circle never reaches it; one that is tangent touches once.
    expect(snapOf(at(29, 2), [line(-100, 0, 10, 0), circle(0, 0, 30)], x).type).toBe(SnapType.NEAREST)
    const touch = snapOf(at(1, 29), [line(-50, 30, 50, 30), circle(0, 0, 30)], x)
    expect(touch.type).toBe(SnapType.INTERSECTION); near(touch.y, 30)
  })

  test("alignment with the points of other elements, horizontally and vertically", () => {
    const l = line(0, 0, 100, 50)
    expect(snapOf(at(60, 53), [l], only(SnapType.HORIZONTAL))).toMatchObject({ x: 60, y: 50, type: SnapType.HORIZONTAL })
    expect(snapOf(at(97, 20), [l], only(SnapType.VERTICAL))).toMatchObject({ x: 100, y: 20, type: SnapType.VERTICAL })
  })

  test("the midpoint between two points of the drawing (equidistant)", () => {
    const eq = { ...only(SnapType.EQUIDISTANT), smartTolerance: 15 }
    // However far apart the two points are, the middle between them snaps (it used to need them within 30 units).
    expect(snapOf(at(52, 3), [circle(0, 0, 5), circle(100, 0, 5)], eq)).toMatchObject({ x: 50, y: 0, type: SnapType.EQUIDISTANT })
    expect(snapOf(at(21, 2), [circle(0, 0, 5), circle(40, 0, 5)], eq)).toMatchObject({ x: 20, y: 0, type: SnapType.EQUIDISTANT })
    expect(snapOf(at(30, 30), [circle(0, 0, 5), circle(100, 0, 5)], eq).type).toBe(SnapType.NEAREST)
  })

  test("a higher priority wins at the same distance, a closer point wins otherwise", () => {
    // Endpoint (10) and a grid point (1) on the same spot: the endpoint is reported.
    expect(snapOf(at(100, 0), [line(0, 0, 100, 0)], only(SnapType.GRID, SnapType.ENDPOINT))).toMatchObject({ type: SnapType.ENDPOINT })
    // The cursor is closer to the midpoint than to the end: closer wins.
    expect(snapOf(at(55, 0), [line(0, 0, 100, 0)], only(SnapType.ENDPOINT, SnapType.MIDPOINT)).type).toBe(SnapType.MIDPOINT)
  })
})

describe("snap points: solids", () => {
  const all = only(SnapType.CENTER, SnapType.ENDPOINT, SnapType.QUADRANT)
  test("a cube: its eight corners and its centre", () => {
    const cube = { id: "k", type: "cube", x: 0, y: 0, z: 0, width: 20, height: 10, depth: 30 }
    expect(snapOf(at(11, 6, 14), [cube], only(SnapType.ENDPOINT))).toMatchObject({ x: 10, y: 5, z: 15, type: SnapType.ENDPOINT })
    expect(snapOf(at(-9, -4, -14), [cube], only(SnapType.ENDPOINT))).toMatchObject({ x: -10, y: -5, z: -15 })
    expect(snapOf(at(1, 1, 1), [cube], only(SnapType.CENTER))).toMatchObject({ x: 0, y: 0, z: 0, type: SnapType.CENTER })
  })

  test("a sphere: its centre and its six quadrant points", () => {
    const sphere = { id: "s", type: "sphere", x: 0, y: 0, z: 0, radius: 25 }
    expect(snapOf(at(1, 1, 1), [sphere], all)).toMatchObject({ x: 0, y: 0, z: 0, type: SnapType.CENTER })
    expect(snapOf(at(24, 1, 0), [sphere], only(SnapType.QUADRANT))).toMatchObject({ x: 25, y: 0, z: 0 })
    expect(snapOf(at(0, 1, 24), [sphere], only(SnapType.QUADRANT))).toMatchObject({ x: 0, y: 0, z: 25 })
  })

  test("a cylinder stands on Z: centre, both ends of the axis, the quadrants of both end circles", () => {
    const cylinder = { id: "y", type: "cylinder", x: 0, y: 0, z: 0, radius: 10, height: 40 }
    expect(snapOf(at(1, 1, 1), [cylinder], all)).toMatchObject({ x: 0, y: 0, z: 0, type: SnapType.CENTER })
    expect(snapOf(at(1, 1, 19), [cylinder], only(SnapType.ENDPOINT))).toMatchObject({ x: 0, y: 0, z: 20, type: SnapType.ENDPOINT })
    expect(snapOf(at(1, 1, -19), [cylinder], only(SnapType.ENDPOINT))).toMatchObject({ x: 0, y: 0, z: -20 })
    expect(snapOf(at(9, 1, 19), [cylinder], only(SnapType.QUADRANT))).toMatchObject({ x: 10, y: 0, z: 20, type: SnapType.QUADRANT })
    expect(snapOf(at(1, -9, -19), [cylinder], only(SnapType.QUADRANT))).toMatchObject({ x: 0, y: -10, z: -20 })
  })

  test("a cone: the apex, the base centre, and the quadrants of the base only", () => {
    const cone = { id: "n", type: "cone", x: 0, y: 0, z: 0, radius: 10, height: 40 }
    expect(snapOf(at(1, 1, 19), [cone], only(SnapType.ENDPOINT))).toMatchObject({ x: 0, y: 0, z: 20 })
    expect(snapOf(at(9, 1, -19), [cone], only(SnapType.QUADRANT))).toMatchObject({ x: 10, y: 0, z: -20 })
    expect(snapOf(at(9, 1, 19), [cone], only(SnapType.QUADRANT)).type).toBe(SnapType.NEAREST)
  })

  test("a torus: its centre and the outer edge of the ring", () => {
    const torus = { id: "t", type: "torus", x: 0, y: 0, z: 0, radius: 30, tubeRadius: 5 }
    expect(snapOf(at(1, 1), [torus], only(SnapType.CENTER))).toMatchObject({ x: 0, y: 0, type: SnapType.CENTER })
    expect(snapOf(at(34, 1), [torus], only(SnapType.QUADRANT))).toMatchObject({ x: 35, y: 0, type: SnapType.QUADRANT })
    expect(snapOf(at(-1, -34), [torus], only(SnapType.QUADRANT))).toMatchObject({ x: 0, y: -35 })
  })
})

describe("snap points: relative to the start point", () => {
  const horizontal = line(0, 0, 100, 0)
  const start = at(30, 50)

  test("perpendicular: the foot of the perpendicular from the start point onto a line", () => {
    const perpendicular = only(SnapType.PERPENDICULAR)
    expect(snapOf(at(33, 4), [horizontal], perpendicular, start)).toMatchObject({ x: 30, y: 0, type: SnapType.PERPENDICULAR })
    // The foot has to lie on the segment itself.
    expect(snapOf(at(133, 4), [horizontal], perpendicular, at(130, 50)).type).toBe(SnapType.NEAREST)
  })

  test("tangent: the points where a line from the start point just touches a circle", () => {
    const tangent = only(SnapType.TANGENT)
    const from = at(100, 0), c = circle(0, 0, 30)
    const x = (30 * 30) / 100, y = 30 * Math.sqrt(1 - (30 / 100) ** 2)
    const upper = snapOf(at(x + 1, y - 1), [c], tangent, from)
    expect(upper.type).toBe(SnapType.TANGENT); near(upper.x, x); near(upper.y, y)
    const lower = snapOf(at(x + 1, -y + 1), [c], tangent, from)
    near(lower.y, -y)
    // From inside the circle there is no tangent.
    expect(snapOf(at(5, 5), [c], tangent, at(1, 1)).type).toBe(SnapType.NEAREST)
  })

  test("parallel: the cursor pulled onto the line through the start point that runs like another line", () => {
    const parallel = only(SnapType.PARALLEL)
    expect(snapOf(at(40, 53), [horizontal], parallel, start)).toMatchObject({ x: 40, y: 50, type: SnapType.PARALLEL })
    const diagonal = snapOf(at(66, 72), [line(0, 0, 100, 100)], parallel, at(30, 30))
    near(diagonal.x, diagonal.y); expect(diagonal.type).toBe(SnapType.PARALLEL)
  })

  test("without a start point none of the three can apply, with the line being drawn they do", () => {
    const three = only(SnapType.PERPENDICULAR, SnapType.TANGENT, SnapType.PARALLEL)
    expect(snapOf(at(33, 4), [horizontal, circle(0, 0, 30)], three).type).toBe(SnapType.NEAREST)
    const drawing = { id: "d", type: "line", isActive: true, x1: 30, y1: 50, z1: 0, x2: 30, y2: 50, z2: 0 }
    expect(snapOf(at(33, 4), [horizontal, drawing], only(SnapType.PERPENDICULAR)).type).toBe(SnapType.PERPENDICULAR)
  })
})

describe("the snap hook", () => {
  test("toggling a kind or the whole snap changes what snaps, and the indicator follows", () => {
    createRoot((dispose) => {
      useElementsStore.setState({ elements: [line(0, 0, 100, 0) as never] })
      const snap = createSnap()
      snap.updateSnapSettings({ enabled: true, tolerance: 10, types: { ...none, endpoint: true } as never })
      const hit = snap.snapToPoint({ x: 97, y: 2 })
      expect(hit).toMatchObject({ x: 100, y: 0, type: SnapType.ENDPOINT })
      expect(snap.snapIndicator()).toMatchObject({ visible: true, type: SnapType.ENDPOINT })

      snap.toggleSnapType(SnapType.ENDPOINT)
      expect(snap.snapSettings().types.endpoint).toBe(false)
      snap.snapToPoint({ x: 97, y: 2 })
      expect(snap.snapIndicator().visible).toBe(false)

      snap.toggleSnapType(SnapType.NEAREST)
      snap.snapToPoint({ x: 40, y: 3 })
      expect(snap.snapIndicator()).toMatchObject({ visible: true, type: SnapType.NEAREST })
      snap.snapToPoint({ x: 400, y: 300 })
      expect(snap.snapIndicator().visible).toBe(false)

      snap.updateSnapSettings({ enabled: false })
      expect(snap.snapToPoint({ x: 40, y: 3 })).toMatchObject({ x: 40, y: 3 })
      useElementsStore.setState({ elements: [] })
      dispose()
    })
  })
})

describe("the snap marker", () => {
  test("every kind of snap has a marker to draw", async () => {
    const { installDom } = await import("./helpers/dom.ts")
    installDom("http://localhost/cad")
    const { render } = await import("solid-js/web")
    const { default: SnapIndicator } = await import("../src/features/cad/components/SnapIndicator.tsx")
    for (const type of Object.values(SnapType)) {
      const root = document.createElement("div")
      document.body.append(root)
      const dispose = render(() => SnapIndicator({ x: 10, y: 10, type, visible: true }), root)
      try {
        expect(root.querySelector("div div"), `no marker for ${type}`).not.toBeNull()
      } finally { dispose(); root.remove() }
    }
    // And nothing at all while there is no snap.
    const root = document.createElement("div")
    document.body.append(root)
    const dispose = render(() => SnapIndicator({ x: 10, y: 10, type: SnapType.GRID, visible: false }), root)
    expect(root.querySelector("div")).toBeNull()
    dispose(); root.remove()
  })
})

describe("snapping a part that is moved with the gizmo", () => {
  const cube: any = { id: "k", type: "cube", x: 100, y: 50, z: 0, width: 20, height: 20, depth: 20 }
  const kinds = only(SnapType.ENDPOINT, SnapType.CENTER, SnapType.GRID, SnapType.NEAREST)

  test("along one axis the nearest point is measured on that axis alone", () => {
    // Sliding along X at y=0: the cube's centre is 50 off the line in Y, but 1 away in X, so it is caught.
    const hit = snapPointAlongAxes(at(99, 0, 0), [cube], kinds, ["x"])
    expect(hit).toMatchObject({ x: 100, type: SnapType.CENTER })
    // In 3D the same cursor is nowhere near it.
    expect(snapOf(at(99, 0, 0), [cube], only(SnapType.ENDPOINT, SnapType.CENTER)).type).toBe(SnapType.NEAREST)
  })

  test("in a plane both axes count; the third is ignored", () => {
    expect(snapPointAlongAxes(at(98, 52, 400), [cube], kinds, ["x", "y"])).toMatchObject({ x: 100, y: 50, type: SnapType.CENTER })
    expect(snapPointAlongAxes(at(98, 80, 0), [cube], kinds, ["x", "y"])).toBeUndefined()
  })

  test("nothing within the tolerance, nothing to snap, snapping off: no snap", () => {
    expect(snapPointAlongAxes(at(60, 0, 0), [cube], kinds, ["x"])).toBeUndefined()
    expect(snapPointAlongAxes(at(99, 0, 0), [], kinds, ["x"])).toBeUndefined()
    expect(snapPointAlongAxes(at(99, 0, 0), [cube], { ...kinds, enabled: false }, ["x"])).toBeUndefined()
    expect(snapPointAlongAxes(at(99, 0, 0), [cube], kinds, [])).toBeUndefined()
  })

  test("the grid and the point on an edge never pull a drag: only named points do", () => {
    const grid = snapPointAlongAxes(at(11, 0, 0), [], only(SnapType.GRID), ["x"])
    expect(grid).toBeUndefined()
    expect(snapPointAlongAxes(at(30, 4, 0), [line(0, 0, 100, 0)] as any, only(SnapType.NEAREST), ["x", "y"])).toBeUndefined()
  })

  test("the hook skips the parts being moved, publishes the marker and clears it", () => {
    createRoot((dispose) => {
      const moving = { ...cube, id: "moving", x: 0, y: 0 }
      useElementsStore.setState({ elements: [cube as never, moving as never] })
      const snap = createSnap()
      snap.updateSnapSettings({ enabled: true, tolerance: 10, types: { ...none, center: true } as never })
      // The moving part's own centre is at the cursor, and must not be offered to itself.
      expect(snap.snapAlongAxes({ x: 1, y: 0, z: 0 }, ["x"], new Set(["moving"]))).toBeUndefined()
      expect(snap.snapIndicator().visible).toBe(false)
      const hit = snap.snapAlongAxes({ x: 99, y: 0, z: 0 }, ["x"], new Set(["moving"]))
      expect(hit).toMatchObject({ x: 100, type: SnapType.CENTER })
      expect(snap.snapIndicator()).toMatchObject({ visible: true, type: SnapType.CENTER })
      snap.clearIndicator()
      expect(snap.snapIndicator().visible).toBe(false)
      useElementsStore.setState({ elements: [] })
      dispose()
    })
  })
})
