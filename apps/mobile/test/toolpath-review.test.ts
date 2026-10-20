import { describe, expect, test } from "bun:test"
import type { PreviewCollisionEvent, PreviewOperation } from "@cadcamfun/api"
import { contactSegments, cutterAt, describeCutter, nextContact, operationAt, orderedContacts } from "../lib/toolpath-review"

const cutter = { diameter: 6, fluteLength: 18, shankDiameter: 6, stickout: 34, noseRadius: 0, holder: { diameter: 32, length: 40, kind: "shrink", assumed: false } }

const operations: PreviewOperation[] = [
  { index: 0, name: "face", toolId: "T1", startSegment: 0, endSegment: 9, cutter },
  { index: 1, name: "contour", toolId: "T2", startSegment: 10, endSegment: 19 },
]

const contact = (overrides: Partial<PreviewCollisionEvent> = {}): PreviewCollisionEvent => ({
  code: "RAPID_INTO_STOCK",
  severity: "error",
  seconds: 12.5,
  segment: 4,
  line: 12,
  message: "rapid into the stock left at line 12",
  ...overrides,
})

describe("the program's operations", () => {
  test("a segment belongs to the operation that owns it", () => {
    expect(operationAt(operations, 0)?.name).toBe("face")
    expect(operationAt(operations, 9)?.name).toBe("face")
    expect(operationAt(operations, 10)?.name).toBe("contour")
    expect(operationAt(operations, 99)).toBeUndefined()
  })

  test("the cutter at the playhead is the tool of the running operation", () => {
    expect(cutterAt(operations, 4)?.diameter).toBe(6)
    expect(cutterAt(operations, 14)).toBeUndefined()
  })

  test("the tool is described in the words the desktop uses", () => {
    expect(describeCutter(cutter)).toBe("Ø6 mm · 18 mm flute · shrink holder Ø32 mm")
    expect(describeCutter({ ...cutter, noseRadius: 2 })).toContain("2 mm nose")
    expect(describeCutter({ ...cutter, holder: { ...cutter.holder, assumed: true } })).toContain("assumed")
    expect(describeCutter(undefined)).toBeUndefined()
  })
})

describe("the contacts on the clock", () => {
  test("the segments with a contact are marked", () => {
    expect([...contactSegments([contact(), contact({ segment: 7 })])]).toEqual([4, 7])
  })

  test("the first contact at or after the playhead is the one the playback stops at", () => {
    const events = [contact({ segment: 9, seconds: 30 }), contact({ segment: 4, seconds: 12.5 })]
    expect(nextContact(events, 0)?.segment).toBe(4)
    expect(nextContact(events, 5)?.segment).toBe(9)
    expect(nextContact(events, 10)).toBeUndefined()
  })

  test("the contacts are listed worst first, then in the order they happen", () => {
    const events = [
      contact({ code: "NEAR_MISS", severity: "warning", seconds: 5, segment: 2 }),
      contact({ code: "HOLDER_IN_STOCK", severity: "error", seconds: 40, segment: 8 }),
      contact({ code: "MILL_INTO_VISE", severity: "error", seconds: 20, segment: 5 }),
    ]
    expect(orderedContacts(events).map((event) => event.code)).toEqual(["MILL_INTO_VISE", "HOLDER_IN_STOCK", "NEAR_MISS"])
  })
})
