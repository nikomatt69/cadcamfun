/**
 * The workflow steps: the pure ones (`cam/verify`, `cam/gcode`) against real generated G-code, and the
 * service-backed ones (`vcs/commit`, `notify/push`) against a real repository.
 */
import { describe, expect, test } from "bun:test"
import { Database, schema } from "@cadcamfun/db"
import { cam } from "@cadcamfun/core"
import { Effect, Layer, Schema } from "effect"
import { ProjectVcsRepo } from "../src/repos/project-vcs-repo.ts"
import { LocalProfile } from "../src/services/local-profile.ts"
import { NotificationService } from "../src/services/notifications.ts"
import { GitHubTransports, ProjectVcs, type Actor } from "../src/services/project-vcs.ts"
import { WorkflowRunner } from "../src/services/workflow-runner.ts"
import { WorkflowServiceStepsLive } from "../src/services/workflow-service-steps-live.ts"

const migrationsFolder = new URL("../../../packages/db/drizzle", import.meta.url).pathname
const FakeGitHub = Layer.succeed(GitHubTransports, GitHubTransports.of({ make: () => { throw new Error("no remote in these tests") } }))

/**
 * The whole version-control stack, built exactly as `layers.ts` builds it: the repository services
 * first (`LocalProfile` in, because the runner resolves the actor of a run dispatched without one),
 * then the layer that registers the service-backed steps into the already-built runner.
 *
 * `Db` is one layer reference used twice, so Effect's memo map hands out a single in-memory database
 * rather than a second, empty one.
 */
const Db = Database.layer({ path: ":memory:", migrationsFolder })
const VcsCore = Layer.mergeAll(ProjectVcs.layer, WorkflowRunner.layer()).pipe(
  Layer.provideMerge(ProjectVcsRepo.layer),
  Layer.provideMerge(FakeGitHub),
  Layer.provideMerge(LocalProfile.layer),
  Layer.provideMerge(Db),
)
const Live = WorkflowServiceStepsLive.pipe(Layer.provideMerge(VcsCore), Layer.provideMerge(NotificationService.layer), Layer.provideMerge(Db))

/**
 * A milling request the generator and the verifier both understand, so the checks have something real
 * to chew on. Decoded through the real schema — `generateToolpath` takes a decoded request, and a raw
 * record is missing every defaulted field.
 */
const milling = (depth = 2) =>
  Schema.decodeUnknownSync(cam.generator.GenerateRequestSchema)({
    settings: { operationType: "pocket", machineType: "mill", toolType: "endmill", toolDiameter: 6, depth, stepdown: 1, feedrate: 800, rapidRate: 3000 },
    geometry: { geometryType: "rectangle", rectangleWidth: 40, rectangleHeight: 20, stock: { x: 0, y: 0, width: 120, height: 80, topZ: 0, depth: 10 } },
  })

const program = (request: ReturnType<typeof milling>) => {
  const outcome = cam.generator.generateToolpath(request)
  if (outcome.error !== undefined) throw new Error(outcome.error)
  return outcome.response
}

interface Fixture {
  readonly projectId: string
  readonly actor: Actor
}

/** A project holding one toolpath whose stored request + G-code are exactly `entry`. */
const withToolpath = <A, E>(entry: { readonly request: unknown; readonly gcode: string }, body: (f: Fixture) => Effect.Effect<A, E, Database | ProjectVcs | WorkflowRunner>) =>
  Effect.runPromise(
    Effect.gen(function*() {
      const { db } = yield* Database
      const vcs = yield* ProjectVcs
      const [u] = db.insert(schema.userTable).values({ email: "ada@x.io", name: "Ada" }).returning().all()
      const project = db.insert(schema.projectTable).values({ name: "Bracket", ownerId: u!.id }).returning().get()
      db.insert(schema.toolpathTable).values({ id: "t1", name: "Pocket", data: { request: entry.request }, gcode: entry.gcode, projectId: project.id, createdBy: u!.id }).run()
      const actor: Actor = { userId: u!.id, name: "Ada", email: "ada@x.io" }
      yield* vcs.commit(project.id, { message: "init" }, actor)
      return yield* body({ projectId: project.id, actor })
    }).pipe(Effect.provide(Live), Effect.scoped),
  )

const runsOf = (projectId: string) =>
  Effect.gen(function*() {
    const runner = yield* WorkflowRunner
    return yield* runner.runs(projectId)
  }).pipe(Effect.provide(Live), Effect.scoped)

