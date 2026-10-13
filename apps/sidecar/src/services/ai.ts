import { inspectProperties, readProperty, componentParameters } from "./ai-inspection.ts"
import { createHash } from "node:crypto"
import {
  AiBackground, AiConfig, AiCredentials, jsonFileCredentials, AiHost, AiService, BackgroundTaskManager, DirectModel, defaultModelFactory,
  ToolHandlers, backgroundToolContributionsFor, buildTools, defaultProviderSpecs, makeAiBackgroundLayer,
  searchWeb, makeNikCliRuntime, readPolicyFile, agentSystemPrompt, historySchema, parseProjectContext, projectContextKey, type ActionContribution, type HostToolSpec, type ProviderId, type ToolHandlersShape,
  CONTRIBUTION_KEYS, bridgeAdmission, describeBridge, scopeBridge, type BridgeMode, type BridgeTool
} from "@cadcamfun/ai"
import { DESIGN_SPACE, cad, cam, checkModel } from "@cadcamfun/core"
import { Context, Effect, Layer, Redacted, Schema } from "effect"
import type { SessionUser } from "@cadcamfun/api"
import { z } from "zod"
import { AppConfigService } from "../config.ts"
import { captureViewport } from "./ai-vision.ts"
import { changeParameters, historyRevision, inspectParametric, testParametric } from "./ai-parametric.ts"
import { ActingUser } from "./acting-user.ts"
import { ComponentRepo } from "../repos/component-repo.ts"
import { DrawingRepo } from "../repos/drawing-repo.ts"
import { MachineConfigRepo } from "../repos/machine-config-repo.ts"
import { MaterialRepo } from "../repos/material-repo.ts"
import { ProjectRepo } from "../repos/project-repo.ts"
import { ToolRepo } from "../repos/tool-repo.ts"
import { ToolpathRepo } from "../repos/toolpath-repo.ts"
import { KvStore } from "./kv.ts"
import { normalizeElement, withDefaultTolerance } from "@cadcamfun/ai"
import { groupElements, transformElements } from "./ai-transform.ts"
import { applyChanges, describeElements, elementsOf, newElements, type Element } from "./ai-elements.ts"
import { LocalProfile } from "./local-profile.ts"
import { ProjectVcs } from "./project-vcs.ts"
import { WorkflowRunner } from "./workflow-runner.ts"
import { vcsContributions } from "./ai-vcs-tools.ts"
import { aiPromptStep } from "./workflow-service-steps.ts"
import { ProjectRepo as ProjectsForVcs } from "../repos/project-repo.ts"

/** The bounding box of an element in drawing coordinates, or undefined when it cannot be worked out. */
const elementBounds = (element: Record<string, unknown>, all?: ReadonlyArray<Element>) => {
  try {
    const mesh = element["type"] === "mesh" && Array.isArray(element["vertices"]) && Array.isArray(element["faces"])
      ? cam.model.placeElementMesh(element, { positions: Float64Array.from((element["vertices"] as Array<{ x: number; y: number; z: number }>).flatMap((v) => [v.x, v.y, v.z])), indices: Uint32Array.from((element["faces"] as number[][]).flat()) })
      : element["type"] && String(element["type"]).startsWith("boolean-") && all
      ? cam.model.booleanElementMesh(all, element)?.mesh
      : cam.model.elementMesh(element)
    if (mesh) {
      const bounds = cam.model.meshBounds({ positions: Float64Array.from(mesh.positions), indices: mesh.indices })
      if ([...bounds.min, ...bounds.max].every(Number.isFinite)) return { min: { x: bounds.min[0]!, y: bounds.min[1]!, z: bounds.min[2]! }, max: { x: bounds.max[0]!, y: bounds.max[1]!, z: bounds.max[2]! } }
    }
    // Legacy 2D bounds do not apply arbitrary gizmo transforms; never label those as transformed world bounds.
    if (element["rotation"] !== undefined || element["scale"] !== undefined || element["translateX"] !== undefined || element["translateY"] !== undefined || element["translateZ"] !== undefined) return undefined
    const b = cam.generator.elementBounds(element as never)
    return Number.isFinite(b.min.x) && Number.isFinite(b.max.z) ? { min: b.min, max: b.max } : undefined
  } catch { return undefined }
}

/**
 * Where a case-insensitive substring occurs in one element: its id, type, name, layer and scalar property values,
 * children included. The walk is bounded (depth, matches, value length) so searching a big model stays cheap, and the
 * large geometry arrays (`vertices`, `faces`) are skipped because they are not searchable evidence.
 */
const searchElement = (element: Element, needle: string): Array<{ path: string; value: string }> => {
  const found: Array<{ path: string; value: string }> = []
  const walk = (value: unknown, path: string, depth: number): void => {
    if (found.length >= 20 || depth > 6 || value === null || value === undefined) return
    if (typeof value === "object") {
      const entries: ReadonlyArray<readonly [string, unknown]> = Array.isArray(value)
        ? value.map((child, index) => [String(index), child] as const)
        : Object.entries(value as Record<string, unknown>)
      for (const [key, child] of entries) {
        if (key === "elements" || key === "vertices" || key === "faces") continue
        walk(child, path === "" ? key : `${path}/${key}`, depth + 1)
      }
      return
    }
    const text = String(value)
    if (text.toLowerCase().includes(needle)) found.push({ path, value: text.slice(0, 120) })
  }
  walk({ ...element }, "", 0)
  return found
}

