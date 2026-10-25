import { Show, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { t } from "../i18n/index.ts"
import { useApp } from "../shared/state/context.ts"
import { Modal } from "../shared/ui/modal.tsx"
import { toast } from "../shared/ui/toast.tsx"
import { projectSession } from "../features/projects/lib/project-session.ts"
import {
  checkForUpdates, decodeUpdateEvent, dismissUpdate, formatBytes, initialUpdateView, installFailed, installPendingUpdate, openReleaseNotes, percentOf,
  reduceUpdate, releaseNotesOf, reopenUpdate, restartAfterUpdate, type AvailableUpdate, type UpdateEvent, type UpdateView
} from "./updates.ts"

const PRIMARY = "rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
const SECONDARY = "rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"

/**
 * The update dialog (desktop shell only). It follows the shell's `update://status` events: a check the person asked for from the
 * menu bar is answered in every case (checking, up to date, failed), a release is offered with its notes and installed with a live
 * progress bar, and the finished install ends in a restart button. A critical release cannot be put off; anything else can, and a
 * download or a pending restart that is hidden stays on screen as a small chip.
 */
export function UpdatePrompt(): JSX.Element {
  const app = useApp()
  const [view, setView] = createSignal<UpdateView>(initialUpdateView)
  const [busy, setBusy] = createSignal(false)
  onMount(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return
    let off: (() => void) | undefined
    let gone = false
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      const stop = await listen<unknown>("update://status", (message) => {
        const next = decodeUpdateEvent(message.payload)
        if (next !== undefined) setView((current) => reduceUpdate(current, next))
      })
      if (gone) stop(); else off = stop
    }).catch(() => undefined)
    onCleanup(() => { gone = true; off?.() })
  })

  const fail = (cause: unknown): void => {
    const reason = (cause as { reason?: string } | null)?.reason
    toast.error(reason === "unsavedWork" ? t("update.unsavedWork") : t("update.failed"))
  }
  const install = async (): Promise<void> => {
    setBusy(true)
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      await installPendingUpdate(projectSession(app), invoke)
    } catch (cause) {
      fail(cause)
      setView(installFailed)
    } finally { setBusy(false) }
  }
  const restart = async (): Promise<void> => {
    setBusy(true)
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      await restartAfterUpdate(projectSession(app), invoke)
    } catch (cause) { fail(cause) } finally { setBusy(false) }
  }
  const retry = (): void => { setView((current) => ({ ...current, dialog: undefined })); void checkForUpdates().catch(() => undefined) }
  const close = (): void => { setView(dismissUpdate) }

  const dialog = (): UpdateEvent | undefined => view().minimized ? undefined : view().dialog
  const chip = (): UpdateEvent | undefined => view().minimized ? view().dialog : undefined
  const mustAnswer = (): boolean => { const current = dialog(); return current?.status === "available" && !current.dismissible }
  const percent = (current: Extract<UpdateEvent, { status: "downloading" }>): number | undefined => percentOf(current.downloaded, current.total)

  const title = (current: UpdateEvent): string => {
    switch (current.status) {
      case "checking": return t("update.title.checking")
      case "upToDate": return t("update.title.upToDate")
      case "available": return t(current.critical ? "update.title.critical" : "update.title.available")
      case "downloading": return t("update.title.downloading")
      case "ready": return t("update.title.ready")
      case "failed": return t("update.title.failed")
    }
  }
  const footer = (current: UpdateEvent): JSX.Element => {
    switch (current.status) {
      case "checking": return <button type="button" class={SECONDARY} onClick={close}>{t("update.hide")}</button>
      case "upToDate": return <button type="button" class={PRIMARY} onClick={close}>{t("update.ok")}</button>
      case "available": return <>
        <button type="button" class={`${SECONDARY} mr-auto`} onClick={() => void openReleaseNotes().catch(() => undefined)}>{t("update.releaseNotes")}</button>
        <Show when={current.dismissible}><button type="button" class={SECONDARY} onClick={close}>{t("update.later")}</button></Show>
        <button type="button" class={PRIMARY} disabled={busy()} onClick={() => void install()}>{t("update.install")}</button>
      </>
      case "downloading": return <button type="button" class={SECONDARY} onClick={close}>{t("update.hide")}</button>
      case "ready": return <>
        <button type="button" class={SECONDARY} onClick={close}>{t("update.later")}</button>
        <button type="button" class={PRIMARY} disabled={busy()} onClick={() => void restart()}>{t("update.restart")}</button>
      </>
      case "failed": return <>
        <button type="button" class={SECONDARY} onClick={close}>{t("update.close")}</button>
        <button type="button" class={PRIMARY} onClick={retry}>{t("update.retry")}</button>
      </>
    }
  }
  const body = (current: UpdateEvent): JSX.Element => {
    switch (current.status) {
      case "checking": return (
        <p class="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-200">
          <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" aria-hidden="true" />{t("update.checking")}
        </p>
      )
      case "upToDate": return <p class="text-sm text-gray-700 dark:text-gray-200">{t("update.upToDate", { version: current.version })}</p>
      case "available": return <AvailableBody update={current} />
      case "downloading": return (
        <div class="space-y-2" data-testid="update-progress">
          <p class="text-sm text-gray-700 dark:text-gray-200">{t("update.downloading")}</p>
          <div class="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent(current) ?? undefined} aria-label={t("update.downloading")}>
            <div class={`h-full bg-blue-600 transition-[width] ${percent(current) === undefined ? "w-1/3 animate-pulse" : ""}`} style={percent(current) === undefined ? undefined : { width: `${percent(current)}%` }} />
          </div>
          <p class="text-xs text-gray-500">
            {percent(current) === undefined ? formatBytes(current.downloaded) : `${percent(current)}% · ${formatBytes(current.downloaded)} / ${formatBytes(current.total ?? 0)}`}
          </p>
        </div>
      )
      case "ready": return <p class="text-sm text-gray-700 dark:text-gray-200">{t("update.ready", { version: current.version })}</p>
      case "failed": return <p role="alert" class="text-sm text-red-600 dark:text-red-400">{t("update.checkFailed")}<span class="mt-1 block text-xs text-gray-500">{current.message}</span></p>
    }
  }

  return <>
    <Modal open={dialog() !== undefined} onClose={() => { if (!mustAnswer()) close() }} closable={!mustAnswer()} title={dialog() === undefined ? undefined : title(dialog()!)} size="md" footer={dialog() === undefined ? undefined : footer(dialog()!)}>
      <div data-testid="update-prompt" role="status">{dialog() === undefined ? null : body(dialog()!)}</div>
    </Modal>
    <Show when={chip()}>{(current) => (
      <button type="button" data-testid="update-chip" onClick={() => { setView(reopenUpdate) }}
        class="fixed bottom-10 right-4 z-50 rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs text-gray-800 shadow-lg hover:bg-blue-50 dark:border-blue-800 dark:bg-gray-800 dark:text-gray-100">
        {current().status === "downloading" ? t("update.chip.downloading", { percent: String(percent(current() as Extract<UpdateEvent, { status: "downloading" }>) ?? "…") }) : t("update.chip.ready")}
      </button>
    )}</Show>
  </>
}

function AvailableBody(props: { readonly update: AvailableUpdate }): JSX.Element {
  const notes = (): string => releaseNotesOf(props.update.notes)
  return (
    <div class="space-y-3">
      <p class="text-sm text-gray-800 dark:text-gray-100">
        {props.update.current === undefined ? t("update.available", { version: props.update.version }) : t("update.availableFrom", { version: props.update.version, current: props.update.current })}
      </p>
      <Show when={props.update.critical}>
        <p role="alert" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{t("update.criticalNote")}</p>
      </Show>
      <Show when={notes() !== ""}>
        <div>
          <h4 class="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">{t("update.notes")}</h4>
          <pre data-testid="update-notes" class="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-gray-50 p-2 font-sans text-xs text-gray-700 dark:bg-gray-900 dark:text-gray-200">{notes()}</pre>
        </div>
      </Show>
      <p class="text-xs text-gray-500">{t("update.savesFirst")}</p>
    </div>
  )
}
