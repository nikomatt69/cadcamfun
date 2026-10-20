import { expect, test } from "bun:test"
import { decodeEdgesResponse, encodeEdgesRequest } from "./viewport-geometry.ts"

test("raw requests preserve sliced positions and promote u16 indices without detaching source", () => {
  const storage = new Float32Array([99, 1, 2, 3, 4, 5, 6, 7, 8, 9, 99])
  const positions = storage.subarray(1, 10)
  for (const indices of [new Uint16Array([0, 1, 2]), new Uint32Array([0, 1, 2])]) {
    const bytes = encodeEdgesRequest({ positions, indices, thresholdAngle: 25 })
    const header = new DataView(bytes.buffer)
    expect(header.getUint32(4, true)).toBe(3)
    expect(header.getUint32(8, true)).toBe(3)
    expect(header.getFloat64(12, true)).toBe(25)
    expect([...new Float32Array(bytes.buffer, 24, 9)]).toEqual([...positions])
    expect([...new Uint32Array(bytes.buffer, 60, 3)]).toEqual([0, 1, 2])
    expect(positions.buffer.byteLength).toBe(storage.byteLength)
  }
})

test("non-indexed triangles and empty geometry have explicit zero index counts", () => {
  for (const positions of [new Float32Array(), new Float32Array(9)]) {
    const bytes = encodeEdgesRequest({ positions })
    expect(new DataView(bytes.buffer).getUint32(8, true)).toBe(0)
  }
  expect(() => encodeEdgesRequest({ positions: new Float32Array(8) })).toThrow()
  expect(() => encodeEdgesRequest({ positions: new Float32Array(6) })).toThrow()
  expect(() => encodeEdgesRequest({ positions: new Float32Array(9), thresholdAngle: NaN })).toThrow()
})

test("decoded endpoints view their response bytes, and malformed envelopes fail closed", () => {
  const bytes = new ArrayBuffer(32)
  const header = new DataView(bytes)
  header.setUint32(0, 0x314c4543, true)
  header.setUint32(4, 2, true)
  new Float32Array(bytes, 8).set([1, 2, 3, 4, 5, 6])
  const endpoints = decodeEdgesResponse(bytes)
  expect(endpoints.buffer).toBe(bytes)
  expect([...endpoints]).toEqual([1, 2, 3, 4, 5, 6])
  expect(() => decodeEdgesResponse(bytes.slice(0, 31))).toThrow()
  header.setUint32(4, 1, true)
  expect(() => decodeEdgesResponse(bytes)).toThrow()
  expect(() => decodeEdgesResponse(new ArrayBuffer(8))).toThrow()
})
