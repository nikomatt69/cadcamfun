import { Bar, Connector, Icon, Row, Stage, Text, Window } from "../../stageshow/kit"
import { useSiteTheme } from "./useSiteTheme"
import { dependencyConnector } from "./layer-diagram"
import "./diagrams.css"

// Two home-page diagrams drawn as product UI: the packages and apps of the
// workspace, and the direction imports point (geometry to the window).

const LAYERS = ["core", "api", "sidecar", "desktop"] as const
const CHIP = { w: 112, h: 34 }

/** Imports point inward: four layers, one arrow between each. */
export function LayerDiagram() {
  const theme = useSiteTheme()
  return (
    <div aria-hidden="true">
    <Stage width={720} height={150} compact={{ below: 560, width: 358, height: 300 }} theme={theme} greys="cool" className="dg dg-layers">
      {(_s, rect, layout) => {
        const compact = layout === "compact"
        const pos = (i: number) => compact ? { x: 107, y: 12 + i * 48 } : { x: 24 + i * 150, y: 24 }
        return (
          <>
            <Window title="Imports" toolbar={<Icon name="more" size={16} />} className="dg-window">
              {LAYERS.map((name, i) => (
                <div key={name} className="dg-chip" data-target={`layer-${i}`} data-active={i === 0 || undefined} style={{ left: pos(i).x, top: pos(i).y, width: CHIP.w, height: CHIP.h }}>
                  <Text>{name}</Text>
                </div>
              ))}
            </Window>
            {LAYERS.slice(0, -1).map((_, i) => {
              const link = dependencyConnector(rect(`layer-${i + 1}`), rect(`layer-${i}`), compact)
              return link ? <Connector key={i} {...link} show arrow dots="none" route="straight" /> : null
            })}
          </>
        )
      }}
    </Stage>
    </div>
  )
}

const PACKAGES = ["core", "api", "db", "ai", "vcs", "workflow"]
const APPS = [
  { name: "sidecar", note: "Bun server" },
  { name: "desktop", note: "Tauri window" },
  { name: "mobile", note: "iOS companion" },
]

/** The workspace: packages in a sidebar, apps as cards. */
export function WorkspaceMap() {
  const theme = useSiteTheme()
  return (
    <Stage width={720} height={290} compact={{ below: 560, width: 358, height: 340 }} theme={theme} greys="cool" className="dg dg-map">
      {() => (
        <Window
          title="Workspace"
          className="dg-window dg-window--map"
          sidebar={
            <div className="dg-side">
              <Text className="dg-side__head">Packages</Text>
              {PACKAGES.map((name, i) => (
                <Row key={name} pad={6} selected={i === 0} lead={<Bar w={14} h={14} r={4} tone={i === 0 ? 4 : 2} />} title={<Text>{name}</Text>} />
              ))}
            </div>
          }
          sidebarWidth={150}
        >
          <div className="dg-apps">
            {APPS.map((app, i) => (
              <div key={app.name} className="dg-app" data-active={i === 0 || undefined}>
                <Text className="dg-app__label">Apps</Text>
                <Text className="dg-app__name">{app.name}</Text>
                <Bar w={60 + i * 8} h={5} tone={2} />
                <Text className="dg-app__note">{app.note}</Text>
              </div>
            ))}
          </div>
        </Window>
      )}
    </Stage>
  )
}
