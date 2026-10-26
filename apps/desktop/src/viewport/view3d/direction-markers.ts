/**
 * Where the feed-direction arrows of a toolpath go: along a line-segment buffer (xyz of both ends of every segment, in playback
 * order, as `pathBuffers` makes them), one arrow every `spacing` of travelled length. An arc is a run of tiny segments, so the
 * distance carries across consecutive segments; a gap between runs (a rapid in between) starts the count again, so every run
 * shows its direction near its start.
 */

export interface DirectionMarkers {
  /** xyz of every arrow's centre. */
  readonly positions: Float32Array
  /** Unit xyz of the segment each arrow sits on. */
  readonly directions: Float32Array
  /** The segment (index into the buffer's pairs) each arrow sits on, ascending: "only what has run" counts arrows by it. */
  readonly segments: Uint32Array
  /** The spacing actually used, which grows when `maxMarkers` would be exceeded. */
  readonly spacing: number
}

export const MAX_DIRECTION_MARKERS = 4000

const EMPTY: DirectionMarkers = { positions: new Float32Array(0), directions: new Float32Array(0), segments: new Uint32Array(0), spacing: 0 }

/** The length of the whole buffer: what the spacing is limited by. */
const lengthOf = (positions: Float32Array): number => {
  let total = 0
  for (let i = 0; i + 5 < positions.length; i += 6) total += Math.hypot(positions[i + 3]! - positions[i]!, positions[i + 4]! - positions[i + 1]!, positions[i + 5]! - positions[i + 2]!)
  return total
}

export const directionMarkers = (positions: Float32Array, spacing: number, maxMarkers = MAX_DIRECTION_MARKERS): DirectionMarkers => {
  if (!(spacing > 0) || positions.length < 6) return EMPTY
  const step = Math.max(spacing, lengthOf(positions) / Math.max(1, maxMarkers))
  const tolerance = 1e-4 * Math.max(1, step)
  // Pass one: the runs (consecutive segments that join end to start) and how long each is.
  const runOf = new Int32Array(positions.length / 6), runLength: number[] = []
  let endX = Number.NaN, endY = Number.NaN, endZ = Number.NaN
  for (let segment = 0, i = 0; i + 5 < positions.length; segment++, i += 6) {
    const length = Math.hypot(positions[i + 3]! - positions[i]!, positions[i + 4]! - positions[i + 1]!, positions[i + 5]! - positions[i + 2]!)
    if (!(length > 1e-9)) { runOf[segment] = -1; continue }
    if (!(Math.hypot(positions[i]! - endX, positions[i + 1]! - endY, positions[i + 2]! - endZ) <= tolerance)) runLength.push(0)
    runOf[segment] = runLength.length - 1
    runLength[runLength.length - 1]! += length
    endX = positions[i + 3]!; endY = positions[i + 4]!; endZ = positions[i + 5]!
  }
  // Pass two: the first arrow of a run is half a spacing in (the middle of a run shorter than that), then one every spacing.
  const at: number[] = [], toward: number[] = [], on: number[] = []
  let run = -1, untilNext = 0
  for (let segment = 0, i = 0; i + 5 < positions.length; segment++, i += 6) {
    const id = runOf[segment]!
    if (id < 0) continue
    if (id !== run) { run = id; untilNext = Math.min(step / 2, runLength[id]! / 2) }
    const ax = positions[i]!, ay = positions[i + 1]!, az = positions[i + 2]!
    const dx = positions[i + 3]! - ax, dy = positions[i + 4]! - ay, dz = positions[i + 5]! - az
    const length = Math.hypot(dx, dy, dz)
    const ux = dx / length, uy = dy / length, uz = dz / length
    let along = untilNext
    while (along < length && at.length / 3 < maxMarkers) {
      at.push(ax + ux * along, ay + uy * along, az + uz * along)
      toward.push(ux, uy, uz)
      on.push(segment)
      along += step
    }
    untilNext = along - length
  }
  return { positions: Float32Array.from(at), directions: Float32Array.from(toward), segments: Uint32Array.from(on), spacing: step }
}

/** How many arrows belong to the first `segments` segments: what has run. */
export const markersUpTo = (markers: DirectionMarkers, segments: number): number => {
  let low = 0, high = markers.segments.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (markers.segments[middle]! < segments) low = middle + 1; else high = middle
  }
  return low
}

/** The spacing that suits a path of this extent: about thirty arrows across it, never finer than a millimetre or coarser than fifty. */
export const defaultDirectionSpacing = (extent: number): number => Math.min(50, Math.max(1, extent / 30))
