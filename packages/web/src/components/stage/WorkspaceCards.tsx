import { Text, Window } from "../../stageshow/kit"
import { useSiteTheme } from "./useSiteTheme"
import "./workspace.css"

export type WorkspaceItem = { title: string; role: string; owns: string; href: string }

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
  return (
    <div className="ss-stage ws" data-theme={theme} data-palette="accent" data-fidelity="standard" data-greys="cool" data-layout="wide">
        <Window
          title={heading[0]}
          className="ws-window"
          sidebar={
              <div className="ws-side">
                <Text className="ws-side__head">{heading[1]}</Text>
                {apps.map((a) => (
                  <Cell key={a.href + a.title} item={a} strong />
                ))}
              </div>
          }
          sidebarWidth={290}
        >
          <div className="ws-grid">
            <div className="ws-compact-apps">
              <Text className="ws-side__head">{heading[1]}</Text>
              {apps.map((a) => <Cell key={a.href + a.title} item={a} strong />)}
            </div>
            {packages.map((p) => (
              <Cell key={p.title} item={p} />
            ))}
          </div>
        </Window>
    </div>
  )
}
