/**
 * Status pill — same primitive iOS uses for state, just rendered with our typographic stack.
 * The dot is optional so it can also label PRs, runs, branches and AI authorship.
 */
import { Show, type JSX } from "solid-js"

export type PillTone = "neutral" | "success" | "danger" | "warning" | "accent" | "ai"

export interface PillProps {
  readonly tone?: PillTone
  readonly dot?: boolean
  readonly children: JSX.Element
  readonly class?: string
}

export const Pill = (props: PillProps): JSX.Element => (
  <span class={`pill${props.tone && props.tone !== "neutral" ? ` ${props.tone}` : ""}${props.class ? ` ${props.class}` : ""}`}>
    <Show when={props.dot}>
      <span class="dot" aria-hidden="true" />
    </Show>
    {props.children}
  </span>
)