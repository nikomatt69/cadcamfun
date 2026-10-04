import { Context, Effect, Layer, Stream, SubscriptionRef } from "effect"
import { Commands, History, type CadDocument, type Command, type CommandError } from "@cadcamfun/core"
import type { Program, Setup } from "@cadcamfun/cam"

export interface WorkspaceState {
  readonly history: History.History
  readonly setup: Setup
  /** Last generated program and its G-code, cleared when the design or setup changes. */
  readonly output?: { readonly program: Program; readonly gcode: string; readonly controller: string }
}

/**
 * The live editing session shared by the UI and the AI agent: an undoable document,
 * its CAM setup and the last generated output. Every change is published on `changes`.
 */
export class Workspace extends Context.Service<
  Workspace,
  {
    readonly state: Effect.Effect<WorkspaceState>
    readonly document: Effect.Effect<CadDocument>
    readonly execute: (command: Command) => Effect.Effect<CadDocument, CommandError>
    readonly undo: Effect.Effect<CadDocument>
    readonly redo: Effect.Effect<CadDocument>
    readonly updateSetup: (f: (setup: Setup) => Setup) => Effect.Effect<Setup>
    readonly setOutput: (output: NonNullable<WorkspaceState["output"]>) => Effect.Effect<void>
    readonly changes: Stream.Stream<WorkspaceState>
  }
>()("@cadcamfun/ai/Workspace") {
  static readonly make = Effect.fnUntraced(function* (document: CadDocument, setup: Setup) {
    const ref = yield* SubscriptionRef.make<WorkspaceState>({ history: History.make(document), setup })
    const present = (s: WorkspaceState) => s.history.present
    return Workspace.of({
      state: SubscriptionRef.get(ref),
      document: SubscriptionRef.get(ref).pipe(Effect.map(present)),
      execute: (command) =>
        SubscriptionRef.modifyEffect(ref, (s) =>
          History.execute(s.history, command).pipe(
            Effect.map((history) => [history.present, { ...s, history, output: undefined }] as const),
          ),
        ),
      undo: SubscriptionRef.modify(ref, (s) => {
        const history = History.undo(s.history)
        return [history.present, { ...s, history, output: undefined }] as const
      }),
      redo: SubscriptionRef.modify(ref, (s) => {
        const history = History.redo(s.history)
        return [history.present, { ...s, history, output: undefined }] as const
      }),
      updateSetup: (f) =>
        SubscriptionRef.modify(ref, (s) => {
          const setup = f(s.setup)
          return [setup, { ...s, setup, output: undefined }] as const
        }),
      setOutput: (output) => SubscriptionRef.update(ref, (s) => ({ ...s, output })),
      changes: SubscriptionRef.changes(ref),
    })
  })

  static readonly layer = (document: CadDocument, setup: Setup) =>
    Layer.effect(Workspace, Workspace.make(document, setup))
}

export const defaultSetup: Setup = { machineId: "hobby-grbl", materialId: "mdf", safeZ: 5, operations: [] }

export { Commands }
