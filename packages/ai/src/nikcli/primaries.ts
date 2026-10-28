/// <reference path="../text.d.ts" />
/**
 * The agents a person talks to: exactly two, structured after nikcli's primary agents and adapted to CAD/CAM.
 * There is no General, CAD or CAM agent: both primaries use the CAD and the CAM tools and every assistant-mode
 * focus (CAD, CAM, G-code, toolpath, general) mixed, as the task requires. The only difference is editing:
 *
 * - `build` does drawing and machining itself, end to end, and delegates separable work to the specialist
 *   subagents (`agents.ts`) with the `agent` tool, in the background by default.
 * - `plan` is read-only across drawing and machining: it holds no write tool, no `agent` delegation and no
 *   `code_mode`, so it cannot change anything directly or through a specialist or a program. It investigates
 *   with every focus, reads both sides, and hands its plan to Build in the same conversation.
 *
 * Assistant modes (`prompts/modes.ts`) stay orthogonal prompt focus for both primaries: a mode never grants or
 * denies a tool. Older clients may still send `general`, `cad`, `cam` (or the old host names `cadcam`,
 * `cadcam-cad`, `cadcam-cam`): `resolvePrimary` maps them to `build`, so stored conversations and preferences
 * keep working on the editing agent instead of failing.
 */
import { WRITE_TOOL_IDS } from "../tools/project-tools.ts"
import delegation from "../prompts/awareness/delegation.txt" with { type: "text" }
import research from "../prompts/awareness/research.txt" with { type: "text" }
import mods from "../prompts/awareness/mods.txt" with { type: "text" }

export const PRIMARY_IDS = ["build", "plan"] as const
export type PrimaryId = (typeof PRIMARY_IDS)[number]

export interface PrimarySpec {
  readonly id: PrimaryId
  /** The agent's name in the host config. */
  readonly host: string
  readonly title: string
  readonly description: string
  /** Appended to the role prompt: what this agent owns and who it delegates the rest to. */
  readonly focus: string
  /** Tool ids this primary does not hold even when the project registered them. */
  readonly without: ReadonlyArray<string>
  /** Whether this primary may change the document at all (false only for `plan`). */
  readonly canEdit: boolean
  /** Whether this primary may delegate to specialist subagents (false only for `plan`, which must not edit by proxy). */
  readonly delegates: boolean
  /** Work posture: an editing executor or a read-only planner. */
  readonly kind: "build" | "plan"
}

/**
 * nikcli composes a primary agent's prompt from a short role line and reusable "awareness" blocks (`agent/agent.ts`
 * `PRIMARY_AGENT_DELEGATION_AWARENESS`, `MONITOR_TOOL_AWARENESS`, …); the blocks here are `prompts/awareness/*.txt`, written
 * for CAD/CAM. Plan takes none of them: it holds no delegation and no write, and a block that teaches a tool its agent cannot
 * call only invites the call. Its turn-level rules arrive as a reminder when it is entered (`prompts/reminders.ts`).
 */
const composeFocus = (role: string, ...blocks: ReadonlyArray<string>): string => [role, ...blocks.map((block) => block.trim())].join("\n\n")

const BUILD_ROLE = "You are the Build agent: you do the work yourself, end to end, across the drawing and the machining. You hold every CAD and CAM tool and every assistant-mode focus (CAD, CAM, G-code, toolpath and general) — the focus only guides the work, it never limits your tools, and you move between focuses as the task requires. Build in small checked steps: model or edit the geometry, check it, set up and generate the operations, generate and analyse the G-code, verify the toolpath, and report what the evidence shows."

export const PRIMARIES: Readonly<Record<PrimaryId, PrimarySpec>> = {
  build: {
    id: "build",
    host: "cadcam-build",
    title: "Build",
    description: "Build agent: builds and machines end to end itself — drawing, 3D model, operations, G-code and verification — using CAD and CAM together and every mode focus, delegating only separable work.",
    focus: composeFocus(BUILD_ROLE, delegation, research, mods),
    without: [],
    canEdit: true,
    delegates: true,
    kind: "build"
  },
  plan: {
    id: "plan",
    host: "cadcam-plan",
    title: "Plan",
    description: "Plan agent: read-only across drawing and machining. Investigates with CAD and CAM together and every mode focus, then returns an ordered, executable plan. Cannot change anything.",
    focus: "You are the Plan agent: you plan, you never execute. You hold only reads across the drawing, the machining, the libraries, the version control and the memory, and you can use every assistant-mode focus (CAD, CAM, G-code, toolpath and general) — the focus only guides the investigation. You can plan any job this application does: a 3D part or an assembly, a parametric change, an imported drawing, milling, turning or printing with their operations and G-code, the review or repair of an existing program, a library or version-control change. Never claim to have created, edited, generated or verified anything saved. Return an ordered plan the Build agent can execute without guessing: current state and evidence read, steps in order with the tool and values each step uses, CAD steps before the CAM steps that depend on them, risks and unknowns, and how each result is checked (design check, plan check, G-code analysis, simulation and review). Keep the plan in your todo list as you investigate, and mark steps done only when the evidence for them was actually read.",
    // Every write tool, plus the two indirect write paths: delegation to an editing specialist and the program runner.
    without: [...WRITE_TOOL_IDS, "agent", "code_mode"],
    canEdit: false,
    delegates: false,
    kind: "plan"
  }
}

export const isPrimaryId = (value: unknown): value is PrimaryId =>
  typeof value === "string" && (PRIMARY_IDS as ReadonlyArray<string>).includes(value)

/** Legacy primary ids and host names of the removed General/CAD/CAM agents; all were editing agents, so they land on Build. */
const LEGACY_TO_BUILD: ReadonlyArray<string> = ["general", "cad", "cam", "cadcam", "cadcam-cad", "cadcam-cam"]

export const resolvePrimary = (value: string | undefined): PrimaryId | undefined =>
  value === undefined || LEGACY_TO_BUILD.includes(value) ? "build" : isPrimaryId(value) ? value : undefined

/**
 * A stored host agent name (what the host keeps on a session's messages, with its permission-mode suffix) in terms of
 * the current roster: the host names of the removed General/CAD/CAM agents become the Build host, the suffix is kept.
 */
export const currentHostAgent = (name: string | undefined): string | undefined => {
  if (name === undefined) return undefined
  const suffix = name.endsWith("-auto") ? "-auto" : name.endsWith("-ask") ? "-ask" : ""
  const base = suffix === "" ? name : name.slice(0, -suffix.length)
  return base === "cadcam" || base === "cadcam-cad" || base === "cadcam-cam" ? `${PRIMARIES.build.host}${suffix}` : name
}
