import { describe, expect, test } from "bun:test"
import { DEFAULT_CUTTERS } from "./cutters.ts"
import { cuttingData } from "./cutting-data.ts"
import { taylorFor, toolLifeMinutes } from "./process.ts"
import { baseLibrary, consumeLife, diffLibraries, editLibrary, emptyLifeBook, libraryHash, libraryMaterial, materialIssues, pickSister, planMagazine, remainingLife, resetLife } from "./tool-library.ts"

const cutter = DEFAULT_CUTTERS.find((c) => c.id === "flat-8")!
const machine = { maxRpm: 24000, maxFeed: 6000 }
const data = (lib: ReturnType<typeof baseLibrary>, id: string) => cuttingData({ material: libraryMaterial(lib, id), cutter, cut: "rough-side", machine, depth: 8 })

describe("versioned cutting-data library (spec 69 D4)", () => {
  const base = baseLibrary()
  const grade = base.materials.find((m) => m.family.startsWith("aluminium") || m.iso === "N")!.id

  test("an edit is a new version with a log, and changes the cutting data deterministically", () => {
    const v1 = editLibrary(base, [{ kind: "patch", id: grade, patch: { vcCarbide: { rough: libraryMaterial(base, grade).vcCarbide.rough * 0.5, finish: libraryMaterial(base, grade).vcCarbide.finish * 0.5 } } }], "shop speeds are lower")
    expect(v1.version).toBe(1)
    expect(base.version).toBe(0)
    expect(v1.log[0]!.note).toBe("shop speeds are lower")
    expect(v1.log[0]!.changes.map((c) => c.field)).toEqual(["vcCarbide"])
    const a = data(base, grade), b = data(v1, grade), b2 = data(v1, grade)
    expect(b.rpm).toBeLessThan(a.rpm)
    expect(b).toEqual(b2)
    expect(libraryHash(v1)).not.toBe(libraryHash(base))
    expect(libraryHash(baseLibrary())).toBe(libraryHash(base))
    // Putting the old value back restores the table and its hash.
    const v2 = editLibrary(v1, [{ kind: "patch", id: grade, patch: { vcCarbide: libraryMaterial(base, grade).vcCarbide } }], "revert")
    expect(libraryHash(v2)).toBe(libraryHash(base))
    expect(v2.version).toBe(2)
    expect(diffLibraries(base, v1).map((d) => `${d.id}.${d.field}`)).toEqual([`${grade}.vcCarbide`])
  })

  test("add, remove and bad edits: nothing is half applied", () => {
    const custom = { ...libraryMaterial(base, grade), id: "shop-alloy", name: "Shop alloy", aliases: [] }
    const v1 = editLibrary(base, [{ kind: "add", material: custom }], "new grade")
    expect(libraryMaterial(v1, "shop-alloy").name).toBe("Shop alloy")
    expect(() => editLibrary(v1, [{ kind: "add", material: custom }], "again")).toThrow(/already exists/)
    expect(() => editLibrary(base, [{ kind: "patch", id: grade, patch: { kc11: -5 } }], "bad")).toThrow(/kc11 must be a positive/)
    expect(() => editLibrary(base, [{ kind: "patch", id: "nope", patch: {} }], "bad")).toThrow(/Unknown material/)
    expect(editLibrary(v1, [{ kind: "remove", id: "shop-alloy" }], "drop").materials.length).toBe(base.materials.length)
    expect(base.materials.every((m) => materialIssues(m).length === 0)).toBe(true)
  })
})

describe("tool life, sister tools and magazine (spec 69 D4)", () => {
  const vc = 300
  test("the life book takes its limit from the Taylor model of process.ts: faster cutting uses the edge up sooner", () => {
    const t = taylorFor("carbide", "N")
    expect(toolLifeMinutes(t, vc * 1.2)).toBeLessThan(toolLifeMinutes(t, vc))
    expect(remainingLife(consumeLife(emptyLifeBook, "A", 10), "A", toolLifeMinutes(t, vc))).toBeCloseTo(toolLifeMinutes(t, vc) - 10, 9)
  })

  test("the life book counts minutes per tool and a sister replaces a worn tool", () => {
    let book = emptyLifeBook
    book = consumeLife(book, "A", 40)
    expect(remainingLife(book, "A", 45)).toBe(5)
    const life = () => 45
    const group = { id: "g", members: ["A", "B"] }
    expect(pickSister(group, book, life, 4)).toEqual({ toolId: "A", reason: "primary tool has enough life" })
    const swapped = pickSister(group, book, life, 10)
    expect(swapped.toolId).toBe("B")
    expect(swapped.reason).toMatch(/A is worn out/)
    book = consumeLife(book, "B", 44)
    expect(pickSister(group, book, life, 10).toolId).toBeUndefined()
    expect(pickSister(group, book, life, 10).reason).toMatch(/replace or regrind/)
    expect(remainingLife(resetLife(book, "A"), "A", 45)).toBe(45)
    expect(() => consumeLife(book, "A", -1)).toThrow()
  })

  test("a magazine that holds the tools numbers them by first use; a movable sequence is grouped to fewest changes", () => {
    const seq = ["T1", "T2", "T1", "T3", "T2"]
    const kept = planMagazine(seq, 4)
    expect(kept.pockets).toEqual({ T1: 1, T2: 2, T3: 3 })
    expect(kept.changes).toBe(4)
    expect(kept.loads.length).toBe(1)
    const grouped = planMagazine(seq, 4, true)
    expect(grouped.sequence).toEqual(["T1", "T1", "T2", "T2", "T3"])
    expect(grouped.changes).toBe(2)
    expect(grouped.notes).toContain("operations were grouped by tool")
  })

  test("more tools than pockets are split into loads with the stop reported", () => {
    const plan = planMagazine(["a", "b", "c", "d", "e"], 2, true)
    expect(plan.loads).toEqual([["a", "b"], ["c", "d"], ["e"]])
    expect(plan.notes.join(" ")).toMatch(/3 loads/)
    expect(() => planMagazine(["a"], 0)).toThrow()
  })
})

