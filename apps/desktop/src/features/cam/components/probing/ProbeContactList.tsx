/** The touches of a run (spec 73 §4): where each made contact and how far from where the drawn part would have stopped it; a row highlights its contact in the 3D view. */
import { For, Show, type JSX } from "solid-js"
import { t } from "../../../../i18n/index.ts"
import type { ProbeContact, ProbeSimContact } from "../../lib/probing/contract.ts"

const fixed = (n: number): string => { const r = Math.round(n * 1000) / 1000; return (r === 0 ? 0 : r).toFixed(3) }

export const deviationOf = (contact: ProbeSimContact, expected: ProbeContact | undefined): number | undefined =>
  expected === undefined ? undefined : Math.hypot(contact.tip.x - expected.expected.x, contact.tip.y - expected.expected.y, contact.tip.z - expected.expected.z)

export function ProbeContactList(props: {
  readonly contacts: ReadonlyArray<ProbeSimContact>
  readonly expected: ReadonlyArray<ProbeContact>
  readonly highlighted: number | undefined
  onHighlight(index: number | undefined): void
}): JSX.Element {
  return (
    <Show when={props.contacts.length > 0}>
      <ol class="probing-contacts" data-testid="probe-contacts" aria-label={t("cam.probing.contacts")}>
        <For each={props.contacts}>{(contact, index) => {
          const deviation = () => deviationOf(contact, props.expected[index()])
          return (
            <li>
              <button type="button" class="probing-contact" aria-pressed={props.highlighted === index()} data-testid={`probe-contact-${index()}`}
                onClick={() => props.onHighlight(props.highlighted === index() ? undefined : index())}>
                <span class="probing-contact__no">{index() + 1}</span>
                <span class="probing-contact__name">{contact.name ?? props.expected[index()]?.name ?? ""}</span>
                <span class="probing-contact__pos">{fixed(contact.tip.x)} {fixed(contact.tip.y)} {fixed(contact.tip.z)}</span>
                <Show when={deviation() !== undefined}><span class="probing-contact__dev">{fixed(deviation()!)}</span></Show>
              </button>
            </li>
          )
        }}</For>
      </ol>
    </Show>
  )
}
