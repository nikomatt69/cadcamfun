import { For, Show, type JSX } from "solid-js"
import { Modal } from "../../../shared/ui/modal.tsx"
import { t } from "../../../i18n/index.ts"
import { useCamHistoryStore } from "../store/camHistoryStore.ts"

export default function CamHistoryModal(props: { readonly open: boolean; readonly onClose: () => void }): JSX.Element {
  const history = useCamHistoryStore()
  return <Modal open={props.open} variant="workspace" title={t("cam.history.title")} onClose={props.onClose}>
    <div class="px-6 py-4 space-y-3" data-testid="cam-history-dialog">
      <p class="text-sm text-gray-500 dark:text-gray-400">{t("cam.history.hint")}</p>
      <ol class="space-y-2"><For each={history.entries}>{(entry, index) => <li>
        <button type="button" aria-current={index() === history.index ? "step" : undefined} class={`w-full rounded-md border px-3 py-2 text-left text-sm ${index() === history.index ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30" : "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"}`} onClick={() => history.restore(index())}>
          <div class="flex justify-between gap-2"><span>{t(entry.label)}</span><time class="text-xs text-gray-500">{new Date(entry.time).toLocaleTimeString()}</time></div>
          <div class="mt-1 text-xs text-gray-500 dark:text-gray-400">{entry.snapshot.cam.gcode.split("\n").filter(Boolean).length} {t("save.ncLines")} · {entry.snapshot.cam.program.toolpaths.length} {t("save.toolpaths")}</div>
          <Show when={entry.snapshot.cam.kernelArtifact?.nc === entry.snapshot.cam.gcode}><span class="text-xs text-blue-600 dark:text-blue-400">{entry.snapshot.cam.kernelArtifact?.release}</span></Show>
        </button>
      </li>}</For></ol>
    </div>
  </Modal>
}
