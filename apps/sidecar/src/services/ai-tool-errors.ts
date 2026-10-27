/**
 * Why an assistant tool refused to act. Each is a typed failure of the tool's Effect and carries the sentence the model reads;
 * at the tool boundary (`toolRefusal`) they become the `{ ok: false, error }` answer instead of a thrown error.
 */
import { Data } from "effect"
import type { TurnCancelled } from "./acting-user.ts"

/** The project does not exist or the acting account cannot see it. */
export class ProjectNotAccessible extends Data.TaggedError("ProjectNotAccessible")<{ readonly projectId: string; readonly message: string }> {
  constructor(projectId: string, message = "Project not found or not accessible.") {
    super({ projectId, message })
  }
}

/** The acting account may read the project but not change it. */
export class WriteForbidden extends Data.TaggedError("WriteForbidden")<{ readonly projectId: string; readonly message: string }> {
  constructor(projectId: string) {
    super({ projectId, message: "You do not have permission to write this project." })
  }
}

/** The drawing the tool would act on cannot be resolved (gone, ambiguous, or none yet); the message says what to do. */
export class DrawingUnavailable extends Data.TaggedError("DrawingUnavailable")<{ readonly message: string }> {}

/** A cancelled turn (`TurnCancelled`, from `acting-user.ts`) is a refusal too. */
export type ToolAccessError = ProjectNotAccessible | WriteForbidden | TurnCancelled | DrawingUnavailable

/** The answer a tool gives the model for a refusal. */
export const toolRefusal = (error: ToolAccessError): { readonly ok: false; readonly error: string } => ({ ok: false, error: error.message })
