/**
 * The specialist agents the `cadcam` agent delegates to (nikcli's `Agent` roster and `SUBAGENT_TOOLSETS`): each has a
 * name, a prompt that says how it works, and a curated tool set, so a job runs with exactly the tools it needs and
 * nothing else. The host config (`config.ts`), the `agent` tool and the runner all read this one list.
 *
 * The lists name **tool ids**, and a tool may not mix effects, so the cut between reading and changing is enforced by
 * the catalogue: `cad`, `cam`, `library`, `vcs` and `memory` cannot change anything, while `cad_edit`, `cam_edit`,
 * `parts`, `library_edit`, `memory_edit`, `vcs_edit` and `agent` always do (`agents.test.ts` derives both halves).
 *
 * Every specialist starts in the background (nikcli's `background` defaults true): the call returns at once and the
 * completion wakes the parent with the report, unless the call passes `background: false` and waits. An agent that
 * edits the document (`edits`) still runs one at a time per project, and its tool calls reach the editor live through
 * the parent's stream (`adoptChildSession`).
 */

import { specialistPrompt } from "./prompts/index.ts"
import { SPECIALIST_NATIVE_TOOLS } from "./tool-registry.ts"
import { DESTRUCTIVE_TOOL_IDS } from "../tools/project-tools.ts"
import { HUMAN_APPROVAL, type PermissionRule } from "./permission-modes.ts"

export const SUBAGENT_IDS = ["researcher", "editor", "modeler", "machinist", "reviewer", "planner", "diagnostician", "verifier", "optimizer"] as const
export type SubagentId = (typeof SUBAGENT_IDS)[number]

export interface SubagentSpec {
  readonly id: SubagentId
  /** The agent's name in the host config. */
  readonly host: string
  /** What the UI calls it. */
  readonly title: string
  readonly description: string
  readonly prompt: string
  /** Tool ids it may call; ids the project did not register are left out of its permissions. */
  readonly tools: ReadonlyArray<string>
  /** Changes the drawing or the operations (so it runs alone, and its results are mirrored into the editor). */
  readonly edits: boolean
  readonly steps: number
  readonly timeoutMs: number
}

const MINUTE = 60_000

/** Read-only view of the drawing, the machine, the libraries, the project history, the stored mods and the outside world. */
const READS = ["cad", "cam", "library", "vcs", "memory", "mods", "research"] as const

export const SUBAGENTS: Readonly<Record<SubagentId, SubagentSpec>> = {
  researcher: {
    id: "researcher",
    title: "CAD/CAM researcher",
    host: "cadcam-worker",
    description: "Read-only investigator: inspects the drawing, operations, machine, materials, tools and G-code and returns findings. Cannot change anything.",
    prompt: specialistPrompt("researcher"),
    // Verification stores a program and a report (`cam_edit`), so it is not here: this role reads reports, it does not make them.
    tools: [...READS],
    edits: false,
    steps: 40,
    timeoutMs: 5 * MINUTE
  },
  editor: {
    id: "editor",
    title: "CAD editor",
    host: "cadcam-editor",
    description: "Minimal-change editor: changes, moves, scales, regroups or removes specific existing entities and touches nothing else. Use for \"make this hole 8 mm\", \"move the bracket 20 mm up\", \"rename the layer\".",
    prompt: specialistPrompt("editor"),
    // It edits and places saved parts; the libraries stay read-only for this role.
    tools: ["cad", "cad_edit", "library", "parts", "memory", "research", "vcs"],
    edits: true,
    steps: 40,
    timeoutMs: 8 * MINUTE
  },
  modeler: {
    id: "modeler",
    title: "3D modeller",
    host: "cadcam-modeler",
    description: "3D modeller: builds new geometry (solids, booleans, revolutions, imported drawings) for one well-described part or group.",
    prompt: specialistPrompt("modeler"),
    // A reusable part comes from the project's components; a new cutter or machine is a decision for the machinist or the user.
    tools: ["cad", "cad_edit", "library", "parts", "memory", "research", "vcs"],
    edits: true,
    steps: 60,
    timeoutMs: 10 * MINUTE
  },
  machinist: {
    id: "machinist",
    title: "CAM programmer",
    host: "cadcam-machinist",
    description: "CAM programmer: creates and updates machining operations for existing geometry, generates G-code, analyses it and simulates the toolpath.",
    prompt: specialistPrompt("machinist"),
    // The CAM specialist owns the libraries: it reads them, and may add a cutter, a material or a machine the shop
    // actually has, or remove one that is gone. Model confirmation is not native human approval.
    // It holds no `vcs_edit`: workflow triggering shares that tool with commit, restore and the pull request, and no
    // specialist may commit (spec 08 §specialists, spec 26 §6.5). The main agent runs the workflows.
    tools: ["cad", "cam", "cam_edit", "library", "library_edit", "memory", "research", "vcs"],
    edits: true,
    steps: 60,
    timeoutMs: 10 * MINUTE
  },
  reviewer: {
    id: "reviewer",
    title: "Design and program reviewer",
    host: "cadcam-reviewer",
    description: "Reviews a pull request: reads the diff, the workflow runs and the verification reports, then writes a verdict. Read-only.",
    prompt: specialistPrompt("reviewer"),
    tools: ["cad", "cam", "library", "vcs", "memory", "mods"],
    edits: false,
    steps: 40,
    timeoutMs: 5 * MINUTE
  },
  planner: {
    id: "planner",
    title: "Build and machining planner",
    host: "cadcam-planner",
    description: "Read-only planner (nikcli's planning agent): turns a request into an ordered build and machining plan with layers, parts, values, tools and the risks it found. Use it before a large or ambiguous job.",
    prompt: specialistPrompt("planner"),
    tools: [...READS],
    edits: false,
    // A plan can gate the next step: the caller passes `background: false` when it must wait for it.
    steps: 40,
    timeoutMs: 5 * MINUTE
  },
  diagnostician: {
    id: "diagnostician",
    title: "Failure diagnostician",
    host: "cadcam-diagnostician",
    description: "Read-only debugger (nikcli's debugging agent): finds the root cause of a failed check, a verification error, a gouge, a collision, a rapid in material or a refused call, and says exactly what to change. Does not repair.",
    prompt: specialistPrompt("diagnostician"),
    tools: [...READS],
    edits: false,
    steps: 40,
    timeoutMs: 5 * MINUTE
  },
  verifier: {
    id: "verifier",
    title: "Verification runner",
    host: "cadcam-verifier",
    description: "Test runner (nikcli's test-runner): generates a missing program, runs the model checks, the DFM rules, the static G-code analysis and the toolpath simulation, and reports what passed, what failed and what was not modelled. Does not fix.",
    prompt: specialistPrompt("verifier"),
    // `cam_verify`, not `cam_edit`: it generates and verifies an existing program; it cannot create, update, set stock or release.
    tools: ["cad", "cam", "cam_verify", "library", "vcs", "memory"],
    edits: true,
    steps: 40,
    timeoutMs: 10 * MINUTE
  },
  optimizer: {
    id: "optimizer",
    title: "Toolpath optimizer",
    host: "cadcam-optimizer",
    description: "Refactor agent (nikcli's refactor agent) for CAM: shortens cycle time and improves tool life of existing operations without changing the part, the stock or the finish; measures before and after.",
    prompt: specialistPrompt("optimizer"),
    tools: ["cad", "cam", "cam_edit", "library", "memory", "research", "vcs"],
    edits: true,
    steps: 60,
    timeoutMs: 10 * MINUTE
  }
}

