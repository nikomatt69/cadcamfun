/**
 * The exact kernel's scene operations that used to run on the sidecar's main thread (shell, offset, distance, motion study, exact
 * exchange, fastening and the four feature edits that return a body): one pure function over plain data, so the scoped worker and
 * the inline path run the same code. A fillet or a shell of a complex solid takes seconds; on the main thread that stalls every
 * request and the assistant's own event stream. Authorization, persistence and revisions stay with the caller.
 */
import { cad } from "@cadcamfun/core"

type Scene = ReadonlyArray<Record<string, unknown>>

export type CadSceneOp =
  | { readonly op: "shell"; readonly id: string; readonly thickness: number; readonly open?: ReadonlyArray<string>; readonly wallByFace?: Parameters<typeof cad.sceneShell>[4] }
  | { readonly op: "shell-body"; readonly id: string; readonly thickness: number; readonly open?: ReadonlyArray<string>; readonly wallByFace?: Parameters<typeof cad.sceneShell>[4] }
  | { readonly op: "offset"; readonly id: string; readonly distance: number }
  | { readonly op: "distance"; readonly firstId: string; readonly secondId: string }
  | { readonly op: "motion"; readonly model: Parameters<typeof cad.sceneMotion>[1]; readonly sweep: Parameters<typeof cad.sceneMotion>[2] }
  | { readonly op: "exchange"; readonly format: "step" | "iges"; readonly ids?: ReadonlyArray<string> }
  | { readonly op: "fasten"; readonly washers?: boolean }
  | { readonly op: "fillet-body"; readonly id: string; readonly fillet: number; readonly radius: number }
  | { readonly op: "boss-body"; readonly id: string; readonly boss: number; readonly diameter: number; readonly taper: number }
  | { readonly op: "hole-body"; readonly id: string; readonly hole: number; readonly change: Parameters<typeof cad.sceneHoleEditBody>[3] }
  | { readonly op: "nurbs-body"; readonly id: string; readonly nurbs: number; readonly edit: cad.NurbsEdit }

export type CadSceneInput = { readonly elements: Scene } & CadSceneOp

const exchange = (elements: Scene, format: "step" | "iges", ids: ReadonlyArray<string> | undefined) => {
  const scene = cad.sceneParts(cad.selectElements(elements, ids))
  const wanted = ids === undefined ? undefined : new Set(ids)
  const parts = scene.parts.filter((p) => wanted === undefined || wanted.has(p.id))
  const missing = ids?.filter((id) => !parts.some((p) => p.id === id)) ?? []
  if (parts.length === 0 || missing.length > 0 || scene.skipped.length > 0) return { ok: false as const, error: "Some requested elements have no exact solid to export.", skipped: scene.skipped, missing }
  const content = format === "iges" ? cad.brep.writeIgesBreps(parts) : cad.brep.writeStepBreps(parts)
  return { ok: true as const, format, content, parts: parts.length, warnings: [] as string[] }
}

/** One function per operation: the result type of each is exact, so a caller that names the operation gets its own result type. */
const OPERATIONS = {
  "shell": (e: Scene, i: Extract<CadSceneOp, { op: "shell" }>) => cad.sceneShell(e, i.id, i.thickness, i.open ?? [], i.wallByFace ?? []),
  "shell-body": (e: Scene, i: Extract<CadSceneOp, { op: "shell-body" }>) => cad.sceneShellBody(e, i.id, i.thickness, i.open ?? [], i.wallByFace ?? []),
  "offset": (e: Scene, i: Extract<CadSceneOp, { op: "offset" }>) => cad.sceneOffsetBody(e, i.id, i.distance),
  "distance": (e: Scene, i: Extract<CadSceneOp, { op: "distance" }>) => cad.sceneDistance(e, i.firstId, i.secondId),
  "motion": (e: Scene, i: Extract<CadSceneOp, { op: "motion" }>) => cad.sceneMotion(e, i.model, i.sweep),
  "exchange": (e: Scene, i: Extract<CadSceneOp, { op: "exchange" }>) => exchange(e, i.format, i.ids),
  "fasten": (e: Scene, i: Extract<CadSceneOp, { op: "fasten" }>) => cad.fastenScene(e, i.washers !== undefined ? { washers: i.washers } : {}),
  "fillet-body": (e: Scene, i: Extract<CadSceneOp, { op: "fillet-body" }>) => cad.sceneFilletEditBody(e, i.id, i.fillet, i.radius),
  "boss-body": (e: Scene, i: Extract<CadSceneOp, { op: "boss-body" }>) => cad.sceneBossEditBody(e, i.id, i.boss, i.diameter, i.taper),
  "hole-body": (e: Scene, i: Extract<CadSceneOp, { op: "hole-body" }>) => cad.sceneHoleEditBody(e, i.id, i.hole, i.change),
  "nurbs-body": (e: Scene, i: Extract<CadSceneOp, { op: "nurbs-body" }>) => cad.sceneNurbsEditBody(e, i.id, i.nurbs, i.edit)
} as const

export type CadSceneResult = { readonly [K in keyof typeof OPERATIONS]: ReturnType<(typeof OPERATIONS)[K]> }

export const cadScene = (input: CadSceneInput): CadSceneResult[keyof CadSceneResult] =>
  (OPERATIONS[input.op] as (elements: Scene, op: CadSceneOp) => CadSceneResult[keyof CadSceneResult])(input.elements, input)
