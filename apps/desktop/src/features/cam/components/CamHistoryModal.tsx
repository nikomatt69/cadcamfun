import { For, Show, type JSX } from "solid-js"
import { Modal } from "../../../shared/ui/modal.tsx"
import { t } from "../../../i18n/index.ts"
import { useCamHistoryStore } from "../store/camHistoryStore.ts"

export default function CamHistoryModal(props: { readonly open: boolean; readonly onClose: () => void }): JSX.Element {
  const history = useCamHistoryStore()
  return <Modal open={props.open} variant="workspace" title={t("cam.history.title")} onClose={props.onClose}>
    <div class="px-6 py-4 space-y-3" data-testid="cam-history-dialog">
      <p class="text-xs text-[color:var(--ent-text-muted)]">{t("cam.history.hint")}</p>
      <ol class="space-y-2"><For each={history.entries}>{(entry, index) => <li>
        <button type="button" aria-current={index() === history.index ? "step" : undefined} class={`w-full rounded-[5px] border px-3 py-2 text-left text-xs ${index() === history.index ? "border-[color:var(--ent-accent)] bg-[color:var(--ent-accent-soft)]" : "border-[color:var(--ent-line)] hover:bg-[color:var(--ent-surface-subtle)]"}`} onClick={() => history.restore(index())}>
          <div class="flex justify-between gap-3"><span>{t(entry.label)}</span><time class="flex-none text-[11px] tabular-nums text-[color:var(--ent-text-muted)]">{new Date(entry.time).toLocaleTimeString()}</time></div>
          <div class="mt-1 text-[11px] text-[color:var(--ent-text-muted)]">{entry.snapshot.cam.gcode.split("\n").filter(Boolean).length} {t("save.ncLines")} · {entry.snapshot.cam.program.toolpaths.length} {t("save.toolpaths")}</div>
          <Show when={entry.snapshot.cam.kernelArtifact?.nc === entry.snapshot.cam.gcode}><span class="text-[11px] text-[color:var(--ent-accent)]">{entry.snapshot.cam.kernelArtifact?.release}</span></Show>
        </button>
      </li>}</For></ol>
    </div>
  </Modal>
}
