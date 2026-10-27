/**
 * `cad_edit` — everything that changes the open drawing. Read-only inspection lives in `cad`, so a specialist that
 * may read the model has no way to change it: permissions are keyed by tool id and this one is never given to a
 * read-only role.
 *
 * `delete` is the destructive action of the group. The host's permissions are keyed by tool, so the whole tool is
 * registered as `ask` (spec 26 §2.2): one native confirmation instead of an invented action-level permission system.
 */
import { Schema } from "effect"
import { CAD_ACTION_INPUTS, PARAMETRIC_ACTION_INPUTS, type CadImportInput } from "@cadcamfun/api"
import { cad } from "@cadcamfun/core"
import { EntityChanges, EntityInput } from "../domain-schemas.ts"
import { ELEMENT_TYPES, MAX_ELEMENTS_PER_CALL, normalizeElement } from "../element-catalog.ts"
import { attachmentNames, getAttachment } from "../attachments.ts"
import { validated } from "../tools/define.ts"
import { defineWireAction, type ActionContext, type ActionSpec } from "./action.ts"
import { holeInputProblem } from "./cad.ts"
import {
  runParametricConvert, runParametricCreate, runParametricRecipeCreate, runParametricTimeline, runParametricUpdate
} from "./parametric.ts"

const INPUTS = { ...CAD_ACTION_INPUTS, ...PARAMETRIC_ACTION_INPUTS }

const isBoolean = (e: Record<string, unknown>): boolean => typeof e["type"] === "string" && (e["type"] as string).startsWith("boolean-")
const isContainer = (e: Record<string, unknown>): boolean => e["type"] === "component" || e["type"] === "group"

/**
 * Elements that name the same `component` become the children of one `component` element (placed at its first child's
 * position, children relative to it), so a model that cannot write nested arguments still builds assemblies: it only names the
 * part each solid belongs to. An element a Boolean refers to by index, a Boolean and a container stay on their own.
 */
export const groupIntoComponents = <T extends { readonly index: number; readonly element: Record<string, unknown> }>(kept: ReadonlyArray<T>): T[] => {
  const referenced = new Set<number>()
  for (const { element } of kept) if (isBoolean(element) && Array.isArray(element["operands"])) for (const o of element["operands"] as unknown[]) if (typeof o === "number") referenced.add(o)
  const members = new Map<string, T[]>()
  for (const entry of kept) {
    const name = entry.element["component"]
    if (typeof name !== "string" || name.trim() === "" || isBoolean(entry.element) || isContainer(entry.element) || referenced.has(entry.index)) continue
    members.set(name.trim(), [...(members.get(name.trim()) ?? []), entry])
  }
  const grouped = new Set<T>()
  const out: T[] = []
  for (const entry of kept) {
    const name = typeof entry.element["component"] === "string" ? entry.element["component"].trim() : ""
    const group = members.get(name)
    // Not a member (a Boolean operand, a container, no name): it stays as it is.
    if (group === undefined || !group.includes(entry)) { out.push(entry); continue }
    if (grouped.has(entry)) continue
    for (const member of group) grouped.add(member)
    const first = group[0]!.element
    const origin = { x: Number(first["x"]) || 0, y: Number(first["y"]) || 0, z: Number(first["z"]) || 0 }
    const children = group.map(({ element }) => {
      const { component: _component, layer: _layer, layerId: _layerId, ...child } = element
      return { ...child, x: (Number(child["x"]) || 0) - origin.x, y: (Number(child["y"]) || 0) - origin.y, z: (Number(child["z"]) || 0) - origin.z }
    })
    const layer = first["layer"] ?? first["layerId"]
    const container = normalizeElement({ type: "component", name, ...origin, elements: children, ...(layer !== undefined ? { layer } : {}) })
    if (container.ok) out.push({ ...entry, element: container.element })
    else for (const member of group) out.push(member)
  }
  return out
}

/** The element catalogue (`element-catalog.ts`) checks each element's own fields; the call names only their types. */
const addElementsParameters = Schema.Struct({
  elements: Schema.Array(Schema.StructWithRest(Schema.Struct({ type: Schema.Literals(ELEMENT_TYPES) }), [Schema.Record(Schema.String, Schema.Unknown)]))
    .check(Schema.isMinLength(1), Schema.isMaxLength(MAX_ELEMENTS_PER_CALL))
})

