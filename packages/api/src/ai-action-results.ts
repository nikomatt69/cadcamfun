/**
 * What each catalogue action answers and what it touches, declared once next to its input schemas (`ai-cam.ts`,
 * `ai-inspection.ts`). The AI package validates every implementation's answer against the result declared here before it
 * crosses an adapter as success, and the desktop decodes the same shapes when it mirrors a change into the editor.
 *
 * A result schema states what consumers rely on, not every field: a value may carry more (the model reads it), never less.
 * A verdict is a result: a check or a review whose `ok` is false because the part or the program failed matches its schema
 * and is an answer. Refusals (`ok: false` that match no result) are not described per action; their shape is the shared
 * failure below.
 */
import { Schema } from "effect"
import { cam } from "@cadcamfun/core"
import type { ActionEffect } from "./ai-actions.ts"

// ---------------------------------------------------------------- shared shapes

/** Every outcome an execution can have. Only `succeeded` (and `partial`, with what was left out named) is completed work. */
export const ActionOutcomeKind = Schema.Literals(["succeeded", "partial", "refused", "conflict", "cancelled", "uncertain"])
export type ActionOutcomeKind = typeof ActionOutcomeKind.Type


/** The wire form of every non-success: the model and the desktop read the same four fields; anything else the implementation said stays. */
export const ActionFailureResult = Schema.Struct({
  ok: Schema.Literal(false),
  _tag: Schema.String,
  actionId: Schema.String,
  error: Schema.String
})
export type ActionFailureResult = typeof ActionFailureResult.Type

const num = Schema.Finite
const int = Schema.Int
const str = Schema.String
const strings = Schema.Array(str)
const record = Schema.Record(str, Schema.Unknown)
const vec3 = Schema.Struct({ x: num, y: num, z: num })
const nullable = <S extends Schema.Top>(schema: S) => Schema.NullOr(schema)

/** The document an answer is about. `createdDrawing` is present only when the call had to create it. */
const drawingRef = {
  drawingId: str,
  projectId: str,
  createdDrawing: Schema.optionalKey(Schema.Literal(true))
} as const

/** An element as the editor stores it: an id, a type, and its own fields. */
export const ActionElement = Schema.StructWithRest(Schema.Struct({ id: str, type: str }), [record])

const elements = Schema.Array(ActionElement)

// ---------------------------------------------------------------- `cad` (reads)

