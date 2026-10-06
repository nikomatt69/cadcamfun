/**
 * 3D primitive creation panel: Box / Sphere / Cylinder / Cone / Torus plus the
 * `Extrude` and `Revolve` operations that turn selected 2D profiles into
 * solids. Mirrors the legacy ToolPanel's "3D primitives" group.
 *
 * Apple-design principles applied here:
 *  - Specific labels ("Add box", not "Submit") — every button names what it does.
 *  - One common path first (primitives grid), advanced options (extrude/revolve)
 *    one level deeper in their own sub-sections.
 *  - Buttons respond on pointer-down via CSS `:active` in `cad-workspace.css`;
 *    the `CadButton` primitive hands the press down to the styles layer.
 *  - Status feedback (the selection list) is visible and proximate to its
 *    controls — the user can always see which solid is selected.
 */
import { For, Show, createMemo, createSignal } from "solid-js"
import { Box, Circle, Disc, Layers, Play, Square, Triangle, Trash2 } from "lucide-solid"
import {
  isClosedShape,
  tessellate,
  type BoxSolid,
  type ConeSolid,
  type CylinderSolid,
  type Entity,
  type ExtrudeSolid,
  type RevolveSolid,
  type Solid,
  type SphereSolid,
  type TorusSolid,
  type Vec2
} from "@cadcamfun/core"
import { useApp } from "../state/context.ts"
import { t, type Key } from "../i18n/index.ts"
import { CadButton } from "./cad-controls.tsx"

interface PrimitiveConfig {
  readonly id: string
  readonly label: Key
  readonly icon: typeof Box
  readonly defaults: () => Solid
}

const PRIMITIVES: ReadonlyArray<PrimitiveConfig> = [
  {
    id: "box",
    label: "cad.box",
    icon: Square,
    defaults: (): BoxSolid => ({
      _tag: "Box",
      origin: { x: 0, y: 0, z: 0 },
      size: { x: 50, y: 50, z: 25 }
    })
  },
  {
    id: "sphere",
    label: "cad.sphere",
    icon: Circle,
    defaults: (): SphereSolid => ({
      _tag: "Sphere",
      center: { x: 0, y: 0, z: 0 },
      radius: 25,
      rings: 32
    })
  },
  {
    id: "cylinder",
    label: "cad.cylinder",
    icon: Disc,
    defaults: (): CylinderSolid => ({
      _tag: "Cylinder",
      origin: { x: 0, y: 0, z: 0 },
      radius: 20,
      height: 40,
      segments: 48
    })
  },
  {
    id: "cone",
    label: "cad.cone",
    icon: Triangle,
    defaults: (): ConeSolid => ({
      _tag: "Cone",
      origin: { x: 0, y: 0, z: 0 },
      baseRadius: 25,
      topRadius: 0,
      height: 40,
      segments: 48
    })
  },
  {
    id: "torus",
    label: "cad.torus",
    icon: Circle,
    defaults: (): TorusSolid => ({
      _tag: "Torus",
      center: { x: 0, y: 0, z: 0 },
      majorRadius: 25,
      minorRadius: 8,
      majorSegments: 48,
      minorSegments: 16
    })
  }
]

/** Closes a tessellated ring back to its first point (drops the duplicate). */
const closeRing = (points: ReadonlyArray<Vec2>): Vec2[] => {
  const first = points[0]
  const last = points.at(-1)
  if (first !== undefined && last !== undefined && first.x === last.x && first.y === last.y) {
    return points.slice(0, -1)
  }
  return [...points]
}

