/**
 * The cycle palette (spec 73 §4): the probing cycles in groups (setup, 5-axis, calibration, tool setter, inspection). An entry the
 * machine cannot run is disabled and says why; the setup cycles are always open, because a machine without a stored probe plans with
 * the defaults of Settings > Machining.
 */
import { For, Show, type JSX } from "solid-js"
import { t } from "../../../../i18n/index.ts"
import type { MachineProfile } from "../../lib/probing/contract.ts"
import { PALETTE_GROUPS, availability, entriesOf, type PaletteEntry } from "../../lib/probing/cycle-palette.data.ts"
import { ProbeIcon } from "./ProbeIcons.tsx"

export function ProbeCyclePalette(props: { readonly profile: MachineProfile | undefined; onAdd(entry: PaletteEntry): void }): JSX.Element {
  return (
    <div class="probing-palette" data-testid="probe-palette">
      <For each={PALETTE_GROUPS}>{(group) => (
        <div class="probing-palette__group">
          <h4 class="probing-eyebrow">{t(group.label)}</h4>
          <div class="probing-palette__cells">
            <For each={entriesOf(group.id)}>{(entry) => {
              const state = () => availability(entry, props.profile)
              return (
                <button type="button" class="probing-cell" data-testid={`probe-add-${entry.id}`} disabled={!state().ok}
                  title={(() => { const s = state(); return s.ok ? t(entry.hint) : t(s.reason) })()}
                  onClick={() => props.onAdd(entry)}>
                  <ProbeIcon kind={entry.kind} size={18} />
                  <span>{t(entry.label)}</span>
                </button>
              )
            }}</For>
          </div>
          <Show when={entriesOf(group.id).every((entry) => !availability(entry, props.profile).ok)}>
            <p class="panel-hint">{(() => { const s = availability(entriesOf(group.id)[0]!, props.profile); return s.ok ? "" : t(s.reason) })()}</p>
          </Show>
        </div>
      )}</For>
    </div>
  )
}
