import { Icon, Stage } from "../../stageshow/kit"
import { useSiteTheme } from "./useSiteTheme"
import "./nav.css"

export type LocaleOption = { code: string; endonym: string }

/** The language picker as a stage control around a real <select>. */
export default function LocaleSelect({ options, locale, bare, onDocs, label }: { options: LocaleOption[]; locale: string; bare: string; onDocs: boolean; label: string }) {
  const theme = useSiteTheme()
  const change = (code: string) => {
    document.cookie = `cadcamfun_locale=${code}; Path=/; Max-Age=31536000; SameSite=Lax`
    if (!onDocs) {
      const url = new URL(window.location.href)
      url.searchParams.set("lang", code)
      window.location.href = `${url.pathname}${url.search}`
      return
    }
    const target = code === "en" ? bare : `/${code}${bare}`
    window.location.href = `${target}?lang=${encodeURIComponent(code)}`
  }
  return (
    <div style={{ width: 150, height: 36 }}>
      <Stage width={150} height={36} theme={theme} greys="cool" className="nv" specimen>
        {() => (
          <label className="nv-locale" style={{ position: "absolute", inset: 0 }}>
            <Icon name="globe" size={15} />
            <select aria-label={label} defaultValue={locale} onChange={(e) => change(e.target.value)}>
              {options.map((o) => (
                <option key={o.code} value={o.code}>{o.endonym}</option>
              ))}
            </select>
          </label>
        )}
      </Stage>
    </div>
  )
}