/** The tool handlers the model can call, over the active project's newest drawing and the libraries. */
const toolHandlers = Effect.gen(function*() {
  const appConfig = yield* AppConfigService
  const drawings = yield* DrawingRepo
  const materials = yield* MaterialRepo
  const tools = yield* ToolRepo
  const projects = yield* ProjectRepo
  const toolpaths = yield* ToolpathRepo
  const components = yield* ComponentRepo
  const machines = yield* MachineConfigRepo
  const { user: local } = yield* LocalProfile
  const kv = yield* KvStore
  const actingCell = yield* ActingUser
  /** The account of the chat turn that called a tool (the local profile until one has). */
  const acting = () => actingCell.get(local)

  /**
   * Reads never provision a workspace. Only an authorized write may create the default project or drawing.
   */
  const assertWrite = async (projectId: string) => {
    actingCell.assertActive()
    const actor = acting()
    const access = await Effect.runPromise(projects.find(actor.id, projectId))
    if (!access || (access.project.ownerId !== actor.id && access.orgRole !== "ADMIN" && access.orgRole !== "MANAGER")) throw new Error("You do not have permission to write this project.")
    actingCell.assertActive()
  }
  const load = async (projectId: string, write = false): Promise<{ id: string; projectId: string; data: Record<string, unknown>; elements: Element[]; created: boolean }> => {
    const actor = acting()
    let project: { id: string } | undefined = (await Effect.runPromise(projects.find(actor.id, projectId)))?.project
    let created = false
    if (!project) {
      if (projectId !== "default") throw new Error("Project not found or not accessible; no other workspace was modified.")
      const own = (await Effect.runPromise(projects.list(acting().id))).find((candidate) => candidate.ownerId === acting().id)
      if (!own && !write) throw new Error("Open a project before inspecting the workspace.")
      project = own ?? await Effect.runPromise(projects.create(actor.id, { name: "Untitled project" }))
      created = own === undefined
    }
    if (write) await assertWrite(project.id)
    const rows = await Effect.runPromise(drawings.listByProject(project.id))
    const snapshot = (await Effect.runPromise(kv.get(`ai.context.${project.id}`)))?.value as { projectId?: unknown; drawingId?: unknown } | undefined
    // Resolve only inside the accessible project: a snapshot cannot redirect a tool to another project.
    let row = (snapshot?.projectId === project.id && typeof snapshot.drawingId === "string" ? rows.find((drawing) => drawing.id === snapshot.drawingId) : undefined) ?? rows[0]
    if (!row) {
      if (!write) throw new Error("The project has no drawing. Create a drawing before inspection.")
      row = await Effect.runPromise(drawings.create(project.id, { name: "Drawing 1", data: { elements: [], version: "1.0" } }))
      created = true
    }
    const data = row.data !== null && typeof row.data === "object" ? (row.data as Record<string, unknown>) : {}
    return { id: row.id, projectId: project.id, data, elements: elementsOf(data), created }
  }
  const save = async (id: string, data: Record<string, unknown>, elements: ReadonlyArray<Element>) => {
    const drawing = await Effect.runPromise(drawings.find(acting().id, id))
    if (!drawing) throw new Error("Drawing no longer exists.")
    await assertWrite(drawing.project.id)
    await Effect.runPromise(drawings.update(id, { data: { ...data, elements, version: "1.0" } }))
  }
  /** What the UI needs to mirror a change in the open editor: where it went and the resulting elements. */
  const where = (loaded: { id: string; projectId: string; created: boolean }) => ({ drawingId: loaded.id, projectId: loaded.projectId, ...(loaded.created ? { createdDrawing: true } : {}) })

  /** A stored operation of the active drawing with its request rebuilt over the drawing's current elements. */
  const operation = async (drawingId: string, operationId: string | undefined): Promise<{ id: string; request: Record<string, unknown> } | { error: string }> => {
    const { id, projectId, elements, data } = await load(drawingId)
    if (!operationId) return { error: "operationId is required" }
    const found = await Effect.runPromise(toolpaths.find(acting().id, operationId))
    if (!found || found.row.drawingId !== id || found.project.id !== projectId) return { error: "Operation not found in the active drawing" }
    const stored = found.row.data as { request?: { settings?: unknown; geometry?: unknown; printer?: unknown } } | null
    if (!stored?.request) return { error: "Operation has no generation settings" }
    const savedGeometry = stored.request.geometry !== null && typeof stored.request.geometry === "object" ? stored.request.geometry : {}
    return { id: operationId, request: { ...stored.request, geometry: { ...savedGeometry, selectedElements: elements.filter((e) => e.type !== "workpiece"), ...(data["stock"] !== undefined ? { stock: data["stock"] } : {}) } } }
  }

  /** The 3D-printer choices (infill, supports, walls) are stored beside the settings, not in them. */
  const PRINTER_KEYS: ReadonlyArray<string> = ["infillDensity", "infillPattern", "supportType", "shellCount", "printResolution", "printOrientation"]
  const splitPrinter = (params: Record<string, unknown>): { readonly printer: Record<string, unknown>; readonly rest: Record<string, unknown> } => {
    const printer: Record<string, unknown> = {}
    const rest: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(params)) (PRINTER_KEYS.includes(key) ? printer : rest)[key] = value
    return { printer, rest }
  }
  const decodePrinter = (input: Record<string, unknown>) => Schema.decodeUnknownSync(cam.generator.PrinterExtrasSchema)(input)

  const handlers: ToolHandlersShape = {
    stock: async (projectId, input) => {
      if (!(await Effect.runPromise(projects.find(acting().id, projectId)))) return { ok: false, error: "Project not found or not accessible." }
      const loaded = await load(projectId, input.action === "set")
      /** The raw piece as the CAD scene draws it, when the drawing holds one. */
      const workpieceOf = (elements: ReadonlyArray<Element>, id?: string) => {
        const own = elements.filter((e) => e["type"] === "workpiece")
        return id === undefined ? own[0] : own.find((e) => e.id === id) ?? own[0]
      }
      const workpieceView = (element: Element | undefined) => element === undefined ? null : {
        id: element.id, name: typeof element["name"] === "string" ? element.name : null,
        width: element["width"], height: element["height"], depth: element["depth"], x: element["x"], y: element["y"], z: element["z"]
      }
      if (input.action === "inspect") {
        const stock = loaded.data["stock"]
        const workpiece = workpieceView(workpieceOf(loaded.elements, typeof (stock as { elementId?: unknown } | undefined)?.elementId === "string" ? String((stock as { elementId: string }).elementId) : undefined))
        if (stock === undefined) return { ok: false, error: "No explicit stock configured. Set stock before quantitative removal verification.", workpiece, ...where(loaded) }
        const decoded = Schema.decodeUnknownSync(cam.generator.StockSchema)(stock)
        const matches = workpiece !== null && workpiece.width === decoded.width && workpiece.height === decoded.height && workpiece.depth === decoded.depth && workpiece.x === decoded.x && workpiece.y === decoded.y && workpiece.z === decoded.topZ - decoded.depth / 2
        return { ok: true, stock: decoded, volumeMm3: decoded.width * decoded.height * decoded.depth, coordinateFrame: "CAD drawing coordinates; XY centre, Z top face", workpiece, workpieceMatchesStock: matches, ...where(loaded) }
      }
      const stock = Schema.decodeUnknownSync(cam.generator.StockSchema)(input.stock)
      const referenced = stock.elementId === undefined ? undefined : loaded.elements.find((e) => e.id === stock.elementId)
      if (stock.elementId !== undefined && referenced === undefined) return { ok: false, error: "Stock reference element does not exist in the active drawing." }
      const invalidated = await Effect.runPromise(drawings.configureStock(loaded.id, stock))
      // One stock with two faces: the drawing's `stock` is what CAM reads, and the `workpiece` element is what the
      // CAD scene draws, so the raw piece is visible now, survives reopening the project and travels with its history.
      // A stock named after a real part element keeps that element as its source and adds nothing to the scene.
      const fromElement = referenced !== undefined && referenced["type"] !== "workpiece"
      let elements = loaded.elements
      let workpieceId: string | undefined
      if (!fromElement) {
        const existing = workpieceOf(loaded.elements, stock.elementId)
        workpieceId = existing?.id ?? crypto.randomUUID()
        const workpiece: Element = {
          ...(existing ?? { layerId: "default", color: "#3080FF", wireframe: false }), id: workpieceId, type: "workpiece",
          name: existing?.["name"] ?? "Stock", layerId: existing?.layerId ?? "default",
          width: stock.width, height: stock.height, depth: stock.depth, x: stock.x, y: stock.y, z: stock.topZ - stock.depth / 2
        }
        elements = existing === undefined ? [...loaded.elements, workpiece] : loaded.elements.map((e) => (e.id === workpieceId ? workpiece : e))
        // `configureStock` already stored the drawing's stock; both lands in the same document in one write.
        await save(loaded.id, { ...loaded.data, stock: { ...stock, elementId: workpieceId } }, elements)
      }
      const stored = fromElement ? stock : { ...stock, elementId: workpieceId }
      return {
        ok: true, action: "set", stock: stored, volumeMm3: stock.width * stock.height * stock.depth,
        workpiece: workpieceView(fromElement ? undefined : elements.find((e) => e.id === workpieceId)),
        invalidatedOperations: invalidated,
        note: `${fromElement ? "The stock is derived from the referenced element." : "The workpiece element is the raw piece drawn in the CAD scene: never machine it, and it is not part geometry."} Stock changed. Generate and verify affected operations again.${stock.radius > 0 ? " A radius marks a cylindrical stock; the CAD scene draws the workpiece element as a box." : ""}`,
        ...where(loaded)
      }
    },
    cadInspect: async (projectId, input) => {
      if (!(await Effect.runPromise(projects.find(acting().id, projectId)))) return { ok: false, error: "Project not found or not accessible." }
      const loaded = await load(projectId)
      if (input.action === "layers") {
        const snapshot = await Effect.runPromise(kv.get(`ai.context.${projectId}`))
        const value = snapshot?.value as { layers?: unknown; activeLayer?: unknown; projectId?: unknown } | undefined
        return { ok: true, layers: Array.isArray(value?.layers) ? value.layers : [], activeLayer: value?.activeLayer ?? null, source: "desktop workspace snapshot", capturedAt: snapshot?.updatedAt ?? null, available: Array.isArray(value?.layers), ...where(loaded) }
      }
      if (input.action === "property") {
        const element = loaded.elements.find((e) => e.id === input.elementId)
        return element ? { ...readProperty(element, input.path, input.offset, input.maxChars), ...where(loaded) } : { ok: false, error: "Element not found in the active drawing." }
      }
      if (input.action === "search") {
        const needle = input.query.trim().toLowerCase()
        const hits = loaded.elements
          .filter((e) => input.layerId === undefined || e.layerId === input.layerId || e["layer"] === input.layerId)
          .map((e) => ({ element: e, foundIn: searchElement(e, needle) }))
          .filter((hit) => hit.foundIn.length > 0)
        const page = hits.slice(0, input.limit)
        return {
          ok: true, query: input.query, total: hits.length, returned: page.length, complete: hits.length <= page.length,
          elements: page.map(({ element, foundIn }) => ({ id: element.id, type: element.type, name: typeof element["name"] === "string" ? element.name : null, layerId: element.layerId, foundIn })),
          note: hits.length > page.length ? `Limit reached: narrow the query or filter by layerId to find the rest.` : undefined,
          ...where(loaded)
        }
      }
      const matched = loaded.elements.filter((e) => (input.ids === undefined || input.ids.includes(e.id)) && (input.layerId === undefined || e.layerId === input.layerId || e["layer"] === input.layerId))
      const page = matched.slice(input.offset, input.offset + input.limit)
      return { ok: true, total: matched.length, offset: input.offset, nextOffset: input.offset + page.length < matched.length ? input.offset + page.length : null, elements: page.map((e) => ({ properties: inspectProperties(e), bounds: elementBounds(e, loaded.elements) ?? null })), missingIds: input.ids?.filter((id) => !loaded.elements.some((e) => e.id === id)) ?? [], ...where(loaded) }
    },
    cadComponentRelations: async (projectId, input) => {
      if (!(await Effect.runPromise(projects.find(acting().id, projectId)))) return { ok: false, error: "Project not found or not accessible." }
      const loaded = await load(projectId)
      const first = loaded.elements.find((e) => e.id === input.firstId), second = loaded.elements.find((e) => e.id === input.secondId)
      if (!first || !second || first.id === second.id) return { ok: false, error: "Choose two different existing element/component ids." }
      const a = elementBounds(first, loaded.elements), b = elementBounds(second, loaded.elements)
      const origin = (e: Element) => ({ x: typeof e["x"] === "number" ? e["x"] : 0, y: typeof e["y"] === "number" ? e["y"] : 0, z: typeof e["z"] === "number" ? e["z"] : 0 })
      const p = origin(first), q = origin(second)
      const gaps = a && b ? Object.fromEntries((["x", "y", "z"] as const).map((axis) => [axis, Math.max(0, a.min[axis] - b.max[axis], b.min[axis] - a.max[axis])])) : null
      return { ok: true, first: { id: first.id, placement: p, bounds: a ?? null, parametric: componentParameters(first) }, second: { id: second.id, placement: q, bounds: b ?? null, parametric: componentParameters(second) }, originDistanceMm: Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z), originConvention: "Nominal x,y,z placement fields; actual renderer origins and pivots are available in cad_vision spatial evidence", boundingGapsMm: gaps, explicitReferences: [first, second].flatMap((e) => Array.isArray(e["operands"]) ? e["operands"].filter((id) => id === first.id || id === second.id).map((id) => ({ from: e.id, to: id, kind: "boolean operand" })) : []), note: "Nominal bounding measurements only. Equal parameter names are not shared bindings; bounding overlap does not prove interference.", ...where(loaded) }
    },
    webSearch: async (input, signal) => appConfig.aiOffline ? { ok: false, error: "Web search is disabled in offline mode." } : searchWeb(input, signal),
    vision: async (projectId, mode, focus, signal) => {
      if (!(await Effect.runPromise(projects.find(acting().id, projectId)))) return { ok: false, error: "Project not found or not accessible." }
      return captureViewport({
        set: (key, value) => Effect.runPromise(kv.set(key, value)),
        get: async (key) => (await Effect.runPromise(kv.get(key)))?.value,
        delete: (key) => Effect.runPromise(kv.delete(key))
      }, { projectId, mode, ...(focus !== undefined ? { focus } : {}), ...(signal !== undefined ? { signal } : {}) }, async (capture) => {
        const loaded = await load(projectId)
        const camContext = capture.context["cam"] as { selectedOperationId?: unknown } | undefined
        const selected = mode === "cam" && typeof camContext?.selectedOperationId === "string" ? await Effect.runPromise(toolpaths.find(acting().id, camContext.selectedOperationId)) : undefined
        const programError = camContext?.selectedOperationId && mode === "cam" && (!selected || selected.row.drawingId !== loaded.id || !selected.row.gcode) ? "The selected CAM operation has no saved program in the active drawing." : undefined
        const programRevision = selected?.row.gcode && selected.row.drawingId === loaded.id ? createHash("sha256").update(cam.programGeometryText(cam.generator.analyseGcode(selected.row.gcode).program)).digest("hex") : undefined
        return { elements: loaded.elements, drawing: { ...describeElements(loaded.elements, 100, elementBounds), ...where(loaded) }, operations: mode === "cam" ? await handlers.listOperations(projectId) : null, ...(programRevision ? { programRevision } : {}), ...(programError ? { programError } : {}) }
      })
    },
    grep: async (projectId, input) => {
      if (!(await Effect.runPromise(projects.find(acting().id, projectId)))) return { ok: false, error: "Project not found or not accessible." }
      const loaded = await load(projectId)
      const needle = input.query.trim().toLowerCase()
      if (needle === "") return { ok: false, error: "The query is empty after trimming." }
      const hits = loaded.elements
        .filter((e) => (input.layerId === undefined || e.layerId === input.layerId || e["layer"] === input.layerId))
        .filter((e) => !input.parametricOnly || e.type === "parametric")
        .map((e) => ({ element: e, foundIn: searchElement(e, needle) }))
        .filter((hit) => hit.foundIn.length > 0)
      const page = hits.slice(input.offset, input.offset + input.limit)
      return {
        ok: true, query: input.query, total: hits.length, returned: page.length,
        offset: input.offset, complete: input.offset + page.length >= hits.length,
        nextOffset: input.offset + page.length < hits.length ? input.offset + page.length : null,
        hits: page.map(({ element, foundIn }) => {
          const base = { id: element.id, type: element.type, name: typeof element["name"] === "string" ? element.name : null, layerId: element.layerId, parametric: element.type === "parametric", foundIn }
          if (element.type !== "parametric") return base
          // A grep is a text operation: it reports the stored history, it never rebuilds geometry to
          // answer a search. Metrics come from cad_parametric inspect, which can afford the kernel run.
          const decoded = historySchema.safeParse(element["history"])
          if (!decoded.success) return { ...base, historyProblems: decoded.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`) }
          return {
            ...base,
            ...(input.includeParameters ? { parameters: decoded.data.parameters } : {}),
            revision: historyRevision(element["history"]),
            featureIds: decoded.data.features.map((f) => f.id)
          }
        }),
        ...where(loaded)
      }
    },
    parametric: async (projectId, input) => {
      if (!(await Effect.runPromise(projects.find(acting().id, projectId)))) return { ok: false, error: "Project not found or not accessible." }
      if (input.action === "validate") return inspectParametric(input.history)
      if (input.action === "create") {
        const report = inspectParametric(input.history)
        if (!report.ok) return report
        return { ...(await handlers.addElements(projectId, [{ type: "parametric", name: input.name, history: input.history, x: input.x ?? 0, y: input.y ?? 0, z: input.z ?? 0, ...(input.layer ? { layer: input.layer } : {}) }])) as Record<string, unknown>, mutation: "add" }
      }
      const loaded = await load(projectId)
      const element = loaded.elements.find((e) => e.id === input.elementId && e.type === "parametric")
      if (!element) return { ok: false, error: "Parametric element not found in this drawing.", ...where(loaded) }
      const history = element["history"]
      if (input.action === "inspect") return { ...inspectParametric(history), elementId: element.id, ...where(loaded) }
      if (input.action === "test") return { ...testParametric(history, input), elementId: element.id, ...where(loaded) }
      if (input.expectedRevision !== historyRevision(history)) return { ok: false, error: "The part changed since inspection. Inspect it again before updating.", ...where(loaded) }
      const changed = changeParameters(history, input.parameters)
      if (!changed.ok) return changed
      if (!changed.report.ok) return { ...changed.report, error: "Parameters were not changed because the variant failed validation.", ...where(loaded) }
      const updated = { ...element, history: changed.history }
      await save(loaded.id, loaded.data, loaded.elements.map((e) => e.id === element.id ? updated : e))
      return { ok: true, mutation: "update", elements: [updated], ids: [element.id], revision: historyRevision(changed.history), report: changed.report, ...where(loaded) }
    },
    addEntities: async (projectId, entities) => {
      const loaded = await load(projectId, true)
      const created = newElements(entities as Array<Record<string, unknown> & { type: string }>, "default", () => crypto.randomUUID())
      await save(loaded.id, loaded.data, [...loaded.elements, ...created])
      return { ok: true, ids: created.map((e) => e.id), elements: created, ...where(loaded) }
    },
    addElements: async (projectId, rawInput) => {
      let raw = rawInput
      // Whoever calls this gets the same guarantees as the tool: defaults filled, types and counts checked, nothing added on error.
      const checked = raw.map((input) => normalizeElement(input))
      const problems = checked.flatMap((result, index) => (result.ok ? [] : [`elements[${index}]: ${result.error}`]))
      if (problems.length > 0) return { ok: false, error: "Nothing was added.", problems }
      raw = checked.flatMap((result) => (result.ok ? [result.element] : []))
      const loaded = await load(projectId, true)
      const settings = loaded.data["settings"] as { tolerance?: unknown } | undefined
      const drawingTolerance = typeof settings?.tolerance === "number" ? settings.tolerance : 0
      const created: Element[] = raw.map((input) => withDefaultTolerance(input, drawingTolerance).element).map((fields) => ({ ...fields, id: crypto.randomUUID(), layerId: typeof fields["layer"] === "string" ? fields["layer"] : typeof fields["layerId"] === "string" ? fields["layerId"] : "default" }) as Element)
      // Booleans refer to their operands by id; inside one batch a number is the index of an earlier element.
      for (const element of created) {
        const operands = element["operands"]
        if (!Array.isArray(operands)) continue
        const resolved = operands.map((operand) => (typeof operand === "number" ? created[operand]?.id : operand))
        if (resolved.some((operand) => typeof operand !== "string" || (!created.some((e) => e.id === operand) && !loaded.elements.some((e) => e.id === operand)))) {
          return { ok: false, error: "A boolean operand is not an element of this drawing or batch.", ...where(loaded) }
        }
        element["operands"] = resolved
      }
      await save(loaded.id, loaded.data, [...loaded.elements, ...created])
      return { ok: true, ids: created.map((e) => e.id), elements: created, ...where(loaded) }
    },
    modifyEntities: async (projectId, changes) => {
      const loaded = await load(projectId, true)
      const missing = changes.filter((c) => !loaded.elements.some((e) => e.id === c.id)).map((c) => c.id)
      if (missing.length > 0) return { ok: false, error: `Unknown element ids: ${missing.join(", ")}. Use cad_describe_drawing to list the ids.`, ...where(loaded) }
      const updated: Element[] = []
      const refused: string[] = []
      const elements = loaded.elements.map((e) => {
        const change = changes.find((c) => c.id === e.id)
        if (!change) return e
        const next = applyChanges(e, change.changes as Record<string, unknown>)
        // The element must still be one the editor can draw: right field types, a history that still builds a solid. An element
        // that was not valid to begin with (made by hand in the editor) is not judged.
        if (normalizeElement(e).ok) {
          const after = normalizeElement(next)
          if (!after.ok) { refused.push(`${e.id}: ${after.error}`); return e }
        }
        updated.push(next)
        return next
      })
      if (refused.length > 0) return { ok: false, error: `Nothing changed. ${refused.join("; ")}`, ...where(loaded) }
      await save(loaded.id, loaded.data, elements)
      return { ok: true, modified: updated.length, elements: updated, ...where(loaded) }
    },
    deleteEntities: async (projectId, ids) => {
      const loaded = await load(projectId, true)
      const elements = loaded.elements.filter((e) => !ids.includes(e.id))
      await save(loaded.id, loaded.data, elements)
      return { ok: true, deleted: loaded.elements.length - elements.length, ids: loaded.elements.filter((e) => ids.includes(e.id)).map((e) => e.id), ...where(loaded) }
    },
    transformEntities: async (projectId, input) => {
      const loaded = await load(projectId, true)
      const result = transformElements(loaded.elements, input, () => crypto.randomUUID())
      if (!result.ok) return { ok: false, error: result.error, ...where(loaded) }
      const elements = result.copied
        ? [...loaded.elements, ...result.elements]
        : loaded.elements.map((e) => result.elements.find((next) => next.id === e.id) ?? e)
      await save(loaded.id, loaded.data, elements)
      return { ok: true, mode: result.copied ? "copied" : "transformed", copied: result.copied, ids: result.elements.map((e) => e.id), elements: result.elements, ...where(loaded) }
    },
    groupEntities: async (projectId, input) => {
      const loaded = await load(projectId, true)
      const result = groupElements(loaded.elements, input, () => crypto.randomUUID())
      if (!result.ok) return { ok: false, error: result.error, ...where(loaded) }
      const elements = [...loaded.elements.filter((e) => !result.removed.includes(e.id)), ...result.added]
      await save(loaded.id, loaded.data, elements)
      return { ok: true, removed: result.removed, ids: result.added.map((e) => e.id), elements: result.added, ...where(loaded) }
    },
    describeDrawing: async (projectId) => {
      const loaded = await load(projectId)
      return { ...describeElements(loaded.elements, 200, elementBounds), settings: loaded.data["settings"] ?? null, ...where(loaded) }
    },
    checkDesign: async (projectId) => {
      const loaded = await load(projectId)
      const settings = (loaded.data["settings"] ?? {}) as { tolerance?: unknown; units?: unknown }
      const tolerance = typeof settings.tolerance === "number" ? settings.tolerance : undefined
      const issues = checkModel(loaded.elements, { ...(tolerance !== undefined ? { tolerance } : {}), boundsOf: elementBounds })
      const described = describeElements(loaded.elements, 0, elementBounds)
      return {
        ok: !issues.some((issue) => issue.severity === "error"),
        issues: issues.slice(0, 50), omitted: Math.max(0, issues.length - 50),
        stats: { elements: described.total, counts: described.counts, bounds: described.bounds, settings: loaded.data["settings"] ?? null },
        designSpace: DESIGN_SPACE, ...where(loaded)
      }
    },
    createOperation: async (drawingId, operation) => {
      const { id, projectId, elements, data } = await load(drawingId, true)
      const params = operation.params !== null && typeof operation.params === "object" ? operation.params : {}
      const split = splitPrinter(params as Record<string, unknown>)
      const settings = cam.generator.decodeSettings({ ...split.rest, operationType: operation.type })
      const printer = decodePrinter(split.printer)
      // A lathe works from its stock size and a probe from the machine, so only drawing-based operations need elements.
      const needsElements = settings.machineType !== "lathe" && settings.operationType !== "probing"
      if (needsElements && elements.length === 0) return { ok: false, error: "The drawing has no elements yet: add shapes with cad_add_elements first." }
      const geometry = {
        geometryType: "selected" as const,
        selectedElements: elements.filter((e) => e.type !== "workpiece"),
        ...(data["stock"] !== undefined ? { stock: data["stock"] } : {})
      }
      const request = { settings, geometry, printer }
      const row = await Effect.runPromise(toolpaths.create(acting().id, {
        name: `${operation.type} operation`, description: "Created by the nikcli CAD/CAM agent",
        data: { request }, projectId, drawingId: id, type: settings.machineType, operationType: settings.operationType
      }))
      return { ok: true, operationId: row.id, name: row.name, drawing: typeof data["name"] === "string" ? data["name"] : "Drawing", elements: elements.length }
    },
    listOperations: async (drawingId) => {
      const { id } = await load(drawingId)
      const rows = await Effect.runPromise(toolpaths.listForDrawing(id))
      return rows.map((row) => {
        const settings = (row.data as { request?: { settings?: Record<string, unknown> } } | null)?.request?.settings ?? {}
        return {
          id: row.id, name: row.name, type: row.type, operationType: row.operationType, generated: Boolean(row.gcode),
          tool: { type: settings["toolType"], diameter: settings["toolDiameter"] }, depth: settings["depth"], stepdown: settings["stepdown"], feedrate: settings["feedrate"]
        }
      })
    },
    updateOperation: async (drawingId, operationId, params) => {
      const { id, projectId } = await load(drawingId, true)
      const found = await Effect.runPromise(toolpaths.find(acting().id, operationId))
      if (!found || found.row.drawingId !== id || found.project.id !== projectId) return { ok: false, error: "Operation not found in the active drawing" }
      const stored = found.row.data as { request?: { settings?: Record<string, unknown>; geometry?: unknown; printer?: unknown } } | null
      if (!stored?.request) return { ok: false, error: "Operation has no generation settings" }
      const split = splitPrinter(params)
      const settings = cam.generator.decodeSettings({ ...(stored.request.settings ?? {}), ...split.rest })
      const printer = decodePrinter({ ...(stored.request.printer !== null && typeof stored.request.printer === "object" ? stored.request.printer as Record<string, unknown> : {}), ...split.printer })
      const request = { ...stored.request, settings, printer }
      // The stored G-code no longer matches the settings: drop it so nothing exports a stale program.
      await Effect.runPromise(toolpaths.update(operationId, { data: { request }, gcode: null, operationType: settings.operationType }))
      return { ok: true, operationId, settings: { operationType: settings.operationType, toolDiameter: settings.toolDiameter, depth: settings.depth, stepdown: settings.stepdown, feedrate: settings.feedrate }, note: "Generate G-code again, then verify it." }
    },
    suggestParameters: async (drawingId, params) => {
      const { elements, data } = await load(drawingId)
      const settings = cam.generator.decodeSettings(params)
      const geometry = cam.generator.GeometrySchema.make({ geometryType: "selected", selectedElements: elements.filter((e) => e.type !== "workpiece"), ...(data["stock"] !== undefined ? { stock: data["stock"] } : {}) } as never)
      return cam.generator.suggestFor(settings, geometry as never)
    },
    compareSetups: async (projectId, candidates) => {
      if (!(await Effect.runPromise(projects.find(acting().id, projectId)))) return { ok: false, error: "Project not found or not accessible." }
      const loaded = await load(projectId)
      if (loaded.data["stock"] === undefined) return { ok: false, error: "Configure explicit stock with cam_stock before comparing removal and cutter setups." }
      const geometry = Schema.decodeUnknownSync(cam.generator.GeometrySchema)({ geometryType: "selected", selectedElements: loaded.elements.filter((e) => e.type !== "workpiece"), stock: loaded.data["stock"] })
      const results: unknown[] = []
      for (const candidate of candidates) {
        try {
          const tool = candidate.toolId ? (await Effect.runPromise(tools.find(acting().id, candidate.toolId)))?.detail : undefined
          const material = candidate.materialId ? (await Effect.runPromise(materials.find(acting().id, candidate.materialId)))?.material : undefined
          if ((candidate.toolId && !tool) || (candidate.materialId && !material)) { results.push({ name: candidate.name, ok: false, error: "Library tool or material is missing or inaccessible." }); continue }
          const settings = cam.generator.decodeSettings({ ...candidate.params, ...(tool ? { toolType: tool.type, toolDiameter: tool.diameter, ...(tool.numberOfFlutes ? { flutes: tool.numberOfFlutes } : {}) } : {}) })
          if (tool?.maxRPM && settings.rpm > tool.maxRPM) { results.push({ name: candidate.name, ok: false, error: `Requested RPM ${settings.rpm} exceeds the cutter limit ${tool.maxRPM}.` }); continue }
          if (material && candidate.params["material"] === undefined) { results.push({ name: candidate.name, ok: false, error: "Specify params.material as the verified generator cutting family for this library material; the name alone is not a physical mapping." }); continue }
          const request = { settings, geometry }
          const generated = cam.generator.generateToolpath(request as never)
          if (generated.error) { results.push({ name: candidate.name, ok: false, error: generated.error }); continue }
          const built = cam.verify.verifyRequestFor(request as never, generated.response.gcode, { tool: { ...(tool?.cuttingLength ? { cuttingLength: tool.cuttingLength } : {}), ...(tool?.shankDiameter ? { shankDiameter: tool.shankDiameter } : {}) } })
          if (!built.ok) { results.push({ name: candidate.name, ok: false, error: built.error }); continue }
          const report = cam.verify.verifyToolpath(built.request)
          const suggestions = cam.generator.suggestFor(settings, geometry)
          results.push({ name: candidate.name, ok: report.ok, settings, sources: { tool: tool ? { id: tool.id, name: tool.name, diameter: tool.diameter, type: tool.type, material: tool.material, flutes: tool.numberOfFlutes, maxRPM: tool.maxRPM, cuttingLength: tool.cuttingLength, shankDiameter: tool.shankDiameter } : null, material: material ? { id: material.id, name: material.name, properties: material.properties } : null }, suggestions, generation: generated.response.stats, verification: { ok: report.ok, stats: report.stats, issues: report.issues.slice(0, 20) } })
        } catch { results.push({ name: candidate.name, ok: false, error: "Candidate settings could not be validated or calculated." }) }
      }
      return { ok: true, mutated: false, candidates: results, note: "Real generated-path and stock-heightfield comparisons. Material physical properties are source evidence; cutting family remains explicit in settings. No cutting-force or material-suitability certification.", ...where(loaded) }
    },
    generateGcode: async (drawingId, operationId) => {
      await assertWrite(drawingId)
      const found = await operation(drawingId, operationId)
      if ("error" in found) return { gcode: "", stats: { error: found.error } }
      const { response, error } = cam.generator.generateToolpath(found.request as never)
      if (error) return { gcode: "", stats: { error } }
      await assertWrite(drawingId)
      await Effect.runPromise(toolpaths.update(found.id, { data: { request: found.request, response }, gcode: response.gcode }))
      return { gcode: response.gcode, stats: response.stats }
    },
    verifyOperation: async (drawingId, operationId, options) => {
      await assertWrite(drawingId)
      const found = await operation(drawingId, operationId)
      if ("error" in found) return { ok: false, error: found.error }
      const { response, error } = cam.generator.generateToolpath(found.request as never)
      if (error) return { ok: false, error }
      const built = cam.verify.verifyRequestFor(found.request as never, response.gcode, {
        ...(options.tool !== undefined ? { tool: options.tool } : {}),
        ...(options.stock !== undefined ? { stock: options.stock } : {}),
        ...(options.fixtures !== undefined ? { fixtures: options.fixtures } : {}),
        ...(options.targetSolids !== undefined ? { target: { solids: options.targetSolids } } : {}),
        ...(options.resolution !== undefined ? { resolution: options.resolution } : {}),
        ...(options.tolerance !== undefined ? { tolerance: options.tolerance } : {})
      })
      if (!built.ok) return { ok: false, error: built.error }
      const report = cam.verify.verifyToolpath(built.request)
      // Keep the full report (with the height map) and the program it is about on the operation: the CAM page shows it.
      const row = await Effect.runPromise(toolpaths.find(acting().id, found.id))
      const previous = row?.row.data !== null && typeof row?.row.data === "object" ? (row!.row.data as Record<string, unknown>) : {}
      await assertWrite(drawingId)
      await Effect.runPromise(toolpaths.update(found.id, { data: { ...previous, request: found.request, response, verification: { report, request: { stock: built.request.stock, tool: built.request.tool, fixtures: built.request.fixtures }, at: new Date().toISOString() } }, gcode: response.gcode }))
      // The height field is for the UI; the model gets the verdict, the numbers and where it went wrong.
      return {
        ok: report.ok, issues: report.issues.slice(0, 20), stats: report.stats,
        stock: built.request.stock, tool: built.request.tool,
        stockSource: options.stock !== undefined ? "verification override" : (found.request.geometry as Record<string, unknown>)["stock"] !== undefined ? "configured drawing stock" : "inferred from geometry/toolpath",
        modelled: {
          holder: built.request.tool.holderDiameter !== undefined, shank: built.request.tool.cuttingLength !== undefined,
          fixtures: built.request.fixtures.length, target: built.request.target !== undefined
        },
        note: "A passing report covers only what is modelled; it is not a machine certification."
      }
    },
    remember: async (key, value) => { actingCell.assertActive(); await Effect.runPromise(kv.set(`ai.memory.${key}`, value)); return { ok: true, key } },
    recall: async (prefix) => (await Effect.runPromise(kv.list(`ai.memory.${prefix ?? ""}`))).map((e) => ({ key: e.key.slice("ai.memory.".length), value: e.value })),
    projectContext: async (projectId) => {
      const entry = await Effect.runPromise(kv.get(projectContextKey(projectId)))
      // An absent row is an empty document, not a failure: a project that never had rules reads as blank.
      return entry === undefined ? { text: "" } : parseProjectContext(entry.value)
    },
    saveProjectContext: async (projectId, text) => {
      await assertWrite(projectId)
      const entry = await Effect.runPromise(kv.set(projectContextKey(projectId), text))
      return parseProjectContext(entry.value)
    },
    lookupMaterial: async (query) => (await Effect.runPromise(materials.list(acting().id, { search: query, includePublic: true }))).slice(0, 10).map((m) => ({ id: m.id, name: m.name, description: m.description, properties: m.properties, updatedAt: m.updatedAt })),
    lookupTool: async (query) => (await Effect.runPromise(tools.list(acting().id, { search: query, includePublic: true }))).slice(0, 10).map((t) => ({ id: t.id, name: t.name, diameter: t.diameter, type: t.type, material: t.material, numberOfFlutes: t.numberOfFlutes, maxRPM: t.maxRPM, coolantType: t.coolantType, cuttingLength: t.cuttingLength, totalLength: t.totalLength, shankDiameter: t.shankDiameter, notes: t.notes })),
    lookupComponent: async (query) => {
      const needle = query.trim().toLowerCase()
      const rows = await Effect.runPromise(components.listVisible(acting().id))
      return rows
        .filter((c) => needle === "" || c.name.toLowerCase().includes(needle) || (c.description ?? "").toLowerCase().includes(needle) || c.project.name.toLowerCase().includes(needle))
        .slice(0, 20)
        .map((c) => ({ id: c.id, name: c.name, description: c.description, type: c.type, projectId: c.projectId, projectName: c.project.name, isPublic: c.isPublic, updatedAt: c.updatedAt }))
    },
    lookupMachineConfig: async (query) => (await Effect.runPromise(machines.list(acting().id, { ...(query === "" ? {} : { search: query }), includePublic: true, page: 1, limit: 10 }))).rows.slice(0, 10).map((m) => ({ id: m.id, name: m.name, description: m.description, type: m.type, config: m.config, isPublic: m.isPublic, isOwner: m.isOwner, usageCount: m.usageCount, updatedAt: m.updatedAt })),
    deleteLibrary: async (input) => {
      const { kind, id } = input
      if (kind === "material" || kind === "tool") {
        // Same rule as the library HTTP routes: visible to the acting user, and writable (owner or organisation write access).
        const found = kind === "material" ? await Effect.runPromise(materials.find(acting().id, id)) : await Effect.runPromise(tools.find(acting().id, id))
        if (!found) return { ok: false, error: `Unknown ${kind} id: ${id}.` }
        if (!found.canWrite) return { ok: false, error: `The acting user may not delete this ${kind}.` }
        actingCell.assertActive()
        await Effect.runPromise(kind === "material" ? materials.remove(id) : tools.remove(id))
        return { ok: true, kind, id, note: "Toolpaths that referenced it keep their stored parameters; re-check them with cam_verify_toolpath." }
      }
      const found = await Effect.runPromise(machines.find(acting().id, id))
      if (!found) return { ok: false, error: `Unknown machine config id: ${id}.` }
      if (!found.permission.isOwner) return { ok: false, error: "Only the owner may delete this machine config." }
      if (found.usageCount > 0) return { ok: false, error: `This machine config is still used by ${found.usageCount} toolpath(s); reassign or delete them first.` }
      actingCell.assertActive()
      await Effect.runPromise(machines.remove(id))
      return { ok: true, kind, id }
    },
    listComponents: async (projectId) => {
      const loaded = await load(projectId)
      return loaded.elements
        .filter((element) => element.type === "component")
        .map((element) => ({
          id: element.id,
          name: typeof element["name"] === "string" ? element["name"] : null,
          layerId: element.layerId,
          children: Array.isArray(element["elements"]) ? element["elements"].length : 0,
          bounds: elementBounds(element, loaded.elements) ?? null
        }))
    },
    saveComponent: async (projectId, ids, name) => {
      const loaded = await load(projectId, true)
      const chosen = loaded.elements.filter((e) => ids.includes(e.id))
      const missing = ids.filter((id) => !loaded.elements.some((e) => e.id === id))
      if (missing.length > 0) return { ok: false, error: `Unknown element ids: ${missing.join(", ")}.` }
      if (chosen.length === 0) return { ok: false, error: "Nothing to save: no elements selected." }
      const first = chosen[0]!
      const originX = typeof first["x"] === "number" ? first["x"] : 0
      const originY = typeof first["y"] === "number" ? first["y"] : 0
      const children = chosen.map((e) => { const { id: _id, layerId: _layerId, layer: _layer, ...child } = e as Record<string, unknown>; return cad.shiftElement(child, { x: -originX, y: -originY, z: 0 }) })
      const component = { id: crypto.randomUUID(), type: "component", name, x: originX, y: originY, z: typeof first["z"] === "number" ? first["z"] : 0, elements: children, layerId: first.layerId } as Element
      const data = { name, type: "custom", version: "1.0", elements: [component], geometry: { type: "custom", elements: [component] }, metadata: { createdAt: new Date().toISOString() }, properties: {} }
      await assertWrite(loaded.projectId)
      const created = await Effect.runPromise(components.create(loaded.projectId, { name, data }))
      return { ok: true, componentId: created.id, name: created.name, children: chosen.length, ...where(loaded) }
    },
    insertComponent: async (projectId, componentId, transform) => {
      const loaded = await load(projectId, true)
      const found = await Effect.runPromise(components.find(acting().id, componentId))
      if (!found) return { ok: false, error: `Unknown component id: ${componentId}.` }
      const data = found.data as { elements?: ReadonlyArray<Record<string, unknown>> } | null
      const stored = Array.isArray(data?.elements) ? data.elements : []
      if (stored.length === 0) return { ok: false, error: `Component ${componentId} has no elements.` }
      const base = stored[0]!
      const instances = stored.map((e) => ({ ...e, id: crypto.randomUUID(), layerId: typeof e["layerId"] === "string" ? e["layerId"] : base["layerId"] ?? "default" })) as Element[]
      let placed = instances
      if (transform !== undefined) {
        const moved = transformElements(instances, { ids: instances.map((e) => e.id), transform, copies: 0 }, () => crypto.randomUUID())
        if (!moved.ok) return { ok: false, error: moved.error }
        placed = moved.elements as Element[]
      }
      await save(loaded.id, loaded.data, [...loaded.elements, ...placed])
      return { ok: true, ids: placed.map((e) => e.id), component: { id: found.id, name: found.name }, elements: placed, ...where(loaded) }
    },
    deleteComponent: async (componentId) => {
      const found = await Effect.runPromise(components.find(acting().id, componentId))
      if (!found) return { ok: false, error: `Unknown component id: ${componentId}.` }
      const access = await Effect.runPromise(projects.find(acting().id, found.projectId))
      if (!access || (access.project.ownerId !== acting().id && access.orgRole !== "ADMIN" && access.orgRole !== "MANAGER")) return { ok: false, error: "You do not have permission to delete this component." }
      actingCell.assertActive()
      await Effect.runPromise(components.remove(componentId))
      return { ok: true, deleted: componentId }
    },
    upsertMaterial: async (input) => {
      actingCell.assertActive()
      const id = typeof input["id"] === "string" ? input["id"] : undefined
      const name = String(input["name"])
      const properties = (input["properties"] !== null && typeof input["properties"] === "object" ? input["properties"] : {}) as Record<string, unknown>
      if (id !== undefined) {
        const existing = await Effect.runPromise(materials.find(acting().id, id))
        if (!existing) return { ok: false, error: "Material not found or not accessible; no replacement was created." }
        if (existing) {
          if (!existing.canWrite) return { ok: false, error: "You do not have permission to update this material." }
          actingCell.assertActive()
          const row = await Effect.runPromise(materials.update(id, { name, properties, ...(typeof input["description"] === "string" ? { description: input["description"] } : {}), ...(typeof input["isPublic"] === "boolean" ? { isPublic: input["isPublic"] } : {}) }))
          return { ok: true, id: row.id, created: false }
        }
      }
      const row = await Effect.runPromise(materials.create(acting().id, { name, properties, ...(typeof input["description"] === "string" ? { description: input["description"] } : {}), ...(typeof input["isPublic"] === "boolean" ? { isPublic: input["isPublic"] } : {}) }))
      return { ok: true, id: row.id, created: true }
    },
    upsertTool: async (input) => {
      actingCell.assertActive()
      const id = typeof input["id"] === "string" ? input["id"] : undefined
      const fields = { name: String(input["name"]), type: String(input["type"]), diameter: Number(input["diameter"]), material: String(input["material"]),
        numberOfFlutes: typeof input["numberOfFlutes"] === "number" ? input["numberOfFlutes"] : null, maxRPM: typeof input["maxRPM"] === "number" ? input["maxRPM"] : null,
        coolantType: typeof input["coolantType"] === "string" ? input["coolantType"] : null, cuttingLength: typeof input["cuttingLength"] === "number" ? input["cuttingLength"] : null,
        totalLength: typeof input["totalLength"] === "number" ? input["totalLength"] : null, shankDiameter: typeof input["shankDiameter"] === "number" ? input["shankDiameter"] : null,
        notes: typeof input["notes"] === "string" ? input["notes"] : null, ...(typeof input["isPublic"] === "boolean" ? { isPublic: input["isPublic"] } : {}) }
      if (id !== undefined) {
        const existing = await Effect.runPromise(tools.find(acting().id, id))
        if (!existing) return { ok: false, error: "Tool not found or not accessible; no replacement was created." }
        if (existing) {
          if (!existing.canWrite) return { ok: false, error: "You do not have permission to update this tool." }
          actingCell.assertActive()
          const row = await Effect.runPromise(tools.update(id, fields))
          return { ok: true, id: row.id, created: false }
        }
      }
      const row = await Effect.runPromise(tools.create(acting().id, fields))
      return { ok: true, id: row.id, created: true }
    },
    upsertMachineConfig: async (input) => {
      actingCell.assertActive()
      const id = typeof input["id"] === "string" ? input["id"] : undefined
      const config = { kinematics: input["kinematics"] ?? {}, postProcessor: input["postProcessor"], workOffsets: input["workOffsets"] ?? ["G54", "G55", "G56", "G57", "G58", "G59"],
        ...(input["probing"] !== undefined ? { probing: input["probing"] } : {}), ...(typeof input["maxRPM"] === "number" ? { maxRPM: input["maxRPM"] } : {}), ...(typeof input["maxFeed"] === "number" ? { maxFeed: input["maxFeed"] } : {}) }
      const type = String(input["kind"])
      if (id !== undefined) {
        const existing = await Effect.runPromise(machines.find(acting().id, id))
        if (!existing) return { ok: false, error: "Machine config not found or not accessible; no replacement was created." }
        if (existing) {
          if (!existing.permission.isOwner) return { ok: false, error: "Only the owner may update this machine config." }
          actingCell.assertActive()
          const res = await Effect.runPromise(machines.update(id, { name: String(input["name"]), description: typeof input["description"] === "string" ? input["description"] : null, type, config, isPublic: input["isPublic"] === true }))
          return { ok: true, id: res.view.id, created: false }
        }
      }
      const view = await Effect.runPromise(machines.create(acting().id, { name: String(input["name"]), description: typeof input["description"] === "string" ? input["description"] : null, type, config, isPublic: input["isPublic"] === true }))
      return { ok: true, id: view.id, created: true }
    },
    setProjectDefault: async (input) => {
      // Defaults are project-scoped notes, like the memory keys; resolved from the open project, or the newest one.
      const loaded = await load(input.projectId ?? "default", true)
      const { projectId: _ignored, ...defaults } = input
      await Effect.runPromise(kv.set(`ai.defaults.${loaded.projectId}`, defaults))
      return { ok: true, projectId: loaded.projectId, defaults }
    },
    suggestChain: async (input) => {
      const loaded = await load(input.projectId)
      const rows = await Effect.runPromise(toolpaths.listForDrawing(loaded.id))
      const rowsById = new Map(rows.map((r) => [r.id, r]))
      const from = input.fromOperationId ? rowsById.get(input.fromOperationId) : rows[rows.length - 1]
      const settingsOf = (row: typeof rows[number] | undefined): Record<string, unknown> => ((row?.data as { request?: { settings?: Record<string, unknown> } } | null)?.request?.settings ?? {})
      const settings = settingsOf(from)
      const depth = typeof settings["depth"] === "number" ? settings["depth"] : 0
      const stepdown = typeof settings["stepdown"] === "number" ? settings["stepdown"] : 1
      const remaining = Math.max(0, depth - stepdown)
      const operationType = remaining > 0.05 ? "pocket" : depth > 0 ? "contour" : "face"
      const reason = remaining > 0.05 ? `Roughing left about ${remaining.toFixed(2)} mm of depth: continue clearing.` : depth > 0 ? "The stock is roughed to depth: profile or finish the outline." : "No operation yet: face the stock to establish a reference plane."
      return { ok: true, recommendation: { type: "operation" as const, operationType, params: { toolDiameter: typeof settings["toolDiameter"] === "number" ? settings["toolDiameter"] : 6, depth, stepdown, feedrate: typeof settings["feedrate"] === "number" ? settings["feedrate"] : 800 }, reason }, after: from?.id ?? null }
    },
    chainStatus: async (input) => {
      const loaded = await load(input.projectId)
      const rows = await Effect.runPromise(toolpaths.listForDrawing(loaded.id))
      const row = rows.find((r) => r.id === input.operationId)
      if (!row) return { ok: false, error: `Unknown operation id: ${input.operationId}.` }
      const settings = (row.data as { request?: { settings?: Record<string, unknown> } } | null)?.request?.settings ?? {}
      const index = rows.findIndex((r) => r.id === row.id)
      const previous = index > 0 ? rows[index - 1] : undefined
      const warnings: string[] = []
      if (settings["useRestMachining"] === true) {
        const rest = typeof settings["restToolDiameter"] === "number" ? settings["restToolDiameter"] : undefined
        const diameter = typeof settings["toolDiameter"] === "number" ? settings["toolDiameter"] : undefined
        if (rest === undefined || diameter === undefined || rest <= diameter) warnings.push("OrphanRef: rest machining names no larger previous tool")
      }
      return { ok: true, operationId: row.id, restFrom: previous?.id ?? null, prevTool: settings["restToolDiameter"] ?? null, generated: Boolean(row.gcode), warnings }
    }
  }
  return handlers
})

export const ToolHandlersLive = Layer.effect(ToolHandlers, toolHandlers.pipe(Effect.map((h) => ToolHandlers.of(h))))

/**
 * The implementations of the library actions (`library.*`, `parts.*`, `library_edit.*`): the catalogue declares them, this
 * supplies what the repositories do with them. Keys are catalogue action ids; `contributionGuard` checks they match.
 */
const libraryContributions = (handlers: ToolHandlersShape): Readonly<Record<string, ActionContribution>> => ({
  "library.component_list": (_input, context) => handlers.listComponents(context.projectId),
  "library.lookup_component": (input) => handlers.lookupComponent((input as { query: string }).query),
  "library.lookup_machine_config": (input) => handlers.lookupMachineConfig((input as { query: string }).query),
  "parts.save": (input, context) => {
    const value = input as { ids: string[]; name: string }
    return handlers.saveComponent(context.projectId, value.ids, value.name)
  },
  "parts.insert": (input, context) => {
    const value = input as { componentId: string; transform?: cad.ElementTransform }
    return handlers.insertComponent(context.projectId, value.componentId, value.transform)
  },
  // `confirm` is the catalogue's admission of intent, not a repository argument: it is required by the schema and proven to the user.
  "parts.delete": (input) => handlers.deleteComponent((input as { componentId: string }).componentId),
  "library_edit.upsert_material": (input) => handlers.upsertMaterial(input as Record<string, unknown>),
  "library_edit.upsert_tool": (input) => handlers.upsertTool(input as Record<string, unknown>),
  "library_edit.upsert_machine_config": (input) => handlers.upsertMachineConfig(input as Record<string, unknown>),
  "library_edit.set_default": (input, context) => handlers.setProjectDefault({ ...(input as { materialId?: string; toolId?: string; machineConfigId?: string }), projectId: context.projectId }),
  "library_edit.delete": (input) => {
    const { kind, id } = input as { kind: "material" | "tool" | "machine_config"; id: string }
    return handlers.deleteLibrary({ kind, id })
  }
})

/**
 * Every contributed action must have exactly one implementation, and every implementation must name a contributed action:
 * a model-visible capability with nothing behind it, or a dead implementation, fails at startup rather than at a call.
 */
const contributionGuard = (contributions: Readonly<Record<string, ActionContribution>>): void => {
  const provided = Object.keys(contributions)
  const missing = CONTRIBUTION_KEYS.filter((key) => !provided.includes(key))
  const unknown = provided.filter((key) => !CONTRIBUTION_KEYS.includes(key))
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(`Action contributions do not match the catalogue. Missing: ${missing.join(", ") || "none"}. Unknown: ${unknown.join(", ") || "none"}.`)
  }
}

/**
 * The catalogue's second face (RM-11): what an outside client (a standalone nikcli with `@cadcamfun/nikcli-plugin`) calls over HTTP.
 * It runs the very tool definitions the embedded host registers, through the same admission (`ActingUser`): the call acts as the
 * account that holds the token, in a session bound to that account and project, and cannot reach another account's work. It needs
 * no model and no embedded host, so it is available in every mode. `bridgeAdmission` decides first: destructive actions need a
 * person's approval, which only the application can ask for, and delegation is in-process only.
 */
export class AiActions extends Context.Service<AiActions, {
  /** The catalogue as the operator's policy leaves it (`bridge.use`, `tool.use`). */
  readonly list: (mode?: BridgeMode) => ReadonlyArray<BridgeTool>
  readonly invoke: (call: { readonly projectId: string; readonly tool: string; readonly input: unknown; readonly user: SessionUser; readonly mode?: BridgeMode; readonly signal?: AbortSignal }) => Effect.Effect<{ readonly tool: string; readonly action: string; readonly result: unknown }, { readonly message: string }>
}>()("cadcamfun/AiActions") {}

export const AiActionsLive = Layer.effect(AiActions, Effect.gen(function*() {
  const handlers = yield* ToolHandlers
  const vcs = yield* ProjectVcs
  const runner = yield* WorkflowRunner
  const projectsRepo = yield* ProjectsForVcs
  const { user: local } = yield* LocalProfile
  const acting = yield* ActingUser
  const { policies = [] } = yield* AiConfig
  const actor = {
    get userId() { return acting.get(local).id },
    get name() { return acting.get(local).name ?? "User" },
    get email() { return acting.get(local).email ?? "unknown@cadcamfun.local" },
    get lastPrompt() { return acting.lastPrompt() }
  }
  // Delegation (`agent`) is in-process only, so the background contributions are not part of this face.
  const contributions: Readonly<Record<string, ActionContribution>> = {
    ...libraryContributions(handlers),
    ...vcsContributions({ vcs, runner, projects: projectsRepo, actor })
  }
  return AiActions.of({
    list: (mode) => scopeBridge(describeBridge(), policies, mode),
    invoke: ({ projectId, tool, input, user, mode, signal }) => Effect.gen(function*() {
      const admission = bridgeAdmission(tool, input, policies, mode)
      if (!admission.ok) return yield* Effect.fail({ message: admission.error })
      const spec = buildTools(handlers, projectId, [], contributions).find((candidate) => candidate.id === tool)
      if (spec === undefined) return yield* Effect.fail({ message: `Tool "${tool}" is not available.` })
      // One session per account and project: the owner file and the in-memory binding make a second account's call fail closed.
      const sessionId = `bridge:${projectId}:${user.id}`
      const bound = yield* Effect.promise(() => acting.bind(projectId, sessionId, user, `${tool}.${admission.action} (standalone nikcli)`))
      if (!bound) return yield* Effect.fail({ message: "This project's bridge session belongs to another account." })
      const output = yield* Effect.promise((abort) => {
        const cancel = signal ?? abort
        return acting.invoke(projectId, sessionId, () => spec.execute(input, { sessionId, projectId, signal: cancel }), cancel)
      }).pipe(Effect.catchDefect(() => Effect.fail({ message: "The call was denied or interrupted." })))
      let result: unknown
      try { result = JSON.parse(output) } catch { result = output }
      return { tool, action: admission.action, result }
    })
  })
}))

/** The embedded nikcli host (the primary path); skipped with `CADCAMFUN_AI_HOST=direct`. */
const AiHostLive = Layer.effect(AiHost, Effect.gen(function*() {
  const config = yield* AppConfigService
  const handlers = yield* ToolHandlers
  const credentials = yield* AiCredentials
  const vcs = yield* ProjectVcs
  const runner = yield* WorkflowRunner
  const projectsRepo = yield* ProjectsForVcs
  const { user: local } = yield* LocalProfile
  const actingCell = yield* ActingUser
  // Read when a tool runs, so the version-control tools act as the account that is chatting.
  const actor = {
    get userId() { return actingCell.get(local).id },
    get name() { return actingCell.get(local).name ?? "User" },
    get email() { return actingCell.get(local).email ?? "unknown@cadcamfun.local" },
    // The message that opened the current turn, cited on an AI commit (see `project-vcs.ts`).
    get lastPrompt() { return actingCell.lastPrompt() }
  }
  // Runtime-wide scheduler: instantiated before the host so `toolsFor` can
  // hand its four `agent_task*` tool specs to every project's host. The same
  // instance is passed to `AiBackgroundLive` below so the worker runner owns
  // it (no second scheduler, no second scheduler across projects).
  const scheduler = new BackgroundTaskManager({})
  // Every implementation the application owns, keyed by catalogue action id; the guard keeps the two sides in step.
  const contributions: Readonly<Record<string, ActionContribution>> = {
    ...libraryContributions(handlers),
    ...vcsContributions({ vcs, runner, projects: projectsRepo, actor }),
    ...backgroundToolContributionsFor(scheduler)
  }
  contributionGuard(contributions)
  const policies = yield* readPolicyFile(policyFile(config.dataDir))
  const runtime = yield* makeNikCliRuntime({
    dataDir: config.dataDir,
    ...(policies.length > 0 ? { policies } : {}),
    providers: defaultProviderSpecs(config.aiMinimaxBaseUrl ? { minimax: config.aiMinimaxBaseUrl } : {}),
    systemPrompt: agentSystemPrompt(),
    // Host imports and model metadata start on demand, after the editor is usable.
    // One request to models.dev, only while `<cache>/models.json` is missing: that file is
    // what turns "the four providers we declare" into the whole catalogue. Offline tests
    // set the flag and the seed answers "skipped" without touching the network.
    catalogue: { network: !config.aiOffline },
    toolsFor: (projectId) => buildTools(handlers, projectId, [], contributions).map((spec): HostToolSpec => ({
      ...spec,
      execute: (input, ctx) => actingCell.invoke(projectId, ctx.sessionId, () => spec.execute(input, ctx), ctx.signal).catch(() => JSON.stringify({ ok: false, error: "AI invocation denied or interrupted." })),
      ...(spec.executeWithFiles ? { executeWithFiles: (input: unknown, ctx: { sessionId: string; projectId: string; signal: AbortSignal }) => actingCell.invoke(projectId, ctx.sessionId, () => spec.executeWithFiles!(input, ctx), ctx.signal).catch(() => ({ output: JSON.stringify({ ok: false, error: "AI invocation denied or interrupted." }) })) } : {})
    }))
  })
  yield* credentials.attach({
    apply: (change) => change._tag === "set"
      ? runtime.setProviderKey(change.provider, Redacted.value(change.credential.key))
      : runtime.clearProviderKey(change.provider)
  })
  return AiHost.of({ runtime, scheduler })
}))

const AiBackgroundLive = Layer.unwrap(Effect.gen(function*() {
  const host = yield* AiHost
  return makeAiBackgroundLayer.pipe(Layer.provide(Layer.succeed(AiHost, host)))
})).pipe(Layer.provide(AiHostLive), Layer.orDie)

/** nikcli resource policy (`provider.use`, `tool.use`) the operator keeps in `<data dir>/ai/policy.json`; absent means allow all. */
const policyFile = (dataDir: string): string => `${dataDir}/ai/policy.json`

const AiConfigLive = Layer.unwrap(AppConfigService.use((c) => readPolicyFile(policyFile(c.dataDir)).pipe(
  Effect.map((policies) => AiConfig.layer({ dataDir: c.dataDir, forceGateway: false, ...(policies.length > 0 ? { policies } : {}) }))
)))

/** Publishes the assistant's one workflow step (`ai/prompt`) to the runner that is already in scope. */
const AiPromptStepLive = Layer.effectDiscard(
  Effect.gen(function*() {
    const ai = yield* AiService
    const runner = yield* WorkflowRunner
    yield* runner.register({ "ai/prompt": aiPromptStep({ ai }) })
  }),
)

/** Credentials, config, direct model and the service; needs the repos and `AppConfigService`. */
export const AiLive = Layer.unwrap(Effect.gen(function*() {
  const config = yield* AppConfigService
  // Keys are kept in <data dir>/ai/credentials.json (owner-only), so they are not asked for again after a restart.
  const base = Layer.mergeAll(ActingUser.layer, AiCredentials.layerPersisted(jsonFileCredentials(`${config.dataDir}/ai/credentials.json`)), AiConfigLive)
  const withDirect = DirectModel.layerWith(config.aiModelFactory ?? defaultModelFactory).pipe(Layer.provideMerge(base))
  const withHandlers = AiActionsLive.pipe(Layer.provideMerge(ToolHandlersLive.pipe(Layer.provideMerge(withDirect))))
  const withHost = config.aiHost === "direct" ? withHandlers : AiHostLive.pipe(Layer.provideMerge(withHandlers))
  // Build the background runner from the live host once the host is in scope,
  // so the worker's `runner` always closes over the same scheduler the host
  // advertised. Without the host (the `direct` path) we provide a stub that
  // simply refuses to enqueue — the four `agent_task*` tools won't be wired.
  const withBackground = config.aiHost === "direct"
    ? withHost
    : AiBackgroundLive.pipe(Layer.provideMerge(withHost))
  // `ai/prompt` is the one step that needs the assistant, and the assistant is built on top of the
  // workflow runner (its own git tools use it), so the registration can only happen here — once the
  // service exists. Until this layer runs, a workflow naming `ai/prompt` fails as an unknown step
  // rather than quietly doing nothing. The registration consumes the service it publishes, so the
  // exported services are the very same instances (Effect memoises by layer reference).
  return AiPromptStepLive.pipe(Layer.provideMerge(AiService.layer.pipe(Layer.provideMerge(withBackground))))
}))

export type { ProviderId }
