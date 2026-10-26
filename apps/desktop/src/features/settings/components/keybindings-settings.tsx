import { For, Show, createMemo, createSignal, onCleanup, type JSX } from "solid-js"
import { t, type Key } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { toast } from "../../../shared/ui/toast.tsx"
import { saveFile } from "../../../shared/lib/save-file.ts"
import { COMMANDS, GROUPS, SCOPES, groupKeyOf, labelKeyOf, type CommandDef, type Scope } from "../../../shared/keybindings/catalog.ts"
import { canonicalChord, chordFromEvent, displayChord, formatChord, parseChord, type Platform } from "../../../shared/keybindings/chord.ts"
import { ChordKeys } from "../../../shared/keybindings/chips.tsx"
import type { KeybindingError } from "../../../shared/keybindings/service.ts"

/** The text of a refused rebind, in the user's words. */
const explain = (error: KeybindingError, platform: Platform): string => {
  const displayOf = (text: string): string => { const chord = parseChord(text); return chord === undefined ? text : displayChord(chord, platform) }
  switch (error._tag) {
    case "ChordConflict": return t("keys.error.conflict", { chord: displayOf(error.chord), commands: error.with.map((id) => t(labelKeyOf(id) as Key)).join(", ") })
    case "InvalidChord": return t(`keys.error.${error.reason}` as Key, { chord: displayOf(error.chord) })
    default: return t("keys.error.unknown")
  }
}

interface Pending { readonly id: string; readonly chord: string; readonly message: string; readonly reassignable: boolean; readonly replaces: string | undefined }

/**
 * Settings > Keyboard: every command of the catalog with its chords, grouped by where it works. A chord is changed by
 * pressing the new keys (or typing them), a clash names the command that owns it and offers to reassign, and the
 * whole map exports and imports as JSON. All rules live in the keybindings service; this screen only shows them.
 */