export const isSubagentId = (value: unknown): value is SubagentId =>
  typeof value === "string" && (SUBAGENT_IDS as ReadonlyArray<string>).includes(value)

export const subagentById = (id: string | undefined): SubagentSpec => SUBAGENTS[isSubagentId(id) ? id : "researcher"]

/** A specialist's permission block: deny everything, allow its tools (those the project registered) and the playbooks. */
export const subagentPermission = (spec: SubagentSpec, registeredToolIds: ReadonlyArray<string>): Record<string, PermissionRule> => {
  const permission: Record<string, PermissionRule> = { "**": "deny" }
  for (const id of spec.tools) if (registeredToolIds.includes(id)) permission[id] = "allow"
  // A tool that contains a destructive action asks natively; the catalogue is where that is decided.
  for (const id of DESTRUCTIVE_TOOL_IDS) if (permission[id] === "allow") permission[id] = HUMAN_APPROVAL
  for (const id of SPECIALIST_NATIVE_TOOLS) permission[id] = "allow"
  // The confined program runner sees only the tools allowed above.
  permission["code_mode"] = "allow"
  return permission
}

/** What the model reads in the `agent.start` description: who it can delegate to. */
export const subagentCatalogue = (): string =>
  SUBAGENT_IDS.map((id) => {
    const spec = SUBAGENTS[id]
    return `- ${id}${spec.edits ? " (edits the document)" : " (read-only)"}: ${spec.description} Tools: ${spec.tools.join(", ")}.`
  }).join("\n")

/**
 * Sessions a specialist runs in, by the parent session that started it. The parent's event stream also carries the tool
 * calls of its specialists (so the editor shows their changes as they happen); everything else a child session says stays
 * with the child.
 */
const children = new Map<string, Map<string, SubagentId>>()

export const adoptChildSession = (parentSessionId: string, childSessionId: string, agent: SubagentId = "researcher"): (() => void) => {
  let map = children.get(parentSessionId)
  if (map === undefined) children.set(parentSessionId, (map = new Map()))
  map.set(childSessionId, agent)
  return () => {
    const current = children.get(parentSessionId)
    current?.delete(childSessionId)
    if (current?.size === 0) children.delete(parentSessionId)
  }
}

/** The specialist running in `sessionId` for this parent, or undefined when that session is not one of its children. */
export const childAgent = (parentSessionId: string, sessionId: string): SubagentId | undefined =>
  children.get(parentSessionId)?.get(sessionId)