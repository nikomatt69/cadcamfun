import { expect, test } from "bun:test"
import {
  allocatePlaybackBuffer, BufferError, BYTES_PER_SEGMENT, checkPlaybackInvariants,
  decodePlaybackBuffer, encodePlaybackBuffer, MAX_BUFFER_BYTES, MAX_TOOLS, sectionOffsets,
} from "../src/index.ts"

const valid = (count = 2, tools: readonly string[] = ["T1"]) => {
  const writer = allocatePlaybackBuffer(count, tools)
  for (let i = 0; i < count; i++) {
    writer.views.starts[i] = i / 2
    writer.views.durations[i] = 0.5
    writer.views.to[i * 3] = i + 0.123456789123
  }
  return writer.finalize(count / 2, { x: 1, y: 2, z: 3 })
}

const refuses = (run: () => unknown, reason: BufferError["reason"]) => {
  try { run() } catch (error) {
    expect(error).toBeInstanceOf(BufferError)
    expect((error as BufferError).reason).toBe(reason)
    return
  }
  throw new Error(`Expected BufferError(${reason})`)
}

test("encoding owns canonical bytes and preserves Unicode tool identifiers", () => {
  const source = decodePlaybackBuffer(valid(2, ["\uFEFFT1", "工具 🔧", ""]))
  const bytes = encodePlaybackBuffer(source)
  expect([...bytes]).toEqual([...source.bytes])
  expect(bytes.buffer === source.bytes.buffer).toBe(false)
  const decoded = decodePlaybackBuffer(bytes)
  expect(decoded.toolIds).toEqual(["\uFEFFT1", "工具 🔧", ""])
  source.views.to[0] = 999
  expect(decoded.views.to[0]).toBe(0.123456789123)
})

test("copy and shared-memory decoding own snapshots; aligned ordinary input remains a view", () => {
  const bytes = valid()
  const direct = decodePlaybackBuffer(bytes)
  const snapshot = decodePlaybackBuffer(bytes, { copy: true })
  expect(direct.bytes.buffer).toBe(bytes.buffer)
  expect(snapshot.bytes.buffer === bytes.buffer).toBe(false)
  const shared = new Uint8Array(new SharedArrayBuffer(bytes.length))
  shared.set(bytes)
  const decoded = decodePlaybackBuffer(shared)
  shared.fill(0)
  expect(decoded.duration).toBe(1)
  expect(decoded.bytes[0]).toBe(67)
  expect(decoded.bytes.buffer === shared.buffer).toBe(false)
})

test("reserved flags, header words, padding and trailing bytes fail closed", () => {
  for (const offset of [6, 12]) {
    const bytes = valid()
    bytes[offset] = 1
    refuses(() => decodePlaybackBuffer(bytes), "unsupported_flags")
  }
  const trailing = new Uint8Array(valid().length + 8)
  trailing.set(valid())
  refuses(() => decodePlaybackBuffer(trailing), "trailing_data")
  const writer = allocatePlaybackBuffer(0)
  const padded = writer.finalize(0, { x: 0, y: 0, z: 0 })
  padded[padded.length - 1] = 1
  refuses(() => decodePlaybackBuffer(padded), "invalid_data")
  const innerPadding = valid(1)
  innerPadding[sectionOffsets(1).pathIndex + 4] = 1
  refuses(() => decodePlaybackBuffer(innerPadding), "invalid_data")
})

test("every incomplete payload prefix is rejected within the supplied view", () => {
  const bytes = valid(3, ["T1", "工具"])
  for (let end = 0; end < bytes.length; end++) {
    expect(() => decodePlaybackBuffer(bytes.subarray(0, end))).toThrow(BufferError)
  }
})

test("malformed UTF-8 and unpaired UTF-16 surrogates are rejected rather than repaired", () => {
  const bytes = valid()
  bytes[sectionOffsets(2).tools + 8] = 0xff
  refuses(() => decodePlaybackBuffer(bytes), "invalid_utf8")
  refuses(() => allocatePlaybackBuffer(0, ["\ud800"]), "invalid_utf8")
})