const describe = Schema.Struct({ total: int, counts: Schema.Record(str, int), ...drawingRef })
const check = Schema.Struct({ ok: Schema.Boolean, issues: Schema.Array(record), omitted: int, stats: record, ...drawingRef })
const relations = Schema.Struct({
  ok: Schema.Literal(true), first: record, second: record, originDistanceMm: num,
  boundingGapsMm: nullable(Schema.Struct({ x: num, y: num, z: num })), explicitReferences: Schema.Array(record), ...drawingRef
})
const grep = Schema.Struct({
  ok: Schema.Literal(true), query: str, total: int, returned: int, offset: int, complete: Schema.Boolean, nextOffset: nullable(int),
  hits: Schema.Array(Schema.StructWithRest(Schema.Struct({ id: str, type: str, parametric: Schema.Boolean, foundIn: strings }), [record])),
  ...drawingRef
})
/** `cad.vision`'s value; the image itself travels as a file part. */
const vision = Schema.Struct({ ok: Schema.Literal(true), image: Schema.Struct({ width: int, height: int }) })
const inspectElements = Schema.Struct({
  ok: Schema.Literal(true), total: int, offset: int, nextOffset: nullable(int),
  elements: Schema.Array(Schema.Struct({ properties: record, bounds: Schema.Unknown })), missingIds: strings, ...drawingRef
})
const inspectLayers = Schema.Struct({ ok: Schema.Literal(true), layers: Schema.Array(Schema.Unknown), available: Schema.Boolean, ...drawingRef })
const inspectSearch = Schema.Struct({
  ok: Schema.Literal(true), query: str, total: int, returned: int, complete: Schema.Boolean,
  elements: Schema.Array(Schema.StructWithRest(Schema.Struct({ id: str, type: str, foundIn: strings }), [record])), ...drawingRef
})
const inspectProperty = Schema.Struct({
  ok: Schema.Literal(true), elementId: str, path: strings, encoding: Schema.Literal("json"), content: str, totalChars: int, nextOffset: nullable(int), ...drawingRef
})
/** Origins: the CAD zero datum the answer is measured against, and one entry per element with its own origin. */
const inspectOrigins = Schema.Struct({
  ok: Schema.Literal(true), units: Schema.Literal("mm"), zero: vec3, axes: Schema.Struct({ x: str, y: str, z: str }),
  total: int, offset: int, nextOffset: nullable(int),
  elements: Schema.Array(Schema.StructWithRest(Schema.Struct({
    id: str, type: str, origin: vec3, distanceFromZeroMm: num, bounds: Schema.Unknown
  }), [record])),
  missingIds: strings, ...drawingRef
})
/** A sheet is a derived artifact: `mutated` is always false. */
const sheet = Schema.Struct({ ok: Schema.Literal(true), mutated: Schema.Literal(false) })
/** The rebuild report every parametric read returns: the rebuild succeeded (`ok`), its bodies, volume and problems. */
const parametricReport = {
  ok: Schema.Boolean,
  bodyCount: int,
  volumeMm3: nullable(num),
  bounds: nullable(Schema.Struct({ min: vec3, max: vec3 })),
  issues: Schema.Array(record),
  solids: Schema.Array(Schema.StructWithRest(Schema.Struct({ id: str, closedSolid: Schema.Boolean, shells: int, throughHoles: nullable(int) }), [record]))
} as const
const parametricValidate = Schema.Struct(parametricReport)
const parametricInspect = Schema.Struct({ ...parametricReport, elementId: str, revision: str, history: record, ...drawingRef })
const parametricTest = Schema.Struct({ ok: Schema.Boolean, revision: str, mutated: Schema.Literal(false), cases: Schema.Array(record), elementId: str, ...drawingRef })
const parametricDfm = Schema.Struct({ ok: Schema.Boolean, process: str, toolDiameter: num, issues: Schema.Array(record), metrics: Schema.Struct({ bodies: int, volumeMm3: num }) })
const parametricExact = Schema.Struct({ ok: Schema.Boolean, bodies: Schema.Array(record), issues: Schema.Array(record) })
const exact = Schema.Struct({
  ok: Schema.Literal(true),
  totals: Schema.Struct({ parts: int, volume: num, area: num }),
  parts: Schema.Array(Schema.StructWithRest(Schema.Struct({ id: str, name: str, valid: Schema.Boolean, volume: num, holesTotal: int }), [record])),
  skipped: Schema.Array(Schema.Struct({ id: str, name: str, reason: str })),
  ...drawingRef
})
const assembly = Schema.Struct({
  ok: Schema.Literal(true), parts: int,
  interference: Schema.StructWithRest(Schema.Struct({ clashes: Schema.Array(record), clashesTotal: int, checked: int }), [record]),
  bom: Schema.Array(record), bomTotal: int, jointsTotal: int, fasteners: record, ...drawingRef
})
const fastener = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), threads: Schema.Array(record) }),
  Schema.Struct({ ok: Schema.Literal(true), thread: record })
])
/** A recipe's generated history and its rebuild report; nothing is stored. */
const recipe = Schema.Struct({ ok: Schema.Boolean, recipe: str, history: record, report: Schema.Struct(parametricReport) })
/** A read-only conversion: the parametric history an existing element would become. */
const fromElement = Schema.Struct({ ...parametricReport, source: Schema.Struct({ id: str, type: str }), placement: vec3, notes: strings, ...drawingRef })

// ---------------------------------------------------------------- `cad_edit` (writes)

