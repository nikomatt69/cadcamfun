/**
 * The language of the interface (spec 06-desktop-ui.md §1).
 *
 * The choice is a preference like any other: it is stored with the settings and
 * applied to the whole app as soon as the language pack is loaded. The list shows
 * every shipped language by its own name, because a reader picks their language
 * by the name they know it under.
 */
import { For, Show } from "solid-js"
import type { JSX } from "solid-js"
import Globe from "lucide-solid/icons/globe"
import { useApp } from "../../../shared/state/context.ts"
import { LOCALE_CODES, isLoading, localeInfo, t, type Locale } from "../../../i18n/index.ts"

export function LanguageSelector(): JSX.Element {
  const app = useApp()
  const locale = (): Locale => app.settings.settings().locale
  return (
    <div class="relative">
      <select
        value={locale()}
        onChange={(event) => app.settings.update({ locale: event.currentTarget.value as Locale })}
        class="block w-full rounded-md border border-slate-200/70 bg-white/80 py-2 pl-10 pr-4 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700/50 dark:bg-slate-800/60 dark:text-slate-100"
      >
        <For each={LOCALE_CODES}>{(code) => <option value={code}>{localeInfo(code).endonym}</option>}</For>
      </select>
      <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <Globe class="h-4 w-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
      </div>
      <Show when={isLoading()}>
        <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">{t("settings.lang.loading")}</p>
      </Show>
    </div>
  )
}
