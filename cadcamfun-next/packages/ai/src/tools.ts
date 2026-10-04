import { Effect, Schema } from "effect"
import { Doc, Elements, ElementId, Geometry, Transform, type CadDocument, type Element } from "@cadcamfun/core"
import { Analyze, CamLibrary, Machines, Operations, Post, generateProgram } from "@cadcamfun/cam"
import { Tool, ToolFailure } from "@cadcamfun/llm"
import { Workspace } from "./workspace"

const round = (n: number) => Math.round(n * 1000) / 1000

const describeElement = (e: Element) => {
  const b = Elements.boundsOf(e)
  return {
    id: e.id,
    type: e._tag,
    layerId: e.layerId,
    ...(e.name ? { name: e.name } : {}),
    closed: Elements.isClosed(e),
    area: round(Elements.area(e)),
    perimeter: round(Elements.perimeter(e)),
    bounds: b && { min: { x: round(b.min.x), y: round(b.min.y) }, max: { x: round(b.max.x), y: round(b.max.y) } },
  }
}

export const summarize = (doc: CadDocument) => ({
  name: doc.name,
  units: doc.units,
  revision: doc.revision,
  activeLayerId: doc.activeLayerId,
  layers: doc.layers,
  bounds: Doc.bounds(doc) ?? null,
  elements: doc.elements.map(describeElement),
})

const toFailure = (error: { readonly message: string }) => new ToolFailure({ message: error.message })

const Json = Schema.Unknown

/**
 * CAD/CAM tools for the agent. Built inside an Effect so each handler closes over the live
 * services; handlers themselves have no requirements, as the tool runtime expects.
 */
