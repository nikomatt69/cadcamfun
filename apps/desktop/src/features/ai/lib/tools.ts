/**
 * The tool ids the embedded nikcli host registers for the `cadcam` agent: the consolidated tools of the action
 * catalogue (`packages/ai/src/actions/catalogue.ts`), one per capability group, each carrying its actions behind an
 * `action` discriminator.
 *
 * This file holds only what the interface cannot derive — the title and category the UI shows per tool. The list of
 * ids is a contract in its own right, and `ai.test.ts` compares it against the catalogue's tools: a tool the host
 * registers and the desktop does not know would be rejected by the SSE validation layer as "not allowed", so the two
 * must name the same capabilities. `cam_verify` is an exposure: the verifier's narrow view of `cam_edit` (generate and
 * verify only), with the same action ids, so it renders as `cam_edit` does.
 */
export const TOOL_IDS = [
  "cad", "cad_edit", "cam", "cam_edit", "library", "parts", "library_edit",
  "memory", "memory_edit", "research", "vcs", "vcs_edit", "agent", "cam_verify"
] as const

/** The canonical tool an exposure carries actions of: the row, the facts and the mirrors key on the canonical id. */
export const CANONICAL_TOOL: Readonly<Record<string, string>> = { cam_verify: "cam_edit" }
export const canonicalTool = (tool: string): string => CANONICAL_TOOL[tool] ?? tool

export type ToolId = (typeof TOOL_IDS)[number]

/** Version control, described apart from the CAD/CAM capabilities; `agent` is a catalogue tool like `cad_edit`. */
export const VCS_TOOL_IDS = ["vcs", "vcs_edit"] as const
export const PROGRAM_TOOL_ID = "code_mode"

export interface ToolSummary {
  readonly id: ToolId
  readonly category: "cad" | "cam" | "library" | "memory" | "research" | "agents"
  readonly title: string
  readonly description: string
}

export const TOOL_SUMMARIES: ReadonlyArray<ToolSummary> = [
  { id: "cad", category: "cad", title: "Read the drawing", description: "Describe what is in the open drawing, check what is illogical in it, search and page through its elements, inspect component relationships, run parametric design rules and capture the viewport." },
  { id: "cad_edit", category: "cad", title: "Edit the drawing", description: "Add 3D elements and 2D entities, modify, transform, group, import a drawing, create or update a parametric part, control the editor and delete — the destructive actions ask first." },
  { id: "cam", category: "cam", title: "Read the machining", description: "The machine's axes and zeros, the operations, the stock, suggested cutting parameters, static G-code analysis and the CAM viewport." },
  { id: "cam_edit", category: "cam", title: "Machine", description: "Create and update an operation, generate its G-code and verify the program against the stock, the holder, the fixtures and the finished part." },
  { id: "cam_verify", category: "cam", title: "Verify a program", description: "The verifier's view of machining: generate an existing operation's program and verify the stored program, without creating or changing operations or stock." },
  { id: "library", category: "library", title: "Read the libraries", description: "Saved components, materials, cutters and machine configurations the user already owns." },
  { id: "parts", category: "library", title: "Reusable parts", description: "Save a group of elements as a component, place it again, or remove it." },
  { id: "library_edit", category: "library", title: "Write the libraries", description: "Create or replace a material, a cutter or a machine configuration and set the project defaults." },
  { id: "memory", category: "memory", title: "Read the notes", description: "The notes and the standing context this project keeps between conversations." },
  { id: "memory_edit", category: "memory", title: "Write the notes", description: "Save a confirmed fact, or replace a section of the project's standing context." },
  { id: "research", category: "research", title: "Research", description: "A live web search over technical sources and paged reading of the files the user attached." },
  { id: "agent", category: "agents", title: "Delegate to a specialist", description: "Hand a job to the researcher, editor, modeler, machinist, reviewer, planner, diagnostician, verifier or optimizer agent, each with only the tools its job needs; list, read and cancel their tasks." },
  // `vcs` and `vcs_edit` are deliberately absent: they are not CAD/CAM capabilities, so they are described in
  // `EXTRA_TOOL_SUMMARIES` with the host's own program runner.
  // test asserts one summary per CAD/CAM tool. They are described in `EXTRA_TOOL_SUMMARIES` below, with the host's
  // own tools. `agent` is in `TOOL_IDS` because the host registers it like any other catalogue tool.
]

export interface ExtraToolSummary {
  readonly id: (typeof VCS_TOOL_IDS)[number] | typeof PROGRAM_TOOL_ID
  readonly category: "vcs" | "program"
  readonly title: string
  readonly description: string
}

/** The host's program runner and the version-control tools, shown beside the CAD/CAM ones. */
export const EXTRA_TOOL_SUMMARIES: ReadonlyArray<ExtraToolSummary> = [
  { id: "code_mode", category: "program", title: "Run a program", description: "Write a short program in a confined JavaScript subset that calls the CAD/CAM tools in loops (patterns, lattices, many operations) and returns one value." },
  { id: "vcs", category: "vcs", title: "Read the history", description: "Branch, uncommitted files, entity-level diff between two revisions and the pull requests of the project." },
  { id: "vcs_edit", category: "vcs", title: "Record the work", description: "Start an ai/* branch, commit, roll named ids back, open a pull request and run the project's workflows." }
]

const BY_ID = new Map<string, string>([...TOOL_SUMMARIES, ...EXTRA_TOOL_SUMMARIES].map((tool) => [tool.id, tool.title]))

/**
 * The title the chat shows for one tool call: the tool's own title, with its action when the tool carries more than
 * one (`cad_edit delete` reads as what happened, where `cad_edit` alone does not).
 */
export const toolTitle = (id: string, action?: string): string => {
  const base = BY_ID.get(id) ?? id
  return action === undefined || action === "" ? base : `${base}: ${action.replaceAll("_", " ")}`
}