import { For, Show, type JSX } from "solid-js"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { AUTOSAVE_MINUTES } from "../../../shared/state/settings.ts"

/** Automatic saving of the open drawing and CAM program: on/off and the interval. */
export function AutosaveSettings(): JSX.Element {
  const app = useApp()
  return (
    <div class="mt-8" data-testid="autosave-setting">
      <h4 class="text-sm font-medium text-slate-900 dark:text-white">{t("settings.autosave.title")}</h4>
      <label class="mt-3 flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
        <input type="checkbox" name="autosave" class="mt-1 h-4 w-4 accent-blue-600" aria-label={t("settings.autosave.title")}
          checked={app.settings.settings().autosave} onChange={(event) => app.settings.update({ autosave: event.currentTarget.checked })} />
        <span>{t("settings.autosave.body")}</span>
      </label>
      <Show when={app.settings.settings().autosave}>
        <label class="mt-3 flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
          <span>{t("settings.autosave.every")}</span>
          <select name="autosaveMinutes" class="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
            value={String(app.settings.settings().autosaveMinutes)} onChange={(event) => app.settings.update({ autosaveMinutes: Number(event.currentTarget.value) })}>
            <For each={AUTOSAVE_MINUTES}>{(minutes) => <option value={String(minutes)}>{t("settings.autosave.minutes", { minutes })}</option>}</For>
          </select>
        </label>
      </Show>
      <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("settings.autosave.hint")}</p>
    </div>
  )
}
