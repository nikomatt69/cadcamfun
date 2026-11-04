import { describe, expect, test } from "bun:test"
import { runJobList } from "./job-list.ts"

describe("job list", () => {
  test("five parts, one invalid: four results and one reported failure; a repeated item is a cache hit; an accepted program is skipped", async () => {
    let runs = 0
    const items = [
      { id: "p1", key: "a", input: 1 }, { id: "p2", key: "b", input: -1 }, { id: "p3", key: "a", input: 1 },
      { id: "p4", key: "c", input: 3 }, { id: "p5", key: "d", input: 4, hasAcceptedProgram: true }, { id: "p6", key: "e", input: 5 }
    ]
    const progress: number[] = []
    const out = await runJobList(items, async (n) => { runs++; if (n < 0) throw new Error("invalid part"); return n * 10 }, (p) => progress.push(p.done))
    expect(out.map((o) => o.status)).toEqual(["ok", "failed", "cache-hit", "ok", "skipped", "ok"])
    expect(out[1]).toMatchObject({ message: "invalid part" })
    expect(out[2]).toMatchObject({ sameAs: "p1", value: 10 })
    expect(runs).toBe(4)
    expect(progress.length).toBe(6)
    expect(Math.max(...progress)).toBe(6)
  })
})
