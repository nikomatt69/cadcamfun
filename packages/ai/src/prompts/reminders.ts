/// <reference path="../text.d.ts" />
/**
 * The two reminders nikcli adds to a user message when the primary agent changes (`session/prompt.ts` `insertReminders`,
 * `session/prompt/build-switch.txt`), written for CAD/CAM. A reminder is a short synthetic part of the turn's user message,
 * sent once when the situation changes and never again, so the history stays an append-only prefix; the standing role of
 * each primary is in its agent prompt (`nikcli/primaries.ts`), not here.
 */
import { PRIMARY_IDS, PRIMARIES, type PrimaryId } from "../nikcli/primaries.ts"
import planMode from "./reminders/plan-mode.txt" with { type: "text" }
import buildSwitch from "./reminders/build-switch.txt" with { type: "text" }

export const PLAN_MODE_REMINDER = planMode.trim()
export const BUILD_SWITCH_REMINDER = buildSwitch.trim()

/** The primary a host agent name belongs to (`cadcam-plan`, `cadcam-plan-auto`, …), or undefined for anything else. */
export const primaryOfHost = (name: string | undefined): PrimaryId | undefined => {
  if (name === undefined) return undefined
  const base = name.endsWith("-auto") ? name.slice(0, -"-auto".length) : name.endsWith("-ask") ? name.slice(0, -"-ask".length) : name
  return PRIMARY_IDS.find((id) => PRIMARIES[id].host === base)
}

/**
 * The reminder this turn needs, if any. `previous` is the primary of the session's latest assistant message (undefined on a
 * first turn or when it came from something that is not a primary, such as a specialist).
 *
 * - entering Plan (first turn, or coming from Build): the plan-mode rules;
 * - leaving Plan for Build: the build switch;
 * - staying in the same primary: nothing.
 */
export const reminderFor = (current: PrimaryId | undefined, previous: PrimaryId | undefined): string | undefined => {
  if (current === "plan" && previous !== "plan") return PLAN_MODE_REMINDER
  if (current === "build" && previous === "plan") return BUILD_SWITCH_REMINDER
  return undefined
}
