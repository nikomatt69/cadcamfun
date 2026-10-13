import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import {
  RECIPES, analyzeManufacturability, buildRecipe, runModelScript, dimensionValue, dimensionsOf, historyVolume, meshBounds, moveFeature, rebuild, removeFeature, removeParameter, renameParameter, resolveParameters, setDimension, setParameter, usesOf,
  type DfmMaterial, type DfmProcess, type DfmReport, type Feature, type History, type RecipeResult
} from "@cadcamfun/core"
import { useElementsStore, type Element } from "../store/elementsStore.ts"

const INPUT = "w-full px-2 py-1 border border-gray-300 rounded-md text-sm font-mono dark:bg-gray-700 dark:border-gray-600 dark:text-white"
const SMALL = "px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-600 disabled:opacity-40"

const STATUS: Readonly<Record<string, { readonly text: string; readonly tone: string }>> = {
  "fully-constrained": { text: "fully constrained", tone: "text-green-700" },
  "under-constrained": { text: "under-constrained", tone: "text-amber-700" },
  "over-constrained": { text: "over-constrained", tone: "text-amber-700" },
  conflicting: { text: "conflicting", tone: "text-red-700" },
  failed: { text: "failed", tone: "text-red-700" }
}

const SELECT = "w-full px-1 py-1 border border-gray-300 rounded-md text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-white"
const SEVERITY_TONE: Readonly<Record<string, string>> = { error: "text-red-700", warning: "text-amber-700", info: "text-gray-600 dark:text-gray-300" }

const SCRIPT_STARTER = `// A bracket: parameters, a sketch, an extrusion, a hole pattern, a rib and a chamfer.
m.param("width", 60).param("depth", 40).param("thick", 8)
m.extrude(m.sketch("XY").rectangle([0, 0], "width", "depth"), { depth: "thick" })
const hole = m.hole({ plane: "XY", offset: "thick", at: [10, 10], diameter: 6, depth: "thick" })
m.pattern({ feature: hole, kind: "linear", count: 3, step: [20, 0, 0] })
m.rib(m.sketch("XY", "thick").path([[10, 30], [50, 30]]), { thickness: 3, depth: 10 })
m.chamfer({ size: 1, edges: { parallel: "z" } })
`

const format = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/\.?0+$/, ""))

/**
 * The editor of a `parametric` element: its parameters (numbers or formulas, with the value each resolves to), its feature
 * timeline with the dimensions of every feature, the state of every sketch, and what the history could not build. Every edit is
 * `elements.updateElement(id, { history })`, so it goes through the editor's undo, and the viewport and the CAM rebuild from the
 * new history. The logic is core's (`cad/history-edit.ts`); this only shows it.
 */
