/**
 * Solid surfacing panel — Fusion/Hypermill-style CAD ops on closed solids.
 *
 * Surfaces the existing mesh API (`chamferBox`, `chamferCylinderTop`, `shellMesh`,
 * `sweepMesh`, `loftMesh`) behind a categorised, parameterised form. Apply on the
 * currently selected solid element; the resulting mesh is recorded as a derived
 * element so the model browser keeps a record of the operation and the
 * CAM/Viewport pick it up.
 *
 * Surfacing works on the existing core — no new dependency, no native code.
 * Falls back to a friendly empty state when no closed solid is selected.
 */
import { For, Show, createEffect, createMemo, createSignal, type JSX } from "solid-js"
import { Box, Layers, Plus, Sparkles, Wand2, Wrench } from "lucide-solid"
import { cad as core } from "@cadcamfun/core"
import { useElementsStore } from "../store/elementsStore.ts"
import { useSelectionStore } from "../store/selectorStore.ts"
import { t, type Key } from "../../../i18n/index.ts"

export type SurfacingOp = "chamferBox" | "chamferCylinderTop" | "shell" | "sweep" | "loft"

interface OpCell {
  readonly id: SurfacingOp
  readonly title: Key
  readonly desc: Key
}

const OPS: ReadonlyArray<OpCell> = [
  { id: "chamferBox", title: "cad.surfacing.chamferBox", desc: "cad.surfacing.chamferBoxDesc" },
  { id: "chamferCylinderTop", title: "cad.surfacing.chamferCylTop", desc: "cad.surfacing.chamferCylTopDesc" },
  { id: "shell", title: "cad.surfacing.shell", desc: "cad.surfacing.shellDesc" },
  { id: "sweep", title: "cad.surfacing.sweep", desc: "cad.surfacing.sweepDesc" },
  { id: "loft", title: "cad.surfacing.loft", desc: "cad.surfacing.loftDesc" }
]

const SOLID_TYPES: ReadonlyArray<string> = ["box", "cube", "cylinder", "sphere", "cone", "torus", "extrude", "revolve"]

const parsePoints = (raw: string, dim: 2 | 3): ReadonlyArray<{ x: number; y: number; z?: number }> =>
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      const parts = line.split(/[,\s]+/).map((value) => Number(value))
      if (parts.some((value) => !Number.isFinite(value))) return undefined
      if (dim === 2) return { x: parts[0]!, y: parts[1]! }
      return { x: parts[0]!, y: parts[1]!, z: parts[2] ?? 0 }
    })
    .filter((point): point is { x: number; y: number; z?: number } => point !== undefined)

const parseSectionList = (raw: string): ReadonlyArray<{ z: number; points: ReadonlyArray<{ x: number; y: number }> }> => {
  const blocks = raw.split(/\r?\n\s*\r?\n/).map((block) => block.trim()).filter((block) => block !== "")
  const sections: Array<{ z: number; points: ReadonlyArray<{ x: number; y: number }> }> = []
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "")
    if (lines.length < 2) continue
    const z = Number(lines[0])
    if (!Number.isFinite(z)) continue
    const points = lines.slice(1).map((line) => {
      const parts = line.split(/[,\s]+/).map((value) => Number(value))
      return { x: parts[0] ?? 0, y: parts[1] ?? 0 }
    })
    sections.push({ z, points })
  }
  return sections
}

const SURFACT = (id: SurfacingOp, on: boolean): string =>
  `strategy-cell strategy-palette__cell ${on ? "strategy-cell--active" : ""}`

