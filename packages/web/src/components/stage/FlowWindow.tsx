import type { ReactNode } from "react"
import { Window } from "../../stageshow/kit"
import { useSiteTheme } from "./useSiteTheme"
import "./flow.css"

/**
 * A stageshow window in the page's flow, for real forms and tables: the kit's
 * chrome and tokens around live markup, at its natural height. Pass the markup
 * as children from an .astro page (it stays server-rendered).
 */
export default function FlowWindow({ title, children, className }: { title: string; children?: ReactNode; className?: string }) {
  const theme = useSiteTheme()
  return (
    <div className={`ss-stage fw${className ? ` ${className}` : ""}`} data-theme={theme} data-palette="accent" data-fidelity="standard" data-greys="cool" data-layout="wide">
      <Window title={title} className="fw-window" body={{ className: "fw-body" }}>
        {children}
      </Window>
    </div>
  )
}
