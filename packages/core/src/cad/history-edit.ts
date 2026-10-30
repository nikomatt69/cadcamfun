/**
 * Editing a parametric history without rebuilding it by hand: which dimensions a feature has and where they live, setting one,
 * renaming a parameter (and rewriting every formula that uses it), removing or moving a feature, and a starting part. Pure and
 * immutable: every function returns a new `History`, so an editor can keep the old one for undo.
 *
 * A dimension is addressed by a path inside its feature: `depth`, `at.0`, `sketch.constraints.3.value`. The panel and the assistant use the
 * same paths.
 */
import { namesIn, type Dimension } from "./expr.ts"
import { rebuild, type DimConstraint, type Feature, type History, type RebuildResult } from "./history.ts"
import { bodyCreator, bodyRefs, declaredNeeds } from "./history-timeline.ts"

export interface DimensionRef {
  /** Where it lives inside its feature: `depth`, `step.1`, `sketch.constraints.2.value`. */
  readonly path: string
  readonly label: string
  readonly value: Dimension
}

const constraintLabel = (c: DimConstraint): string => {
  const ids = [("line" in c ? c.line : undefined), ("circle" in c ? c.circle : undefined), ("a" in c ? c.a : undefined), ("b" in c ? c.b : undefined)].filter((x): x is string => typeof x === "string")
  return `${c.type}${ids.length > 0 ? ` ${ids.join(" ")}` : ""}`
}

