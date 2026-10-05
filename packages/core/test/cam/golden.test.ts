/**
 * Golden-file tests per post (generic, fanuc, grbl) for the four reference jobs of
 * the spec, plus geometry checks that replay the emitted text with the reference
 * interpreter, and the determinism check.
 *
 * Goldens live in test/golden/*.nc. Regenerate only with
 * `UPDATE_GOLDEN=1 bun test packages/core` and review the diff.
 */
import { describe, expect, test } from "bun:test"
import type { Vec2 } from "../../src/cad/vec.ts"
import { type Program, type Toolpath, makeProgram } from "../../src/cam/ir.ts"
import { DrillParams, generateDrill } from "../../src/cam/operations/drill.ts"
import { FaceParams, generateFace } from "../../src/cam/operations/face.ts"
import { PocketParams, generatePocket } from "../../src/cam/operations/pocket.ts"
import { ProfileParams, generateProfile } from "../../src/cam/operations/profile.ts"
import { type PostId, posts } from "../../src/cam/post/index.ts"
import type { Stock, Tool } from "../../src/cam/tool.ts"
import { expectGolden } from "../golden.ts"
import { invariantViolations } from "./helpers.ts"
import { drill5, tool6 } from "./fixtures.ts"

const stock: Stock = { x: 60, y: 50, z: 15, origin: { x: 0, y: 0, z: 0 }, material: "aluminium 6061" }

const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 }
]

interface Job {
  readonly name: string
  readonly toolpath: Toolpath
  readonly tool: Tool
  readonly totalDepth: number
  readonly allowRapidIntoHole?: boolean
}

const jobs: ReadonlyArray<Job> = [
  {
    name: "profile-outside",
    tool: tool6,
    totalDepth: 2,
    toolpath: generateProfile(new ProfileParams({ id: "p1", name: "Square outside", totalDepth: 2, stepdown: 1, side: "outside", leadIn: "arc" }), rect(15, 10, 45, 40), tool6, stock)
  },
  {
    name: "profile-inside",
    tool: tool6,
    totalDepth: 2,
    toolpath: generateProfile(new ProfileParams({ id: "p2", name: "Square inside", totalDepth: 2, stepdown: 1, side: "inside", leadIn: "helix" }), rect(10, 10, 50, 40), tool6, stock)
  },
  {
    name: "pocket-island",
    tool: tool6,
    totalDepth: 2,
    toolpath: generatePocket(
      new PocketParams({ id: "k1", name: "Pocket with island", totalDepth: 2, stepdown: 2, stepover: 60 }),
      { boundary: rect(8, 8, 52, 42), islands: [rect(24, 20, 36, 30)] },
      tool6,
      stock
    )
  },
  {
    name: "drill-peck",
    tool: drill5,
    totalDepth: 9,
    allowRapidIntoHole: true,
    toolpath: generateDrill(
      new DrillParams({ id: "d1", name: "Four holes", totalDepth: 9, peck: 3, retractHeight: 2 }),
      [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 40 }, { x: 10, y: 40 }],
      drill5,
      stock
    )
  },
  {
    name: "face",
    tool: tool6,
    totalDepth: 1,
    toolpath: generateFace(new FaceParams({ id: "f1", name: "Face top", totalDepth: 1, stepdown: 0.5, stepover: 70 }), undefined, tool6, stock)
  }
]

const program = (job: Job): Program => makeProgram(job.name, [job.toolpath], { metadata: { material: stock.material } })

const postIds: ReadonlyArray<PostId> = ["generic", "fanuc", "grbl"]

describe("golden G-code", () => {
  for (const post of postIds) {
    for (const job of jobs) {
      test(`${post} / ${job.name}`, () => {
        expectGolden(`${post}-${job.name}.nc`, posts[post]!.emit(program(job), {}))
      })
    }
  }
})

describe("geometry of the emitted G-code (replayed with the reference interpreter)", () => {
  for (const post of postIds) {
    for (const job of jobs) {
      test(`${post} / ${job.name}: depth, stock bounds, arc radii and path length`, () => {
        expect(
          invariantViolations(job.toolpath, { stock, tool: job.tool, totalDepth: job.totalDepth, allowRapidIntoHole: job.allowRapidIntoHole }, post)
        ).toEqual([])
      })
    }
  }
})

describe("determinism", () => {
  test("generating and emitting the same program twice is byte-identical", () => {
    for (const post of postIds) {
      for (const job of jobs) {
        const again = jobs.find((j) => j.name === job.name)!
        const a = posts[post]!.emit(program(job), {})
        const b = posts[post]!.emit(program(again), {})
        expect(a).toBe(b)
      }
    }
  })

  test("regenerating the operations yields identical IR", () => {
    const again = generatePocket(
      new PocketParams({ id: "k1", name: "Pocket with island", totalDepth: 2, stepdown: 2, stepover: 60 }),
      { boundary: rect(8, 8, 52, 42), islands: [rect(24, 20, 36, 30)] },
      tool6,
      stock
    )
    expect(JSON.stringify(again)).toBe(JSON.stringify(jobs[2]!.toolpath))
  })
})
