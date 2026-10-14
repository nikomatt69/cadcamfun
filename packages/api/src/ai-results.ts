/**
 * What every catalogue action answers. A result is validated against its contract at the one seam where the action's
 * implementation is crossed, before any adapter (host text, Code Mode value, desktop, HTTP bridge) sees it.
 *
 * A success pins the fields its consumers depend on: the ids it created or touched, the drawing it went to, revisions,
 * identities and page counts. Richer evidence (bounds, issues, notes) passes through without being pinned, because
 * the model and the desktop read more than a contract can usefully freeze. A refusal is `{ ok: false, error }`; typed
 * refusals and conflicts add `_tag`. A value that is neither is not a result: a read answers with a failure and a
 * write becomes `ActionUncertain`, never a success.
 */
import { Schema } from "effect"
import { cam } from "@cadcamfun/core"
import { ActionCommitted, ActionConflict } from "./ai-actions.ts"

const text = Schema.String
const count = Schema.Number
const flag = Schema.Boolean
const object = Schema.Record(Schema.String, Schema.Unknown)
const list = Schema.Array(Schema.Unknown)
const ids = Schema.Array(Schema.String)
const offset = Schema.NullOr(Schema.Number)
const yes = Schema.Literal(true)
/** Where a drawing change or read went: the mirror target the desktop needs. */
const target = { drawingId: text, projectId: text }

/** The action did nothing, and says why. Typed refusals (`_tag`) and stale/blocked answers carry an `error` too. */
export const ActionRefusal = Schema.Struct({ ok: Schema.Literal(false), error: text })

/** A typed failure from the seam (denied, invalid input, interrupted, uncertain, failed): it names its tag and action. */
export const ActionTypedFailure = Schema.Struct({
  ok: Schema.Literal(false),
  _tag: Schema.Literals(["ActionDenied", "ActionInvalidInput", "ActionInterrupted", "ActionUncertain", "ActionFailed"]),
  actionId: text
})

const answer = <S extends Schema.Top>(success: S) => Schema.Union([success, ActionRefusal, ActionTypedFailure, ActionConflict, ActionCommitted])

/** A batch that changed drawing elements: what the editor mirrors. */
const elementChange = Schema.Struct({ ok: yes, ids, elements: list, ...target })
const parametricReport = Schema.Struct({ ok: flag, bodyCount: count, volumeMm3: Schema.NullOr(count), issues: list })
const libraryRow = Schema.Struct({ id: text, name: text })
const task = Schema.Struct({ id: text, status: Schema.Literals(["queued", "running", "completed", "error", "cancelled"]) })
const viewport = Schema.Struct({ ok: yes, image: object })

