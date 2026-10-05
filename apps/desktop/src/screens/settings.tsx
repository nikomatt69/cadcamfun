import { For } from "solid-js"
import { useApp } from "../state/context.ts"
import { t } from "../i18n/index.ts"
import { THEMES } from "../state/settings.ts"
import { ScreenHeader } from "./screen-parts.tsx"

export function SettingsScreen() {
  const app = useApp()
  const settings = app.settings.settings
  return <section><ScreenHeader title={t("settings.title")} subtitle={t("settings.subtitle")} /><div class="grid max-w-2xl gap-4 p-6">
    <label class="form-label">{t("settings.units")}<select class="form-select" value={settings().units} onChange={(e) => app.settings.update({ units: e.currentTarget.value === "inch" ? "inch" : "mm" })}><option value="mm">{t("settings.unitsMm")}</option><option value="inch">{t("settings.unitsInch")}</option></select></label>
    <label class="form-label">{t("settings.theme")}<select class="form-select" value={settings().theme} onChange={(e) => { const theme = THEMES.find((item) => item === e.currentTarget.value); if (theme) app.settings.update({ theme }) }}><For each={THEMES}>{(theme) => <option value={theme}>{t(theme === "light" ? "settings.themeLight" : theme === "dark" ? "settings.themeDark" : "settings.themeSystem")}</option>}</For></select></label>
    <label class="form-label">{t("settings.locale")}<select class="form-select" value="en"><option value="en">{t("settings.english")}</option></select></label>
    <label class="form-label">{t("settings.decimalPlaces")}<input class="form-input" type="number" min="0" max="6" step="1" value={settings().decimals} onChange={(e) => { const decimals = Number(e.currentTarget.value); if (Number.isInteger(decimals) && decimals >= 0 && decimals <= 6) app.settings.update({ decimals }) }} /></label>
    <label class="form-label">{t("settings.postProcessor")}<select class="form-select" value={settings().postProcessor} onChange={(e) => { const postProcessor = e.currentTarget.value; if (postProcessor === "grbl" || postProcessor === "fanuc" || postProcessor === "gcode") app.settings.update({ postProcessor }) }}><option value="grbl">GRBL</option><option value="fanuc">Fanuc</option><option value="gcode">{t("settings.generic")}</option></select></label>
    <label class="flex gap-2"><input type="checkbox" checked={settings().snapEnabled} onChange={(e) => app.settings.update({ snapEnabled: e.currentTarget.checked })} />{t("settings.snap")}</label>
    <button class="btn btn-outline" onClick={() => app.settings.reset()}>{t("form.reset")}</button>
  </div></section>
}