/** Builds geometry in the editor's own element format: the way objects are created, in 3D. */
const runAddElements = async ({ elements }: typeof addElementsParameters.Type, { handlers, projectId }: ActionContext) => {
  // Every element is judged on its own: the valid ones are added and the rest are named, so one slip never costs the whole call.
  const checked = elements.map((element, index) => ({ index, result: normalizeElement(element) }))
  const skipped: Array<{ index: number; error: string }> = []
  const warnings: string[] = []
  let kept = checked.flatMap(({ index, result }) => {
    if (!result.ok) { skipped.push({ index, error: result.error }); return [] }
    if (result.warning !== undefined) warnings.push(`elements[${index}]: ${result.warning}`)
    return [{ index, element: result.element }]
  })
  // A boolean whose operand (an earlier element of this call, by index) was skipped cannot be built; that goes on until stable.
  for (let changed = true; changed;) {
    changed = false
    const alive = new Set(kept.map((k) => k.index))
    kept = kept.filter(({ index, element }) => {
      if (!isBoolean(element) || !Array.isArray(element["operands"])) return true
      const missing = (element["operands"] as unknown[]).find((o) => typeof o === "number" && !alive.has(o))
      if (missing === undefined) return true
      skipped.push({ index, error: `its operand elements[${String(missing)}] was not added` })
      changed = true
      return false
    })
  }
  if (kept.length === 0) {
    return { ok: false, error: "Nothing was added: every element was invalid.", problems: skipped.sort((a, b) => a.index - b.index).map((s) => `elements[${s.index}]: ${s.error}`) }
  }
  kept = groupIntoComponents(kept)
  // The handler counts operand indexes in the batch it receives, which is now the kept elements.
  const newIndex = new Map(kept.map((k, position) => [k.index, position]))
  const batch = kept.map(({ element }) => isBoolean(element) && Array.isArray(element["operands"])
    ? { ...element, operands: (element["operands"] as unknown[]).map((o) => (typeof o === "number" ? newIndex.get(o) ?? o : o)) }
    : element)
  const stored = await handlers.addElements(projectId, batch)
  if (stored === null || typeof stored !== "object") return stored
  const out: Record<string, unknown> = { ...stored }
  if (skipped.length > 0) {
    out["skipped"] = skipped.sort((a, b) => a.index - b.index).map((s) => ({ index: s.index, error: s.error }))
    out["note"] = `${kept.length} of ${elements.length} elements were added. Send only the skipped ones again, corrected; the rest are already in the drawing.`
  }
  if (warnings.length > 0) out["warnings"] = warnings
  return out
}

/** A mesh attachment as the desktop parses it: up to 40 mesh elements, each checked by the element catalogue. */
const MeshAttachment = Schema.Struct({
  format: Schema.Literal("cadcamfun-mesh"),
  elements: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)).check(Schema.isMinLength(1), Schema.isMaxLength(40))
})

