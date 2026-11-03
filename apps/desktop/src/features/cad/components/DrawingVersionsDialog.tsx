import { For, Show, createResource, createSignal, type JSX } from "solid-js"
import { History } from "lucide-solid"
import { Modal } from "../../../shared/ui/modal.tsx"
import { LoadingState } from "../../../shared/components/screen-parts.tsx"
import { toast } from "../../../shared/ui/toast.tsx"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { projectSession } from "../../projects/lib/project-session.ts"
import { useDocumentStore } from "../store/documentStore.ts"
import { applyStoredDrawing } from "../lib/open-drawing.ts"

interface Version { readonly id: string; readonly version: number; readonly createdAt: string; readonly elements: number }

/**
 * The open drawing's restore points: the documents its saves replaced. Restoring first saves what the editor holds (so nothing
 * typed since the last save is lost), then puts the chosen version back; the document it replaces becomes a restore point too,
 * so a restore can itself be undone.
 */
export default function DrawingVersionsDialog(props: { readonly open: boolean; readonly onClose: () => void }): JSX.Element {
  const app = useApp()
  const [busy, setBusy] = createSignal<string>()
  const drawingId = (): string | undefined => (props.open ? useDocumentStore.getState().drawingId ?? undefined : undefined)
  const [versions, { refetch }] = createResource(drawingId, (id) =>
    app.runtime.run(app.client.drawings.versions({ params: { id } })) as Promise<ReadonlyArray<Version>>)

  const restore = async (version: Version): Promise<void> => {
    const id = useDocumentStore.getState().drawingId
    if (id === null || busy() !== undefined) return
    setBusy(version.id)
    try {
      const session = projectSession(app)
      await session.document.saveNow("manual")
      await app.runtime.run(app.client.drawings.restoreVersion({ params: { id, versionId: version.id } }))
      applyStoredDrawing(app, await app.runtime.run(app.client.drawings.get({ params: { id } })))
      await session.document.baseline()
      toast.success(t("save.versions.restored", { version: version.version }))
      await refetch()
    } catch {
      toast.error(t("save.versions.failed"))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <Modal open={props.open} onClose={() => { if (busy() === undefined) props.onClose() }} title={t("save.versions.title")} size="md">
      <div class="px-6 py-4" data-testid="drawing-versions">
        <Show when={!versions.loading} fallback={<LoadingState label={t("common.loading")} rows={2} />}>
          <Show when={!versions.error} fallback={<div role="alert" class="flex flex-wrap items-center justify-between gap-3 text-sm text-[color:var(--ent-bad)]"><span>{t("common.error")}</span><button type="button" class="rounded-md border border-[color:var(--ent-line-strong)] px-3 py-1 text-sm text-[color:var(--ent-text)] hover:bg-[color:var(--ent-surface-subtle)]" onClick={() => void refetch()}>{t("common.retry")}</button></div>}>
          <Show when={(versions() ?? []).length > 0} fallback={<p class="text-sm text-[color:var(--ent-text-muted)]">{t("save.versions.empty")}</p>}>
            <ul class="divide-y divide-[color:var(--ent-line)]">
              <For each={versions()}>
                {(version) => (
                  <li class="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <span>
                      <time class="block font-medium tabular-nums text-[color:var(--ent-text)]" dateTime={version.createdAt}>{new Date(version.createdAt).toLocaleString()}</time>
                      <span class="text-xs text-[color:var(--ent-text-muted)]">{t("save.versions.item", { version: version.version, elements: version.elements })}</span>
                    </span>
                    <button type="button" data-testid="restore-version" disabled={busy() !== undefined} aria-label={`${t("save.versions.restore")}: ${t("save.versions.item", { version: version.version, elements: version.elements })}`} onClick={() => void restore(version)}
                      class="flex items-center gap-1 rounded-md border border-[color:var(--ent-line-strong)] px-3 py-1 text-sm hover:bg-[color:var(--ent-surface-subtle)] disabled:opacity-50">
                      <History size={14} />{t("save.versions.restore")}
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          </Show>
        </Show>
      </div>
    </Modal>
  )
}
