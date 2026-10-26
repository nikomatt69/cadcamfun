import { expect, test } from "bun:test"
import {
  COUNT_FROM,
  COUNT_WARN,
  cameraRowSubtitle,
  canAttachMore,
  characterCount,
  composerPlaceholder,
  inputHeights,
  modeChipAccessibilityLabel,
  modeLabel,
  parseSlashCommand,
  savedMessagesLabel,
  slashCommands,
  slashQuery,
  stepMode,
} from "../lib/composer"
import { MAX_ATTACHMENTS } from "../lib/attachments"

test("the placeholder follows the connection, then the live turn, then the mode", () => {
  expect(composerPlaceholder({ offline: true, busy: true, mode: "cam" })).toContain("offline")
  expect(composerPlaceholder({ offline: false, busy: true, mode: "cam" })).toContain("Steer")
  expect(composerPlaceholder({ offline: false, busy: false, mode: "general" })).toContain("type /")
  expect(composerPlaceholder({ offline: false, busy: false, mode: "gcode" })).toContain("G-code")
})

test("the focus chip names every mode, including the default", () => {
  expect(modeLabel("general")).toBe("General")
  expect(modeLabel("gcode")).toBe("G-code")
  expect(modeChipAccessibilityLabel("cam")).toBe("Focus: CAM")
})

test("stepping the focus wraps around the list in both directions", () => {
  expect(stepMode("general", 1)).toBe("cad")
  expect(stepMode("general", -1)).toBe("gcode")
  expect(stepMode("gcode", 1)).toBe("general")
})

test("the character count appears past 100 and warns past 400", () => {
  expect(characterCount(COUNT_FROM)).toEqual({ visible: false, warn: false })
  expect(characterCount(COUNT_FROM + 1)).toEqual({ visible: true, warn: false })
  expect(characterCount(COUNT_WARN)).toEqual({ visible: true, warn: false })
  expect(characterCount(COUNT_WARN + 1)).toEqual({ visible: true, warn: true })
})

test("the editor grows with the text size but never past twice", () => {
  expect(inputHeights(1)).toEqual({ line: 22, min: 42, max: 152 })
  expect(inputHeights(0.8).line).toBe(22)
  expect(inputHeights(1.5).line).toBe(33)
  expect(inputHeights(3).line).toBe(44)
  expect(inputHeights(1.5).max).toBeGreaterThan(inputHeights(1).max)
})

test("saved messages read as a count with the right plural", () => {
  expect(savedMessagesLabel(1)).toStartWith("1 message saved")
  expect(savedMessagesLabel(3)).toStartWith("3 messages saved")
})

test("the camera row reports how full the message is and stops at the limit", () => {
  expect(cameraRowSubtitle(0)).toContain("Photograph")
  expect(cameraRowSubtitle(2)).toBe(`2 of ${MAX_ATTACHMENTS} attached · add another`)
  expect(cameraRowSubtitle(MAX_ATTACHMENTS)).toContain("remove one")
  expect(canAttachMore(MAX_ATTACHMENTS - 1)).toBe(true)
  expect(canAttachMore(MAX_ATTACHMENTS)).toBe(false)
})

test("a slash offers the focus commands and narrows as the word is typed", () => {
  expect(slashCommands("/").map((command) => command.name)).toEqual(["general", "cad", "cam", "toolpath", "gcode"])
  expect(slashCommands("/ca").map((command) => command.name)).toEqual(["cad", "cam"])
  expect(slashCommands("  /T").map((command) => command.name)).toEqual(["toolpath"])
  expect(slashCommands("/g-c").map((command) => command.name)).toEqual(["gcode"])
  expect(slashCommands("/zzz")).toEqual([])
})

test("the command row only shows while the first word is still being typed", () => {
  expect(slashQuery("/")).toBe("")
  expect(slashQuery("/cam")).toBe("cam")
  expect(slashQuery("hello /cam")).toBeUndefined()
  expect(slashQuery("/cam ")).toBeUndefined()
  expect(slashQuery("/cam face")).toBeUndefined()
  expect(slashCommands("plain text")).toEqual([])
})

test("a finished command is split from the message that follows it", () => {
  expect(parseSlashCommand("/cam")).toMatchObject({ command: { mode: "cam" }, rest: "" })
  expect(parseSlashCommand("/cam face the top")).toMatchObject({ command: { mode: "cam" }, rest: "face the top" })
  expect(parseSlashCommand("  /G-code  review the file ")).toMatchObject({ command: { mode: "gcode" }, rest: "review the file" })
  expect(parseSlashCommand("/cam\nline two")).toMatchObject({ command: { mode: "cam" }, rest: "line two" })
})

test("only a complete command name counts, so paths and partial words stay ordinary text", () => {
  expect(parseSlashCommand("/ca")).toBeUndefined()
  expect(parseSlashCommand("/usr/bin")).toBeUndefined()
  expect(parseSlashCommand("/cad/foo")).toBeUndefined()
  expect(parseSlashCommand("/")).toBeUndefined()
  expect(parseSlashCommand("cam")).toBeUndefined()
})