/** Every dimension of a feature, in the order a person reads them. */
export const dimensionsOf = (f: Feature): ReadonlyArray<DimensionRef> => {
  const out: DimensionRef[] = []
  const add = (path: string, label: string, value: Dimension | undefined) => { if (value !== undefined) out.push({ path, label, value }) }
  switch (f.type) {
    case "sketch":
      add("offset", "offset along the normal", f.offset)
      f.sketch.constraints.forEach((c, i) => { if ("value" in c) add(`sketch.constraints.${i}.value`, constraintLabel(c), c.value as Dimension) })
      f.sketch.shapes?.forEach((shape, i) => {
        const base = `sketch.shapes.${i}`, name = `${shape.kind} ${shape.id}`
        if (shape.kind === "polyline" || shape.kind === "curve") { shape.points.forEach((p, k) => { add(`${base}.points.${k}.0`, `${name} point ${k + 1} x`, p[0]); add(`${base}.points.${k}.1`, `${name} point ${k + 1} y`, p[1]) }); return }
        add(`${base}.at.0`, `${name} x`, shape.at[0]); add(`${base}.at.1`, `${name} y`, shape.at[1])
        if (shape.kind === "rectangle") { add(`${base}.width`, `${name} width`, shape.width); add(`${base}.height`, `${name} height`, shape.height) }
        else if (shape.kind === "circle") add(`${base}.diameter`, `${name} diameter`, shape.diameter)
        else if (shape.kind === "polygon") { add(`${base}.radius`, shape.flats === true ? `${name} radius to the sides` : `${name} radius to the corners`, shape.radius); add(`${base}.rotation`, `${name} rotation (deg)`, shape.rotation) }
        else if (shape.kind === "ellipse") { add(`${base}.radiusX`, `${name} radius X`, shape.radiusX); add(`${base}.radiusY`, `${name} radius Y`, shape.radiusY) }
        else { add(`${base}.length`, `${name} overall length`, shape.length); add(`${base}.width`, `${name} width`, shape.width); add(`${base}.angle`, `${name} angle (deg)`, shape.angle) }
      })
      break
    case "extrude":
      add("depth", "depth", f.depth)
      add("edge.size", `edge ${f.edge?.style ?? ""} size`, f.edge?.size)
      add("corner.size", `corner ${f.corner?.style ?? ""} size`, f.corner?.size)
      add("taper", "draft angle (deg)", f.taper)
      break
    case "revolve": add("angle", "angle (deg)", f.angle); break
    case "hole":
      add("offset", "offset along the normal", f.offset)
      add("at.0", "centre u", f.at[0]); add("at.1", "centre v", f.at[1])
      add("diameter", "diameter", f.diameter); add("depth", "depth", f.depth)
      add("headDiameter", f.kind === "countersink" ? "countersink diameter" : "counterbore diameter", f.headDiameter)
      add("headDepth", "counterbore depth", f.headDepth)
      add("angle", "countersink angle (deg)", f.angle)
      add("thread.depth", "thread depth", f.thread?.depth)
      add("tolerance.upper", "tolerance, upper", f.tolerance?.upper); add("tolerance.lower", "tolerance, lower", f.tolerance?.lower)
      break
    case "mirror": add("offset", "mirror plane offset", f.offset); break
    case "shell": add("thickness", "shell thickness", f.thickness); break
    case "fillet": add("radius", f.style === "chamfer" ? "chamfer size" : "fillet radius", f.radius); add("edges.minLength", "shortest edge", f.edges?.minLength); break
    case "sweep": add("bendRadius", "bend radius", f.bendRadius); break
    case "loft": break
    case "primitive":
      for (const [key, value] of Object.entries(f.params ?? {})) add(`params.${key}`, `${f.element} ${key}`, value)
      f.at?.forEach((c, i) => add(`at.${i}`, `position ${"xyz"[i]}`, c))
      f.rotation?.forEach((c, i) => add(`rotation.${i}`, `rotation ${"xyz"[i]} (deg)`, c))
      f.profile?.forEach((p, k) => { add(`profile.${k}.0`, `profile point ${k + 1} x`, p[0]); add(`profile.${k}.1`, `profile point ${k + 1} y`, p[1]) })
      for (const [name, list] of [["path", f.path], ["positions", f.positions]] as const) list?.forEach((p, k) => p.forEach((c, axis) => add(`${name}.${k}.${axis}`, `${name} point ${k + 1} ${"xyz"[axis]}`, c)))
      f.radii?.forEach((r, k) => add(`radii.${k}`, `section ${k + 1} radius`, r))
      break
    case "coil":
      add("radius", "coil radius", f.radius); add("pitch", "pitch", f.pitch); add("turns", "turns", f.turns); add("wireDiameter", "wire diameter", f.wireDiameter); add("offset", "start height", f.offset)
      f.centre?.forEach((c, i) => add(`centre.${i}`, `axis ${"xy"[i]}`, c))
      break
    case "move":
      f.translate?.forEach((t, i) => add(`translate.${i}`, `move ${"xyz"[i]}`, t))
      add("rotate.angle", "rotation (deg)", f.rotate?.angle)
      f.rotate?.about?.forEach((c, i) => add(`rotate.about.${i}`, `turn about ${"xyz"[i]}`, c))
      break
    case "scale":
      if (Array.isArray(f.factor)) f.factor.forEach((t, i) => add(`factor.${i}`, `scale ${"xyz"[i]}`, t as Dimension))
      else add("factor", "scale factor", f.factor as Dimension)
      f.about?.forEach((c, i) => add(`about.${i}`, `scale about ${"xyz"[i]}`, c))
      break
    case "split": add("offset", "split plane offset", f.offset); break
    case "rib": add("thickness", "rib thickness", f.thickness); add("depth", "rib height", f.depth); break
    case "sheet": add("thickness", "sheet thickness", f.thickness); add("width", "flange width", f.width); add("bendRadius", "inside bend radius", f.bendRadius)
      f.hems?.forEach((h, i) => { add(`hems.${i}.length`, `hem ${i + 1} length`, h.length); add(`hems.${i}.gap`, `hem ${i + 1} gap`, h.gap) })
      break
    case "thread":
      add("diameter", "thread diameter", f.diameter); add("pitch", "pitch", f.pitch); add("length", "thread length", f.length); add("offset", "start height", f.offset)
      f.at?.forEach((c, i) => add(`at.${i}`, `axis ${"xy"[i]}`, c))
      break
    case "text":
      add("height", "text height", f.height); add("depth", "text depth", f.depth); add("strokeWidth", "stroke width", f.strokeWidth); add("offset", "offset along the normal", f.offset); add("spacing", "letter spacing", f.spacing)
      f.at?.forEach((c, i) => add(`at.${i}`, `position ${"uv"[i]}`, c))
      break
    case "plane":
      if (f.from.kind === "offset") add("from.distance", "plane offset", f.from.distance)
      else if (f.from.kind === "angle") { add("from.angle", "plane angle (deg)", f.from.angle); add("from.at", "hinge position", f.from.at) }
      else if (f.from.kind === "points") f.from.points.forEach((p, k) => p.forEach((c, i) => add(`from.points.${k}.${i}`, `point ${k + 1} ${"xyz"[i]}`, c)))
      else { f.from.near.forEach((c, i) => add(`from.near.${i}`, `face point ${"xyz"[i]}`, c)); add("from.offset", "lift off the face", f.from.offset) }
      break
    case "draft":
      add("angle", "draft angle (deg)", f.angle); add("neutral", "neutral plane", f.neutral)
      f.near.forEach((c, i) => add(`near.${i}`, `face point ${"xyz"[i]}`, c))
      break
    case "mate":
      add("offset", "gap", f.offset); add("spin", "spin (deg)", f.spin)
      f.slide?.forEach((c, i) => add(`slide.${i}`, `slide ${"uv"[i]}`, c))
      break
    case "pushpull":
      add("distance", "push/pull distance", f.distance)
      f.near.forEach((c, i) => add(`near.${i}`, `face point ${"xyz"[i]}`, c))
      break
    case "combine": break
    // An imported body is frozen geometry: it has no parameters to edit.
    case "imported": break
    case "pattern":
      add("count", "count", f.count)
      if (f.kind === "grid") {
        f.step?.forEach((s, i) => add(`step.${i}`, `step ${"xyz"[i]}`, s))
        add("countB", "rows", f.countB)
        f.stepB?.forEach((s, i) => add(`stepB.${i}`, `row step ${"xyz"[i]}`, s))
      } else if (f.kind === "linear") { f.step?.forEach((s, i) => add(`step.${i}`, `step ${"xyz"[i]}`, s)) }
      else { f.centre?.forEach((c, i) => add(`centre.${i}`, `centre ${"xy"[i]}`, c)); add("span", "span (deg)", f.span) }
      break
  }
  return out
}

