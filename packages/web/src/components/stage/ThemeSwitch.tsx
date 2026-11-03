import { Moon, Sun } from "lucide-react"
import { Segmented, Stage } from "../../stageshow/kit"
import { useSiteTheme } from "./useSiteTheme"
import "./nav.css"

// One crossfade for the whole page: per-surface colour transitions are frozen
// during the swap so nothing changes theme at its own pace.
function setTheme(next: "light" | "dark") {
  const root = document.documentElement
  const apply = () => {
    root.setAttribute("data-theme", next)
    try { localStorage.setItem("theme", next) } catch {}
  }
  root.classList.add("theme-switching")
  const release = () => requestAnimationFrame(() => root.classList.remove("theme-switching"))
  const doc = document as Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } }
  if (doc.startViewTransition) doc.startViewTransition(apply).finished.finally(release)
  else {
    apply()
    release()
  }
}

/** Light / dark as a stage segmented control; clicking a half sets that theme. */
export default function ThemeSwitch({ label }: { label: string }) {
  const theme = useSiteTheme()
  return (
    <div style={{ width: 84, height: 36 }}>
      <Stage width={84} height={36} theme={theme} greys="cool" className="nv" specimen>
        {() => (
          <Segmented
            className="nv-seg"
            value={theme === "dark" ? 1 : 0}
            items={[
              <button key="l" type="button" className="nv-btn" aria-label={`${label}: light`} aria-pressed={theme === "light"} onClick={() => setTheme("light")}><Sun size={14} strokeWidth={1.8} /></button>,
              <button key="d" type="button" className="nv-btn" aria-label={`${label}: dark`} aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}><Moon size={14} strokeWidth={1.8} /></button>,
            ]}
          />
        )}
      </Stage>
    </div>
  )
}