test("numeric corruption and invalid indices never escape a decoder", () => {
  const corruptions = [
    (data: ReturnType<typeof decodePlaybackBuffer>) => { data.views.starts[0] = NaN },
    (data: ReturnType<typeof decodePlaybackBuffer>) => { data.views.durations[0] = Infinity },
    (data: ReturnType<typeof decodePlaybackBuffer>) => { data.views.durations[0] = -1 },
    (data: ReturnType<typeof decodePlaybackBuffer>) => { data.views.to[0] = NaN },
    (data: ReturnType<typeof decodePlaybackBuffer>) => { data.views.from[0] = Infinity },
    (data: ReturnType<typeof decodePlaybackBuffer>) => { data.views.starts[1] = 0.1 },
    (data: ReturnType<typeof decodePlaybackBuffer>) => { data.views.pathIndex.set([1, 0]) },
    (data: ReturnType<typeof decodePlaybackBuffer>) => { data.views.rapid[0] = 2 },
    (data: ReturnType<typeof decodePlaybackBuffer>) => { data.views.toolIndex[0] = 1 },
  ]
  for (const corrupt of corruptions) {
    const data = decodePlaybackBuffer(valid())
    corrupt(data)
    refuses(() => decodePlaybackBuffer(data.bytes), "invalid_data")
    refuses(() => encodePlaybackBuffer(data), "invalid_data")
  }
  for (const offset of [16, 24, 32, 40]) {
    const bytes = valid()
    new DataView(bytes.buffer).setFloat64(offset, NaN, true)
    refuses(() => decodePlaybackBuffer(bytes), "invalid_data")
  }
})

test("resource limits and forged counts are checked before allocating or iterating", () => {
  refuses(() => allocatePlaybackBuffer(Math.ceil(MAX_BUFFER_BYTES / BYTES_PER_SEGMENT), ["T1"]), "limit_exceeded")
  refuses(() => allocatePlaybackBuffer(0, Array(MAX_TOOLS + 1).fill("")), "limit_exceeded")
  refuses(() => allocatePlaybackBuffer(0, ["T1"], { maxToolTableBytes: 4 }), "limit_exceeded")
  const bytes = valid()
  refuses(() => decodePlaybackBuffer(bytes, { maxBytes: bytes.length - 1 }), "limit_exceeded")
  refuses(() => decodePlaybackBuffer(bytes, { maxBytes: -1 }), "limit_exceeded")
  new DataView(bytes.buffer).setUint32(sectionOffsets(2).tools, MAX_TOOLS + 1, true)
  refuses(() => decodePlaybackBuffer(bytes), "limit_exceeded")
})

test("writers validate metadata, section lengths and finite values before finalization", () => {
  const writer = allocatePlaybackBuffer(1, ["T1"])
  writer.views.durations[0] = 1
  refuses(() => writer.finalize(0.5, { x: 0, y: 0, z: 0 }), "invalid_data")
  refuses(() => writer.finalize(1, { x: Infinity, y: 0, z: 0 }), "invalid_data")
  const data = decodePlaybackBuffer(valid())
  refuses(() => encodePlaybackBuffer({ ...data, segmentCount: 3 }), "invalid_data")
})

test("zero-duration moves are valid and producer diagnostics remain bounded", () => {
  const writer = allocatePlaybackBuffer(100, ["T1"])
  const bytes = writer.finalize(0, { x: 0, y: 0, z: 0 })
  expect(checkPlaybackInvariants(decodePlaybackBuffer(bytes))).toEqual([])
  writer.views.starts.fill(NaN)
  const data = { ...writer, duration: 0, end: { x: 0, y: 0, z: 0 } }
  expect(checkPlaybackInvariants(data)).toHaveLength(64)
  refuses(() => decodePlaybackBuffer(bytes), "invalid_data")
})
