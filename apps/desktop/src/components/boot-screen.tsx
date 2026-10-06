/**
 * The splash shown while the sidecar boots, and the failure state with Retry /
 * "View logs" (spec 06-desktop-ui.md §1).
 */
import { Show, type JSX } from "solid-js"
import LoaderCircle from "lucide-solid/icons/loader-circle"
import Terminal from "lucide-solid/icons/terminal"
import Triangle from "lucide-solid/icons/triangle"
import { t } from "../i18n/index.ts"
import type { BootState } from "../state/client.ts"

export interface BootScreenProps {
  readonly state: BootState
  /** Seconds already waited, for the "waited N s" line. */
  readonly elapsedSeconds: number
  readonly onRetry: () => void
  /** Reveals the shell's log folder; absent outside Tauri. */
  readonly onViewLogs?: () => void
  readonly logsDir?: string
}

/** The splash. `state: "ready"` is never rendered — the shell takes over. */
export function BootScreen(props: BootScreenProps): JSX.Element {
  const failed = (): boolean => props.state._tag === "failed"
  const reason = (): string | undefined =>
    props.state._tag === "failed" ? props.state.reason : undefined

  return (
    <main
      class="flex h-screen w-screen items-center justify-center bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100"
      aria-busy={!failed()}
      aria-live="polite"
    >
      <div class="card w-full max-w-md p-6 text-center">
        <h1 class="text-2xl font-semibold">{t("boot.splashTitle")}</h1>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{t("app.tagline")}</p>

        <Show
          when={!failed()}
          fallback={
            <div class="mt-6 flex flex-col gap-3">
              <p class="flex items-start gap-2 text-left text-sm text-red-700 dark:text-red-300" role="alert">
                <Triangle size={18} aria-hidden="true" class="shrink-0" />
                <span>
                  <strong class="block">{t("boot.failedTitle")}</strong>
                  {t("boot.failedBody")}
                  <span class="mt-1 block font-mono text-xs opacity-80">{reason()}</span>
                </span>
              </p>
              <p class="text-xs text-gray-500">{t("boot.elapsed", { seconds: props.elapsedSeconds })}</p>
              <div class="flex justify-center gap-2">
                <button type="button" class="btn btn-primary" onClick={() => props.onRetry()}>
                  {t("boot.retry")}
                </button>
                <Show when={props.onViewLogs !== undefined}>
                  <button
                    type="button"
                    class="btn btn-outline"
                    onClick={() => props.onViewLogs?.()}
                  >
                    <Terminal size={16} aria-hidden="true" />
                    {t("boot.viewLogs")}
                  </button>
                </Show>
              </div>
              <Show when={props.logsDir !== undefined}>
                <p class="font-mono text-xs text-gray-500">{props.logsDir}</p>
              </Show>
            </div>
          }
        >
          <div class="mt-6 flex flex-col items-center gap-3">
            <LoaderCircle size={28} aria-hidden="true" class="animate-spin text-blue-600" />
            <p class="text-sm">
              {props.state._tag === "starting" ? t("boot.connecting") : t("boot.checking")}
            </p>
            <p class="text-xs text-gray-500">{t("boot.waiting")}</p>
            <p class="text-xs text-gray-500">{t("boot.elapsed", { seconds: props.elapsedSeconds })}</p>
          </div>
        </Show>
      </div>
    </main>
  )
}
