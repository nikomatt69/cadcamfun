import { Segmented, Stage, Text } from "../../stageshow/kit"
import { useSiteTheme } from "./useSiteTheme"
import "./nav.css"

export type NavLink = { href: string; label: string; external?: boolean }

const CELL_MIN = 72
const CELL_CHAR = 7.4
const PAD = 4

/**
 * The header's link group as a stage control: one segment per link, a raised
 * thumb on the current page. The links are real anchors, so it navigates,
 * focuses and reads like the markup it replaces.
 */
export default function NavTabs({ links, current }: { links: NavLink[]; current: number }) {
  const theme = useSiteTheme()
  const cell = Math.ceil(Math.max(CELL_MIN, ...links.map((l) => l.label.length * CELL_CHAR + 28)))
  const width = cell * links.length + PAD
  return (
    <div style={{ width, height: 36 }}>
    <Stage width={width} height={36} theme={theme} greys="cool" className="nv" specimen>
      {() => (
        <Segmented
          className="nv-seg"
          data-none={current < 0 || undefined}
          value={Math.max(current, 0)}
          items={links.map((l) => (
            <a key={l.href} href={l.href} aria-current={links.indexOf(l) === current ? "page" : undefined} {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              <Text>{l.label}</Text>
            </a>
          ))}
        />
      )}
    </Stage>
    </div>
  )
}
