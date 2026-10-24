import { Show, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { t } from "../i18n/index.ts"
import { useApp } from "../shared/state/context.ts"
import { toast } from "../shared/ui/toast.tsx"
import { projectSession } from "../features/projects/lib/project-session.ts"
import { decodeUpdateEvent, installPendingUpdate, type UpdateEvent } from "./updates.ts"

/** The update banner: a release is available (critical ones cannot be dismissed), downloading, ready. Desktop shell only. */
export function UpdatePrompt(): JSX.Element {
  const app = useApp()
  const [event, setEvent] = createSignal<UpdateEvent>()
  const [dismissed, setDismissed] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  onMount(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return
    let off: (() => void) | undefined
    let gone = false
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      const stop = await listen<unknown>("update://status", (message) => {
        const next = decodeUpdateEvent(message.payload)
        if (next !== undefined && next.status !== "checking" && next.status !== "upToDate") { setEvent(next); setDismissed(false) }
      })
      if (gone) stop(); else off = stop
    }).catch(() => undefined)
    onCleanup(() => { gone = true; off?.() })
  })
  const install = async (): Promise<void> => {
    setBusy(true)
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      await installPendingUpdate(projectSession(app), invoke)
    } catch (cause) {
      const reason = (cause as { reason?: string } | null)?.reason
      toast.error(reason === "unsavedWork" ? t("update.unsavedWork") : t("update.failed"))
    } finally { setBusy(false) }
  }
  const view = () => { const current = event(); return current && current.status !== "failed" && !dismissed() ? current : undefined }
  return (
    <Show when={view()}>
      {(current) => (
        <div role="status" data-testid="update-prompt" class="fixed bottom-10 right-4 z-50 flex max-w-sm items-center gap-3 rounded-lg border border-blue-200 bg-white p-3 text-sm shadow-lg dark:border-blue-800 dark:bg-gray-800">
          <span class="text-gray-800 dark:text-gray-100">
            {current().status === "available" ? t("update.available", { version: (current() as { version: string }).version })
              : current().status === "downloading" ? t("update.downloading") : t("update.ready")}
          </span>
          <Show when={current().status === "available"}>
            <button type="button" disabled={busy()} onClick={() => void install()} class="rounded-md bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 disabled:opacity-50">{t("update.install")}</button>
            <Show when={(current() as { dismissible?: boolean }).dismissible}>
              <button type="button" onClick={() => setDismissed(true)} class="text-gray-500 hover:text-gray-700">{t("update.later")}</button>
            </Show>
          </Show>
        </div>
      )}
    </Show>
  )
}