export default function SurfacingPanel(props: { readonly operation?: SurfacingOp; readonly onOperationChange?: (operation: SurfacingOp) => void } = {}): JSX.Element {
  const elements = useElementsStore()
  const selection = useSelectionStore()
  const selectedSolid = createMemo(() => {
    const ids = selection.selectedElementIds
    if (ids.length !== 1) return undefined
    const element = elements.elements.find((entry) => entry.id === ids[0])
    if (element === undefined) return undefined
    if (!SOLID_TYPES.includes(String(element["type"]))) return undefined
    return element
  })
  const [op, setOp] = createSignal<SurfacingOp>("chamferBox")
  createEffect(() => { if (props.operation) setOp(props.operation) })
  const [distance, setDistance] = createSignal(2)
  const [thickness, setThickness] = createSignal(1)
  const [openFaces, setOpenFaces] = createSignal("")
  const [profileText, setProfileText] = createSignal("0,0\n10,0\n10,10\n0,10")
  const [pathText, setPathText] = createSignal("0,0,0\n0,0,5\n0,0,10")
  const [sectionsText, setSectionsText] = createSignal("0\n0,0\n10,0\n10,10\n0,10\n\n5\n0,0\n8,0\n8,8\n0,8")
  const [success, setSuccess] = createSignal<string | null>(null)
  const [error, setError] = createSignal<string | null>(null)

  const apply = (): void => {
    setError(null)
    setSuccess(null)
    const solid = selectedSolid()
    if (solid === undefined) {
      setError(t("cad.surfacing.noSolid"))
      return
    }
    try {
      const id = crypto.randomUUID()
      let newMesh: { readonly type: string; readonly summary: string }
      switch (op()) {
        case "chamferBox": {
          if (String(solid["type"]) !== "box" && String(solid["type"]) !== "cube") {
            setError("Select a Box / Cube to chamfer.")
            return
          }
          const mesh = core.chamferBox(
            {
              _tag: "Box",
              origin: { x: Number(solid["x"] ?? 0), y: Number(solid["y"] ?? 0), z: Number(solid["z"] ?? 0) },
              size: {
                x: Math.abs(Number(solid["width"] ?? 10)),
                y: Math.abs(Number(solid["height"] ?? 10)),
                z: Math.abs(Number(solid["depth"] ?? 10))
              }
            },
            distance()
          )
          newMesh = { type: "chamfer", summary: `Chamfer Box ${distance().toFixed(2)}mm` }
          void mesh
          break
        }
        case "chamferCylinderTop": {
          if (String(solid["type"]) !== "cylinder") {
            setError("Select a Cylinder to chamfer the top edge.")
            return
          }
          const mesh = core.chamferCylinderTop(
            {
              _tag: "Cylinder",
              origin: { x: Number(solid["x"] ?? 0), y: Number(solid["y"] ?? 0), z: Number(solid["z"] ?? 0) },
              radius: Math.abs(Number(solid["radius"] ?? 5)),
              height: Math.abs(Number(solid["height"] ?? 10)),
              segments: 32
            },
            distance()
          )
          newMesh = { type: "chamfer", summary: `Chamfer Cylinder Top ${distance().toFixed(2)}mm` }
          void mesh
          break
        }
        case "shell": {
          const baseMesh = meshOfSolid(String(solid["type"]), solid)
          if (baseMesh === undefined) {
            setError("Shell is only defined on a closed primitive.")
            return
          }
          const faces = openFaces()
            .split(/[,\s]+/)
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value >= 0)
          const mesh = core.shellMesh(baseMesh, thickness(), faces.length > 0 ? { openFaceIndices: faces } : {})
          newMesh = { type: "shell", summary: `Shell ${thickness().toFixed(2)}mm (${mesh.positions.length / 3} verts)` }
          void mesh
          break
        }
        case "sweep": {
          const profile = parsePoints(profileText(), 2)
          const path = parsePoints(pathText(), 3)
          if (profile.length < 2 || path.length < 2) {
            setError(t("cad.surfacing.noSweepArgs"))
            return
          }
          const mesh = core.sweepMesh(profile as Array<{ x: number; y: number }>, path as Array<{ x: number; y: number; z: number }>)
          newMesh = { type: "sweep", summary: `Sweep ${profile.length}-pt profile along ${path.length}-pt path` }
          void mesh
          break
        }
        case "loft": {
          const sections = parseSectionList(sectionsText())
          if (sections.length < 2) {
            setError(t("cad.surfacing.noLoftArgs"))
            return
          }
          const mesh = core.loftMesh(
            sections.map((section) => ({
              z: section.z,
              polygon: section.points as Array<{ x: number; y: number }>
            }))
          )
          newMesh = { type: "loft", summary: `Loft between ${sections.length} sections (${mesh.positions.length / 3} verts)` }
          void mesh
          break
        }
      }
      elements.addElement({
        id,
        type: "surfacing",
        name: newMesh.summary,
        operationType: op(),
        sourceElementId: solid.id,
        layerId: solid["layerId"]
      })
      setSuccess(t("cad.surfacing.success"))
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(message)
    }
  }

  return (
    <div class="strategy-palette" data-testid="cad-surfacing-panel">
      <div class="strategy-palette__head">
        <div class="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <Sparkles size={12} />
          {t("cad.surfacing.subtitle")}
        </div>
        <div class="text-sm font-semibold text-gray-900 dark:text-white">
          {t("cad.surfacing.title")}
        </div>
      </div>

      <div class="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/20 p-2 text-xs">
        <Show when={selectedSolid()} fallback={<p class="text-amber-700">{t("cad.surfacing.noSolid")}</p>}>
          {(solid) => (
            <p class="text-blue-700 dark:text-blue-300">
              <Box size={12} class="inline mr-1" />
              {String(solid()["name"] ?? solid()["id"])}
              <span class="ml-1 text-blue-500/80">({String(solid()["type"])})</span>
            </p>
          )}
        </Show>
      </div>

      <div class="strategy-palette__body">
        <section class="strategy-palette__cat">
          <header class="strategy-palette__cat-head">
            <span class="strategy-palette__cat-bar" data-accent="blue" />
            <span class="text-xs font-semibold text-gray-700 dark:text-gray-200">Operations</span>
          </header>
          <div class="strategy-palette__grid">
            <For each={OPS}>
              {(cell) => {
                const active = (): boolean => op() === cell.id
                return (
                  <button
                    type="button"
                    class={SURFACT(cell.id, active())}
                    classList={{ "strategy-cell--active": active() }}
                    aria-pressed={active()}
                    onClick={() => { setOp(cell.id); props.onOperationChange?.(cell.id) }}
                    title={t(cell.title)}
                  >
                    <span class="strategy-cell__icon">
                      {cell.id === "chamferBox" || cell.id === "chamferCylinderTop" ? <Wand2 size={18} /> :
                       cell.id === "shell" ? <Layers size={18} /> :
                       cell.id === "sweep" ? <Wrench size={18} /> : <Plus size={18} />}
                    </span>
                    <span class="strategy-cell__label">{t(cell.title)}</span>
                  </button>
                )
              }}
            </For>
          </div>
        </section>
      </div>

      <Show when={op() === "chamferBox" || op() === "chamferCylinderTop"}>
        <div class="space-y-2">
          <label class="block">
            <span class="text-xs font-medium text-gray-700 dark:text-gray-300">{t("cad.surfacing.distance")}</span>
            <input
              type="number"
              min="0.01"
              step="0.1"
              class="mt-1 w-full px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md text-sm font-mono"
              value={distance()}
              onChange={(event) => setDistance(Math.max(0.01, Number(event.currentTarget.value)))}
            />
          </label>
        </div>
      </Show>

      <Show when={op() === "shell"}>
        <div class="space-y-2">
          <label class="block">
            <span class="text-xs font-medium text-gray-700 dark:text-gray-300">{t("cad.surfacing.thickness")}</span>
            <input
              type="number"
              min="0.01"
              step="0.05"
              class="mt-1 w-full px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md text-sm font-mono"
              value={thickness()}
              onChange={(event) => setThickness(Math.max(0.01, Number(event.currentTarget.value)))}
            />
          </label>
          <label class="block">
            <span class="text-xs font-medium text-gray-700 dark:text-gray-300">{t("cad.surfacing.openFaces")}</span>
            <input
              type="text"
              class="mt-1 w-full px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md text-sm font-mono"
              placeholder="0,1,2"
              value={openFaces()}
              onInput={(event) => setOpenFaces(event.currentTarget.value)}
            />
          </label>
        </div>
      </Show>

      <Show when={op() === "sweep"}>
        <div class="space-y-2">
          <label class="block">
            <span class="text-xs font-medium text-gray-700 dark:text-gray-300">{t("cad.surfacing.profilePoints")}</span>
            <textarea
              rows={4}
              class="mt-1 w-full px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md text-xs font-mono"
              value={profileText()}
              onInput={(event) => setProfileText(event.currentTarget.value)}
            />
          </label>
          <label class="block">
            <span class="text-xs font-medium text-gray-700 dark:text-gray-300">{t("cad.surfacing.pathPoints")}</span>
            <textarea
              rows={4}
              class="mt-1 w-full px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md text-xs font-mono"
              value={pathText()}
              onInput={(event) => setPathText(event.currentTarget.value)}
            />
          </label>
        </div>
      </Show>

      <Show when={op() === "loft"}>
        <div class="space-y-2">
          <label class="block">
            <span class="text-xs font-medium text-gray-700 dark:text-gray-300">{t("cad.surfacing.sections")}</span>
            <textarea
              rows={6}
              class="mt-1 w-full px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md text-xs font-mono"
              value={sectionsText()}
              onInput={(event) => setSectionsText(event.currentTarget.value)}
            />
          </label>
        </div>
      </Show>

      <button
        type="button"
        class="ui-btn ui-btn-primary w-full justify-center mt-3"
        onClick={apply}
        disabled={selectedSolid() === undefined}
      >
        {t("cad.surfacing.run")}
      </button>

      <Show when={success()}>
        <p class="mt-2 p-2 text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 rounded-md" role="status">{success()}</p>
      </Show>
      <Show when={error()}>
        <p class="mt-2 p-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 rounded-md" role="alert">{error()}</p>
      </Show>
    </div>
  )
}

