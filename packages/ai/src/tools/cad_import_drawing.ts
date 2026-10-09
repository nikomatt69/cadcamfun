import { z } from "zod"
import { cad } from "@cadcamfun/core"
import { attachmentNames, getAttachment } from "../attachments.ts"
import { normalizeElement } from "../element-catalog.ts"
import { defineTool } from "./define.ts"

const MAX_DRAWING_CHARS = 2_000_000

/** DXF/SVG text to 3D: closed outlines become solids of `depth`, circles and inner loops holes. */
export const cadImportDrawing = defineTool("cad_import_drawing", {
  parameters: z.object({
    /** Defaults to the attachment's extension. */
    format: z.enum(["dxf", "svg", "step", "mesh"]).optional(),
    /** The file text, or ... */
    content: z.string().min(1).max(MAX_DRAWING_CHARS).optional(),
    /** ... the name of a file the user attached to the chat (preferred: no need to repeat the file). */
    attachment: z.string().min(1).optional(),
    /** Thickness, mm. Required for DXF and SVG; a STEP part brings its own height. */
    depth: z.number().positive().optional(),
    /** STEP only: the axis the part stands on (default z). */
    up: z.enum(["x", "y", "z"]).optional(),
    scale: z.number().positive().optional(),
    gap: z.number().positive().optional(),
    tolerance: z.number().positive().optional(),
    name: z.string().min(1).optional(),
    color: z.string().min(1).optional(),
    layer: z.string().min(1).optional()
  }),
  execute: async (a, { handlers, projectId }) => {
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
      const mesh = z.object({ format: z.literal("cadcamfun-mesh"), elements: z.array(z.record(z.string(), z.unknown())).min(1).max(40) }).safeParse(raw)
      if (!mesh.success) return { ok: false, error: "Expected a parsed cadcamfun-mesh attachment." }
      const elements: Record<string, unknown>[] = []
      for (const element of mesh.data.elements) {
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
      return stored !== null && typeof stored === "object" ? { ...stored, warnings: ["Imported triangles preserve source geometry; no parametric history was recovered. Mesh units use the explicit import scale (default 1 mm per source unit)."], stats: { meshes: elements.length } } : stored
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
})
