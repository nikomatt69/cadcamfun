import { For, Show, createEffect, createSignal, onCleanup, type JSX } from "solid-js"
import { Schema } from "effect"
import { SavedCamProgram } from "../lib/saved-program.ts"
import { Modal } from "../../../shared/ui/modal.tsx"
import { t } from "../../../i18n/index.ts"

interface Props {
  readonly open: boolean
  readonly hasProgram: boolean
  readonly onClose: () => void
  readonly onOpen: (file: File) => void
}

const SUPPORTED = /\.(nc|gcode|ngc|tap|cnc|txt|h|mpf|spf|min|json)$/i
const pathOf = (file: File): string => file.webkitRelativePath || file.name

/** Keep separate NC programs separate: a folder is a list of candidates, never a concatenated program. */
export default function CamImportDialog(props: Props): JSX.Element {
  const [files, setFiles] = createSignal<ReadonlyArray<File>>([])
  const [skipped, setSkipped] = createSignal<ReadonlyArray<{ path: string; reason: string }>>([])
  const [busy, setBusy] = createSignal(false)
  let generation = 0
  createEffect(() => { if (!props.open) { generation++; setBusy(false) } })
  onCleanup(() => { generation++ })
  const choose = async (event: Event): Promise<void> => {
    const input = event.currentTarget as HTMLInputElement
    const chosen = Array.from(input.files ?? [])
    input.value = ""
    if (!chosen.length || busy()) return
    const run = ++generation
    const accepted: File[] = [], rejected: Array<{ path: string; reason: string }> = []
    setBusy(true); setFiles([]); setSkipped([])
    for (const file of chosen) {
      if (file.name.startsWith(".")) continue
      if (!SUPPORTED.test(file.name)) { rejected.push({ path: pathOf(file), reason: t("cam.batch.unsupported") }); continue }
      try {
        const text = await file.text()
        if (!text.trim() || text.includes("\0")) throw new Error(t("cam.batch.invalidFile"))
        if (/\.json$/i.test(file.name)) Schema.decodeUnknownSync(SavedCamProgram)(JSON.parse(text))
        accepted.push(file)
      } catch { rejected.push({ path: pathOf(file), reason: t("cam.batch.invalidFile") }) }
      if (generation !== run) return
    }
    if (generation !== run) return
    setFiles(accepted.sort((a, b) => pathOf(a).localeCompare(pathOf(b))))
    setSkipped(rejected.sort((a, b) => a.path.localeCompare(b.path)))
    setBusy(false)
  }
  const open = (file: File): void => {
    if (props.hasProgram && !window.confirm(t("cam.batch.confirmReplace"))) return
    props.onOpen(file)
    props.onClose()
  }
  const close = (): void => { if (!busy()) props.onClose() }
  return <Modal open={props.open} variant="workspace" title={t("cam.batch.title")} onClose={close} closable={!busy()}>
    <div class="space-y-4 px-6 py-4">
      <p class="text-sm text-[color:var(--ent-text-muted)]">{t("cam.batch.explanation")}</p>
      <div class="flex flex-wrap gap-2">
        <label class="cursor-pointer rounded-md border border-[color:var(--ent-line-strong)] px-3 py-2 text-sm">
          {t("cad.importExport.chooseFiles")}
          <input class="sr-only" type="file" multiple disabled={busy()} accept=".nc,.gcode,.ngc,.tap,.cnc,.txt,.h,.mpf,.spf,.min,.json" onChange={(event) => void choose(event)} />
        </label>
        <label class="cursor-pointer rounded-md border border-[color:var(--ent-line-strong)] px-3 py-2 text-sm">
          {t("cad.importExport.chooseFolder")}
          <input class="sr-only" type="file" multiple disabled={busy()} ref={(input) => input.setAttribute("webkitdirectory", "")} onChange={(event) => void choose(event)} />
        </label>
      </div>
      <Show when={busy()}><p role="status" class="text-xs">{t("cam.batch.reading")}</p></Show>
      <Show when={files().length > 0}>
        <p class="text-xs text-[color:var(--ent-text-muted)]">{t("cam.batch.available", { count: files().length })}</p>
        <ul class="max-h-48 space-y-1 overflow-auto" data-testid="cam-import-programs">
          <For each={files()}>{(file) => <li><button type="button" class="w-full rounded border border-[color:var(--ent-line)] px-2 py-1.5 text-left text-sm hover:bg-[color:var(--ent-surface-subtle)]" onClick={() => open(file)}>{pathOf(file)}</button></li>}</For>
        </ul>
      </Show>
      <Show when={skipped().length > 0}>
        <details class="text-xs text-[color:var(--ent-text-muted)]"><summary>{t("cam.batch.skipped", { count: skipped().length })}</summary><ul class="max-h-32 overflow-auto"><For each={skipped()}>{(item) => <li>{item.path}: {item.reason}</li>}</For></ul></details>
      </Show>
    </div>
    <div class="flex justify-end border-t border-[color:var(--ent-line)] px-6 py-4"><button type="button" class="rounded border border-[color:var(--ent-line-strong)] px-3 py-2 text-xs" disabled={busy()} onClick={close}>{t("common.close")}</button></div>
  </Modal>
}
