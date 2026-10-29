/**
 * One layer of the printed program, drawn from the G-code itself: every bead of the layer coloured by what it is (walls, skin,
 * infill, bridges, supports, adhesion), over the plate. The slider walks the layers; nothing here is a sketch of the settings.
 */
import { For, Show, createEffect, createMemo, createSignal, type JSX } from "solid-js"
import { cam } from "@cadcamfun/core"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { Field } from "./ui.tsx"
import { t } from "../../../../i18n/index.ts"

const COLOUR: Readonly<Record<string, string>> = {
  "WALL-OUTER": "#2557d6", "WALL-INNER": "#6b95f2", SKIN: "#1d9a6c", FILL: "#c58a1b", BRIDGE: "#8a55c8",
  SUPPORT: "#9aa4b2", "SUPPORT-INTERFACE": "#6e7a8a", BRIM: "#b0b6c0", SKIRT: "#b0b6c0", RAFT: "#b0b6c0"
}
const LABEL: Readonly<Record<string, string>> = {
  "WALL-OUTER": "Outer wall", "WALL-INNER": "Inner wall", SKIN: "Top and bottom", FILL: "Infill", BRIDGE: "Bridge", SUPPORT: "Support", "SUPPORT-INTERFACE": "Interface", BRIM: "Adhesion", SKIRT: "Adhesion", RAFT: "Adhesion"
}

export function PrintLayerPreview(): JSX.Element {
  const gen = useGeneratorStore()
  const [layer, setLayer] = createSignal(0)
  let canvas: HTMLCanvasElement | undefined
  /** The beads of the program by layer; read once per program. */
  const beads = createMemo(() => {
    const code = gen.currentGCode
    if (code === "" || gen.settings.machineType !== "3dprinter") return undefined
    const { beads: all } = cam.print.replayBeads(code)
    const byLayer = new Map<number, typeof all>()
    // Beads before the first layer marker are the purge line of the start block, not part of any layer.
    for (const bead of all) { if (bead.layer < 0) continue; const list = byLayer.get(bead.layer); if (list) list.push(bead); else byLayer.set(bead.layer, [bead]) }
    const layers = [...byLayer.keys()].sort((a, b) => a - b)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const bead of all) {
      if (bead.layer < 0) continue
      minX = Math.min(minX, bead.x0, bead.x1); maxX = Math.max(maxX, bead.x0, bead.x1)
      minY = Math.min(minY, bead.y0, bead.y1); maxY = Math.max(maxY, bead.y0, bead.y1)
    }
    return { byLayer, layers, box: { minX, minY, maxX, maxY } }
  })
  const current = () => beads()?.layers[Math.min(layer(), (beads()?.layers.length ?? 1) - 1)]
  const kinds = (): string[] => {
    const data = beads()
    const index = current()
    if (!data || index === undefined) return []
    return [...new Set((data.byLayer.get(index) ?? []).map((b) => LABEL[b.kind] ?? b.kind))]
  }

  createEffect(() => {
    const data = beads()
    const index = current()
    if (!data || index === undefined || !canvas) return
    try {
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      const { width, height } = canvas
      ctx.clearRect(0, 0, width, height)
      const { minX, minY, maxX, maxY } = data.box
      const span = Math.max(1, maxX - minX, maxY - minY)
      const scale = (Math.min(width, height) - 24) / span
      const ox = (width - (maxX - minX) * scale) / 2 - minX * scale
      const oy = (height + (maxY - minY) * scale) / 2 + minY * scale
      ctx.lineCap = "round"
      ctx.lineWidth = Math.max(1, 0.4 * scale)
      for (const bead of data.byLayer.get(index) ?? []) {
        ctx.strokeStyle = COLOUR[bead.kind] ?? "#888"
        ctx.beginPath()
        ctx.moveTo(ox + bead.x0 * scale, oy - bead.y0 * scale)
        ctx.lineTo(ox + bead.x1 * scale, oy - bead.y1 * scale)
        ctx.stroke()
      }
    } catch { /* no 2D context (test DOM): the canvas stays blank */ }
  })

  return (
    <Show when={beads()}>
      {(data) => (
        <div class="panel-group" data-testid="print-layer-preview">
          <h4 class="panel-group__title">{t("cam.gen.layerPreview")}</h4>
          <canvas ref={canvas} width={320} height={260} style={{ width: "100%", height: "auto", border: "1px solid var(--panel-border)", "border-radius": "4px", background: "var(--panel-bg)" }} />
          <Field label={`Layer ${Math.min(layer(), data().layers.length - 1) + 1} of ${data().layers.length}`}>
            <input type="range" class="panel-range" min="0" max={Math.max(0, data().layers.length - 1)} value={layer()} aria-label={t("cad.layer")} onInput={(event) => setLayer(parseInt(event.currentTarget.value))} />
          </Field>
          <div class="panel-hint" style={{ display: "flex", "flex-wrap": "wrap", gap: "6px 10px" }}>
            <For each={Object.entries(COLOUR).filter(([k]) => kinds().includes(LABEL[k] ?? k)).filter(([k], i, all) => all.findIndex(([j]) => LABEL[j] === LABEL[k]) === i)}>
              {([kind, colour]) => <span><span style={{ display: "inline-block", width: "8px", height: "8px", "border-radius": "2px", background: colour, "margin-right": "4px" }} />{LABEL[kind]}</span>}
            </For>
          </div>
        </div>
      )}
    </Show>
  )
}
