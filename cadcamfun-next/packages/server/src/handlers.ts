import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Analyze, CamLibrary, Post, generateProgram } from "@cadcamfun/cam"
import { Api, CamFailed } from "./api"
import type { LibraryKind } from "./api-library"
import { Library, type Store } from "./library"
import { Projects } from "./projects"
import { ToolpathStore } from "./toolpaths"

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

/**
 * The three library groups share one contract and differ only in their item schema,
 * so their handlers are built from one untyped definition; the schemas still validate
 * every request and response at the edge.
 */
const crud =
  <A>(kind: LibraryKind, store: Store<A>) =>
  (handlers: any) =>
    handlers
      .handle("list", () => store.list)
      .handle("get", ({ params }: any) => store.get(params.id))
      .handle("create", ({ payload }: any) => store.create(payload))
      .handle("update", ({ params, payload }: any) => store.update(params.id, payload))
      .handle("remove", ({ params }: any) => store.remove(params.id))
      .handle("clone", ({ params }: any) => store.clone(params.id))
      .handle("import", ({ payload }: any) =>
        store.importItems(payload.items).pipe(Effect.map((imported) => ({ imported }))),
      )
      .handle("export", () => store.list.pipe(Effect.map((es) => ({ kind, items: es.map((e) => e.item) }))))

/** `crud` is untyped, so restate what the library groups actually require. */
const needsLibrary = <A>(layer: Layer.Layer<A, unknown, unknown>) => layer as Layer.Layer<A, never, Library>

const ToolHandlers = needsLibrary(
  HttpApiBuilder.group(Api, "tools", (h) =>
    Effect.gen(function* () {
      return crud("tools", (yield* Library).tools)(h)
    }),
  ),
)
const MaterialHandlers = needsLibrary(
  HttpApiBuilder.group(Api, "materials", (h) =>
    Effect.gen(function* () {
      return crud("materials", (yield* Library).materials)(h)
    }),
  ),
)
const MachineHandlers = needsLibrary(
  HttpApiBuilder.group(Api, "machines", (h) =>
    Effect.gen(function* () {
      return crud("machines", (yield* Library).machines)(h)
    }),
  ),
)

const ToolpathHandlers = HttpApiBuilder.group(
  Api,
  "toolpaths",
  Effect.fn(function* (handlers) {
    const store = yield* ToolpathStore
    const projects = yield* Projects
    return (
      handlers
        .handle("listForProject", ({ params }) => store.listForProject(params.projectId))
        .handle("create", ({ params, payload }) =>
          projects.get(params.projectId).pipe(Effect.andThen(store.create(params.projectId, payload))),
        )
        .handle("get", ({ params }) => store.get(params.id))
        .handle("update", ({ params, payload }) => store.update(params.id, payload))
        .handle("remove", ({ params }) => store.remove(params.id))
        .handle("versions", ({ params }) => store.versions(params.id))
        .handle("restore", ({ params }) => store.restore(params.id, params.versionId))
        .handle("comments", ({ params }) => store.comments(params.id))
        // Comments are anonymous until accounts land; `author` is then taken from the session.
        .handle("addComment", ({ params, payload }) =>
          store.addComment(params.id, payload.author ?? "me", payload.content),
        )
        .handle("removeComment", ({ params }) => store.removeComment(params.id, params.commentId))
    )
  }),
)

export const ApiHandlers = Layer.mergeAll(
  SystemHandlers,
  ProjectHandlers,
  CamHandlers,
  ToolHandlers,
  MaterialHandlers,
  MachineHandlers,
  ToolpathHandlers,
)
