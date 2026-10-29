/**
 * What the slicer measured on the program it wrote: time, filament, size, and where the bead went. These are read off the emitted
 * moves (length, layer height, speed, retractions), not guessed from the bounding box.
 */
import { For, Show, type JSX } from "solid-js"
import { Gauge } from "lucide-solid"
import { useGeneratorStore } from "../../store/generatorStore.ts"
import { PrintLayerPreview } from "./PrintLayerPreview.tsx"
import { Note, Section, Stat } from "./ui.tsx"
import { t } from "../../../../i18n/index.ts"

const KIND_LABEL: Readonly<Record<string, string>> = {
  "wall-outer": "Outer wall", "wall-inner": "Inner walls", skin: "Top and bottom", infill: "Infill", bridge: "Bridges",
  support: "Support", "support-interface": "Support interface", skirt: "Skirt", brim: "Brim", raft: "Raft", vase: "Spiral wall"
}

export const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : m > 0 ? `${m} min ${String(total % 60).padStart(2, "0")} s` : `${total} s`
}

export function PrintResultSection(): JSX.Element {
  const gen = useGeneratorStore()
  return (
    <Show when={gen.settings.machineType === "3dprinter"}>
      <Section id="printResult" icon={Gauge} title={t("cam.gen.pr.title")} summary={gen.printStats ? `${formatDuration(gen.printStats.timeSeconds)} · ${gen.printStats.filamentGrams.toFixed(1)} g` : undefined} testId="print-result-section">
        <Show when={gen.printStats} fallback={<Note>{t("cam.gen.pr.hint")}</Note>}>
          {(stats) => {
            const total = (): number => Object.values(stats().lengthByKind).reduce((a, b) => a + b, 0)
            const rows = (): Array<readonly [string, number]> => Object.entries(stats().lengthByKind).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
            return (
              <>
                <div class="panel-stats" data-testid="print-stats">
                  <Stat label={t("cam.gen.kp.printTime")} value={formatDuration(stats().timeSeconds)} />
                  <Stat label={t("cam.gen.pp.filament")} value={`${stats().filamentGrams.toFixed(1)} g`} sub={`${(stats().filamentMm / 1000).toFixed(2)} m`} />
                  <Stat label={t("cam.layers")} value={String(stats().layers)} />
                  <Stat label={t("cad.status.size")} value={`${stats().size.x.toFixed(1)} x ${stats().size.y.toFixed(1)} x ${stats().size.z.toFixed(1)}`} sub="mm" />
                </div>
                <div class="panel-bars" data-testid="print-bars">
                  <For each={rows()}>
                    {([kind, length]) => (
                      <div class="panel-bar">
                        <span>{KIND_LABEL[kind] ?? kind}</span>
                        <span class="panel-bar__track"><span class="panel-bar__fill" style={{ width: `${(100 * length) / Math.max(1, total())}%`, display: "block" }} /></span>
                        <span class="panel-bar__value">{(length / 1000).toFixed(2)} m</span>
                      </div>
                    )}
                  </For>
                </div>
                <PrintLayerPreview />
                <dl class="panel-kv">
                  <dt>{t("cam.gen.pp.travel")}</dt><dd>{(stats().travelMm / 1000).toFixed(2)} m</dd>
                  <dt>{t("cam.gen.pr.retractions")}</dt><dd>{stats().retractions}</dd>
                </dl>
              </>
            )
          }}
        </Show>
      </Section>
    </Show>
  )
}
