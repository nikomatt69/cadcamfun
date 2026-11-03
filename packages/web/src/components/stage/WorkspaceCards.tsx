import { Stage, Text, Window } from "../../stageshow/kit"
import { useSiteTheme } from "./useSiteTheme"
import "./workspace.css"

export type WorkspaceItem = { title: string; role: string; owns: string; href: string }

const CELL = 140
const GAP = 8

function Cell({ item, strong }: { item: WorkspaceItem; strong?: boolean }) {
  return (
    <a className="ws-cell" href={item.href} data-strong={strong || undefined}>
      <Text className="ws-cell__role">{item.role}</Text>
      <Text className="ws-cell__title">{item.title}</Text>
      <span className="ws-cell__owns">{item.owns}</span>
    </a>
  )
}

/** The workspace's packages and apps as a window of linked cells: packages in the grid, apps in the sidebar. */
export default function WorkspaceCards({ packages, apps, heading }: { packages: WorkspaceItem[]; apps: WorkspaceItem[]; heading: [string, string] }) {
  const theme = useSiteTheme()
  const rows = Math.ceil(packages.length / 3)
  const wideBody = rows * CELL + (rows - 1) * GAP + 32
  const wideH = 38 + Math.max(wideBody, apps.length * (CELL + GAP) + 56)
  const compactH = 38 + (packages.length + apps.length) * (CELL - 20 + GAP) + 80
  return (
    <Stage width={1000} height={wideH + 32} compact={{ below: 720, width: 358, height: compactH + 32 }} theme={theme} greys="cool" className="ws">
      {(_s, _r, layout) => (
        <Window
          title={heading[0]}
          className="ws-window"
          style={{ height: layout === "compact" ? compactH : wideH }}
          sidebar={
            layout === "compact" ? undefined : (
              <div className="ws-side">
                <Text className="ws-side__head">{heading[1]}</Text>
                {apps.map((a) => (
                  <Cell key={a.href + a.title} item={a} strong />
                ))}
              </div>
            )
          }
          sidebarWidth={290}
        >
          <div className="ws-grid">
            {layout === "compact" && apps.map((a) => <Cell key={a.href + a.title} item={a} strong />)}
            {packages.map((p) => (
              <Cell key={p.title} item={p} />
            ))}
          </div>
        </Window>
      )}
    </Stage>
  )
}