/** Elements were added to the drawing; `skipped` names the ones a partial call left out. */
const added = Schema.Struct({
  ok: Schema.Literal(true), ids: strings, elements,
  skipped: Schema.optionalKey(Schema.Array(Schema.Struct({ index: int, error: str }))),
  ...drawingRef
})
const modified = Schema.Struct({ ok: Schema.Literal(true), modified: int, elements, ...drawingRef })
const transformed = Schema.Struct({ ok: Schema.Literal(true), mode: Schema.Literals(["copied", "transformed"]), copied: Schema.Boolean, ids: strings, elements, ...drawingRef })
const grouped = Schema.Struct({ ok: Schema.Literal(true), removed: strings, ids: strings, elements, ...drawingRef })
const deleted = Schema.Struct({ ok: Schema.Literal(true), deleted: int, ids: strings, ...drawingRef })
/** The editor performs these as it reads the result; nothing is stored. */
const editor = Schema.Struct({ ok: Schema.Literal(true), actions: Schema.Array(Schema.StructWithRest(Schema.Struct({ action: str }), [record])) })
const parametricCreated = Schema.Struct({ ok: Schema.Literal(true), mutation: Schema.Literal("add"), ids: strings, elements, ...drawingRef })
const parametricUpdated = Schema.Struct({ ok: Schema.Literal(true), mutation: Schema.Literal("update"), ids: strings, elements, revision: str, report: record, ...drawingRef })
const recipeCreated = Schema.Struct({ ok: Schema.Literal(true), recipe: str, history: record, report: Schema.Struct(parametricReport), created: parametricCreated })
const converted = Schema.Struct({ ok: Schema.Literal(true), mutation: Schema.Literal("add"), ids: strings, elements, source: Schema.Struct({ id: str, type: str }), notes: strings, ...drawingRef })

// ---------------------------------------------------------------- `cam` (reads)

/** A plan check is a verdict: `ok` is false when an operation fails its checks. Validated against `revision`. */
const planCheck = Schema.Struct({ ok: Schema.Boolean, status: Schema.Literals(["pass", "failed"]), revision: str, mutated: Schema.Literal(false), operations: Schema.Array(record) })
/** A saved review is a verdict on one operation; `stale` and `unverified` are answers, not refusals. */
const review = Schema.Struct({ ok: Schema.Boolean, status: Schema.Literals(["pass", "failed", "stale", "unverified"]), operationId: str })
const machine = Schema.Struct({ kind: str, title: str, plane: str, axes: Schema.Array(record), xIsDiameter: Schema.Boolean, origins: Schema.Unknown })
const operations = Schema.Array(Schema.StructWithRest(Schema.Struct({ id: str, name: str, generated: Schema.Boolean }), [record]))
const compared = Schema.Struct({ ok: Schema.Literal(true), mutated: Schema.Literal(false), candidates: Schema.Array(record), ...drawingRef })
const gcodePoint = vec3
const analysis = Schema.Struct({
  issues: Schema.Array(Schema.Struct({ severity: Schema.Literals(["error", "warning", "info"]), code: str, line: int, message: str })),
  stats: Schema.Struct({ lines: int, rapidMoves: int, cutMoves: int, toolChanges: int, bounds: nullable(Schema.Struct({ min: gcodePoint, max: gcodePoint })) })
})
const stockRead = Schema.Struct({ ok: Schema.Literal(true), stock: record, volumeMm3: num, workpieceMatchesStock: Schema.Boolean, ...drawingRef })
const chainSuggest = Schema.Struct({
  ok: Schema.Literal(true), after: nullable(str),
  recommendation: Schema.Struct({ type: Schema.Literal("operation"), operationType: str, params: record, reason: str })
})
const materials = Schema.Struct({ ok: Schema.Literal(true), materials: Schema.Array(record), machines: Schema.Array(record) })
const cuttingData = Schema.Struct({ ok: Schema.Literal(true), material: Schema.Struct({ id: str, name: str, iso: str }), machine: record, cuttingData: record })
/** A read-only kernel run (or plan): nothing is stored. A blocked or failed run is a refusal carrying its issues. */
const manufactured = Schema.Struct({ ok: Schema.Literal(true), mutated: Schema.Literal(false), ...drawingRef })
const chainStatus = Schema.Struct({ ok: Schema.Literal(true), operationId: str, restFrom: nullable(str), generated: Schema.Boolean, warnings: strings })