/** Writes `value` at `path` inside `target`, copying the objects and arrays on the way. */
const setAt = (target: unknown, path: ReadonlyArray<string>, value: unknown): unknown => {
  if (path.length === 0) return value
  const [head, ...rest] = path as [string, ...string[]]
  if (Array.isArray(target)) {
    const i = Number(head)
    if (!Number.isInteger(i) || i < 0 || i >= target.length) throw new RangeError(`No entry ${head}`)
    return target.map((v, k) => (k === i ? setAt(v, rest, value) : v))
  }
  if (typeof target === "object" && target !== null) {
    const record = target as Record<string, unknown>
    if (!(head in record)) throw new RangeError(`No field '${head}'`)
    return { ...record, [head]: setAt(record[head], rest, value) }
  }
  throw new RangeError(`Cannot go into '${head}'`)
}

/** The history with one dimension of one feature set to a number or an expression. Throws when the feature or the path does not exist. */
export const setDimension = (history: History, featureId: string, path: string, value: Dimension): History => {
  if (!history.features.some((f) => f.id === featureId)) throw new RangeError(`No feature '${featureId}'`)
  if (!dimensionsOf(history.features.find((f) => f.id === featureId)!).some((d) => d.path === path)) throw new RangeError(`Feature '${featureId}' has no dimension '${path}'`)
  return { ...history, features: history.features.map((f) => (f.id === featureId ? (setAt(f, path.split("."), value) as Feature) : f)) }
}

const wordBoundary = (name: string) => new RegExp(`(?<![A-Za-z0-9_])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_(])`, "g")