export const ACTION_RESULTS = {
  "cad.describe": answer(Schema.Struct({ total: count, counts: object, bounds: Schema.NullOr(object), elements: list, ...target })),
  "cad.check": answer(Schema.Struct({ ok: flag, issues: list, omitted: count, stats: object, ...target })),
  "cad.relations": answer(Schema.Struct({ ok: yes, first: object, second: object, originDistanceMm: count, boundingGapsMm: Schema.NullOr(object), ...target })),
  "cad.grep": answer(Schema.Struct({ ok: yes, query: text, total: count, returned: count, offset: count, complete: flag, nextOffset: offset, hits: list, ...target })),
  "cad.vision": answer(viewport),
  "cad.inspect_elements": answer(Schema.Struct({ ok: yes, total: count, offset: count, nextOffset: offset, elements: list, missingIds: ids, ...target })),
  "cad.inspect_layers": answer(Schema.Struct({ ok: yes, layers: list, available: flag, ...target })),
  "cad.inspect_search": answer(Schema.Struct({ ok: yes, query: text, total: count, returned: count, complete: flag, elements: list, ...target })),
  "cad.inspect_property": answer(Schema.Struct({ ok: yes, elementId: text, content: text, totalChars: count, nextOffset: offset, ...target })),
  "cad.drawing": answer(Schema.Struct({ ok: yes, mutated: Schema.Literal(false) })),
  "cad.parametric_validate": answer(parametricReport),
  "cad.parametric_inspect": answer(Schema.Struct({ ...parametricReport.fields, history: object, revision: text, elementId: text, ...target })),
  "cad.parametric_test": answer(Schema.Struct({ ok: flag, revision: text, mutated: Schema.Literal(false), cases: list, elementId: text })),
  "cad.parametric_dfm": answer(Schema.Struct({ ok: flag, process: text, issues: list, metrics: object })),
  "cad.parametric_exact": answer(Schema.Struct({ ok: flag, bodies: list, issues: list })),
  "cad.exact": answer(Schema.Struct({ ok: yes, totals: object, parts: list, ...target })),
  "cad.assembly": answer(Schema.Struct({ ok: yes, parts: Schema.Unknown, interference: object, bom: list, fasteners: object, ...target })),
  "cad.parametric_fastener": answer(Schema.Union([Schema.Struct({ ok: yes, threads: list }), Schema.Struct({ ok: yes, thread: object })])),
  "cad.parametric_recipe": answer(Schema.Struct({ ok: flag, recipe: Schema.Unknown, history: object, report: object })),
  "cad.parametric_from_element": answer(Schema.Struct({ ok: flag, source: object, notes: list })),

  "cad_edit.add": answer(elementChange),
  "cad_edit.add_entities": answer(elementChange),
  "cad_edit.modify": answer(Schema.Struct({ ok: yes, modified: count, elements: list, ...target })),
  "cad_edit.transform": answer(Schema.Struct({ ok: yes, mode: Schema.Literals(["copied", "transformed"]), ids, elements: list, ...target })),
  "cad_edit.group": answer(Schema.Struct({ ok: yes, removed: ids, ids, elements: list, ...target })),
  "cad_edit.delete": answer(Schema.Struct({ ok: yes, deleted: count, ids, ...target })),
  "cad_edit.editor": answer(Schema.Struct({ ok: yes, actions: list })),
  "cad_edit.import": answer(elementChange),
  "cad_edit.parametric_create": answer(Schema.Struct({ ...elementChange.fields, mutation: Schema.Literal("add") })),
  "cad_edit.parametric_update": answer(Schema.Struct({ ...elementChange.fields, mutation: Schema.Literal("update"), revision: text })),
  "cad_edit.parametric_recipe_create": answer(Schema.Struct({ ok: yes, history: object, report: object, created: object })),
  "cad_edit.parametric_convert": answer(Schema.Struct({ ...elementChange.fields, source: object })),

  "cam.plan_check": answer(Schema.Struct({ ok: flag, status: Schema.Literals(["pass", "failed"]), revision: text, mutated: Schema.Literal(false), operations: list })),
  "cam.review": answer(Schema.Struct({ ok: flag, status: text, operationId: text })),
  "cam.machine": answer(Schema.Struct({ kind: text, title: text, axes: list, origins: Schema.Unknown })),
  "cam.operations": answer(Schema.Array(Schema.Struct({ id: text, name: text, generated: flag }))),
  "cam.suggest": answer(cam.generator.SuggestResponseSchema),
  "cam.compare_setups": answer(Schema.Struct({ ok: yes, mutated: Schema.Literal(false), candidates: list, ...target })),
  "cam.analyze": answer(Schema.Struct({ issues: list, stats: Schema.Struct({ lines: count, rapidMoves: count, cutMoves: count, toolChanges: count }) })),
  "cam.stock": answer(Schema.Struct({ ok: yes, stock: object, volumeMm3: count, ...target })),
  "cam.vision": answer(viewport),
  "cam.chain_suggest": answer(Schema.Struct({ ok: yes, recommendation: object, after: Schema.NullOr(text) })),
  "cam.materials": answer(Schema.Struct({ ok: yes, materials: list, machines: list })),
  "cam.cutting_data": answer(Schema.Struct({ ok: yes, material: object, machine: object, cuttingData: object })),
  "cam.manufacture": answer(Schema.Struct({ ok: yes, mutated: Schema.Literal(false), ...target })),
  "cam.chain_status": answer(Schema.Struct({ ok: yes, operationId: text, generated: flag, warnings: Schema.Array(text) })),

  "cam_edit.manufacture": answer(Schema.Struct({ ok: yes, operationId: text, release: text, identity: object, ...target })),
  "cam_edit.create": answer(Schema.Struct({ ok: yes, operationId: text, name: text })),
  "cam_edit.update": answer(Schema.Struct({ ok: yes, operationId: text, settings: object })),
  "cam_edit.generate": answer(Schema.Struct({ ok: yes, operationId: text, lines: count, returned: count, omitted: count, preview: text, programHash: text })),
  "cam_edit.verify": answer(Schema.Struct({ ok: flag, status: Schema.Literals(["pass", "failed"]), revision: text, operationId: text, programHash: text, issues: list })),
  "cam_edit.stock_set": answer(Schema.Struct({ ok: yes, action: Schema.Literal("set"), stock: object, ...target })),

  "library.component_list": answer(Schema.Array(Schema.Struct({ id: text, name: Schema.NullOr(text), children: count }))),
  "library.lookup_component": answer(Schema.Array(libraryRow)),
  "library.lookup_material": answer(Schema.Array(libraryRow)),
  "library.lookup_tool": answer(Schema.Array(libraryRow)),
  "library.lookup_machine_config": answer(Schema.Array(libraryRow)),

  "parts.save": answer(Schema.Struct({ ok: yes, componentId: text, name: text, children: count, ...target })),
  "parts.insert": answer(Schema.Struct({ ...elementChange.fields, component: object })),
  "parts.delete": answer(Schema.Struct({ ok: yes, deleted: text })),

  "library_edit.upsert_material": answer(Schema.Struct({ ok: yes, id: text, created: flag })),
  "library_edit.upsert_tool": answer(Schema.Struct({ ok: yes, id: text, created: flag })),
  "library_edit.upsert_machine_config": answer(Schema.Struct({ ok: yes, id: text, created: flag })),
  "library_edit.set_default": answer(Schema.Struct({ ok: yes, projectId: text, defaults: object })),
  "library_edit.delete": answer(Schema.Struct({ ok: yes, kind: text, id: text })),

  "memory.recall": answer(Schema.Array(Schema.Struct({ key: text, value: Schema.Unknown }))),
  "memory.context_read": answer(Schema.Struct({ text })),
  "memory_edit.remember": answer(Schema.Struct({ ok: yes, key: text })),
  "memory_edit.context_update": answer(Schema.Struct({ ok: yes, text, changed: flag })),

  "research.search": answer(Schema.Struct({ ok: yes, query: text, results: list })),
  "research.read_attachment": answer(Schema.Struct({ ok: yes, attachment: text, offset: count, content: text, totalChars: count, nextOffset: offset })),

  "vcs.status": answer(Schema.Struct({ branch: text, branches: Schema.Array(text), openPullRequests: list })),
  "vcs.diff": answer(Schema.Array(Schema.Struct({ path: text }))),
  "vcs.list_pull_requests": answer(Schema.Array(Schema.Struct({ number: count, title: text }))),

  "vcs_edit.start_change": answer(Schema.Struct({ branch: text })),
  "vcs_edit.commit": answer(Schema.Struct({ commit: text })),
  "vcs_edit.restore": answer(Schema.Struct({ commit: text, branch: text, paths: Schema.Array(text) })),
  "vcs_edit.open_pull_request": answer(Schema.Struct({ number: count, head: text, base: text })),
  "vcs_edit.run_workflows": answer(Schema.Array(Schema.Struct({ workflow: Schema.Unknown, status: Schema.Unknown }))),

  "agent.start": answer(task),
  "agent.list": answer(Schema.Array(task)),
  "agent.read": answer(task),
  "agent.cancel": answer(task)
} as const

export type ActionResultId = keyof typeof ACTION_RESULTS