// ---------------------------------------------------------------- `cam_edit` (writes)

const programStored = Schema.Struct({ ok: Schema.Literal(true), operationId: str, release: str, identity: record, ...drawingRef })
const operationCreated = Schema.Struct({ ok: Schema.Literal(true), operationId: str, name: str, drawing: str, elements: int })
const operationUpdated = Schema.Struct({ ok: Schema.Literal(true), operationId: str, settings: record, note: str })
/** A generated program: its statistics and the first lines. A failed generation is a refusal, never an empty preview. */
/** A preview of the stored program: how many lines it has, how many the preview shows, and the program's identity. */
const generated = Schema.Struct({
  ok: Schema.Literal(true), operationId: Schema.optionalKey(str), stats: record, programHash: str,
  lines: int, previewLines: int, omittedLines: int, preview: str
})
/** A verification is a verdict: `ok` is false when the replay finds a collision or gouge. */
const verified = Schema.Struct({ ok: Schema.Boolean, status: Schema.Literals(["pass", "failed"]), revision: str, issues: Schema.Array(record), stats: record })
const stockSet = Schema.Struct({ ok: Schema.Literal(true), action: Schema.Literal("set"), stock: record, volumeMm3: num, invalidatedOperations: Schema.Array(Schema.Unknown), ...drawingRef })

// ---------------------------------------------------------------- `library`, `parts`, `library_edit`

/** A library listing: rows with an id and a name; the rest is the row as the repository stores it. */
const rows = (fields: Schema.Struct.Fields = {}) => Schema.Array(Schema.StructWithRest(Schema.Struct({ id: str, name: str, ...fields }), [record]))
const componentList = Schema.Array(Schema.StructWithRest(Schema.Struct({ id: str, name: nullable(str), children: int }), [record]))
const partSaved = Schema.Struct({ ok: Schema.Literal(true), componentId: str, name: str, children: int, ...drawingRef })
const partInserted = Schema.Struct({ ok: Schema.Literal(true), ids: strings, component: Schema.Struct({ id: str, name: str }), elements, ...drawingRef })
const partDeleted = Schema.Struct({ ok: Schema.Literal(true), deleted: str })
const upserted = Schema.Struct({ ok: Schema.Literal(true), id: str, created: Schema.Boolean })
const defaultsSet = Schema.Struct({ ok: Schema.Literal(true), projectId: str, defaults: record })
const libraryDeleted = Schema.Struct({ ok: Schema.Literal(true), kind: Schema.Literals(["material", "tool", "machine_config", "library_item"]), id: str })

// ---------------------------------------------------------------- `memory`, `memory_edit`, `research`

const recalled = Schema.Array(Schema.StructWithRest(Schema.Struct({ key: str }), [record]))
const contextDocument = Schema.Struct({ text: str, updatedAt: Schema.optionalKey(str) })
const remembered = Schema.Struct({ ok: Schema.Literal(true), key: str })
const contextUpdated = Schema.Struct({ ok: Schema.Literal(true), text: str, updatedAt: Schema.optionalKey(str), changed: Schema.Boolean })
/** Excerpts are untrusted text: the result says where they came from, never what to do with them. */
const searched = Schema.Struct({ ok: Schema.Literal(true), query: str, source: str, results: Schema.Array(record) })
const attachmentRead = Schema.Struct({ ok: Schema.Literal(true), attachment: str, offset: int, content: str, totalChars: int, nextOffset: nullable(int) })

// ---------------------------------------------------------------- `vcs`, `vcs_edit`, `agent`

