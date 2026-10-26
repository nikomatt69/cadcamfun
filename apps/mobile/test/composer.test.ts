import { expect, test } from "bun:test"
import { composerPlaceholder, modelPillLabel } from "../lib/composer"

test("the placeholder follows the connection, then the live turn, then the mode", () => {
  expect(composerPlaceholder({ offline: true, busy: true, mode: "cam" })).toContain("offline")
  expect(composerPlaceholder({ offline: false, busy: true, mode: "cam" })).toContain("Steer")
  expect(composerPlaceholder({ offline: false, busy: false, mode: "general" })).toBe("Ask CADCAMFUN…")
  expect(composerPlaceholder({ offline: false, busy: false, mode: "gcode" })).toContain("G-code")
})

test("the model pill shows a non-default mode and nothing for General", () => {
  expect(modelPillLabel("Sonnet 5.5", "general")).toBe("Sonnet 5.5")
  expect(modelPillLabel("Sonnet 5.5", "cam")).toBe("CAM · Sonnet 5.5")
})
