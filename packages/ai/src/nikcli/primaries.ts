/**
 * The agents a person talks to. There are three, and every other agent of the roster (`agents.ts`) is a subagent that
 * one of them delegates to with the `agent` tool (background tasks included):
 *
 * - `general` does both drawing and machining, and delegates what is separable. It is the default and the only one
 *   whose host name predates this list (`cadcam`), so conversations stored under it keep working.
 * - `cad` is for the drawing: it holds every drawing tool and none of the machining writes.
 * - `cam` is for the machine: it holds every machining tool and none of the drawing writes.
 *
 * A primary only narrows what changes the document. The reads, version control, memory, research and delegation are the
 * same for all three, so a CAD conversation can still look at the operations and a CAM one at the drawing.
 */

export const PRIMARY_IDS = ["general", "cad", "cam"] as const
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
}

export const PRIMARIES: Readonly<Record<PrimaryId, PrimarySpec>> = {
  general: {
    id: "general",
    host: "cadcam",
    title: "General",
    description: "Does drawing and machining itself, and delegates separable work to subagents (background tasks included).",
    focus: "",
    without: []
  },
  cad: {
    id: "cad",
    host: "cadcam-cad",
    title: "CAD",
    description: "Drawing and 3D modelling. Reads the machining side but does not change operations, G-code or the machining libraries.",
    focus: "You are the CAD agent: you own the drawing, the 3D model, parametric parts and the components. You can read the operations and the machine but you do not change them: when the job needs machining, say what the CAM agent has to do, or hand it to the machinist subagent. Delegate separable drawing work (a new part, a narrow edit, an investigation) to the modeler, editor, planner or researcher subagents, in the background when it does not block the next step.",
    without: ["cam_edit", "library_edit"]
  },
  cam: {
    id: "cam",
    host: "cadcam-cam",
    title: "CAM",
    description: "Machining: operations, G-code, verification and the machining libraries. Reads the drawing but does not change it.",
    focus: "You are the CAM agent: you own the operations, the toolpaths, the G-code, the verification and the tool, material and machine libraries. You can read the drawing but you do not change it: when the geometry has to change, say what the CAD agent has to do. Delegate separable machining work (an operation sequence, a check, a faster cycle, a failure diagnosis) to the machinist, verifier, optimizer or diagnostician subagents, in the background when it does not block the next step.",
    without: ["cad_edit", "parts"]
  }
}

export const isPrimaryId = (value: unknown): value is PrimaryId =>
  typeof value === "string" && (PRIMARY_IDS as ReadonlyArray<string>).includes(value)

/** `cadcam` is the legacy name of the general agent. */
export const resolvePrimary = (value: string | undefined): PrimaryId | undefined =>
  value === undefined || value === PRIMARIES.general.host ? "general" : isPrimaryId(value) ? value : undefined
