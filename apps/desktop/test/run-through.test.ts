import { describe, expect, test } from "bun:test"
import { RUN_THROUGH_PAUSE_MS, shouldResume } from "../src/features/cam/lib/run-through.ts"

const resting = { runThrough: true, playing: false, time: 42, stoppedAt: 42, duration: 215 }

describe("running the whole program through its stops", () => {
  test("the run goes on after the pause when nothing happened", () => {
    expect(shouldResume(resting)).toBe(true)
    expect(RUN_THROUGH_PAUSE_MS).toBeGreaterThan(0)
  })

  test("it does not go on if the person ended the run, moved the playhead or pressed play meanwhile", () => {
    expect(shouldResume({ ...resting, runThrough: false })).toBe(false)
    expect(shouldResume({ ...resting, time: 10 })).toBe(false)
    expect(shouldResume({ ...resting, playing: true })).toBe(false)
  })

  test("a stop at the very end is the end of the run", () => {
    expect(shouldResume({ ...resting, time: 215, stoppedAt: 215 })).toBe(false)
  })
})