/** Runs a one-workflow file on `main`; `runs` are the persisted WorkflowRun rows. */
const dispatch = (projectId: string, actor: Actor, yaml: string) =>
  Effect.gen(function*() {
    const vcs = yield* ProjectVcs
    const runner = yield* WorkflowRunner
    yield* vcs.commit(projectId, { message: `ci: ${yaml}` }, actor, { ".cadcamfun/workflows/ci.yml": yaml })
    return yield* runner.trigger(projectId, "main", { type: "push", branch: "main", changedPaths: [] }, { actor })
  }).pipe(Effect.provide(Live), Effect.scoped)

/** The first step event of a run, which is what every assertion below is about. */
const firstStep = (run: { readonly events: unknown } | undefined): { uses: string; status: string; message?: string } => {
  const step = stepEvents(run)[0]
  if (step === undefined) throw new Error("the run recorded no step")
  return step
}

const stepEvents = (run: { readonly events: unknown } | undefined): ReadonlyArray<{ uses: string; status: string; message?: string }> => {
  const events = (run?.events ?? []) as ReadonlyArray<Record<string, unknown>>
  return events.filter((e) => e.type === "step").map((e) => ({ uses: String(e.uses), status: String(e.status), ...(e.message === undefined ? {} : { message: String(e.message) }) }))
}

describe("cam/verify", () => {
  test("passes on a program generated from its own request, and counts what it verified", () =>
    withToolpath({ request: milling(), gcode: program(milling()).gcode }, ({ projectId, actor }) =>
      Effect.gen(function*() {
        const [run] = yield* dispatch(projectId, actor, "name: V\non:\n  push:\n    branches: ['**']\njobs:\n  j:\n    steps:\n      - id: v\n        uses: cam/verify\n")
        expect(run!.status).toBe("success")
        const step = firstStep(run)
        expect(step).toMatchObject({ uses: "cam/verify", status: "success" })
        expect(JSON.stringify(run!.events)).toContain('"verified":1')
      })))

  test("fails on a program whose geometry leaves material the operation never removes", () =>
    withToolpath({ request: milling(), gcode: "G21\nG0 X-50 Y-50\nG1 Z-2 F100\nG0 X50 Y50\n" }, ({ projectId, actor }) =>
      Effect.gen(function*() {
        const [run] = yield* dispatch(projectId, actor, "name: V\non:\n  push:\n    branches: ['**']\njobs:\n  j:\n    steps:\n      - uses: cam/verify\n")
        expect(run!.status).toBe("failure")
        const step = firstStep(run)
        expect(step.uses).toBe("cam/verify")
        // The verdict names the part, so a failed run is actionable without opening the report.
        expect(step.message).toContain("Pocket")
      })))

  test("reports a toolpath it cannot verify as skipped, never as passing", () =>
    withToolpath({ request: milling(), gcode: program(milling()).gcode }, ({ projectId, actor }) =>
      Effect.gen(function*() {
        // A lathe job has no tool model the verifier can use; the step must say so out loud.
        const [run] = yield* dispatch(projectId, actor, "name: V\non:\n  push:\n    branches: ['**']\njobs:\n  j:\n    steps:\n      - id: v\n        uses: cam/verify\n        with:\n          toolpath: nope\n")
        expect(run!.status).toBe("success")
        expect(JSON.stringify(run!.events)).toContain('"verified":0')
        expect(JSON.stringify(run!.events)).toContain('"toolpaths":0')
      })))
})

describe("cam/gcode", () => {
  test("passes when the committed G-code is what its request generates", () =>
    withToolpath({ request: milling(), gcode: program(milling()).gcode }, ({ projectId, actor }) =>
      Effect.gen(function*() {
        const [run] = yield* dispatch(projectId, actor, "name: G\non:\n  push:\n    branches: ['**']\njobs:\n  j:\n    steps:\n      - id: g\n        uses: cam/gcode\n")
        expect(run!.status).toBe("success")
        expect(JSON.stringify(run!.events)).toContain('"matched":1')
      })))

  test("catches a stale export: settings edited, G-code never regenerated", () =>
    withToolpath({ request: milling(2), gcode: program(milling(2)).gcode }, ({ projectId, actor }) =>
      Effect.gen(function*() {
        // The editor deepened the operation; the stored program is still the 2 mm one.
        const { db } = yield* Database
        db.update(schema.toolpathTable).set({ data: { request: milling(4) } }).run()
        const vcs = yield* ProjectVcs
        const runner = yield* WorkflowRunner
        yield* vcs.commit(projectId, { message: "deepen the pocket" }, actor, { ".cadcamfun/workflows/ci.yml": "name: G\non:\n  push:\n    branches: ['**']\njobs:\n  j:\n    steps:\n      - uses: cam/gcode\n" })
        const [run] = yield* runner.trigger(projectId, "main", { type: "push", branch: "main", changedPaths: [] }, { actor })
        expect(run!.status).toBe("failure")
        expect(firstStep(run).message).toContain("does not match")
      })))
})

