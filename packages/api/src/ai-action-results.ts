/**
 * What each catalogue action answers and what it touches, declared once next to its input schemas (`ai-cam.ts`,
 * `ai-inspection.ts`). The AI package validates every implementation's answer against the result declared here before it
 * crosses an adapter as success, and the desktop decodes the same shapes when it mirrors a change into the editor.
 *
 * A result schema states what consumers rely on, not every field: a value may carry more (the model reads it), never less.
 * Refusals (`ok: false`) are not described per action; their shape is the shared failure below.
 */
import { Schema } from "effect"

// ---------------------------------------------------------------- shared shapes

/** Every outcome an execution can have. Only `succeeded` (and `partial`, with what was left out named) is completed work. */
export const ActionOutcomeKind = Schema.Literals(["succeeded", "partial", "refused", "conflict", "cancelled", "uncertain"])
export type ActionOutcomeKind = typeof ActionOutcomeKind.Type

/**
 * What an action changes or reaches beyond reading the open document. Declared, never inferred from the tool's name:
 * `interface` is the editor or viewport on the user's screen, `external` the network, `task` the delegation scheduler.
 */
export const ActionEffect = Schema.Literals([
  "drawing", "operation", "program", "report", "stock", "component", "library", "memory", "context", "history", "workflow", "task", "interface", "external"
])
export type ActionEffect = typeof ActionEffect.Type

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
const parametricDfm = Schema.Struct({ ok: Schema.Boolean })
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

// ---------------------------------------------------------------- the table

export interface ActionContract {
  /** What the action changes or reaches; empty for a read of the open document. */
  readonly effects: ReadonlyArray<ActionEffect>
  /** The success value; absent while the action's family has not been migrated (AI-11 Step 1). */
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
  // Kind `write` in the catalogue, but it only changes what the editor shows: layers, view, selection.
  "cad_edit.editor": write(["interface"], editor),
  "cad_edit.import": write(["drawing"], added),
  "cad_edit.parametric_create": write(["drawing"], parametricCreated),
  "cad_edit.parametric_update": write(["drawing"], parametricUpdated),
  "cad_edit.parametric_recipe_create": write(["drawing"], recipeCreated),
  "cad_edit.parametric_convert": write(["drawing"], converted),

  "cam.plan_check": read(),
  "cam.review": read(),
  "cam.machine": read(),
  "cam.operations": read(),
  "cam.suggest": read(),
  "cam.compare_setups": read(),
  "cam.analyze": read(),
  "cam.stock": read(),
  "cam.vision": read(undefined, ["interface"]),
  "cam.chain_suggest": read(),
  "cam.materials": read(),
  "cam.cutting_data": read(),
  "cam.manufacture": read(),
  "cam.chain_status": read(),

  "cam_edit.manufacture": write(["operation", "program"]),
  "cam_edit.create": write(["operation"]),
  "cam_edit.update": write(["operation"]),
  "cam_edit.generate": write(["program"]),
  // Regenerates and stores the program with its report today; AI-11 Step 8 makes it read the stored program.
  "cam_edit.verify": write(["program", "report"]),
  "cam_edit.stock_set": write(["stock"]),

  "library.component_list": read(),
  "library.lookup_component": read(),
  "library.lookup_material": read(),
  "library.lookup_tool": read(),
  "library.lookup_machine_config": read(),

  "parts.save": write(["component"]),
  "parts.insert": write(["drawing"]),
  "parts.delete": write(["component"]),

  "library_edit.upsert_material": write(["library"]),
  "library_edit.upsert_tool": write(["library"]),
  "library_edit.upsert_machine_config": write(["library"]),
  "library_edit.set_default": write(["library"]),
  "library_edit.delete": write(["library"]),

  "memory.recall": read(),
  "memory.context_read": read(),
  "memory_edit.remember": write(["memory"]),
  "memory_edit.context_update": write(["context"]),

  "research.search": read(undefined, ["external"]),
  "research.read_attachment": read(),

  "vcs.status": read(),
  "vcs.diff": read(),
  "vcs.list_pull_requests": read(),
  "vcs_edit.start_change": write(["history"]),
  "vcs_edit.commit": write(["history"]),
  "vcs_edit.restore": write(["history", "drawing"]),
  "vcs_edit.open_pull_request": write(["history"]),
  "vcs_edit.run_workflows": write(["workflow"]),

  "agent.start": write(["task"]),
  // Kind `write` in the catalogue so no read-only role holds the tool, but listing and reading change nothing.
  "agent.list": write([]),
  "agent.read": write([]),
  "agent.cancel": write(["task"])
}
