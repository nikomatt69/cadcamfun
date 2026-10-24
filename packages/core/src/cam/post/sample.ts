/**
 * The standard program a post is tried on (spec 54 C1/C3): one tool, a profile with an arc, a dwell, a drilled hole row with a
 * peck cycle and a second tool, so a definition's tool change, setup, cycle, dwell, arc and end words all show in its output.
 */
import { makeProgram, type Program } from "../ir.ts"

export const samplePostProgram = (): Program =>
  makeProgram("post-sample", [
    {
      id: "profile", name: "Profile", toolId: "1", spindleRpm: 9000, coolant: "flood",
      moves: [
        { _tag: "Rapid", to: { x: 0, y: 0, z: 5 } },
        { _tag: "Linear", to: { x: 0, y: 0, z: -2 }, feed: 200 },
        { _tag: "Linear", to: { x: 20, y: 0, z: -2 }, feed: 400 },
        { _tag: "Arc", to: { x: 30, y: 10, z: -2 }, center: { x: 20, y: 10 }, clockwise: false, feed: 350 },
        { _tag: "Dwell", seconds: 0.5 },
        { _tag: "Rapid", to: { x: 30, y: 10, z: 5 } }
      ]
    },
    {
      id: "drill", name: "Drill", toolId: "2", spindleRpm: 6000, coolant: "off",
      moves: [
        { _tag: "Rapid", to: { x: 10, y: 10, z: 10 } },
        { _tag: "Cycle", cycle: "peck", to: { x: 10, y: 10, z: -8 }, feed: 150, peckDepth: 3, dwellSeconds: 0, retractHeight: 2 },
        { _tag: "Cycle", cycle: "peck", to: { x: 30, y: 10, z: -8 }, feed: 150, peckDepth: 3, dwellSeconds: 0, retractHeight: 2 },
        { _tag: "Rapid", to: { x: 30, y: 10, z: 10 } }
      ]
    }
  ])