describe("vcs/commit", () => {
  test("records a .cadcamfun artefact as a new commit on the branch being checked", () =>
    withToolpath({ request: milling(), gcode: program(milling()).gcode }, ({ projectId, actor }) =>
      Effect.gen(function*() {
        const [run] = yield* dispatch(projectId, actor, [
          "name: Report",
          "on:",
          "  push:",
          "    branches: ['**']",
          "jobs:",
          "  j:",
          "    steps:",
          "      - id: c",
          "        uses: vcs/commit",
          "        with:",
          "          message: add report",
          "          files:",
          '            ".cadcamfun/reports/verify.md": "# verified"',
        ].join("\n"))
        expect(run!.status).toBe("success")
        const vcs = yield* ProjectVcs
        // The artefact is real history, not a side effect: it is in the tree of the new commit.
        const files = yield* vcs.log(projectId)
        expect(files[0]!.message.trim()).toBe("add report")
        expect(yield* vcs.status(projectId)).toEqual([])
      })))

  test("refuses to write anything that is not a .cadcamfun text file", () =>
    withToolpath({ request: milling(), gcode: program(milling()).gcode }, ({ projectId, actor }) =>
      Effect.gen(function*() {
        const [run] = yield* dispatch(projectId, actor, [
          "name: Evil",
          "on:",
          "  push:",
          "    branches: ['**']",
          "jobs:",
          "  j:",
          "    steps:",
          "      - uses: vcs/commit",
          "        with:",
          "          message: rewrite the model",
          "          files:",
          '            "toolpaths/t1.json": "{}"',
        ].join("\n"))
        expect(run!.status).toBe("failure")
        expect(firstStep(run).message).toContain("toolpaths/t1.json")
      })))
})

describe("notify/push", () => {
  test("leaves a notification for the account that dispatched the run", () =>
    withToolpath({ request: milling(), gcode: program(milling()).gcode }, ({ projectId, actor }) =>
      Effect.gen(function*() {
        const [run] = yield* dispatch(projectId, actor, [
          "name: Tell me",
          "on:",
          "  push:",
          "    branches: ['**']",
          "jobs:",
          "  j:",
          "    steps:",
          "      - uses: notify/push",
          "        with:",
          "          outcome: failure",
        ].join("\n"))
        expect(run!.status).toBe("success")
        const { db } = yield* Database
        const rows = db.select().from(schema.notificationTable).all()
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ type: "WORKFLOW_FAILED", userId: actor.userId, projectId })
        expect(rows[0]!.linkUrl).toBe(`/projects/${projectId}/history`)
      })))
})

describe("cam/sequence", () => {
  const rest = (toolDiameter: number, restToolDiameter: number) =>
    Schema.decodeUnknownSync(cam.generator.GenerateRequestSchema)({
      settings: { operationType: "pocket", machineType: "mill", toolType: "endmill", toolDiameter, useRestMachining: true, restToolDiameter, depth: 2, stepdown: 1, feedrate: 800, rapidRate: 3000 },
      geometry: { geometryType: "rectangle", rectangleWidth: 40, rectangleHeight: 20, stock: { x: 0, y: 0, width: 120, height: 80, topZ: 0, depth: 10 } },
    })
  const sequence = "name: S\non:\n  push:\n    branches: ['**']\njobs:\n  j:\n    steps:\n      - id: s\n        uses: cam/sequence\n"

  test("passes when each tool number names one tool", () =>
    withToolpath({ request: milling(), gcode: program(milling()).gcode }, ({ projectId, actor }) =>
      Effect.gen(function*() {
        const [run] = yield* dispatch(projectId, actor, sequence)
        expect(run!.status).toBe("success")
        expect(JSON.stringify(run!.events)).toContain('"tools":1')
      })))

  test("fails when rest machining names a previous tool no larger than this one", () =>
    withToolpath({ request: rest(6, 3), gcode: program(rest(6, 3)).gcode }, ({ projectId, actor }) =>
      Effect.gen(function*() {
        const [run] = yield* dispatch(projectId, actor, sequence)
        expect(run!.status).toBe("failure")
        expect(firstStep(run).message).toContain("larger")
      })))

  test("passes when the previous tool is larger than this one", () =>
    withToolpath({ request: rest(6, 10), gcode: program(rest(6, 10)).gcode }, ({ projectId, actor }) =>
      Effect.gen(function*() {
        const [run] = yield* dispatch(projectId, actor, sequence)
        expect(run!.status).toBe("success")
      })))
})