const pullRequestRef = { number: int, title: str, head: str } as const
const vcsStatus = Schema.Struct({ branch: str, branches: strings, openPullRequests: Schema.Array(Schema.Struct(pullRequestRef)) })
const vcsDiff = Schema.Array(Schema.StructWithRest(Schema.Struct({ path: str, status: str }), [record]))
const pullRequests = Schema.Array(Schema.StructWithRest(Schema.Struct(pullRequestRef), [record]))
const changeStarted = Schema.Struct({ branch: str })
const committed = Schema.Struct({ commit: str })
const restored = Schema.Struct({ commit: str, branch: str, paths: strings })
const pullRequestOpened = Schema.Struct({ number: int, head: str, base: str })
const workflowsRun = Schema.Array(Schema.Struct({ workflow: str, status: str }))
/** A delegated task as the scheduler holds it. A task that stopped in `error` is an answer about the task, not a refusal. */
const task = Schema.StructWithRest(Schema.Struct({
  id: str, description: str, status: Schema.Literals(["queued", "running", "completed", "error", "cancelled"])
}), [record])
const tasks = Schema.Array(task)

// ---------------------------------------------------------------- `mods`, `mods_edit`

/** One mod as `mods.list` answers it: the store's record plus the events the live host reports when it has it loaded. */
const modSummary = Schema.Struct({
  id: str, name: str, description: str, enabled: Schema.Boolean,
  origin: Schema.Literals(["assistant", "user", "plugin"]),
  createdAt: str, updatedAt: str,
  events: strings
})
const modList = Schema.Struct({ ok: Schema.Literal(true), mods: Schema.Array(modSummary) })
/** `mods.read` adds the source and the tool names, so a mod can be reviewed before it is armed. */
const modDetail = Schema.Struct({
  ok: Schema.Literal(true), id: str, name: str, description: str, enabled: Schema.Boolean,
  origin: Schema.Literals(["assistant", "user", "plugin"]),
  createdAt: str, updatedAt: str, source: str, events: strings, tools: strings
})
const modSaved = Schema.Struct({ ok: Schema.Literal(true), id: str, enabled: Schema.Boolean, events: strings })
const modRemoved = Schema.Struct({ ok: Schema.Literal(true), id: str, removed: Schema.Literal(true) })

// ---------------------------------------------------------------- the table

export interface ActionContract {
  /** What the action changes or reaches; empty for a read of the open document. */
  readonly effects: ReadonlyArray<ActionEffect>
  /** The success value. Every catalogue action declares one (AI-11 Step 1); a test-only probe may not. */
  readonly result?: Schema.Top
  /** A success that left something out; the field that names what (`skipped`). */
  readonly partialWhen?: string
}

const read = (result?: Schema.Top, effects: ReadonlyArray<ActionEffect> = []): ActionContract => ({ effects, ...(result !== undefined ? { result } : {}) })
const write = (effects: ReadonlyArray<ActionEffect>, result?: Schema.Top, partialWhen?: string): ActionContract =>
  ({ effects, ...(result !== undefined ? { result } : {}), ...(partialWhen !== undefined ? { partialWhen } : {}) })