const runImport = async (a: CadImportInput, { handlers, projectId }: ActionContext) => {
  const tolerance = a.tolerance ?? 0.01
  let content = a.content
  if (content === undefined) {
    if (a.attachment === undefined) return { ok: false, error: "Give the file text as content, or the name of an attached file as attachment." }
    content = getAttachment(projectId, a.attachment)
    if (content === undefined) {
      const known = attachmentNames(projectId)
      return { ok: false, error: `No attached file called "${a.attachment}".${known.length > 0 ? ` Attached: ${known.join(", ")}.` : " Nothing is attached."}` }
    }
  }
  const name = a.attachment?.toLowerCase() ?? ""
  if (a.format === "mesh" || name.endsWith(".mesh.json")) {
    let raw: unknown
    try { raw = JSON.parse(content) } catch { return { ok: false, error: "The mesh attachment is not valid JSON." } }
    if (!Schema.is(MeshAttachment)(raw)) return { ok: false, error: "Expected a parsed cadcamfun-mesh attachment." }
    const elements: Record<string, unknown>[] = []
    for (const element of raw.elements) {
      if (element["type"] !== "mesh") return { ok: false, error: "Mesh attachments can only contain mesh elements." }
      const checked = normalizeElement(element)
      if (!checked.ok) return { ok: false, error: checked.error }
      const scale = a.scale ?? 1
      checked.element["vertices"] = (checked.element["vertices"] as Array<{ x: number; y: number; z: number }>).map((v) => ({ x: v.x * scale, y: v.y * scale, z: v.z * scale }))
      checked.element["sourceMetadata"] = { ...(checked.element["sourceMetadata"] as Record<string, unknown> | undefined), sourceToMmScale: scale, importedUnits: "mm" }
      // Scaling can overflow even when each input was finite.
      const scaled = normalizeElement(checked.element)
      if (!scaled.ok) return { ok: false, error: scaled.error }
      elements.push({ ...scaled.element, ...(a.name ? { name: a.name } : {}), ...(a.layer ? { layer: a.layer } : {}), ...(a.color ? { color: a.color } : {}) })
    }
    const stored = await handlers.addElements(projectId, elements)
    return stored !== null && typeof stored === "object"
      ? { ...stored, warnings: ["Imported triangles preserve source geometry; no parametric history was recovered. Mesh units use the explicit import scale (default 1 mm per source unit)."], stats: { meshes: elements.length } }
      : stored
  }
  if (a.format === "parasolid" || /\.x_[tb]$/.test(name)) return cad.brep.parasolidDiagnostic()
  if (a.format === "iges" || /\.(igs|iges)$/.test(name)) {
    if (handlers.cadStoreBodies === undefined) return { ok: false, error: "Exact body import is unavailable in this host." }
    try {
      const read = cad.brep.readIgesBreps(content)
      if (read.parts.length === 0 || read.warnings.length > 0) return { ok: false, error: "IGES import is incomplete; nothing was stored.", warnings: read.warnings }
      const scale = a.scale ?? 1
      const bodies = read.parts.map((p) => ({ name: a.name ?? p.name, kind: "solid" as const, brep: scale === 1 ? p.brep : cad.brep.transformBrep(p.brep, { m: [scale, 0, 0, 0, scale, 0, 0, 0, scale], t: { x: 0, y: 0, z: 0 } }) }))
      return handlers.cadStoreBodies(projectId, bodies)
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) } }
  }
  const guessed = /\.(step|stp)$/.test(name) || /^\s*ISO-10303-21/.test(content) ? "step" : name.endsWith(".svg") || /<svg[\s>]/i.test(content) ? "svg" : "dxf"
  const format = a.format ?? guessed
  let depth = a.depth
  let baseZ = 0
  let read: { readonly shapes: ReadonlyArray<cad.Shape>; readonly warnings: ReadonlyArray<string> }
  if (format === "step") {
    const step = cad.readStepShapes(content, { tolerance, ...(a.up !== undefined ? { up: a.up } : {}) })
    read = step
    depth ??= step.height > 0 ? step.height : undefined
    baseZ = step.zMin
  } else {
    read = format === "dxf"
      ? cad.readDxfShapes(content, { tolerance })
      : cad.parseSvg(content, { ...(a.scale !== undefined ? { scale: a.scale } : {}), tolerance })
  }
  if (depth === undefined) return { ok: false, error: "A drawing has no thickness: give depth in mm.", warnings: read.warnings }
  if (read.shapes.length === 0) return { ok: false, error: "No lines, arcs, circles or polylines were found in the file.", warnings: read.warnings }
  const built = cad.extrudeDrawing(read.shapes, {
    depth, baseZ, tolerance,
    ...(a.gap !== undefined ? { gap: a.gap } : {}), ...(a.name !== undefined ? { name: a.name } : {}),
    ...(a.color !== undefined ? { color: a.color } : {}), ...(a.layer !== undefined ? { layer: a.layer } : {})
  })
  const warnings = [...read.warnings, ...built.warnings]
  if (built.elements.length === 0) return { ok: false, error: "No closed outline was found to extrude.", stats: built.stats, warnings }
  const normalized: Array<Record<string, unknown>> = []
  for (const [index, element] of built.elements.entries()) {
    const result = normalizeElement(element)
    if (!result.ok) return { ok: false, error: `Nothing was added. elements[${index}]: ${result.error}` }
    normalized.push(result.element)
  }
  const stored = await handlers.addElements(projectId, normalized)
  return stored !== null && typeof stored === "object" ? { ...stored, stats: built.stats, warnings } : stored
}

