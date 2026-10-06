import { Show, type JSX } from "solid-js"
import messages from "../i18n/en.legacy.json" with { type: "json" }
import { en, format, type Placeholders } from "../i18n/index.ts"
import { ErrorState, LoadingState } from "./screen-parts.tsx"

// Local fallback keeps these screens usable until the integrating agent registers this table.
export const lt = (key: keyof typeof messages, values?: Placeholders): string =>
  format(en[key] ?? messages[key], values)

export function LegacyNotice(props: { readonly message: string }): JSX.Element {
  return <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100" role="status">
    <strong class="mb-1 block">{lt("legacy.unavailable")}</strong>{props.message}
  </div>
}

export function LegacyReadState(props: { readonly loading: boolean; readonly error: string | undefined; readonly retry: () => unknown }): JSX.Element {
  return <>
    <Show when={props.loading}><LoadingState label={lt("legacy.loading")} /></Show>
    <Show when={props.error}>
      <ErrorState label={lt("legacy.error")} detail={props.error} />
      <button class="btn btn-outline" onClick={() => void props.retry()}>{lt("legacy.retry")}</button>
    </Show>
  </>
}
