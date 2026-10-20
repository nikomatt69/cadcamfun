import { describe, expect, test } from "bun:test"
import {
  allocatePlaybackBuffer,
  BUFFER_MAGIC,
  BUFFER_VERSION,
  BufferError,
  checkPlaybackInvariants,
  decodePlaybackBuffer,
  HEADER_BYTES,
  sectionOffsets,
  toolTableBytes,
} from "../src/index.ts"

const TOOLS = ["T1", "T2"]

const fill = (writer: ReturnType<typeof allocatePlaybackBuffer>, count: number) => {
  const { views } = writer
  let time = 0
  for (let i = 0; i < count; i++) {
    views.starts[i] = time
    views.durations[i] = 0.5
    views.from[i * 3] = i
    views.from[i * 3 + 1] = 0
    views.from[i * 3 + 2] = -1
    views.to[i * 3] = i + 1
    views.to[i * 3 + 1] = 0
    views.to[i * 3 + 2] = -1
    views.pathIndex[i] = 0
    views.moveIndex[i] = i
    views.toolIndex[i] = i % TOOLS.length
    views.rapid[i] = i % 2
    time += 0.5
  }
  return time
}

describe("the packed CAM buffer", () => {
  test("double precision survives the wire and old float layouts are rejected", () => {
    const writer = allocatePlaybackBuffer(1, TOOLS)
    writer.views.durations[0] = 0.123456789123
    writer.views.to[0] = 0.987654321987
    const bytes = writer.finalize(0.123456789123, { x: 0.987654321987, y: 0, z: 0 })
    const decoded = decodePlaybackBuffer(bytes)
    expect(decoded.views.durations[0]).toBe(0.123456789123)
    expect(decoded.views.to[0]).toBe(0.987654321987)
    new DataView(bytes.buffer).setUint16(4, 1, true)
    expect(() => decodePlaybackBuffer(bytes)).toThrow(BufferError)
  })

  test("oversized wire counts cannot wrap section offsets and invalid producer counts fail", () => {
    const writer = allocatePlaybackBuffer(0)
    new DataView(writer.bytes.buffer).setUint32(8, 0xffff_ffff, true)
    expect(() => decodePlaybackBuffer(writer.bytes)).toThrow(BufferError)
    for (const count of [-1, 0.5, NaN, Infinity, 0x1_0000_0000]) {
      expect(() => allocatePlaybackBuffer(count)).toThrow(BufferError)
    }
  })

  test("round trips every section", () => {
    const writer = allocatePlaybackBuffer(4, TOOLS)
    const duration = fill(writer, 4)
    const bytes = writer.finalize(duration, { x: 4, y: 0, z: -1 })

    const decoded = decodePlaybackBuffer(bytes)
    expect(decoded.version).toBe(BUFFER_VERSION)
    expect(decoded.segmentCount).toBe(4)
    expect(decoded.duration).toBe(duration)
    expect(decoded.end).toEqual({ x: 4, y: 0, z: -1 })
    expect(decoded.toolIds).toEqual(TOOLS)
    expect(Array.from(decoded.views.starts)).toEqual([0, 0.5, 1, 1.5])
    expect(Array.from(decoded.views.durations)).toEqual([0.5, 0.5, 0.5, 0.5])
    expect(Array.from(decoded.views.from.slice(0, 3))).toEqual([0, 0, -1])
    expect(Array.from(decoded.views.to.slice(3, 6))).toEqual([2, 0, -1])
    expect(Array.from(decoded.views.pathIndex)).toEqual([0, 0, 0, 0])
    expect(Array.from(decoded.views.moveIndex)).toEqual([0, 1, 2, 3])
    expect(Array.from(decoded.views.toolIndex)).toEqual([0, 1, 0, 1])
    expect(Array.from(decoded.views.rapid)).toEqual([0, 1, 0, 1])
  })

  test("decoding views the received bytes without copying them", () => {
    const writer = allocatePlaybackBuffer(2, TOOLS)
    fill(writer, 2)
    const bytes = writer.finalize(1, { x: 0, y: 0, z: 0 })

    const decoded = decodePlaybackBuffer(bytes)
    expect(decoded.views.starts.buffer).toBe(bytes.buffer)
    expect(decoded.bytes.buffer).toBe(bytes.buffer)
  })

  test("an empty buffer is legal", () => {
    const writer = allocatePlaybackBuffer(0)
    const bytes = writer.finalize(0, { x: 0, y: 0, z: 0 })
    const decoded = decodePlaybackBuffer(bytes)
    expect(decoded.segmentCount).toBe(0)
    expect(decoded.views.starts.length).toBe(0)
    expect(decoded.toolIds).toEqual([])
    expect(checkPlaybackInvariants(decoded)).toEqual([])
  })

  test("refuses a buffer that is not ours", () => {
    const bytes = new Uint8Array(64)
    expect(() => decodePlaybackBuffer(bytes)).toThrow(BufferError)
    try {
      decodePlaybackBuffer(bytes)
    } catch (error) {
      expect((error as BufferError).reason).toBe("bad_magic")
      expect((error as BufferError)._tag).toBe("BufferError")
    }
  })

  test("refuses a version it does not know", () => {
    const writer = allocatePlaybackBuffer(1, TOOLS)
    fill(writer, 1)
    const bytes = writer.finalize(1, { x: 0, y: 0, z: 0 })
    new DataView(bytes.buffer).setUint16(4, BUFFER_VERSION + 1, true)
    try {
      decodePlaybackBuffer(bytes)
      throw new Error("the decoder accepted an unknown version")
    } catch (error) {
      expect((error as BufferError).reason).toBe("unsupported_version")
    }
  })

  test("refuses a truncated buffer", () => {
    const writer = allocatePlaybackBuffer(8, TOOLS)
    fill(writer, 8)
    const bytes = writer.finalize(4, { x: 0, y: 0, z: 0 })
    try {
      decodePlaybackBuffer(bytes.slice(0, bytes.byteLength - 16))
      throw new Error("the decoder accepted a truncated buffer")
    } catch (error) {
      expect((error as BufferError).reason).toBe("truncated")
    }
  })

  test("refuses a buffer whose tool table is cut short", () => {
    const writer = allocatePlaybackBuffer(2, TOOLS)
    fill(writer, 2)
    const bytes = writer.finalize(1, { x: 0, y: 0, z: 0 })
    try {
      decodePlaybackBuffer(bytes.slice(0, bytes.byteLength - 3))
      throw new Error("the decoder accepted a truncated tool table")
    } catch (error) {
      expect((error as BufferError).reason).toBe("truncated")
    }
  })

  test("refuses a buffer shorter than its header", () => {
    try {
      decodePlaybackBuffer(new Uint8Array(HEADER_BYTES - 1))
      throw new Error("the decoder accepted a headerless buffer")
    } catch (error) {
      expect((error as BufferError).reason).toBe("truncated")
    }
  })

  test("decodes a buffer that arrives as an unaligned slice", () => {
    const writer = allocatePlaybackBuffer(3, TOOLS)
    fill(writer, 3)
    const bytes = writer.finalize(1.5, { x: 1, y: 2, z: 3 })
    // A response body that was sliced out of a larger buffer starts at an arbitrary offset.
    const backing = new Uint8Array(bytes.byteLength + 1)
    backing.set(bytes, 1)
    const decoded = decodePlaybackBuffer(backing.subarray(1))
    expect(decoded.segmentCount).toBe(3)
    expect(decoded.duration).toBe(1.5)
    expect(decoded.end).toEqual({ x: 1, y: 2, z: 3 })
    expect(decoded.toolIds).toEqual(TOOLS)
    expect(Array.from(decoded.views.starts)).toEqual([0, 0.5, 1])
  })

  test("every section is aligned and the size is the documented one", () => {
    for (const n of [0, 1, 2, 3, 7, 8, 1000]) {
      const offsets = sectionOffsets(n)
      expect(offsets.starts % 8).toBe(0)
      expect(offsets.durations % 4).toBe(0)
      expect(offsets.from % 4).toBe(0)
      expect(offsets.to % 4).toBe(0)
      expect(offsets.pathIndex % 4).toBe(0)
      expect(offsets.moveIndex % 4).toBe(0)
      expect(offsets.toolIndex % 4).toBe(0)
      expect(offsets.tools % 8).toBe(0)
      expect(offsets.fixed % 8).toBe(0)
      // The aligned layout costs at most one padding word per section.
      expect(offsets.fixed).toBeLessThanOrEqual(HEADER_BYTES + n * 77 + 64)
    }
  })

  test("the tool table is sized by its ids", () => {
    expect(toolTableBytes([])).toBe(4)
    expect(toolTableBytes(["T1"])).toBe(4 + 4 + 2)
    expect(toolTableBytes(["T1", "T2"])).toBe(4 + (4 + 2) * 2)
  })

  test("a million double-precision segments fit in about 77 megabytes", () => {
    const offsets = sectionOffsets(1_000_000)
    expect(offsets.fixed).toBeLessThan(78_000_000)
  })

  test("the magic is the documented one", () => {
    const writer = allocatePlaybackBuffer(1, TOOLS)
    fill(writer, 1)
    const bytes = writer.finalize(1, { x: 0, y: 0, z: 0 })
    expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(BUFFER_MAGIC)
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("CCBF")
  })

  test("the invariant check names a broken producer", () => {
    const writer = allocatePlaybackBuffer(3, TOOLS)
    fill(writer, 3)
    const bytes = writer.finalize(1.5, { x: 0, y: 0, z: 0 })
    writer.views.durations[1] = -1
    writer.views.rapid[2] = 7
    writer.views.toolIndex[0] = 9
    expect(() => decodePlaybackBuffer(bytes)).toThrow(BufferError)
    const problems = checkPlaybackInvariants({ ...writer, duration: 1.5, end: { x: 0, y: 0, z: 0 } })
    expect(problems.length).toBe(3)
    expect(problems.some((problem) => problem.includes("negative duration"))).toBe(true)
    expect(problems.some((problem) => problem.includes("rapid flag"))).toBe(true)
    expect(problems.some((problem) => problem.includes("not in the table"))).toBe(true)
  })

  test("segments that overlap are reported", () => {
    const writer = allocatePlaybackBuffer(3, TOOLS)
    fill(writer, 3)
    const bytes = writer.finalize(1.5, { x: 0, y: 0, z: 0 })
    writer.views.starts[2] = 0.1
    expect(() => decodePlaybackBuffer(bytes)).toThrow(BufferError)
    expect(checkPlaybackInvariants({ ...writer, duration: 1.5, end: { x: 0, y: 0, z: 0 } }).some((problem) => problem.includes("inside segment"))).toBe(true)
  })
})
