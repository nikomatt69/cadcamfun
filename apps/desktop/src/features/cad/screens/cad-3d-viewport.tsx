/**
 * 3D viewport settings panel — lighting, material, section plane and scene
 * outliner. Mirrors the legacy TransformControlPanel and View3D settings UI.
 *
 * Apple-design principles applied here:
 *  - Specific labels ("Reset camera", not "Cancel"); every control names what it does.
 *  - 1:1 drag tracking for sliders via Pointer Events + `setPointerCapture`.
 *  - Status feedback is proximate: the scene outliner sits next to the
 *    viewport it controls, and the active selection is visually anchored.
 *  - Reduced-motion safe: numeric changes use CSS opacity transitions, no
 *    springs on toggle switches.
 */
import { For, Show, createMemo, createSignal } from "solid-js"
import { Eye, Lightbulb, Layers, Scissors, Box, Sun, Moon, Aperture } from "lucide-solid"
import { useApp } from "../../../shared/state/context.ts"
import { t, type Key } from "../../../i18n/index.ts"
import { CadButton } from "./cad-controls.tsx"

interface SliderProps {
  readonly label: string
  readonly min: number
  readonly max: number
  readonly step: number
  readonly value: number
  readonly onChange: (value: number) => void
}

/** Pointer-driven slider: press, drag, release with 1:1 tracking (Apple §2, §10). */
function CadSlider(props: SliderProps) {
  let track: HTMLDivElement | undefined
  let drag: { pointer: number; startX: number; startValue: number } | undefined
  const update = (event: PointerEvent) => {
    if (!drag || !track) return
    const rect = track.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const range = props.max - props.min
    const raw = props.min + ratio * range
    const stepped = Math.round(raw / props.step) * props.step
    props.onChange(Math.max(props.min, Math.min(props.max, stepped)))
  }
  return (
    <div class="cad-slider">
      <div class="cad-slider-row">
        <span>{props.label}</span>
        <span class="cad-slider-value">{props.value.toFixed(2)}</span>
      </div>
      <div
        ref={track}
        class="cad-slider-track"
        role="slider"
        tabIndex={0}
        aria-label={props.label}
        aria-valuemin={props.min}
        aria-valuemax={props.max}
        aria-valuenow={props.value}
        onPointerDown={(event) => {
          if (event.button !== 0 || !track) return
          drag = { pointer: event.pointerId, startX: event.clientX, startValue: props.value }
          track.setPointerCapture(event.pointerId)
          update(event)
        }}
        onPointerMove={update}
        onPointerUp={(event) => {
          if (drag?.pointer === event.pointerId) {
            drag = undefined
            track?.releasePointerCapture(event.pointerId)
          }
        }}
        onPointerCancel={() => (drag = undefined)}
      >
        <div class="cad-slider-fill" style={{ width: `${((props.value - props.min) / (props.max - props.min)) * 100}%` }} />
      </div>
    </div>
  )
}

interface ToggleProps {
  readonly label: string
  readonly value: boolean
  readonly onChange: (value: boolean) => void
}

function CadToggle(props: ToggleProps) {
  return (
    <button
      type="button"
      class="cad-setting-toggle"
      role="switch"
      aria-checked={props.value}
      aria-label={props.label}
      onClick={() => props.onChange(!props.value)}
    >
      <span>{props.label}</span>
      <span class="cad-switch" data-on={props.value}>
        <span />
      </span>
    </button>
  )
}

/** Defaults for the 3D viewport settings store. */
export interface ViewportSettings {
  ambient: number
  directional: number
  hemisphere: number
  material: {
    color: string
    metalness: number
    roughness: number
    opacity: number
  }
  section: {
    enabled: boolean
    axis: "x" | "y" | "z"
    position: number
    inverted: boolean
  }
  showScene: boolean
}

export const DEFAULT_VIEWPORT_SETTINGS: ViewportSettings = {
  ambient: 0.4,
  directional: 1.5,
  hemisphere: 1.0,
  material: { color: "#94a3b8", metalness: 0.2, roughness: 0.65, opacity: 1 },
  section: { enabled: false, axis: "z", position: 0, inverted: false },
  showScene: true
}