export default function ParametricPanel(props: { readonly element: Element; readonly locked: boolean }): JSX.Element {
  const elements = useElementsStore()
  const [error, setError] = createSignal("")
  const [newName, setNewName] = createSignal("")
  const [newValue, setNewValue] = createSignal("")
  const history = (): History => props.element["history"] as History
  const resolved = createMemo(() => resolveParameters(history().parameters))
  const built = createMemo(() => { try { return rebuild(history()) } catch { return undefined } })

  /** Applies an edit; a refused one (a name in use, a dimension that does not exist) is shown, not thrown. */
  const edit = (change: (h: History) => History): boolean => {
    try {
      elements.updateElement(props.element.id, { history: change(history()) })
      setError("")
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      return false
    }
  }
  const asValue = (text: string): number | string => { const t = text.trim(); return t !== "" && Number.isFinite(Number(t)) ? Number(t) : t }

  const addParameter = () => {
    const name = newName().trim()
    if (name === "" || newValue().trim() === "") { setError("A parameter needs a name and a value or formula"); return }
    if (edit((h) => setParameter(h, name, asValue(newValue())))) { setNewName(""); setNewValue("") }
  }

  const describe = (feature: Feature): string => {
    switch (feature.type) {
      case "sketch": return `sketch on ${feature.plane}`
      case "extrude": return `extrude ${feature.operation} from ${feature.sketch}${feature.edge ? `, edge ${feature.edge.style}` : ""}${feature.corner ? `, corner ${feature.corner.style}` : ""}${feature.taper !== undefined ? `, draft ${String(feature.taper)}°` : ""}`
      case "revolve": return `revolve ${feature.operation} from ${feature.sketch}`
      case "hole": return `${feature.kind && feature.kind !== "simple" ? `${feature.kind} ` : ""}hole on ${feature.plane}`
      case "pattern": return `${feature.kind} pattern of ${feature.feature}`
      case "mirror": return `mirror of ${feature.feature} through ${feature.plane}`
      case "sweep": return `sweep ${feature.operation} of ${feature.profile} along ${feature.path}${feature.bendRadius !== undefined ? `, bends R${String(feature.bendRadius)}` : ""}`
      case "loft": return `loft ${feature.operation} through ${feature.sections.join(", ")}${feature.smooth ? " (smooth)" : ""}`
      case "shell": return `shell of ${feature.feature}, open ${feature.open ?? "none"}`
      case "primitive": return `${feature.element} ${feature.operation}`
      case "coil": return `${feature.section ?? "round"} coil ${feature.operation}, ${feature.handedness ?? "right"} hand`
      case "move": return `${feature.copy === true ? "copy" : "move"}${feature.rotate !== undefined ? ` turned about ${feature.rotate.axis}` : ""}${feature.translate !== undefined ? " and shifted" : ""}`
      case "scale": return Array.isArray(feature.factor) ? "scale along x, y, z" : "scale"
      case "split": return `split by ${feature.plane}, keep ${feature.keep}`
      case "combine": return `${feature.operation} ${feature.tools.join(", ")} ${feature.operation === "join" ? "into" : feature.operation === "cut" ? "from" : "with"} ${feature.target}`
      case "rib": return `rib on ${feature.sketch}`
      case "sheet": return `sheet-metal strip from ${feature.sketch}${feature.bendRadius !== undefined ? `, bends R${String(feature.bendRadius)}` : ""}`
      case "thread": return `${feature.kind} thread M${String(feature.diameter)} x ${String(feature.pitch)}`
      case "text": return `text "${feature.text.length > 24 ? `${feature.text.slice(0, 24)}…` : feature.text}" ${feature.operation}`
      case "plane": return feature.from.kind === "offset" ? `work plane ${String(feature.from.distance)} mm from ${feature.from.base}` : feature.from.kind === "angle" ? `work plane ${String(feature.from.angle)}° from ${feature.from.base}` : feature.from.kind === "points" ? "work plane through 3 points" : "work plane on a face"
      case "draft": return `draft ${String(feature.angle)}° on the face near (${feature.near.map(String).join(", ")})`
      case "mate": return `mate ${feature.body} to ${feature.to.body}${feature.offset !== undefined ? `, gap ${String(feature.offset)}` : ""}`
      case "pushpull": return `press/pull ${String(feature.distance)} mm`
      case "fillet": return `${feature.style ?? "fillet"} of ${feature.edges?.parallel ? `${feature.edges.parallel}-parallel` : feature.edges?.within ? "boxed" : "all"} ${feature.edges?.kind ?? "convex"} edges`
    }
  }

  /** Replaces the fields of one feature (a treatment added, a hole kind changed); `undefined` removes a field. */
  const patchFeature = (id: string, patch: Readonly<Record<string, unknown>>) => edit((h) => ({
    ...h,
    features: h.features.map((f) => {
      if (f.id !== id) return f
      const next: Record<string, unknown> = { ...f, ...patch }
      for (const key of Object.keys(patch)) if (patch[key] === undefined) delete next[key]
      return next as unknown as Feature
    })
  }))
  const numeric = (dimension: number | string): number => { try { return dimensionValue(dimension, resolved().values) } catch { return NaN } }
  const round1 = (n: number): number => Math.round(n * 10) / 10
  const setTreatment = (feature: Feature & { readonly type: "extrude" }, key: "edge" | "corner", style: string) => {
    if (style === "") { patchFeature(feature.id, { [key]: undefined }); return }
    const current = feature[key]
    const kept = current === undefined ? (key === "edge" ? { size: 1, ends: "both" } : { size: 1 }) : current
    patchFeature(feature.id, { [key]: { ...kept, style } })
  }
  const setHoleKind = (feature: Feature & { readonly type: "hole" }, kind: string) => {
    if (kind === "simple") { patchFeature(feature.id, { kind: undefined, headDiameter: undefined, headDepth: undefined, angle: undefined }); return }
    const d = numeric(feature.diameter), depth = numeric(feature.depth)
    if (kind === "counterbore") patchFeature(feature.id, { kind, headDiameter: round1(d * 1.8) || 10, headDepth: round1(depth * 0.4) || 2, angle: undefined })
    else patchFeature(feature.id, { kind, headDiameter: round1(d * 2) || 10, angle: 90, headDepth: undefined })
  }

  // Shortcuts that append the feature the user would otherwise write by hand; they go through the same `edit` as everything else.
  const nextId = (base: string): string => {
    const taken = new Set(history().features.map((f) => f.id))
    for (let n = 1; ; n++) if (!taken.has(`${base}${n}`)) return `${base}${n}`
  }
  const append = (feature: Feature) => edit((h) => ({ ...h, features: [...h.features, feature] }))
  const addFillet = (style: "fillet" | "chamfer", where: "convex" | "vertical" | "top") => {
    const bounds = built()?.bodies.map((b) => meshBounds(b.mesh)) ?? []
    if (bounds.length === 0) { setError("There is no solid to round yet"); return }
    const box = { minX: Math.min(...bounds.map((b) => b.minX)), minY: Math.min(...bounds.map((b) => b.minY)), maxX: Math.max(...bounds.map((b) => b.maxX)), maxY: Math.max(...bounds.map((b) => b.maxY)), maxZ: Math.max(...bounds.map((b) => b.maxZ)) }
    // A hole is drawn as a polygon, so its rim is dozens of short edges: skipping edges under 3 mm keeps the shortcut to the real edges
    // (it is the "shortest edge" field of the feature; lower it to round a rim as well).
    const MIN_EDGE = 3
    const where3 = where === "vertical" ? { parallel: "z" as const } : where === "top" ? { within: { min: [box.minX - 1, box.minY - 1, box.maxZ - 0.01] as const, max: [box.maxX + 1, box.maxY + 1, box.maxZ + 0.01] as const } } : {}
    append({ id: nextId(style), type: "fillet", radius: 1, style, edges: { ...where3, minLength: MIN_EDGE } })
  }
  // What a shell can hollow: an extrusion, a full revolution or a sweep. The newest is the default; the select picks another.
  const shellable = () => history().features.filter((f) => f.type === "extrude" || f.type === "revolve" || f.type === "sweep")
  const [shellTarget, setShellTarget] = createSignal("")
  const addShell = (open: "none" | "top") => {
    const candidates = shellable()
    const source = candidates.find((f) => f.id === shellTarget()) ?? candidates[candidates.length - 1]
    if (source === undefined) { setError("A shell needs an extrusion, a revolution or a sweep to hollow out"); return }
    append({ id: nextId("shell"), type: "shell", feature: source.id, thickness: 2, open })
  }
  const addGrid = () => {
    const source = [...history().features].reverse().find((f) => f.type === "hole") ?? [...history().features].reverse().find((f) => f.type === "extrude" || f.type === "revolve" || f.type === "sweep" || f.type === "loft")
    if (source === undefined) { setError("A grid pattern needs a hole or a tool feature to copy"); return }
    append({ id: nextId("grid"), type: "pattern", feature: source.id, kind: "grid", count: 3, countB: 2, step: [10, 0, 0], stepB: [0, 10, 0] })
  }
  // Fusion-style body commands. Each starts from a neutral value (a copy beside the part, a split through the middle, a scale of 1)
  // that the dimension fields below then change.
  const bodiesBox = () => {
    const boxes = built()?.bodies.map((b) => meshBounds(b.mesh)) ?? []
    if (boxes.length === 0) return undefined
    return { minX: Math.min(...boxes.map((b) => b.minX)), maxX: Math.max(...boxes.map((b) => b.maxX)), minZ: Math.min(...boxes.map((b) => b.minZ)), maxZ: Math.max(...boxes.map((b) => b.maxZ)) }
  }
  const addCoil = () => append({ id: nextId("coil"), type: "coil", radius: 10, pitch: 4, turns: 5, wireDiameter: 2, operation: "new" })
  const addCopy = () => {
    const box = bodiesBox()
    if (box === undefined) { setError("There is no solid to copy yet"); return }
    append({ id: nextId("copy"), type: "move", translate: [Math.round((box.maxX - box.minX + 10) * 10) / 10, 0, 0], copy: true })
  }
  const addSplit = () => {
    const box = bodiesBox()
    if (box === undefined) { setError("There is no solid to split yet"); return }
    append({ id: nextId("split"), type: "split", plane: "XY", offset: Math.round(((box.minZ + box.maxZ) / 2) * 10) / 10, keep: "both" })
  }
  const addScale = () => {
    if (bodiesBox() === undefined) { setError("There is no solid to scale yet"); return }
    append({ id: nextId("scale"), type: "scale", factor: 1 })
  }
  const issuesOf = (id: string) => (built()?.issues ?? []).filter((i) => i.feature === id)

  // Design rules: the history is checked against a process, a cutter and a material on demand (it rebuilds and samples the solid).
  const [process, setProcess] = createSignal<DfmProcess>("mill")
  const [cutter, setCutter] = createSignal("6")
  const [material, setMaterial] = createSignal<DfmMaterial>("metal")
  const [report, setReport] = createSignal<DfmReport | undefined>(undefined)
  const [checking, setChecking] = createSignal(false)
  const runCheck = () => {
    const toolDiameter = Number(cutter())
    if (!Number.isFinite(toolDiameter) || toolDiameter <= 0) { setError("The cutter diameter must be a positive number"); return }
    setChecking(true)
    // Let the button repaint before the synchronous analysis runs.
    setTimeout(() => {
      try { setReport(analyzeManufacturability(history(), { process: process(), toolDiameter, material: material() })); setError("") }
      catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
      finally { setChecking(false) }
    }, 0)
  }
  const issuesBy = (severity: string) => (report()?.issues ?? []).filter((i) => i.severity === severity)

  // Recipes: engineering generators that replace the history with a rule-checked one.
  const [recipeName, setRecipeName] = createSignal(RECIPES[0]?.name ?? "")
  const [recipeInput, setRecipeInput] = createSignal<Readonly<Record<string, string>>>({})
  const [recipeResult, setRecipeResult] = createSignal<RecipeResult | undefined>(undefined)
  const recipe = () => RECIPES.find((r) => r.name === recipeName())
  const setInput = (name: string, value: string) => setRecipeInput((current) => ({ ...current, [name]: value }))
  const applyRecipe = () => {
    const spec = recipe()
    if (spec === undefined) return
    try {
      const input: Record<string, unknown> = {}
      for (const param of spec.params) {
        const raw = recipeInput()[param.name]
        if (raw === undefined || raw.trim() === "") continue
        input[param.name] = param.type === "array" ? JSON.parse(raw) : param.type === "boolean" ? raw === "true" : param.type === "string" ? raw : Number(raw)
      }
      const result = buildRecipe(spec.name, input)
      if (!window.confirm(`Replace the history of this part with the ${spec.title} recipe?`)) return
      if (edit(() => result.history)) { setRecipeResult(result); setReport(undefined) }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  // Script: the part written as code against the model builder (core `cad/script.ts`), replayed into a history.
  const [script, setScript] = createSignal(SCRIPT_STARTER)
  const [scriptNote, setScriptNote] = createSignal("")
  const runScript = () => {
    try {
      const next = runModelScript(script())
      const result = rebuild(next)
      if (!window.confirm(`Replace the history of this part with the script's ${next.features.length} features?`)) return
      if (edit(() => next)) {
        setReport(undefined)
        setScriptNote(`${next.features.length} features, ${result.bodies.length} body(ies), ${result.issues.filter((i) => i.severity === "error").length} error(s)`)
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setScriptNote("")
      setError(cause instanceof EvalError || /unsafe-eval|Content Security Policy/i.test(message) ? "Scripts need the app to allow script evaluation (CSP 'unsafe-eval'); this build does not." : message)
    }
  }

  return (
    <div class="mt-6 space-y-5 border-t border-gray-200 pt-4 dark:border-gray-600" data-testid="parametric-panel">
      <div>
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Parametric part</h4>
        <Show when={built()} fallback={<p class="text-sm text-red-600">The history could not be rebuilt.</p>}>{(result) =>
          <p class="text-xs text-gray-600 dark:text-gray-300" data-testid="parametric-summary">
            {result().bodies.length} solid{result().bodies.length === 1 ? "" : "s"}, {format(historyVolume(result()) / 1000)} cm³
          </p>}
        </Show>
        <Show when={error()}><p class="mt-1 text-xs text-red-600" role="alert">{error()}</p></Show>
      </div>

      <div>
        <h5 class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Parameters</h5>
        <div class="space-y-1">
          <For each={Object.entries(history().parameters)}>{([name, definition]) =>
            <div class="grid grid-cols-[6rem_1fr_auto] items-center gap-1" data-testid={`parameter-${name}`}>
              <button type="button" class="truncate text-left text-sm font-mono text-blue-700 hover:underline disabled:no-underline" title="Rename" disabled={props.locked}
                onClick={() => { const next = window.prompt(`Rename '${name}' to`, name); if (next && next !== name) edit((h) => renameParameter(h, name, next)) }}>{name}</button>
              <div>
                <input class={INPUT} value={String(definition)} disabled={props.locked} aria-label={`Parameter ${name}`}
                  onChange={(event) => edit((h) => setParameter(h, name, asValue(event.currentTarget.value)))} />
                <Show when={resolved().errors[name]} fallback={<Show when={typeof definition === "string"}><span class="text-xs text-gray-500">= {format(resolved().values[name] ?? NaN)}</span></Show>}>
                  <span class="text-xs text-red-600">{resolved().errors[name]}</span>
                </Show>
              </div>
              <button type="button" class={SMALL} disabled={props.locked} title={(() => { const u = usesOf(history(), name); return u.parameters.length + u.features.length > 0 ? `Used by ${[...u.parameters, ...u.features].join(", ")}` : "Delete" })()}
                onClick={() => edit((h) => removeParameter(h, name))}>✕</button>
            </div>}
          </For>
          <div class="grid grid-cols-[6rem_1fr_auto] items-center gap-1">
            <input class={INPUT} placeholder="name" value={newName()} onInput={(event) => setNewName(event.currentTarget.value)} disabled={props.locked} aria-label="New parameter name" />
            <input class={INPUT} placeholder="12 or width / 2" value={newValue()} onInput={(event) => setNewValue(event.currentTarget.value)} disabled={props.locked} aria-label="New parameter value"
              onKeyDown={(event) => { if (event.key === "Enter") addParameter() }} />
            <button type="button" class={SMALL} disabled={props.locked} onClick={addParameter}>Add</button>
          </div>
        </div>
      </div>

      <div>
        <h5 class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Features</h5>
        <ol class="space-y-3">
          <For each={history().features}>{(feature, index) =>
            <li class="rounded-md border border-gray-200 p-2 dark:border-gray-600" data-testid={`feature-${feature.id}`}>
              <div class="mb-1 flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <span class="text-sm font-medium">{feature.id}</span>
                  <span class="ml-2 text-xs text-gray-500">{describe(feature)}</span>
                  <Show when={feature.type === "sketch" ? built()?.sketches[feature.id] : undefined}>{(sketch) =>
                    <span class={`ml-2 text-xs ${STATUS[sketch().solve.status]?.tone ?? ""}`}>
                      {STATUS[sketch().solve.status]?.text ?? sketch().solve.status}{sketch().solve.dof > 0 ? `, ${sketch().solve.dof} free` : ""}
                    </span>}
                  </Show>
                </div>
                <div class="flex shrink-0 gap-1">
                  <button type="button" class={SMALL} disabled={props.locked || index() === 0} onClick={() => edit((h) => moveFeature(h, feature.id, -1))} title="Earlier">↑</button>
                  <button type="button" class={SMALL} disabled={props.locked || index() === history().features.length - 1} onClick={() => edit((h) => moveFeature(h, feature.id, 1))} title="Later">↓</button>
                  <button type="button" class={SMALL} disabled={props.locked} title="Delete (with what depends on it)"
                    onClick={() => { if (window.confirm(`Delete ${feature.id} and what depends on it?`)) edit((h) => removeFeature(h, feature.id)) }}>✕</button>
                </div>
              </div>
              <Show when={feature.type === "extrude"}>
                <div class="mb-1 grid grid-cols-2 gap-x-2" data-testid={`treatments-${feature.id}`}>
                  <label class="block text-xs text-gray-600 dark:text-gray-300">
                    <span class="block">edge treatment</span>
                    <select class={SELECT} disabled={props.locked} aria-label={`${feature.id} edge treatment`} value={(feature as Feature & { type: "extrude" }).edge?.style ?? ""}
                      onChange={(event) => setTreatment(feature as Feature & { type: "extrude" }, "edge", event.currentTarget.value)}>
                      <option value="">none</option><option value="chamfer">chamfer</option><option value="fillet">fillet</option>
                    </select>
                  </label>
                  <label class="block text-xs text-gray-600 dark:text-gray-300">
                    <span class="block">corner treatment</span>
                    <select class={SELECT} disabled={props.locked} aria-label={`${feature.id} corner treatment`} value={(feature as Feature & { type: "extrude" }).corner?.style ?? ""}
                      onChange={(event) => setTreatment(feature as Feature & { type: "extrude" }, "corner", event.currentTarget.value)}>
                      <option value="">none</option><option value="chamfer">chamfer</option><option value="fillet">fillet</option>
                    </select>
                  </label>
                </div>
                <label class="mb-1 block text-xs text-gray-600 dark:text-gray-300" data-testid={`draft-${feature.id}`}>
                  <span class="block">draft angle (deg, empty = none)</span>
                  <input class={INPUT} disabled={props.locked} aria-label={`${feature.id} draft angle input`} value={String((feature as Feature & { type: "extrude" }).taper ?? "")}
                    onChange={(event) => { const text = event.currentTarget.value.trim(); patchFeature(feature.id, { taper: text === "" ? undefined : asValue(text) }) }} />
                </label>
              </Show>
              <Show when={feature.type === "sweep"}>
                <label class="mb-1 block text-xs text-gray-600 dark:text-gray-300" data-testid={`bend-${feature.id}`}>
                  <span class="block">bend radius (mm, empty = mitred corners)</span>
                  <input class={INPUT} disabled={props.locked} aria-label={`${feature.id} bend radius input`} value={String((feature as Feature & { type: "sweep" }).bendRadius ?? "")}
                    onChange={(event) => { const text = event.currentTarget.value.trim(); patchFeature(feature.id, { bendRadius: text === "" ? undefined : asValue(text) }) }} />
                </label>
              </Show>
              <Show when={feature.type === "hole"}>
                <label class="mb-1 block text-xs text-gray-600 dark:text-gray-300">
                  <span class="block">hole kind</span>
                  <select class={SELECT} disabled={props.locked} aria-label={`${feature.id} hole kind`} value={(feature as Feature & { type: "hole" }).kind ?? "simple"}
                    onChange={(event) => setHoleKind(feature as Feature & { type: "hole" }, event.currentTarget.value)}>
                    <option value="simple">simple</option><option value="counterbore">counterbore</option><option value="countersink">countersink</option>
                  </select>
                </label>
              </Show>
              <Show when={feature.type === "fillet"}>
                <div class="mb-1 grid grid-cols-2 gap-x-2" data-testid={`fillet-${feature.id}`}>
                  <label class="block text-xs text-gray-600 dark:text-gray-300"><span class="block">style</span>
                    <select class={SELECT} disabled={props.locked} aria-label={`${feature.id} style`} value={(feature as Feature & { type: "fillet" }).style ?? "fillet"}
                      onChange={(event) => patchFeature(feature.id, { style: event.currentTarget.value })}>
                      <option value="fillet">fillet</option><option value="chamfer">chamfer</option>
                    </select></label>
                  <label class="block text-xs text-gray-600 dark:text-gray-300"><span class="block">edges</span>
                    <select class={SELECT} disabled={props.locked} aria-label={`${feature.id} edge kind`} value={(feature as Feature & { type: "fillet" }).edges?.kind ?? "convex"}
                      onChange={(event) => patchFeature(feature.id, { edges: { ...(feature as Feature & { type: "fillet" }).edges, kind: event.currentTarget.value } })}>
                      <option value="convex">convex (outside)</option><option value="concave">concave (inside)</option><option value="both">both</option>
                    </select></label>
                  <label class="col-span-2 flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                    <input type="checkbox" disabled={props.locked} aria-label={`${feature.id} include curved rims`} checked={(feature as Feature & { type: "fillet" }).edges?.curved === true}
                      onChange={(event) => patchFeature(feature.id, { edges: { ...(feature as Feature & { type: "fillet" }).edges, curved: event.currentTarget.checked ? true : undefined } })} />
                    <span>include curved-surface rims (slow)</span>
                  </label>
                </div>
              </Show>
              <Show when={feature.type === "shell"}>
                <label class="mb-1 block text-xs text-gray-600 dark:text-gray-300" data-testid={`shell-${feature.id}`}><span class="block">open face</span>
                  <select class={SELECT} disabled={props.locked} aria-label={`${feature.id} open face`} value={(feature as Feature & { type: "shell" }).open ?? "none"}
                    onChange={(event) => patchFeature(feature.id, { open: event.currentTarget.value })}>
                    <option value="none">none (closed hollow)</option><option value="top">top</option><option value="bottom">bottom</option><option value="both">both (tube)</option>
                  </select></label>
              </Show>
              <div class="grid grid-cols-2 gap-x-2 gap-y-1">
                <For each={dimensionsOf(feature)}>{(dimension) =>
                  <label class="block text-xs text-gray-600 dark:text-gray-300">
                    <span class="block truncate" title={dimension.label}>{dimension.label}</span>
                    <input class={INPUT} value={String(dimension.value)} disabled={props.locked} aria-label={`${feature.id} ${dimension.label}`}
                      onChange={(event) => edit((h) => setDimension(h, feature.id, dimension.path, asValue(event.currentTarget.value)))} />
                  </label>}
                </For>
              </div>
              <Show when={issuesOf(feature.id).length > 0}>
                <ul class="mt-1 space-y-0.5" data-testid={`issues-${feature.id}`}>
                  <For each={issuesOf(feature.id)}>{(issue) => <li class={`text-xs ${issue.severity === "error" ? "text-red-700" : "text-amber-700"}`} role={issue.severity === "error" ? "alert" : undefined}>{issue.message}</li>}</For>
                </ul>
              </Show>
            </li>}
          </For>
        </ol>
        <div class="mt-2" data-testid="add-feature">
          <span class="block text-xs text-gray-500">Add feature</span>
          <div class="mt-1 flex flex-wrap gap-1">
            <button type="button" class={SMALL} disabled={props.locked} onClick={() => addFillet("fillet", "convex")}>Fillet all outside edges</button>
            <button type="button" class={SMALL} disabled={props.locked} onClick={() => addFillet("fillet", "vertical")}>Fillet vertical edges</button>
            <button type="button" class={SMALL} disabled={props.locked} onClick={() => addFillet("fillet", "top")}>Fillet top edges</button>
            <button type="button" class={SMALL} disabled={props.locked} onClick={() => addFillet("chamfer", "convex")}>Chamfer all outside edges</button>
            <button type="button" class={SMALL} disabled={props.locked} onClick={() => addFillet("chamfer", "top")}>Chamfer top edges</button>
            <select class={SELECT} disabled={props.locked} aria-label="Shell target" value={shellTarget()} onChange={(event) => setShellTarget(event.currentTarget.value)}>
              <option value="">shell: newest solid</option>
              <For each={shellable()}>{(f) => <option value={f.id}>{`shell: ${f.type} ${f.id}`}</option>}</For>
            </select>
            <button type="button" class={SMALL} disabled={props.locked} onClick={() => addShell("top")}>Shell, open top</button>
            <button type="button" class={SMALL} disabled={props.locked} onClick={() => addShell("none")}>Shell, closed</button>
            <button type="button" class={SMALL} disabled={props.locked} onClick={addGrid}>Grid pattern</button>
            <button type="button" class={SMALL} disabled={props.locked} onClick={addCoil}>Coil</button>
            <button type="button" class={SMALL} disabled={props.locked} onClick={addCopy}>Copy body</button>
            <button type="button" class={SMALL} disabled={props.locked} onClick={addSplit}>Split body</button>
            <button type="button" class={SMALL} disabled={props.locked} onClick={addScale}>Scale</button>
          </div>
        </div>
      </div>

      <div data-testid="dfm-section">
        <h5 class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Manufacturability</h5>
        <div class="grid grid-cols-3 gap-1">
          <label class="block text-xs text-gray-600 dark:text-gray-300"><span class="block">process</span>
            <select class={SELECT} aria-label="Process" value={process()} onChange={(event) => setProcess(event.currentTarget.value as DfmProcess)}>
              <option value="mill">mill</option><option value="turn">turn</option><option value="print">print</option>
            </select></label>
          <label class="block text-xs text-gray-600 dark:text-gray-300"><span class="block">cutter Ø (mm)</span>
            <input class={INPUT} value={cutter()} aria-label="Cutter diameter" onInput={(event) => setCutter(event.currentTarget.value)} /></label>
          <label class="block text-xs text-gray-600 dark:text-gray-300"><span class="block">material</span>
            <select class={SELECT} aria-label="Material" value={material()} onChange={(event) => setMaterial(event.currentTarget.value as DfmMaterial)}>
              <option value="metal">metal</option><option value="cast">cast</option><option value="plastic">plastic</option>
            </select></label>
        </div>
        <button type="button" class={`${SMALL} mt-1`} disabled={checking()} onClick={runCheck}>{checking() ? "Checking…" : "Check design rules"}</button>
        <Show when={report()}>{(r) =>
          <div class="mt-2 space-y-1" data-testid="dfm-report">
            <p class={`text-xs font-medium ${r().ok ? "text-green-700" : "text-red-700"}`}>
              {r().ok ? "No errors" : `${issuesBy("error").length} error(s)`}, {issuesBy("warning").length} warning(s), {issuesBy("info").length} note(s)
              <Show when={r().metrics.minWallMm !== null}> · thinnest wall {format(r().metrics.minWallMm ?? 0)} mm</Show>
            </p>
            <For each={["error", "warning", "info"]}>{(severity) =>
              <For each={issuesBy(severity)}>{(issue) =>
                <div class={`text-xs ${SEVERITY_TONE[severity] ?? ""}`} data-testid={`dfm-${issue.code}`}>
                  <span class="font-medium">{issue.code}</span>{issue.feature ? ` · ${issue.feature}` : ""}: {issue.message}
                  <Show when={issue.measured !== undefined && issue.required !== undefined}><span class="ml-1 font-mono">({format(issue.measured ?? 0)} vs {format(issue.required ?? 0)})</span></Show>
                  <Show when={issue.fix}><div class="text-gray-500">Fix: {issue.fix}</div></Show>
                </div>}
              </For>}
            </For>
          </div>}
        </Show>
      </div>

      <div data-testid="recipes-section">
        <h5 class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Recipes</h5>
        <select class={SELECT} aria-label="Recipe" disabled={props.locked} value={recipeName()} onChange={(event) => { setRecipeName(event.currentTarget.value); setRecipeInput({}); setRecipeResult(undefined) }}>
          <For each={RECIPES}>{(r) => <option value={r.name}>{r.title}</option>}</For>
        </select>
        <Show when={recipe()}>{(spec) =>
          <div class="mt-1">
            <p class="text-xs text-gray-500">{spec().description}</p>
            <div class="mt-1 grid grid-cols-2 gap-x-2 gap-y-1">
              <For each={spec().params}>{(param) =>
                <label class="block text-xs text-gray-600 dark:text-gray-300">
                  <span class="block truncate" title={param.description}>{param.name}</span>
                  <Show when={param.type === "boolean"} fallback={
                    <Show when={param.options} fallback={
                      <input class={INPUT} disabled={props.locked} aria-label={`Recipe ${param.name}`} placeholder={param.type === "array" ? "[{\"diameter\":20,\"length\":40}]" : param.default === undefined ? "" : String(param.default)}
                        value={recipeInput()[param.name] ?? ""} onInput={(event) => setInput(param.name, event.currentTarget.value)} />}>
                      {(options) =>
                        <select class={SELECT} disabled={props.locked} aria-label={`Recipe ${param.name}`} value={recipeInput()[param.name] ?? String(param.default ?? "")} onChange={(event) => setInput(param.name, event.currentTarget.value)}>
                          <For each={options()}>{(option) => <option value={option}>{option}</option>}</For>
                        </select>}
                    </Show>}>
                    <input type="checkbox" disabled={props.locked} aria-label={`Recipe ${param.name}`} checked={(recipeInput()[param.name] ?? String(param.default ?? false)) === "true"}
                      onChange={(event) => setInput(param.name, event.currentTarget.checked ? "true" : "false")} />
                  </Show>
                </label>}
              </For>
            </div>
          </div>}
        </Show>
        <button type="button" class={`${SMALL} mt-1`} disabled={props.locked} onClick={applyRecipe}>Replace with recipe</button>
        <Show when={recipeResult()}>{(r) =>
          <div class="mt-1 text-xs text-gray-600 dark:text-gray-300" data-testid="recipe-result">
            <p>{r().summary}</p>
            <ul class="list-disc pl-4"><For each={r().rules}>{(rule) => <li>{rule}</li>}</For></ul>
          </div>}
        </Show>
      </div>

      <div data-testid="script-section">
        <h5 class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Script</h5>
        <p class="text-xs text-gray-500">JavaScript against <code>m</code>: <code>m.param</code>, <code>m.sketch(plane).rectangle/circle/polygon/slot/path</code>, <code>m.extrude/revolve/sweep/loft/hole/pattern/fillet/chamfer/shell/rib/sheet/thread/text/pushPull</code>. Runs with your privileges: only code you wrote or read.</p>
        <textarea class={`${INPUT} mt-1 h-40`} spellcheck={false} aria-label="Model script" disabled={props.locked} value={script()} onInput={(event) => setScript(event.currentTarget.value)} />
        <div class="mt-1 flex items-center gap-2">
          <button type="button" class={SMALL} disabled={props.locked} onClick={runScript}>Run script</button>
          <button type="button" class={SMALL} disabled={props.locked} onClick={() => setScript(SCRIPT_STARTER)}>Starter</button>
          <Show when={scriptNote()}><span class="text-xs text-gray-600 dark:text-gray-300" data-testid="script-result">{scriptNote()}</span></Show>
        </div>
      </div>

      <Show when={(built()?.issues.length ?? 0) > 0}>
        <div data-testid="parametric-issues">
          <h5 class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Problems</h5>
          <ul class="space-y-1">
            <For each={built()?.issues ?? []}>{(issue) =>
              <li class={`text-xs ${issue.severity === "error" ? "text-red-700" : "text-amber-700"}`}><span class="font-medium">{issue.feature}</span>: {issue.message}</li>}
            </For>
          </ul>
        </div>
      </Show>
    </div>
  )
}