const NEEDS_LAYER = new Set(["layer_create", "layer_rename", "layer_color", "layer_show", "layer_hide", "layer_lock", "layer_unlock", "layer_delete", "layer_activate"])
const NEEDS_IDS = new Set(["select", "show", "hide", "isolate"])

export const CAD_EDIT_ACTIONS: ReadonlyArray<ActionSpec> = [
  defineWireAction({ id: "cad_edit.surface", kind: "write", parameters: INPUTS["cad_edit.surface"],
    run: (input, { handlers, projectId }) => {
      if (handlers.cadStoreBodies === undefined) return { ok: false, error: "Exact body storage is unavailable in this host." }
      try {
        const body = cad.brep.buildSurfaceOperation(input)
        return handlers.cadStoreBodies(projectId, [{ ...body, name: input.name ?? "NURBS surface" }])
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) } }
    } }),
  defineWireAction({ id: "cad_edit.shell", kind: "write", parameters: INPUTS["cad_edit.shell"],
    run: (input, { handlers, projectId }) => handlers.cadBuildShell === undefined ? { ok: false, error: "Shell construction is unavailable in this host." } : handlers.cadBuildShell(projectId, input) }),
  defineWireAction({ id: "cad_edit.hole", kind: "write", parameters: INPUTS["cad_edit.hole"],
    run: (input, { handlers, projectId }) => {
      if (handlers.cadBuildHole === undefined) return { ok: false, error: "Hole editing is unavailable in this host." }
      const bad = holeInputProblem(input)
      return bad !== undefined ? { ok: false, error: bad } : handlers.cadBuildHole(projectId, input)
    } }),
  defineWireAction({ id: "cad_edit.title_block_set", kind: "write", parameters: INPUTS["cad_edit.title_block_set"],
    run: ({ titleBlock }, { handlers, projectId }) => handlers.cadTitleBlock === undefined ? { ok: false, error: "The title block is unavailable in this host." } : handlers.cadTitleBlock(projectId, { action: "set", titleBlock }) }),
  defineWireAction({ id: "cad_edit.offset", kind: "write", parameters: INPUTS["cad_edit.offset"],
    run: (input, { handlers, projectId }) => handlers.cadBuildOffset === undefined ? { ok: false, error: "Offset construction is unavailable in this host." } : handlers.cadBuildOffset(projectId, input) }),
  defineWireAction({ id: "cad_edit.add", kind: "write", replaces: "cad_add_elements", parameters: addElementsParameters, run: runAddElements }),
  defineWireAction({
    id: "cad_edit.add_entities", kind: "write", replaces: "cad_add_entities",
    parameters: INPUTS["cad_edit.add_entities"],
    run: ({ entities }, { handlers, projectId }) => handlers.addEntities(projectId, entities.map((e) => validated(EntityInput, e)))
  }),
  defineWireAction({
    id: "cad_edit.modify", kind: "write", replaces: "cad_modify_entities",
    parameters: INPUTS["cad_edit.modify"],
    // EntityChanges checks the fields it knows (sizes > 0, points); the rest (x, y, z, rotation, scale, history, parameters, any other
    // field of the element) passes through untouched and is judged against the element's own type by the handler.
    run: ({ changes }, { handlers, projectId }) =>
      handlers.modifyEntities(projectId, changes.map((c) => ({ id: c.id, changes: { ...c.changes, ...validated(EntityChanges, c.changes) } })))
  }),
  defineWireAction({
    id: "cad_edit.transform", kind: "write", replaces: "cad_transform_entities",
    parameters: INPUTS["cad_edit.transform"],
    run: async ({ ids, dx, dy, dz, rotateAxis, rotateDegrees, scale, about, copies }, { handlers, projectId }) => {
      const move = dx !== undefined || dy !== undefined || dz !== undefined ? { x: dx ?? 0, y: dy ?? 0, z: dz ?? 0 } : undefined
      const rotate = rotateDegrees !== undefined && rotateDegrees !== 0 ? { axis: rotateAxis ?? "z", degrees: rotateDegrees, ...(about ? { about } : {}) } : undefined
      const scaling = scale !== undefined && scale !== 1 ? { factor: scale, ...(about ? { about } : {}) } : undefined
      if (move === undefined && rotate === undefined && scaling === undefined) {
        return { ok: false, error: "Nothing to do: give dx/dy/dz, rotateDegrees (with rotateAxis) or scale." }
      }
      if (about !== undefined && rotate === undefined && scaling === undefined) return { ok: false, error: "about only means something with rotateDegrees or scale." }
      return handlers.transformEntities(projectId, { ids, transform: { ...(scaling ? { scale: scaling } : {}), ...(rotate ? { rotate } : {}), ...(move ? { move } : {}) }, copies: copies ?? 0 })
    }
  }),
  defineWireAction({
    id: "cad_edit.group", kind: "write", replaces: "cad_group_entities",
    parameters: INPUTS["cad_edit.group"],
    run: ({ ids, name, ungroup, layer }, { handlers, projectId }) =>
      handlers.groupEntities(projectId, { ids, ungroup: ungroup === true, ...(name !== undefined ? { name } : {}), ...(layer !== undefined ? { layer } : {}) })
  }),
  defineWireAction({
    id: "cad_edit.delete", kind: "destructive", replaces: "cad_delete_entities",
    // `confirm: true` is the model's own acknowledgement that the user asked for this; the native `ask` permission the host
    // registers for `cad_edit` is the human decision. Both are required, and neither one alone is enough.
    parameters: INPUTS["cad_edit.delete"],
    run: ({ ids }, { handlers, projectId }) => handlers.deleteEntities(projectId, ids)
  }),
  defineWireAction({
    // The layers, the view and the selection live in the open editor, not in the stored drawing: this checks the actions are
    // complete and hands them back; the editor performs them when it reads the result.
    id: "cad_edit.editor", kind: "write", replaces: "cad_editor",
    parameters: INPUTS["cad_edit.editor"],
    run: ({ actions }) => {
      const problems = actions.flatMap((a, index) => {
        if (NEEDS_LAYER.has(a.action) && (a.layer === undefined || a.layer.trim() === "")) return [`actions[${index}] ${a.action} needs "layer"`]
        if (a.action === "layer_rename" && (a.newName === undefined || a.newName.trim() === "")) return [`actions[${index}] layer_rename needs "newName"`]
        if (a.action === "layer_color" && !/^#[0-9a-fA-F]{6}$/.test(a.color ?? "")) return [`actions[${index}] layer_color needs "color" as #rrggbb`]
        if (a.action === "section_on" && a.position === undefined) return [`actions[${index}] section_on needs "position" (mm along the axis)`]
        if (NEEDS_IDS.has(a.action) && (a.ids === undefined || a.ids.length === 0)) return [`actions[${index}] ${a.action} needs "ids"`]
        return []
      })
      if (problems.length > 0) return { ok: false, error: "Nothing was done.", problems }
      return { ok: true, actions, note: "The editor performs these actions as it reads this result." }
    }
  }),
  defineWireAction({ id: "cad_edit.import", kind: "write", replaces: "cad_import_drawing", parameters: INPUTS["cad_edit.import"], run: runImport }),
  defineWireAction({
    id: "cad_edit.parametric_create", kind: "write", replaces: "cad_parametric",
    parameters: INPUTS["cad_edit.parametric_create"],
    run: (input, context) => runParametricCreate(input, context)
  }),
  defineWireAction({
    id: "cad_edit.parametric_update", kind: "write", replaces: "cad_parametric",
    parameters: INPUTS["cad_edit.parametric_update"],
    run: (input, context) => runParametricUpdate(input, context)
  }),
  defineWireAction({
    id: "cad_edit.parametric_timeline", kind: "write", replaces: "cad_parametric",
    parameters: INPUTS["cad_edit.parametric_timeline"],
    run: (input, context) => runParametricTimeline(input, context)
  }),
  defineWireAction({
    id: "cad_edit.parametric_recipe_create", kind: "write", replaces: "cad_parametric",
    parameters: INPUTS["cad_edit.parametric_recipe_create"],
    run: (input, context) => runParametricRecipeCreate(input, context)
  }),
  defineWireAction({
    id: "cad_edit.parametric_convert", kind: "write", replaces: "cad_parametric",
    parameters: INPUTS["cad_edit.parametric_convert"],
    run: (input, context) => runParametricConvert(input, context)
  })
]