import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Analyze, CamLibrary, Post, generateProgram } from "@cadcamfun/cam"
import { Api, CamFailed } from "./api"
import { Projects } from "./projects"

const SystemHandlers = HttpApiBuilder.group(Api, "system", (handlers) =>
  Effect.succeed(handlers.handle("health", () => Effect.succeed({ status: "ok" as const }))),
)

const ProjectHandlers = HttpApiBuilder.group(
  Api,
  "projects",
  Effect.fn(function* (handlers) {
    const projects = yield* Projects
    return handlers
      .handle("list", () => projects.list)
      .handle("get", ({ params }) => projects.get(params.id))
      .handle("create", ({ payload }) => projects.create(payload))
      .handle("save", ({ params, payload }) => projects.save(params.id, payload))
      .handle("remove", ({ params }) => projects.remove(params.id))
  }),
)

const CamHandlers = HttpApiBuilder.group(
  Api,
  "cam",
  Effect.fn(function* (handlers) {
    const library = yield* CamLibrary
    return handlers
      .handle("library", () =>
        Effect.all({ tools: library.tools, materials: library.materials, machines: library.machines }),
      )
      .handle("gcode", ({ payload }) =>
        Effect.gen(function* () {
          const machine = yield* library.machine(payload.setup.machineId)
          const program = yield* generateProgram(payload.document, payload.setup)
          const controller = payload.controller ?? machine.controller
          const gcode = Post.post(program, { controller, toolChanger: machine.toolChanger })
          const { bounds: _, ...stats } = Analyze.analyzeProgram(program, machine)
          const outOfBounds = Analyze.outOfBounds(
            program.toolpaths.flatMap((t) => t.moves),
            machine,
          ).length
          return { controller, gcode, program, stats, outOfBounds }
        }).pipe(
          Effect.provideService(CamLibrary, library),
          Effect.mapError((e) => new CamFailed({ message: e.message })),
        ),
      )
  }),
)

export const ApiHandlers = Layer.mergeAll(SystemHandlers, ProjectHandlers, CamHandlers)
