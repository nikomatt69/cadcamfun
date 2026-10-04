import { Context, Effect, Layer, Schema } from "effect"
import * as Machines from "./machine"
import * as Materials from "./material"
import * as Tools from "./tool"

export class NotInLibrary extends Schema.TaggedError<NotInLibrary>()("NotInLibrary", {
  kind: Schema.Literals(["tool", "material", "machine"]),
  id: Schema.String,
}) {
  override get message() {
    return `Unknown ${this.kind}: ${this.id}`
  }
}

/** Source of tools, materials and machines. Swap the layer to back it with a database. */
export class CamLibrary extends Context.Service<
  CamLibrary,
  {
    readonly tools: Effect.Effect<ReadonlyArray<Tools.Tool>>
    readonly materials: Effect.Effect<ReadonlyArray<Materials.Material>>
    readonly machines: Effect.Effect<ReadonlyArray<Machines.Machine>>
    readonly tool: (id: string) => Effect.Effect<Tools.Tool, NotInLibrary>
    readonly material: (id: string) => Effect.Effect<Materials.Material, NotInLibrary>
    readonly machine: (id: string) => Effect.Effect<Machines.Machine, NotInLibrary>
  }
>()("@cadcamfun/cam/CamLibrary") {
  static readonly make = (input: {
    readonly tools: ReadonlyArray<Tools.Tool>
    readonly materials: ReadonlyArray<Materials.Material>
    readonly machines: ReadonlyArray<Machines.Machine>
  }) => {
    const find =
      <A extends { readonly id: string }>(kind: NotInLibrary["kind"], items: ReadonlyArray<A>) =>
      (id: string): Effect.Effect<A, NotInLibrary> => {
        const item = items.find((i) => i.id === id)
        return item ? Effect.succeed(item) : Effect.fail(new NotInLibrary({ kind, id }))
      }
    return CamLibrary.of({
      tools: Effect.succeed(input.tools),
      materials: Effect.succeed(input.materials),
      machines: Effect.succeed(input.machines),
      tool: find("tool", input.tools),
      material: find("material", input.materials),
      machine: find("machine", input.machines),
    })
  }

  /** Built-in presets. */
  static readonly layer = Layer.succeed(
    CamLibrary,
    CamLibrary.make({ tools: Tools.presets, materials: Materials.presets, machines: Machines.presets }),
  )
}