export const makeTools = Effect.gen(function* () {
  const workspace = yield* Workspace
  const library = yield* CamLibrary

  const get_document = Tool.make({
    description:
      "Read the current CAD document: units, layers, and every element with id, type, bounds, area and perimeter. Call this before editing existing geometry.",
    parameters: Schema.Struct({}),
    success: Json,
    execute: () => workspace.document.pipe(Effect.map(summarize)),
  })

  const add_shapes = Tool.make({
    description:
      "Add shapes to the document in one undoable step. Coordinates are in document units with Y up. Arc angles are degrees CCW. Rectangle origin is the lower-left corner. Returns the new element ids.",
    parameters: Schema.Struct({ shapes: Schema.Array(Elements.ElementInput) }),
    success: Schema.Struct({ ids: Schema.Array(Schema.String) }),
    execute: ({ shapes }) =>
      Effect.gen(function* () {
        const doc = yield* workspace.document
        const elements = shapes.map((s) => Doc.instantiate(doc, s))
        yield* workspace.execute({ _tag: "AddElements", elements })
        return { ids: elements.map((e) => e.id) }
      }).pipe(Effect.mapError(toFailure)),
  })

  const transform_elements = Tool.make({
    description:
      "Move, rotate (degrees CCW around origin) or scale elements. Shapes that can no longer be represented exactly (e.g. a rectangle rotated 30°) become polylines.",
    parameters: Schema.Struct({ ids: Schema.Array(ElementId), transform: Transform.Transform }),
    success: Json,
    execute: ({ ids, transform }) =>
      workspace.execute({ _tag: "TransformElements", ids, transform }).pipe(
        Effect.map((doc) => doc.elements.filter((e) => ids.includes(e.id)).map(describeElement)),
        Effect.mapError(toFailure),
      ),
  })

  const delete_elements = Tool.make({
    description: "Delete elements by id.",
    parameters: Schema.Struct({ ids: Schema.Array(ElementId) }),
    success: Schema.Struct({ remaining: Schema.Number }),
    execute: ({ ids }) =>
      workspace.execute({ _tag: "RemoveElements", ids }).pipe(
        Effect.map((doc) => ({ remaining: doc.elements.length })),
        Effect.mapError(toFailure),
      ),
  })

  const list_library = Tool.make({
    description: "List available cutting tools, stock materials and machines (ids are used by CAM tools).",
    parameters: Schema.Struct({}),
    success: Json,
    execute: () => Effect.all({ tools: library.tools, materials: library.materials, machines: library.machines }),
  })

  const get_cam_setup = Tool.make({
    description: "Read the CAM setup: machine, material, stock, safe Z and the ordered list of machining operations.",
    parameters: Schema.Struct({}),
    success: Json,
    execute: () => workspace.state.pipe(Effect.map((s) => s.setup)),
  })

  const configure_cam = Tool.make({
    description: "Set machine, material, stock and/or safe Z for CAM. Omitted fields are unchanged.",
    parameters: Schema.Struct({
      machineId: Schema.optional(Schema.String),
      materialId: Schema.optional(Schema.String),
      safeZ: Schema.optional(Geometry.Positive),
      stock: Schema.optional(Operations.Stock),
    }),
    success: Json,
    execute: (input) =>
      Effect.gen(function* () {
        if (input.machineId) yield* library.machine(input.machineId)
        if (input.materialId) yield* library.material(input.materialId)
        return yield* workspace.updateSetup((s) => ({
          ...s,
          machineId: input.machineId ?? s.machineId,
          materialId: input.materialId ?? s.materialId,
          safeZ: input.safeZ ?? s.safeZ,
          stock: input.stock ?? s.stock,
        }))
      }).pipe(Effect.mapError(toFailure)),
  })

  const add_operation = Tool.make({
    description:
      "Append a machining operation (Profile, Pocket, Drill, Engrave, Facing) on the given element ids. Depth is positive mm below the stock top. Feeds/speeds are computed from tool+material unless overridden.",
    parameters: Schema.Struct({ operation: Operations.OperationInput }),
    success: Schema.Struct({ id: Schema.String, operations: Schema.Number }),
    execute: ({ operation }) =>
      Effect.gen(function* () {
        yield* library.tool(operation.toolId)
        const doc = yield* workspace.document
        const missing = operation.elementIds.find((id) => !Doc.findElement(doc, id))
        if (missing) return yield* new ToolFailure({ message: `Element not found: ${missing}` })
        const id = `op-${globalThis.crypto.randomUUID().slice(0, 8)}`
        const setup = yield* workspace.updateSetup((s) => ({
          ...s,
          operations: [...s.operations, { ...operation, id } as Operations.Operation],
        }))
        return { id, operations: setup.operations.length }
      }).pipe(Effect.mapError((e) => (e instanceof ToolFailure ? e : toFailure(e)))),
  })

  const remove_operation = Tool.make({
    description: "Remove a machining operation by id.",
    parameters: Schema.Struct({ id: Schema.String }),
    success: Schema.Struct({ operations: Schema.Number }),
    execute: ({ id }) =>
      workspace
        .updateSetup((s) => ({ ...s, operations: s.operations.filter((o) => o.id !== id) }))
        .pipe(Effect.map((s) => ({ operations: s.operations.length }))),
  })

  const generate_gcode = Tool.make({
    description:
      "Generate toolpaths for all operations and post-process them to G-code for the machine's controller (or the given one). Returns statistics and the first lines of G-code.",
    parameters: Schema.Struct({ controller: Schema.optional(Machines.Controller) }),
    success: Json,
    execute: ({ controller }) =>
      Effect.gen(function* () {
        const { history, setup } = yield* workspace.state
        if (setup.operations.length === 0) return yield* new ToolFailure({ message: "No operations defined" })
        const machine = yield* library.machine(setup.machineId)
        const program = yield* generateProgram(history.present, setup).pipe(Effect.provideService(CamLibrary, library))
        const target = controller ?? machine.controller
        const gcode = Post.post(program, { controller: target, toolChanger: machine.toolChanger })
        yield* workspace.setOutput({ program, gcode, controller: target })
        const stats = Analyze.analyzeProgram(program, machine)
        const outside = Analyze.outOfBounds(
          program.toolpaths.flatMap((t) => t.moves),
          machine,
        ).length
        const lines = gcode.split("\n")
        return {
          controller: target,
          toolpaths: program.toolpaths.map((t) => ({
            name: t.name,
            tool: t.toolName,
            rpm: t.rpm,
            moves: t.moves.length,
          })),
          cutDistanceMm: round(stats.cutDistance),
          rapidDistanceMm: round(stats.rapidDistance),
          estimatedMinutes: round(stats.estimatedSeconds / 60),
          movesOutsideWorkArea: outside,
          lines: lines.length,
          preview: lines.slice(0, 40).join("\n"),
        }
      }).pipe(Effect.mapError((e) => (e instanceof ToolFailure ? e : toFailure(e)))),
  })

  return {
    get_document,
    add_shapes,
    transform_elements,
    delete_elements,
    list_library,
    get_cam_setup,
    configure_cam,
    add_operation,
    remove_operation,
    generate_gcode,
  }
})
