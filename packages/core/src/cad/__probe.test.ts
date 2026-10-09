import { test } from "bun:test"
import { meshOf, meshVolume } from "./solid.ts"
test("topology", () => {
  const box = meshOf({ _tag: "Box", origin: { x: 0, y: 0, z: 0 }, size: { x: 30, y: 30, z: 30 } }, 0.1)
  console.log("positions.length", box.positions.length, "ctor", box.positions.constructor.name)
  console.log("indices.length", box.indices.length, "ctor", box.indices.constructor.name)
  console.log("first 12 positions", Array.from(box.positions.slice(0, 12)))
  console.log("first 9 indices", Array.from(box.indices.slice(0, 9)))
  // count unique positions
  const seen = new Set<string>()
  for (let i = 0; i < box.positions.length; i += 3) seen.add(`${box.positions[i]},${box.positions[i+1]},${box.positions[i+2]}`)
  console.log("unique vertices", seen.size)
  console.log("volume", meshVolume(box))
})
