import { For, Show, createResource, createSignal, type JSX } from "solid-js"
import { History } from "lucide-solid"
import { Modal } from "../../../shared/ui/modal.tsx"
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
    <Modal open={props.open} onClose={props.onClose} title={t("save.versions.title")} size="md">
      <div class="px-6 py-4" data-testid="drawing-versions">
        <Show when={!versions.loading} fallback={<p class="text-sm text-gray-500">…</p>}>
          <Show when={(versions() ?? []).length > 0} fallback={<p class="text-sm text-gray-500 dark:text-gray-400">{t("save.versions.empty")}</p>}>
            <ul class="divide-y divide-gray-200 dark:divide-gray-700">
              <For each={versions()}>
                {(version) => (
                  <li class="flex items-center justify-between gap-3 py-2 text-sm">
                    <span>
                      <span class="block font-medium text-gray-900 dark:text-gray-100">{new Date(version.createdAt).toLocaleString()}</span>
                      <span class="text-xs text-gray-500 dark:text-gray-400">{t("save.versions.item", { version: version.version, elements: version.elements })}</span>
                    </span>
                    <button type="button" data-testid="restore-version" disabled={busy() !== undefined} onClick={() => void restore(version)}
                      class="flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-700">
                      <History size={14} />{t("save.versions.restore")}
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </div>
    </Modal>
  )
}