export function Cad3DViewportSettings(props: {
  readonly settings: ViewportSettings
  readonly onSettings: (next: ViewportSettings) => void
}) {
  const app = useApp()
  const [tab, setTab] = createSignal<"lighting" | "material" | "section" | "scene">("lighting")
  const update = (patch: Partial<ViewportSettings>) =>
    props.onSettings({ ...props.settings, ...patch })

  const selectedSolids = createMemo(() => app.editor.solidSelection())

  return (
    <div class="cad-card cad-3d-viewport">
      <div class="cad-panel-heading">
        <h3>{t("cad.viewSettings")}</h3>
      </div>
      <div class="cad-tabs" role="tablist" aria-label={t("cad.viewSettings")}>
        <For each={["lighting", "material", "section", "scene"] as const}>
          {(id) => (
            <button
              role="tab"
              aria-selected={tab() === id}
              aria-label={t(`cad.tab.${id}` as Key)}
              title={t(`cad.tab.${id}` as Key)}
              onClick={() => setTab(id)}
            >
              {id === "lighting" ? <Sun size={16} /> : id === "material" ? <Aperture size={16} /> : id === "section" ? <Scissors size={16} /> : <Layers size={16} />}
              <Show when={id === "lighting" || id === "material" || id === "scene"}>{t(`cad.tab.${id}` as Key)}</Show>
            </button>
          )}
        </For>
      </div>
      <div class="cad-sidebar-content" role="tabpanel">
        <Show when={tab() === "lighting"}>
          <CadSlider
            label={t("cad.ambientLight")}
            min={0}
            max={2}
            step={0.05}
            value={props.settings.ambient}
            onChange={(ambient) => update({ ambient })}
          />
          <CadSlider
            label={t("cad.directionalLight")}
            min={0}
            max={4}
            step={0.05}
            value={props.settings.directional}
            onChange={(directional) => update({ directional })}
          />
          <CadSlider
            label={t("cad.hemisphereLight")}
            min={0}
            max={2}
            step={0.05}
            value={props.settings.hemisphere}
            onChange={(hemisphere) => update({ hemisphere })}
          />
        </Show>

        <Show when={tab() === "material"}>
          <label class="cad-field">
            <span>{t("cad.material.color")}</span>
            <input
              type="color"
              value={props.settings.material.color}
              onInput={(event) =>
                update({ material: { ...props.settings.material, color: event.currentTarget.value } })
              }
            />
          </label>
          <CadSlider
            label={t("cad.material.metalness")}
            min={0}
            max={1}
            step={0.01}
            value={props.settings.material.metalness}
            onChange={(metalness) =>
              update({ material: { ...props.settings.material, metalness } })
            }
          />
          <CadSlider
            label={t("cad.material.roughness")}
            min={0}
            max={1}
            step={0.01}
            value={props.settings.material.roughness}
            onChange={(roughness) =>
              update({ material: { ...props.settings.material, roughness } })
            }
          />
          <CadSlider
            label={t("cad.material.opacity")}
            min={0.1}
            max={1}
            step={0.01}
            value={props.settings.material.opacity}
            onChange={(opacity) =>
              update({ material: { ...props.settings.material, opacity } })
            }
          />
        </Show>

        <Show when={tab() === "section"}>
          <CadToggle
            label={t("cad.section.enable")}
            value={props.settings.section.enabled}
            onChange={(enabled) =>
              update({ section: { ...props.settings.section, enabled } })
            }
          />
          <label class="cad-field">
            <span>{t("cad.section.axis")}</span>
            <select
              value={props.settings.section.axis}
              onChange={(event) =>
                update({
                  section: {
                    ...props.settings.section,
                    axis: event.currentTarget.value as "x" | "y" | "z"
                  }
                })
              }
            >
              <option value="x">X</option>
              <option value="y">Y</option>
              <option value="z">Z</option>
            </select>
          </label>
          <CadSlider
            label={t("cad.section.constant")}
            min={-100}
            max={100}
            step={0.5}
            value={props.settings.section.position}
            onChange={(position) =>
              update({ section: { ...props.settings.section, position } })
            }
          />
          <CadToggle
            label={t("cad.section.invert")}
            value={props.settings.section.inverted}
            onChange={(inverted) =>
              update({ section: { ...props.settings.section, inverted } })
            }
          />
        </Show>

        <Show when={tab() === "scene"}>
          <p class="cad-hint">{t("cad.scene.hint")}</p>
          <Show
            when={app.editor.solids().length > 0}
            fallback={<div class="cad-empty">{t("cad.scene.empty")}</div>}
          >
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
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </div>
    </div>
  )
}

void Eye
void Lightbulb
void Moon