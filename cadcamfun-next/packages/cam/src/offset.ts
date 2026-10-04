import { EndType, JoinType, areaD, inflatePathsD, type PathD } from "@countertype/clipper2-ts"
import type { Vec2 } from "@cadcamfun/core"

const PRECISION = 4

/** Offset closed polygons; positive grows, negative shrinks. Holes and splits are handled by Clipper2. */
export const offsetPolygons = (polygons: ReadonlyArray<ReadonlyArray<Vec2>>, delta: number): Array<Array<Vec2>> =>
  inflatePathsD(
    polygons.map((p) => p.map(({ x, y }) => ({ x, y }))) as Array<PathD>,
    delta,
    JoinType.Round,
    EndType.Polygon,
    2,
    PRECISION,
  ).map((p) => p.map(({ x, y }) => ({ x, y })))

/** Make a polygon counter-clockwise (positive area). */
export const ccw = (points: ReadonlyArray<Vec2>): Array<Vec2> =>
  areaD(points as PathD) < 0 ? [...points].reverse() : [...points]

/** Make a polygon clockwise (negative area). */
export const cw = (points: ReadonlyArray<Vec2>): Array<Vec2> => ccw(points).reverse()
