import { describe, expect, test } from "bun:test"
import { makeProgram } from "../ir.ts"
import { fanucPost } from "./fanuc.ts"
import { samplePostProgram } from "./sample.ts"
import { testAllPosts, testPost } from "./tester.ts"

describe("post tester (spec 54 C3)", () => {
  test("every implemented post passes the standard sample program and every check ran", () => {
    for (const r of testAllPosts()) {
      expect({ post: r.post, verdict: r.verdict, failed: r.checks.filter((c) => c.status === "failed") }).toEqual({ post: r.post, verdict: "passed", failed: [] })
      expect(r.checks.filter((c) => c.status === "passed").map((c) => c.id)).toEqual(expect.arrayContaining(["replay", "bounds", "cut-length", "endpoints", "tools", "end"]))
    }
  })

  const good = fanucPost.emit(samplePostProgram())
  test("text with a moved coordinate fails bounds and endpoints and names the axis", () => {
    const moved = good.replace(/X30\.000/g, "X31.500")
    expect(moved).not.toBe(good)
    const r = testPost("fanuc", { nc: moved })
    expect(r.verdict).toBe("failed")
    expect(r.checks.find((c) => c.id === "bounds")!.detail).toMatch(/X/)
  })
  test("text without a program end fails; text that drops the arc fails the cut length", () => {
    expect(testPost("fanuc", { nc: good.replace(/M30/g, "") }).checks.find((c) => c.id === "end")!.status).toBe("failed")
    const noArc = good.split("\n").filter((l) => !/^G0?3\b/.test(l.trim())).join("\n")
    expect(noArc).not.toBe(good)
    expect(testPost("fanuc", { nc: noArc }).checks.find((c) => c.id === "cut-length")!.status).toBe("failed")
  })
  test("a word the interpreter cannot replay is reported, not skipped", () => {
    const r = testPost("fanuc", { nc: good.replace("G90", "G90\nG999 X1") })
    expect(r.verdict).toBe("failed")
    expect(r.unsupported.join(" ")).toMatch(/G999/)
  })
  test("expected output: identical passes, a changed feed is a line diff", () => {
    expect(testPost("fanuc", { expected: good }).checks.find((c) => c.id === "expected")!.status).toBe("passed")
    const r = testPost("fanuc", { expected: good.replace("F400", "F450") })
    expect(r.verdict).toBe("failed")
    expect(r.diff.length).toBe(1)
    expect(r.diff[0]!.expected).toMatch(/F450/)
    expect(r.diff[0]!.actual).toMatch(/F400/)
  })
  test("a post that refuses the program is a refusal with its reason, not a failure of the text", () => {
    const rotary = makeProgram("r", [{ id: "a", name: "a", toolId: "1", spindleRpm: 1000, coolant: "off", moves: [{ _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }, { _tag: "Linear", to: { x: 5, y: 0, z: 0 }, feed: 100, rotary: { a: 30 } }] }])
    const r = testPost("grbl", { program: rotary })
    expect(r.verdict).toBe("refused")
    expect(r.reason).toMatch(/rotary/i)
  })
})
