import { describe, expect, test } from "bun:test"
import { sseParser } from "../lib/sse"

describe("sseParser", () => {
  test("parses a complete single frame", () => {
    const parse = sseParser<{ n: number }>()
    expect(parse('data: {"n":1}\n\n')).toEqual([{ n: 1 }])
  })

  test("accumulates split frames across chunks", () => {
    const parse = sseParser<{ n: number }>()
    expect(parse('data: {"n":')).toEqual([])
    expect(parse('1}\n\nda')).toEqual([{ n: 1 }])
    expect(parse('ta: {"n":2}\n\n')).toEqual([{ n: 2 }])
  })

  test("joins multi-line data fields into one payload", () => {
    const parse = sseParser<{ n: number }>()
    expect(parse('data: {"n":\ndata: 5}\n\n')).toEqual([{ n: 5 }])
  })

  test("skips malformed frames without ending the stream", () => {
    const parse = sseParser<{ n: number }>()
    expect(parse("data: not-json\n\n")).toEqual([])
    expect(parse('data: {"n":7}\n\n')).toEqual([{ n: 7 }])
  })

  test("ignores comment and keep-alive lines", () => {
    const parse = sseParser<{ n: number }>()
    expect(parse(": keep-alive\n\ndata: {\"n\":3}\n\n")).toEqual([{ n: 3 }])
  })

  test("handles crlf line endings", () => {
    const parse = sseParser<{ n: number }>()
    expect(parse('data: {"n":4}\r\n\r\n')).toEqual([{ n: 4 }])
  })
})

test("CRLF split at every byte boundary does not lose frames", () => {
  const parse = sseParser<{ n: number }>()
  const results = [...'\uFEFFdata: {"n":1}\r\n\r\ndata: {"n":2}\r\r'].flatMap((byte) => parse(byte))
  expect(results).toEqual([{ n: 1 }, { n: 2 }])
})
