import { Show, type JSX } from "solid-js"
import { SlidersVertical } from "lucide-solid"
import { cam } from "@cadcamfun/core"
import { useGeneratorStore, type ToolpathSettings } from "../../store/generatorStore.ts"
import { Badge, CheckRow, Field, INPUT, NumberField, Section } from "./ui.tsx"

const BLUE = "#4B83F0"

/** "Cutting Parameters": pass depth, feeds, stepover, tool offset and direction (with their sketches) and live statistics. */
export function CuttingSection(): JSX.Element {
  const gen = useGeneratorStore()
  const s = () => gen.settings
  const chipLoad = () => (s().feedrate / (s().rpm * s().flutes)).toFixed(3)
  const feedback = () => cam.generator.getCuttingFeedback(s())
  const recommendedPlunge = () => cam.generator.calculateRecommendedPlungeRate(s().feedrate)
  const stats = () => cam.generator.calculateCuttingStatistics(s())
  const effectiveStepover = () => (s().stepover / 100) * s().toolDiameter
  return (
    <Section id="cutting" icon={SlidersVertical} title="Cutting Parameters" testId="cutting-section">
      <Field label="Pass Depth (mm)">
        <NumberField min="0.1" step="0.1" value={s().stepdown} onValue={(value) => gen.updateSettings("stepdown", value)} />
        <div class="panel-row"><span>Min: 0.1 mm</span><span class="panel-row__value">Max recommended: 3 mm</span></div>
      </Field>

      <Field label="Feedrate (mm/min)">
        <NumberField min="1" int value={s().feedrate} onValue={(value) => gen.updateSettings("feedrate", value)} />
        <div class="panel-row"><span>Chip load per flute: {chipLoad()} mm</span></div>
        <Show when={feedback()}>
          <Badge tone={feedback().startsWith("✓") ? "ok" : "warn"}>{feedback().replace(/^(?:✓|⚠️?)\s*/u, "")}</Badge>
        </Show>
      </Field>

      <Field label="Entry Speed (mm/min)">
        <NumberField min="1" int value={s().plungerate} onValue={(value) => gen.updateSettings("plungerate", value)} />
        <div class="panel-row"><span>Recommended: {recommendedPlunge()} mm/min ({Math.round((recommendedPlunge() / s().feedrate) * 100)}% of feedrate)</span></div>
      </Field>

      <Field label="Stepover (% of diameter)">
        <NumberField min="10" max="90" int accept={(value) => value >= 10 && value <= 90} value={s().stepover} onValue={(value) => gen.updateSettings("stepover", value)} />
        <div class="panel-row"><span>Effective width: {effectiveStepover().toFixed(2)} mm</span></div>
      </Field>

      <Field label="Tool Offset" for="toolOffset">
        <select id="toolOffset" class={INPUT} value={s().offset} onChange={(event) => gen.updateSettings("offset", event.currentTarget.value as ToolpathSettings["offset"])}>
          <option value="outside">Outside</option>
          <option value="inside">Inside</option>
          <option value="center">Center</option>
        </select>
        <div class="mt-2 flex justify-center">
          <div class="w-48 h-32 max-w-full relative">
            <svg width="100%" height="100%" viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg">
              <Show when={s().offset === "center"}>
                <rect x="70" y="40" width="100" height="80" stroke={BLUE} stroke-width="2" stroke-dasharray="5,5" fill="none" />
                <circle cx="120" cy="40" r="4" fill={BLUE} />
                <line x1="120" y1="20" x2="120" y2="140" stroke={BLUE} stroke-width="1" stroke-dasharray="4,4" />
                <line x1="50" y1="80" x2="190" y2="80" stroke={BLUE} stroke-width="1" stroke-dasharray="4,4" />
              </Show>
              <Show when={s().offset === "outside"}>
                <rect x="70" y="40" width="100" height="80" stroke={BLUE} stroke-width="2" stroke-dasharray="5,5" fill="none" />
                <rect x="60" y="30" width="120" height="100" stroke={BLUE} stroke-width="2" fill="none" />
                <circle cx="60" cy="30" r="4" fill={BLUE} />
                <path d="M 60,30 L 70,40" stroke={BLUE} stroke-width="1" />
              </Show>
              <Show when={s().offset === "inside"}>
                <rect x="70" y="40" width="100" height="80" stroke={BLUE} stroke-width="2" stroke-dasharray="5,5" fill="none" />
                <rect x="80" y="50" width="80" height="60" stroke={BLUE} stroke-width="2" fill="none" />
                <circle cx="80" cy="50" r="4" fill={BLUE} />
                <path d="M 80,50 L 70,40" stroke={BLUE} stroke-width="1" />
              </Show>
            </svg>
          </div>
        </div>
      </Field>

      <Field label="Cutting Direction" for="cuttingDirection">
        <select id="cuttingDirection" class={INPUT} value={s().direction} onChange={(event) => gen.updateSettings("direction", event.currentTarget.value as ToolpathSettings["direction"])}>
          <option value="climb">Concordant (Climb)</option>
          <option value="conventional">Discordant (Conventional)</option>
        </select>
        <div class="mt-2 flex justify-center">
          <div class="w-48 h-32 max-w-full relative">
            <svg width="100%" height="100%" viewBox="0 0 240 160" xmlns="http://www.w3.org/2000/svg">
              <text x="120" y="30" text-anchor="middle" font-size="16" fill={BLUE}>{s().direction === "climb" ? "Concordant" : "Discordant"}</text>
              <circle cx="80" cy="80" r="40" fill="none" stroke="#aaa" stroke-width="1" />
              <circle cx="80" cy="80" r={s().direction === "climb" ? "14" : "8"} fill={BLUE} />
              <Show when={s().direction === "climb"}>
                <path d="M 80,80 Q 100,95 120,80" stroke={BLUE} stroke-width="2" fill="none" stroke-dasharray="4,3" />
                <path d="M 115,77 L 120,80 L 115,83" fill="none" stroke={BLUE} stroke-width="2" />
              </Show>
              <circle cx="160" cy="80" r="40" fill="none" stroke="#aaa" stroke-width="1" />
              <circle cx="160" cy="80" r={s().direction === "conventional" ? "14" : "8"} fill={BLUE} />
              <Show when={s().direction === "conventional"}>
                <path d="M 160,80 Q 140,65 120,80" stroke={BLUE} stroke-width="2" fill="none" stroke-dasharray="4,3" />
                <path d="M 125,77 L 120,80 L 125,83" fill="none" stroke={BLUE} stroke-width="2" />
              </Show>
            </svg>
          </div>
        </div>
      </Field>

      <CheckRow id="finishingPass" checked={s().finishingPass} onChange={(checked) => gen.updateSettings("finishingPass", checked)}>Add Finishing Pass</CheckRow>

      <Show when={s().finishingPass}>
        <Field label="Finishing Allowance (mm)">
          <NumberField min="0.05" max="1" step="0.05" value={s().finishingAllowance} onValue={(value) => gen.updateSettings("finishingAllowance", value)} />
        </Field>
      </Show>

      <div class="panel-group">
        <h4 class="panel-group__title">Cutting statistics</h4>
        <dl class="panel-kv">
          <dt>Cutting speed</dt><dd>{stats().cuttingSpeed.toFixed(1)} m/min</dd>
          <dt>Chip load per flute</dt><dd>{chipLoad()} mm</dd>
          <dt>Material removal rate</dt><dd>{stats().materialRemovalRate.toFixed(2)} cm³/min</dd>
          <dt>Effective stepover</dt><dd>{effectiveStepover().toFixed(2)} mm</dd>
        </dl>
      </div>
    </Section>
  )
}