/** Keyed by catalogue id; the AI package's tests assert both lists hold the same ids. */
export const ACTION_CONTRACTS: Readonly<Record<string, ActionContract>> = {
  "cad.describe": read(describe),
  "cad.check": read(check),
  "cad.relations": read(relations),
  "cad.grep": read(grep),
  // Asks the desktop for a capture of what is on screen: it reaches the interface, it changes nothing.
  "cad.vision": read(vision, ["interface"]),
  "cad.inspect_elements": read(inspectElements),
  "cad.inspect_layers": read(inspectLayers),
  "cad.inspect_search": read(inspectSearch),
  "cad.inspect_property": read(inspectProperty),
  "cad.inspect_origins": read(inspectOrigins),
  "cad.drawing": read(sheet),
  "cad.parametric_validate": read(parametricValidate),
  "cad.parametric_inspect": read(parametricInspect),
  "cad.parametric_test": read(parametricTest),
  "cad.parametric_dfm": read(parametricDfm),
  "cad.parametric_exact": read(parametricExact),
  "cad.exact": read(exact),
  "cad.assembly": read(assembly),
  "cad.parametric_fastener": read(fastener),
  "cad.parametric_recipe": read(recipe),
  "cad.parametric_from_element": read(fromElement),

  "cad_edit.add": write(["drawing"], added, "skipped"),
  "cad_edit.add_entities": write(["drawing"], added),
  "cad_edit.modify": write(["drawing"], modified),
  "cad_edit.transform": write(["drawing"], transformed),
  "cad_edit.group": write(["drawing"], grouped),
  "cad_edit.delete": write(["drawing"], deleted),
  // Mostly what the editor shows (view, selection); the layers it creates, renames or deletes belong to the drawing.
  "cad_edit.editor": write(["interface", "drawing"], editor),
  "cad_edit.import": write(["drawing"], added),
  "cad_edit.parametric_create": write(["drawing"], parametricCreated),
  "cad_edit.parametric_update": write(["drawing"], parametricUpdated),
  "cad_edit.parametric_recipe_create": write(["drawing"], recipeCreated),
  "cad_edit.parametric_convert": write(["drawing"], converted),

  "cam.plan_check": read(planCheck),
  "cam.review": read(review),
  "cam.machine": read(machine),
  "cam.operations": read(operations),
  "cam.suggest": read(cam.generator.SuggestResponseSchema),
  "cam.compare_setups": read(compared),
  "cam.analyze": read(analysis),
  "cam.stock": read(stockRead),
  "cam.vision": read(vision, ["interface"]),
  "cam.chain_suggest": read(chainSuggest),
  "cam.materials": read(materials),
  "cam.cutting_data": read(cuttingData),
  "cam.manufacture": read(manufactured),
  "cam.chain_status": read(chainStatus),

  "cam_edit.manufacture": write(["operation", "program"], programStored),
  "cam_edit.create": write(["operation"], operationCreated),
  "cam_edit.update": write(["operation"], operationUpdated),
  "cam_edit.generate": write(["program"], generated),
  // Replays the stored program and persists only a report bound to its hash and manufacturing inputs.
  "cam_edit.verify": write(["report"], verified),
  "cam_edit.stock_set": write(["stock"], stockSet),

  "library.component_list": read(componentList),
  "library.lookup_component": read(rows()),
  "library.lookup_material": read(rows()),
  "library.lookup_tool": read(rows({ diameter: num, type: str })),
  "library.lookup_machine_config": read(rows({ type: str })),

  "parts.save": write(["component"], partSaved),
  "parts.insert": write(["drawing"], partInserted),
  "parts.delete": write(["component"], partDeleted),

  "library_edit.upsert_material": write(["library"], upserted),
  "library_edit.upsert_tool": write(["library"], upserted),
  "library_edit.upsert_machine_config": write(["library"], upserted),
  "library_edit.upsert_library_item": write(["library"], upserted),
  "library_edit.set_cost": write(["library"], upserted),
  "library_edit.set_default": write(["library"], defaultsSet),
  "library_edit.delete": write(["library"], libraryDeleted),

  "memory.recall": read(recalled),
  "memory.context_read": read(contextDocument),
  "memory_edit.remember": write(["memory"], remembered),
  "memory_edit.context_update": write(["context"], contextUpdated),

  "research.search": read(searched, ["external"]),
  "research.read_attachment": read(attachmentRead),

  "vcs.status": read(vcsStatus),
  "vcs.diff": read(vcsDiff),
  "vcs.list_pull_requests": read(pullRequests),
  "vcs_edit.start_change": write(["history"], changeStarted),
  "vcs_edit.commit": write(["history"], committed),
  "vcs_edit.restore": write(["history", "drawing"], restored),
  "vcs_edit.open_pull_request": write(["history"], pullRequestOpened),
  "vcs_edit.run_workflows": write(["workflow"], workflowsRun),

  "agent.start": write(["task"], task),
  // Kind `write` in the catalogue so no read-only role holds the tool, but listing and reading change nothing.
  "agent.list": read(tasks),
  "agent.read": read(task),
  "agent.cancel": write(["task"], task),

  // A mod is app-wide extension code the host imports; `mods_edit.remove` is destructive because the source is gone.
  "mods.list": read(modList),
  "mods.read": read(modDetail),
  "mods_edit.save": write(["mod"], modSaved),
  "mods_edit.set_enabled": write(["mod"], modSaved),
  "mods_edit.remove": write(["mod"], modRemoved)
}