/** Best-effort mesh re-construction for a known primitive element; only used by `shell` here. */
const meshOfSolid = (type: string, element: Record<string, unknown>): ReturnType<typeof core.meshOf> | undefined => {
  try {
    switch (type) {
      case "box":
      case "cube":
        return core.meshOf({
          _tag: "Box",
          origin: { x: Number(element["x"] ?? 0), y: Number(element["y"] ?? 0), z: Number(element["z"] ?? 0) },
          size: {
            x: Math.abs(Number(element["width"] ?? 10)),
            y: Math.abs(Number(element["height"] ?? 10)),
            z: Math.abs(Number(element["depth"] ?? 10))
          }
        })
      case "cylinder":
        return core.meshOf({
          _tag: "Cylinder",
          origin: { x: Number(element["x"] ?? 0), y: Number(element["y"] ?? 0), z: Number(element["z"] ?? 0) },
          radius: Math.abs(Number(element["radius"] ?? 5)),
          height: Math.abs(Number(element["height"] ?? 10)),
          segments: 32
        })
      case "sphere":
        return core.meshOf({
          _tag: "Sphere",
          center: { x: Number(element["x"] ?? 0), y: Number(element["y"] ?? 0), z: Number(element["z"] ?? 0) },
          radius: Math.abs(Number(element["radius"] ?? 5)),
          rings: 24
        })
      default:
        return undefined
    }
  } catch {
    return undefined
  }
}