describe("reading workflow files", () => {
  const CI = "name: B\non:\n  manual: {}\njobs:\n  j:\n    steps:\n      - uses: project/validate\n"

  test("lists the workflow files of a ref with their YAML", () =>
    withToolpath({ request: milling(), gcode: program(milling()).gcode }, ({ projectId, actor }) =>
      Effect.gen(function*() {
        const vcs = yield* ProjectVcs
        const runner = yield* WorkflowRunner
        yield* vcs.commit(projectId, { message: "ci" }, actor, { ".cadcamfun/workflows/build.yml": CI })
        const files = yield* runner.files(projectId, "main")
        expect(files).toHaveLength(1)
        expect(files[0]).toMatchObject({ name: "build.yml", path: ".cadcamfun/workflows/build.yml" })
        expect(files[0]!.content).toContain("project/validate")
        expect(files[0]!.problem).toBeUndefined()
      })))

  test("an unparseable file comes back with the reason, so it can be fixed", () =>
    withToolpath({ request: milling(), gcode: program(milling()).gcode }, ({ projectId, actor }) =>
      Effect.gen(function*() {
        const vcs = yield* ProjectVcs
        const runner = yield* WorkflowRunner
        yield* vcs.commit(projectId, { message: "broken ci" }, actor, { ".cadcamfun/workflows/bad.yml": "name: B\njobs: {}\n" })
        const [file] = yield* runner.files(projectId, "main")
        expect(file!.name).toBe("bad.yml")
        expect(file!.problem).toBeTruthy()
      })))

  test("one file reads by bare name, with or without the .yml suffix", () =>
    withToolpath({ request: milling(), gcode: program(milling()).gcode }, ({ projectId, actor }) =>
      Effect.gen(function*() {
        const vcs = yield* ProjectVcs
        const runner = yield* WorkflowRunner
        yield* vcs.commit(projectId, { message: "ci" }, actor, { ".cadcamfun/workflows/build.yml": CI })
        expect((yield* runner.file(projectId, "main", "build")).name).toBe("build.yml")
        expect((yield* runner.file(projectId, "main", "build.yml")).name).toBe("build.yml")
        expect(Effect.runSync(Effect.result(runner.file(projectId, "main", "nope")))._tag).toBe("Failure")
      })))

  test("a project with no workflows lists nothing rather than failing", () =>
    withToolpath({ request: milling(), gcode: program(milling()).gcode }, ({ projectId }) =>
      Effect.gen(function*() {
        const runner = yield* WorkflowRunner
        expect(yield* runner.files(projectId, "main")).toEqual([])
      })))
})

describe("the step registry", () => {
  test("this stack registers the pure steps and the ones it owns, but not the assistant's", () =>
    Effect.runPromise(
      Effect.gen(function*() {
        const runner = yield* WorkflowRunner
        // `ai/prompt` is absent on purpose: it is registered by the AI layer, which is not part of this
        // stack. A workflow naming it fails as an unknown step rather than silently doing nothing.
        expect(yield* runner.steps()).toEqual(["cam/gcode", "cam/sequence", "cam/verify", "notify/push", "project/require-gcode", "project/validate", "vcs/commit"])
      }).pipe(Effect.provide(Live), Effect.scoped),
    ))

  test("a workflow naming an unregistered step fails before anything runs", () =>
    withToolpath({ request: milling(), gcode: program(milling()).gcode }, ({ projectId, actor }) =>
      Effect.gen(function*() {
        const [run] = yield* dispatch(projectId, actor, "name: X\non:\n  push:\n    branches: ['**']\njobs:\n  j:\n    steps:\n      - uses: cam/teleport\n")
        expect(run!.status).toBe("failure")
        expect(firstStep(run).message).toContain("cam/teleport")
      })))

  test("runs are persisted per project", () =>
    withToolpath({ request: milling(), gcode: program(milling()).gcode }, ({ projectId, actor }) =>
      Effect.gen(function*() {
        yield* dispatch(projectId, actor, "name: P\non:\n  push:\n    branches: ['**']\njobs:\n  j:\n    steps:\n      - uses: project/validate\n")
        expect((yield* runsOf(projectId)).length).toBe(1)
      })))
})