export function KeybindingsSettings(): JSX.Element {
  const app = useApp()
  const keys = app.keys
  const [scope, setScope] = createSignal<Scope>("cad")
  const [query, setQuery] = createSignal("")
  /** The row being recorded: which command, and which existing chord it replaces (undefined = adding one). */
  const [recording, setRecording] = createSignal<{ readonly id: string; readonly replaces: string | undefined } | undefined>(undefined)
  const [typed, setTyped] = createSignal("")
  const [pending, setPending] = createSignal<Pending | undefined>(undefined)
  let stopRecording: (() => void) | undefined
  onCleanup(() => stopRecording?.())

  const rows = createMemo(() => {
    const needle = query().trim().toLowerCase()
    const keymap = keys.keymap()
    return GROUPS.flatMap((group) => {
      const list = COMMANDS.filter((command) => command.scope === scope() && command.group === group)
        .map((command) => ({ command, label: t(labelKeyOf(command.id) as Key), entry: keymap.entry(command.id)! }))
        .filter((row) => needle.length === 0 || row.label.toLowerCase().includes(needle) || row.command.id.includes(needle) ||
          row.entry.chords.some((chord) => displayChord(chord, keys.platform).toLowerCase().includes(needle)))
      return list.length === 0 ? [] : [{ group, list }]
    })
  })

  const commit = (id: string, chords: ReadonlyArray<string>, replaces: string | undefined, reassign = false): void => {
    const result = keys.rebind(id, chords, { reassign })
    if (result.ok) { setPending(undefined); return }
    const chord = result.error._tag === "ChordConflict" || result.error._tag === "InvalidChord" ? result.error.chord : chords.join(", ")
    setPending({ id, chord, message: explain(result.error, keys.platform), reassignable: result.error._tag === "ChordConflict", replaces })
  }

  const withChord = (id: string, chord: string, replaces: string | undefined): ReadonlyArray<string> => {
    const current = (keys.keymap().entry(id)?.chords ?? []).map(formatChord)
    const next = replaces === undefined ? current : current.filter((candidate) => candidate !== replaces)
    return next.includes(chord) ? next : [...next, chord]
  }

  const finish = (): void => { stopRecording?.(); stopRecording = undefined; setRecording(undefined); setTyped("") }

  const startRecording = (command: CommandDef, replaces: string | undefined): void => {
    finish()
    setPending(undefined)
    setRecording({ id: command.id, replaces })
    // Keys are consumed by the recorder, never by the command they happen to be bound to.
    const resume = keys.suspend()
    const onKey = (event: KeyboardEvent): void => {
      // The manual field below the recorder is for typing: its keys are text, not a chord to record.
      if (event.target instanceof HTMLInputElement && event.target.type === "text") return
      event.preventDefault()
      event.stopPropagation()
      if (event.key === "Escape") { finish(); return }
      const chord = chordFromEvent(event, keys.platform)
      if (chord === undefined) return
      finish()
      commit(command.id, withChord(command.id, formatChord(chord), replaces), replaces)
    }
    window.addEventListener("keydown", onKey, true)
    stopRecording = () => { window.removeEventListener("keydown", onKey, true); resume() }
  }

  const submitTyped = (command: CommandDef): void => {
    const canonical = canonicalChord(typed())
    const current = recording()
    if (canonical === undefined) { setPending({ id: command.id, chord: typed(), message: t("keys.error.invalidChord", { chord: typed() }), reassignable: false, replaces: current?.replaces }); return }
    finish()
    commit(command.id, withChord(command.id, canonical, current?.replaces), current?.replaces)
  }

  const remove = (command: CommandDef, chord: string): void => {
    commit(command.id, (keys.keymap().entry(command.id)?.chords ?? []).map(formatChord).filter((candidate) => candidate !== chord), undefined)
  }

  const exportMap = async (): Promise<void> => {
    try {
      await saveFile({ name: "cadcamfun-keyboard-shortcuts.json", data: keys.exportJson(), mime: "application/json" })
      toast.success(t("keys.exported"))
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : String(cause)) }
  }
  const importMap = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return
    const result = keys.importJson(await file.text())
    if (result.ok) toast.success(t("keys.imported")); else toast.error(t("keys.importFailed"))
  }
  const issues = (): number => keys.keymap().issues.length

  return (
    <div class="space-y-4" data-testid="keybindings-settings">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 class="text-lg font-medium leading-6 text-slate-900 dark:text-white">{t("keys.title")}</h3>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("keys.subtitle")}</p>
        </div>
        <div class="flex items-center gap-2 text-sm">
          <button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 dark:border-slate-600" onClick={() => void exportMap()}>{t("keys.export")}</button>
          <label class="cursor-pointer rounded-md border border-slate-300 px-3 py-1.5 dark:border-slate-600">
            {t("keys.import")}
            <input type="file" accept="application/json,.json" class="hidden" onChange={(event) => { void importMap(event.currentTarget.files?.[0]); event.currentTarget.value = "" }} />
          </label>
          <button type="button" class="rounded-md border border-red-200 px-3 py-1.5 text-red-700 dark:border-red-800 dark:text-red-300" onClick={() => { keys.resetAll(); setPending(undefined); toast.success(t("keys.resetDone")) }}>{t("keys.resetAll")}</button>
        </div>
      </div>

      <Show when={issues() > 0}><p role="status" class="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">{t("keys.issues", { count: issues() })}</p></Show>

      <div class="flex flex-wrap items-center gap-2">
        <div role="tablist" class="flex gap-1">
          <For each={SCOPES}>{(tab) =>
            <button type="button" role="tab" aria-selected={scope() === tab} onClick={() => setScope(tab)} class="rounded-md px-3 py-1 text-sm"
              classList={{ "bg-blue-600 text-white": scope() === tab, "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200": scope() !== tab }}>{t(`keys.scope.${tab}` as Key)}</button>}
          </For>
        </div>
        <input type="search" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} placeholder={t("keys.search")} aria-label={t("keys.search")}
          class="ml-auto min-w-[14rem] rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800" />
      </div>

      <For each={rows()}>{(section) =>
        <section>
          <h4 class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t(groupKeyOf(section.group) as Key)}</h4>
          <ul class="divide-y divide-slate-200 dark:divide-slate-700">
            <For each={section.list}>{(row) =>
              <li class="py-2" data-command={row.command.id}>
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-sm text-slate-800 dark:text-slate-200">
                    {row.label}
                    <Show when={row.entry.customised}><span class="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">{t("keys.custom")}</span></Show>
                  </span>
                  <span class="flex flex-wrap items-center gap-2">
                    <For each={row.entry.chords} fallback={<span class="text-xs text-slate-400">{t("keys.unbound")}</span>}>{(chord) =>
                      <span class="inline-flex items-center gap-1 rounded-md border border-transparent hover:border-slate-300 dark:hover:border-slate-600">
                        <button type="button" class="px-1" aria-label={`${row.label}: ${displayChord(chord, keys.platform)}`} onClick={() => startRecording(row.command, formatChord(chord))}><ChordKeys chord={chord} platform={keys.platform} /></button>
                        <button type="button" class="px-1 text-xs text-slate-400 hover:text-red-600" aria-label={`${t("keys.unbound")} ${displayChord(chord, keys.platform)}`} onClick={() => remove(row.command, formatChord(chord))}>×</button>
                      </span>}
                    </For>
                    <button type="button" class="rounded-md border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300" onClick={() => startRecording(row.command, undefined)}>+ {t("keys.add")}</button>
                    <Show when={row.entry.customised}>
                      <button type="button" class="text-xs text-slate-500 underline" onClick={() => { keys.reset(row.command.id); setPending(undefined) }}>{t("keys.reset")}</button>
                    </Show>
                  </span>
                </div>
                <Show when={recording()?.id === row.command.id}>
                  <div class="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm dark:bg-blue-900/20" role="status">
                    <span class="font-medium">{t("keys.record")}</span>
                    <span class="text-xs text-slate-500">{t("keys.recordHint")}</span>
                    <input type="text" value={typed()} onInput={(event) => setTyped(event.currentTarget.value)} placeholder="Mod+Shift+K" aria-label={t("keys.add")}
                      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submitTyped(row.command) } }}
                      class="w-40 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800" />
                    <button type="button" class="text-xs underline" onClick={finish}>{t("keys.cancel")}</button>
                  </div>
                </Show>
                <Show when={pending()?.id === row.command.id}>
                  <div class="mt-2 flex flex-wrap items-center gap-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200" role="alert">
                    <span>{pending()!.message}</span>
                    <Show when={pending()!.reassignable}>
                      <button type="button" class="rounded bg-red-600 px-2 py-0.5 text-xs text-white" onClick={() => { const p = pending()!; commit(p.id, withChord(p.id, p.chord, p.replaces), p.replaces, true) }}>{t("keys.reassign")}</button>
                    </Show>
                    <button type="button" class="text-xs underline" onClick={() => setPending(undefined)}>{t("keys.cancel")}</button>
                  </div>
                </Show>
              </li>}
            </For>
          </ul>
        </section>}
      </For>
    </div>
  )
}