/** Rewrites the uses of a name inside one expression (a number is returned as it is). */
const renameIn = (value: Dimension, from: string, to: string): Dimension =>
  typeof value === "string" && namesIn(value).includes(from) ? value.replace(wordBoundary(from), to) : value

const mapDimensions = (f: Feature, fn: (d: Dimension) => Dimension): Feature => {
  let out = f
  for (const d of dimensionsOf(f)) {
    const next = fn(d.value)
    if (next !== d.value) out = setAt(out, d.path.split("."), next) as Feature
  }
  return out
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Renames a parameter, rewriting every parameter formula and every dimension that refers to it. Throws on a bad or taken name.
 * (Whole-word: renaming `w` leaves `width` alone, and a function call `w(` is not a use of the name.)
 */
export const renameParameter = (history: History, from: string, to: string): History => {
  if (!(from in history.parameters)) throw new RangeError(`No parameter '${from}'`)
  if (!NAME.test(to)) throw new RangeError(`'${to}' is not a valid name (letters, digits and _, not starting with a digit)`)
  if (to !== from && to in history.parameters) throw new RangeError(`There is already a parameter '${to}'`)
  const parameters: Record<string, number | string> = {}
  for (const [name, def] of Object.entries(history.parameters)) parameters[name === from ? to : name] = typeof def === "string" ? (renameIn(def, from, to) as string) : def
  return { parameters, features: history.features.map((f) => mapDimensions(f, (d) => renameIn(d, from, to))) }
}

/** The names of the parameters and features that refer to `name`. */
export const usesOf = (history: History, name: string): { readonly parameters: ReadonlyArray<string>; readonly features: ReadonlyArray<string> } => ({
  parameters: Object.entries(history.parameters).filter(([k, d]) => k !== name && typeof d === "string" && namesIn(d).includes(name)).map(([k]) => k),
  features: history.features.filter((f) => dimensionsOf(f).some((d) => typeof d.value === "string" && namesIn(d.value).includes(name))).map((f) => f.id)
})

/** A parameter added or replaced (a number or an expression). */
export const setParameter = (history: History, name: string, value: number | string): History => {
  if (!NAME.test(name)) throw new RangeError(`'${name}' is not a valid name (letters, digits and _, not starting with a digit)`)
  return { ...history, parameters: { ...history.parameters, [name]: value } }
}

/** A parameter removed; refuses while something still uses it (the lists say what). */
export const removeParameter = (history: History, name: string): History => {
  const used = usesOf(history, name)
  if (used.parameters.length + used.features.length > 0) {
    throw new RangeError(`'${name}' is still used by ${[...used.parameters.map((p) => `parameter ${p}`), ...used.features.map((f) => `feature ${f}`)].join(", ")}`)
  }
  const { [name]: _gone, ...parameters } = history.parameters
  return { ...history, parameters }
}

/** Ids of the features that need `id` to exist: a sketch used by an extrude, revolve, rib or sheet, an extrude / revolve / hole copied by a pattern or a mirror, a sketch used by a sweep or loft, an extrusion hollowed by a shell. */
export const dependentsOf = (history: History, id: string): ReadonlyArray<string> =>
  history.features.filter((f) => ((f.type === "extrude" || f.type === "revolve" || f.type === "rib" || f.type === "sheet") && f.sketch === id) || (f.type === "plane" && f.from.kind !== "points" && f.from.kind !== "face" && f.from.base === id) || (f.type === "sketch" && f.plane === id) || ((f.type === "hole" || f.type === "text") && f.plane === id) || ((f.type === "pattern" || f.type === "mirror" || f.type === "shell") && f.feature === id) || (f.type === "sweep" && (f.profile === id || f.path === id)) || (f.type === "loft" && f.sections.includes(id))).map((f) => f.id)

/** A feature removed together with everything that cannot exist without it (the extrusions of a sketch, the patterns of those, ...). */
export const removeFeature = (history: History, id: string): History => {
  const gone = new Set<string>([id])
  const queue = [id]
  while (queue.length > 0) {
    for (const dependent of dependentsOf(history, queue.pop()!)) if (!gone.has(dependent)) { gone.add(dependent); queue.push(dependent) }
  }
  return { ...history, features: history.features.filter((f) => !gone.has(f.id)) }
}

/** Why one feature must stay after another: it names it, it names a body it made, or the replay saw it change that feature's body. */
export type DependencyReason = "declared" | "body" | "lineage"

/**
 * Every feature's needs (spec 58 §3.3): the declared references, the features that made the bodies it names, and the lineage of a
 * replay, i.e. the features whose bodies it changed or removed (a hole cutting the plate needs the plate's extrusion although it
 * names neither). The replay runs with every feature active (no suppression, no rollback), so a suppressed feature keeps its
 * edges; `result` may be given when that replay is at hand.
 */
export const dependencyGraph = (history: History, result?: RebuildResult): ReadonlyMap<string, ReadonlyMap<string, DependencyReason>> => {
  const ids = new Set(history.features.map((f) => f.id))
  const replay = result ?? rebuild({ parameters: history.parameters, features: history.features.map((f) => (f.suppressed === true ? (({ suppressed: _s, ...rest }) => rest as Feature)(f) : f)) })
  const graph = new Map<string, Map<string, DependencyReason>>()
  for (const f of history.features) {
    const needs = new Map<string, DependencyReason>()
    for (const id of replay.lineage[f.id] ?? []) if (ids.has(id) && id !== f.id) needs.set(id, "lineage")
    for (const id of bodyRefs(f).map(bodyCreator)) if (ids.has(id) && id !== f.id) needs.set(id, "body")
    for (const id of declaredNeeds(f)) if (ids.has(id) && id !== f.id) needs.set(id, "declared")
    graph.set(f.id, needs)
  }
  return graph
}

const because = (reason: DependencyReason): string =>
  reason === "declared" ? "it is referenced" : reason === "body" ? "it makes a body that is named" : "it builds the body that is changed"

/** The outcome of a timeline edit: the new history, or the same one with the reason it was refused. */
export interface TimelineEdit { readonly history: History; readonly refusal?: string }

/**
 * `id` moved so it ends at `index` of the timeline. Valid only when every dependency still points backwards; otherwise the history is
 * returned unchanged with the reason, naming the feature in the way (refusal over approximation: until persistent naming, a feature
 * moved across a body's lineage could act on different geometry).
 */
export const moveFeatureTo = (history: History, id: string, index: number, graph: ReadonlyMap<string, ReadonlyMap<string, DependencyReason>> = dependencyGraph(history)): TimelineEdit => {
  const from = history.features.findIndex((f) => f.id === id)
  if (from < 0) return { history, refusal: `no feature '${id}' in the history` }
  if (!Number.isInteger(index) || index < 0 || index >= history.features.length) return { history, refusal: `position ${index} is outside the timeline (0 to ${history.features.length - 1})` }
  if (index === from) return { history }
  const order = history.features.map((f) => f.id).filter((x) => x !== id)
  order.splice(index, 0, id)
  const at = new Map(order.map((x, i) => [x, i] as const))
  if (index < from) {
    // Moving up: nothing it needs may end below it.
    for (const [need, reason] of graph.get(id) ?? []) {
      if (at.get(need)! > index) return { history, refusal: `'${id}' cannot move above '${need}': ${id} needs it (${because(reason)})` }
    }
  } else {
    // Moving down: nothing that needs it may end above it.
    for (const other of order.slice(0, index)) {
      const reason = graph.get(other)?.get(id)
      if (reason !== undefined) return { history, refusal: `'${id}' cannot move below '${other}': ${other} needs it (${because(reason)})` }
    }
  }
  const byId = new Map(history.features.map((f) => [f.id, f] as const))
  return { history: { ...history, features: order.map((x) => byId.get(x)!) } }
}

/** A feature moved one place up or down; a move across a dependency (declared or lineage) leaves the history as it is. */
export const moveFeature = (history: History, id: string, direction: -1 | 1): History => {
  const i = history.features.findIndex((f) => f.id === id)
  const j = i + direction
  if (i < 0 || j < 0 || j >= history.features.length) return history
  return moveFeatureTo(history, id, j).history
}

/**
 * `feature` inserted right after `after` (at the top with `undefined`). Refused when its id is taken or when something it names
 * (a feature, or the body of a feature) is not above the insertion point.
 */
export const insertFeature = (history: History, feature: Feature, after: string | undefined): TimelineEdit => {
  if (history.features.some((f) => f.id === feature.id)) return { history, refusal: `the id '${feature.id}' is already used` }
  const at = after === undefined ? 0 : history.features.findIndex((f) => f.id === after) + 1
  if (at === 0 && after !== undefined) return { history, refusal: `no feature '${after}' in the history` }
  const above = new Set(history.features.slice(0, at).map((f) => f.id))
  const all = new Set(history.features.map((f) => f.id))
  const missing = [...declaredNeeds(feature), ...bodyRefs(feature).map(bodyCreator)].find((id) => all.has(id) && !above.has(id))
  if (missing !== undefined) return { history, refusal: `'${feature.id}' needs '${missing}', which comes after the insertion point` }
  const features = [...history.features]
  features.splice(at, 0, feature)
  return { history: { ...history, features } }
}

/** A feature's display name, or back to its id with `undefined` / an empty name (display only: the replay never reads it). */
export const renameFeature = (history: History, id: string, name: string | undefined): History => {
  if (!history.features.some((f) => f.id === id)) throw new RangeError(`no feature '${id}' in the history`)
  const trimmed = name?.trim() ?? ""
  if (trimmed.length > 100) throw new RangeError("a feature name has at most 100 characters")
  return {
    ...history,
    features: history.features.map((f) => {
      if (f.id !== id) return f
      if (trimmed !== "") return { ...f, name: trimmed }
      const { name: _name, ...rest } = f
      return rest as Feature
    })
  }
}

/** Positions of a group's members, in timeline order. */
const membersOf = (history: History, group: string): ReadonlyArray<number> =>
  history.features.flatMap((f, i) => (f.group === group ? [i] : []))

const contiguous = (positions: ReadonlyArray<number>): boolean => positions.every((p, i) => i === 0 || p === positions[i - 1]! + 1)

/**
 * `ids` put in the group `group` (created, or renamed when it exists). A group is a run of consecutive features, as in the
 * timelines of Fusion 360 and SolidWorks: the members together with the group's present members must be contiguous, and a
 * feature is in one group at most. Display only: a grouped history replays exactly as the same history without groups.
 */
export const groupFeatures = (history: History, group: { readonly id: string; readonly name: string }, ids: ReadonlyArray<string>): TimelineEdit => {
  if (ids.length === 0) return { history, refusal: "a group needs at least one feature" }
  const unknown = ids.find((id) => !history.features.some((f) => f.id === id))
  if (unknown !== undefined) return { history, refusal: `no feature '${unknown}' in the history` }
  const elsewhere = history.features.find((f) => ids.includes(f.id) && f.group !== undefined && f.group !== group.id)
  if (elsewhere !== undefined) return { history, refusal: `'${elsewhere.id}' is already in the group '${elsewhere.group}'` }
  const positions = history.features.flatMap((f, i) => (ids.includes(f.id) || f.group === group.id ? [i] : []))
  if (!contiguous(positions)) return { history, refusal: `the features of '${group.name}' must be consecutive in the timeline (move them next to each other first)` }
  const existing = history.groups ?? []
  const groups = existing.some((g) => g.id === group.id)
    ? existing.map((g) => (g.id === group.id ? { ...g, name: group.name } : g))
    : [...existing, { id: group.id, name: group.name }]
  return { history: { ...history, groups, features: history.features.map((f) => (ids.includes(f.id) ? { ...f, group: group.id } : f)) } }
}

/** The group removed; its features stay where they are, out of any group. */
export const ungroupFeatures = (history: History, group: string): History => {
  const groups = (history.groups ?? []).filter((g) => g.id !== group)
  const { groups: _groups, ...rest } = history
  return {
    ...(groups.length > 0 ? { ...rest, groups } : rest),
    features: history.features.map((f) => {
      if (f.group !== group) return f
      const { group: _group, ...plain } = f
      return plain as Feature
    })
  }
}

/** A group folded or unfolded in the timeline. */
export const setGroupCollapsed = (history: History, group: string, collapsed: boolean): History => {
  if (!(history.groups ?? []).some((g) => g.id === group)) throw new RangeError(`no group '${group}' in the history`)
  return {
    ...history,
    groups: (history.groups ?? []).map((g) => {
      if (g.id !== group) return g
      if (collapsed) return { ...g, collapsed: true }
      const { collapsed: _collapsed, ...rest } = g
      return rest
    })
  }
}

/**
 * The whole group moved so its first feature ends at `index`. Valid only when every dependency still points backwards (the same
 * rule as `moveFeatureTo`, for every member at once) and no other group is split; otherwise the history comes back unchanged with
 * the reason.
 */
export const moveGroupTo = (history: History, group: string, index: number, graph: ReadonlyMap<string, ReadonlyMap<string, DependencyReason>> = dependencyGraph(history)): TimelineEdit => {
  const members = membersOf(history, group)
  if (members.length === 0) return { history, refusal: `the group '${group}' has no features` }
  const block = members.map((i) => history.features[i]!)
  const rest = history.features.filter((f) => f.group !== group)
  if (!Number.isInteger(index) || index < 0 || index > rest.length) return { history, refusal: `position ${index} is outside the timeline (0 to ${rest.length})` }
  const features = [...rest.slice(0, index), ...block, ...rest.slice(index)]
  const at = new Map(features.map((f, i) => [f.id, i] as const))
  const inBlock = new Set(block.map((f) => f.id))
  for (const f of features) {
    for (const [need, reason] of graph.get(f.id) ?? []) {
      if (!(inBlock.has(f.id) || inBlock.has(need))) continue
      if (at.get(need)! > at.get(f.id)!) return { history, refusal: `the group '${group}' cannot move there: '${f.id}' needs '${need}' (${because(reason)})` }
    }
  }
  const before = rest[index - 1], after = rest[index]
  if (before?.group !== undefined && before.group === after?.group) return { history, refusal: `the group '${group}' cannot move into the group '${before.group}'` }
  return { history: { ...history, features } }
}

/**
 * A starting part: a rectangular plate with a hole in the middle, driven by the parameters `width`, `depth`, `thick` and `hole`.
 * A person edits the numbers and watches it change; the assistant builds on it.
 */
export const plateTemplate = (): History => ({
  parameters: { width: 60, depth: 40, thick: 8, hole: 10 },
  features: [
    {
      id: "sketch1", type: "sketch", plane: "XY",
      sketch: {
        entities: [
          { id: "p1", kind: "point", x: 0, y: 0 }, { id: "p2", kind: "point", x: 60, y: 0 }, { id: "p3", kind: "point", x: 60, y: 40 }, { id: "p4", kind: "point", x: 0, y: 40 },
          { id: "l1", kind: "line", p1: "p1", p2: "p2" }, { id: "l2", kind: "line", p1: "p2", p2: "p3" }, { id: "l3", kind: "line", p1: "p3", p2: "p4" }, { id: "l4", kind: "line", p1: "p4", p2: "p1" }
        ],
        constraints: [
          { type: "fixed", point: "p1", x: 0, y: 0 }, { type: "horizontal", line: "l1" }, { type: "vertical", line: "l2" }, { type: "horizontal", line: "l3" }, { type: "vertical", line: "l4" },
          { type: "length", line: "l1", value: "width" }, { type: "length", line: "l2", value: "depth" }
        ]
      }
    },
    { id: "plate", type: "extrude", sketch: "sketch1", depth: "thick", operation: "new" },
    { id: "hole1", type: "hole", plane: "XY", offset: "thick", at: ["width / 2", "depth / 2"], diameter: "hole", depth: "thick" }
  ]
})
