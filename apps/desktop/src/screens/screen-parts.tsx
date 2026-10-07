/**
 * Shared screen furniture: the page heading and the loading / empty / error states.
 *
 * Every screen renders these instead of hand-writing the same markup, which is also why
 * there is a single place where `role="alert"` and `aria-busy` are decided.
 */
import { Show, type JSX } from "solid-js"
import LoaderCircle from "lucide-solid/icons/loader-circle"
import Triangle from "lucide-solid/icons/triangle"
import { t } from "../i18n/index.ts"

export interface ScreenHeaderProps {
  readonly title: string
  readonly subtitle?: string
  /** Buttons or filters on the right of the heading. */
  readonly actions?: JSX.Element
}

/** `h1` + subtitle + actions; every screen starts with exactly one `h1`. */
export function ScreenHeader(props: ScreenHeaderProps): JSX.Element {
  return (
    <header class="flex flex-wrap items-start gap-3 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
      <div class="min-w-0">
        <h1 class="text-xl font-semibold">{props.title}</h1>
        <Show when={props.subtitle !== undefined}>
          <p class="text-sm text-gray-600 dark:text-gray-300">{props.subtitle}</p>
        </Show>
      </div>
      <Show when={props.actions !== undefined}>
        <div class="ml-auto flex items-center gap-2">{props.actions}</div>
      </Show>
    </header>
  )
}

/** Centred spinner with an accessible label. */
export function LoadingState(props: { readonly label: string }): JSX.Element {
  return (
    <div class="flex items-center gap-2 p-6 text-sm text-gray-600 dark:text-gray-300" aria-busy="true">
      <LoaderCircle size={18} aria-hidden="true" class="animate-spin" />
      <span>{props.label}</span>
    </div>
  )
}

export function EmptyState(props: { readonly label: string }): JSX.Element {
  return (
    <p class="p-6 text-sm text-gray-500 dark:text-gray-400">{props.label}</p>
  )
}

export function ErrorState(props: { readonly label: string; readonly detail?: string; readonly onRetry?: () => void }): JSX.Element {
  return (
    <div class="alert alert-danger flex items-start gap-2" role="alert">
      <Triangle size={18} aria-hidden="true" class="shrink-0" />
      <span class="flex-1">
        {props.label}
        <Show when={props.detail !== undefined}>
          <span class="mt-1 block font-mono text-xs opacity-80">{props.detail}</span>
        </Show>
      </span>
      <Show when={props.onRetry !== undefined}>
        <button type="button" class="btn btn-secondary shrink-0" onClick={() => props.onRetry?.()}>{t("common.retry")}</button>
      </Show>
    </div>
  )
}

/** A live region for "saved"/"deleted" confirmations. */
export function Toast(props: { readonly message: string | undefined }): JSX.Element {
  return (
    <Show when={props.message !== undefined}>
      <p class="alert alert-success" role="status">{props.message}</p>
    </Show>
  )
}

/** Formats an ISO timestamp for a table cell; empty string when unparsable. */
export const formatDate = (iso: string): string => {
  const parsed = Date.parse(iso)
  return Number.isNaN(parsed) ? "" : new Date(parsed).toISOString().slice(0, 16).replace("T", " ")
}