export function Cad3DPrimitives() {
  const app = useApp()
  const [open, setOpen] = createSignal(true)
  const [extrudeHeight, setExtrudeHeight] = createSignal(10)
  const [revolveAngle, setRevolveAngle] = createSignal(Math.PI * 2)
  const [revolveSegments, setRevolveSegments] = createSignal(64)

  const addSolid = (solid: Solid) => {
    const index = app.editor.addSolid(solid)
    app.editor.setSolidSelection([index])
  }

  const onExtrude = () => {
    const selected = app.editor.selection()
    const drawing = app.drawing()
    const height = extrudeHeight()
    if (!Number.isFinite(height) || height === 0) return
    let created = 0
    for (const id of selected) {
      const entity: Entity | undefined = drawing.entities.find((e) => e.id === id)
      if (entity === undefined || !isClosedShape(entity)) continue
      const rings = tessellate(entity, 0.1)
      const raw = rings[0]
      if (raw === undefined || raw.length < 3) continue
      const profile = closeRing(raw)
      const solid: ExtrudeSolid = { _tag: "Extrude", profile, height }
      addSolid(solid)
      created++
    }
    void created
  }

  const onRevolve = () => {
    const selected = app.editor.selection()
    const drawing = app.drawing()
    const angle = revolveAngle()
    if (!Number.isFinite(angle) || angle === 0) return
    for (const id of selected) {
      const entity: Entity | undefined = drawing.entities.find((e) => e.id === id)
      if (entity === undefined) continue
      const rings = tessellate(entity, 0.1)
      const raw = rings[0]
      if (raw === undefined || raw.length < 2) continue
      // Profile lives in the (radius, Z) plane — map source Y → Z, source X → radius.
      const profile: ReadonlyArray<Vec2> = raw.map((p) => ({ x: p.x, y: p.y }))
      const solid: RevolveSolid = {
        _tag: "Revolve",
        profile,
        angle,
        segments: revolveSegments()
      }
      addSolid(solid)
    }
  }

  const selectedSolids = createMemo(() => app.editor.solidSelection())

  return (
    <div class="cad-card cad-3d-primitives">
      <div class="cad-panel-heading">
        <h3>{t("cad.primitives")}</h3>
        <CadButton label={open() ? t("cad.collapse") : t("cad.expand")} onClick={() => setOpen((v) => !v)}>
          <span aria-hidden="true">{open() ? "−" : "+"}</span>
        </CadButton>
      </div>
      <Show when={open()}>
        <div class="cad-3d-primitives-grid">
          <For each={PRIMITIVES}>
            {(primitive) => {
              const Icon = primitive.icon
              return (
                <CadButton label={t(primitive.label)} onClick={() => addSolid(primitive.defaults())}>
                  <Icon size={20} />
                  <span>{t(primitive.label)}</span>
                </CadButton>
              )
            }}
          </For>
        </div>

        <h4 class="cad-section-heading">{t("cad.extrude")}</h4>
        <div class="cad-field-row">
          <label class="cad-field">
            <span>{t("cad.extrusionHeight")}</span>
            <input
              type="number"
              step="0.1"
              value={extrudeHeight()}
              onInput={(event) => {
                const value = event.currentTarget.valueAsNumber
                if (Number.isFinite(value)) setExtrudeHeight(value)
              }}
            />
          </label>
          <CadButton
            label={t("cad.extrude")}
            disabled={app.editor.selection().length === 0}
            onClick={onExtrude}
          >
            <Layers size={16} />
            <span>{t("cad.extrude")}</span>
          </CadButton>
        </div>

        <h4 class="cad-section-heading">{t("cad.revolve")}</h4>
        <div class="cad-field-row">
          <label class="cad-field">
            <span>{t("cad.revolutionAngle")} (deg)</span>
            <input
              type="number"
              step="15"
              value={(revolveAngle() * 180) / Math.PI}
              onInput={(event) => {
                const value = event.currentTarget.valueAsNumber
                if (Number.isFinite(value)) setRevolveAngle((value * Math.PI) / 180)
              }}
            />
          </label>
          <label class="cad-field">
            <span>{t("cad.segments")}</span>
            <input
              type="number"
              min="8"
              max="512"
              step="8"
              value={revolveSegments()}
              onInput={(event) => {
                const value = event.currentTarget.valueAsNumber
                if (Number.isFinite(value)) setRevolveSegments(Math.max(8, Math.min(512, Math.round(value))))
              }}
            />
          </label>
          <CadButton
            label={t("cad.revolve")}
            disabled={app.editor.selection().length === 0}
            onClick={onRevolve}
          >
            <Play size={16} />
            <span>{t("cad.revolve")}</span>
          </CadButton>
        </div>

        <Show when={app.editor.solids().length > 0}>
          <h4 class="cad-section-heading">{t("cad.scene")}</h4>
          <ul class="cad-solid-list" aria-label={t("cad.scene")}>
            <For each={app.editor.solids()}>
              {(solid, index) => (
                <li
                  class="cad-solid-row"
                  classList={{ selected: selectedSolids().includes(index()) }}
                >
                  <button
                    type="button"
                    class="cad-solid-name"
                    onClick={() => app.editor.setSolidSelection([index()])}
                  >
                    <Box size={14} />
                    <span>
                      {solid._tag} <small>#{index()}</small>
                    </span>
                  </button>
                  <CadButton label={t("cad.deleteSolid")} onClick={() => app.editor.removeSolid(index())}>
                    <Trash2 size={14} />
                  </CadButton>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  )
}