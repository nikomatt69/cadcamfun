import { Bar, Connector, Icon, Row, Stage, Text, Window } from "../../stageshow/kit"
import { useSiteTheme } from "./useSiteTheme"
import "./diagrams.css"

// Two home-page diagrams drawn as product UI: the packages and apps of the
// workspace, and the direction imports point (geometry to the window).

const LAYERS = ["core", "api", "sidecar", "desktop"] as const
const CHIP = { w: 112, h: 44, y: 64, x0: 28, gap: 52 }

/** Imports point inward: four layers, one arrow between each. */
export function LayerDiagram() {
  const theme = useSiteTheme()
  const at = (i: number) => CHIP.x0 + i * (CHIP.w + CHIP.gap)
  return (
    <Stage width={720} height={150} compact={{ below: 560, width: 358, height: 300 }} theme={theme} greys="cool" className="dg dg-layers">
      {(_s, _r, layout) => {
        const compact = layout === "compact"
        const pos = (i: number) => (compact ? { x: 20 + (i % 2) * 168, y: 36 + Math.floor(i / 2) * 104 } : { x: at(i), y: CHIP.y })
        return (
          <>
            <Window title="Imports" className="dg-window">
              {LAYERS.map((name, i) => (
                <div key={name} className="dg-chip" data-active={i === 0 || undefined} style={{ left: pos(i).x - 12, top: pos(i).y - 38, width: CHIP.w, height: CHIP.h }}>
                  <Text>{name}</Text>
                  {i === 0 ? <Icon name="check" size={12} /> : <Bar w={22} h={5} tone={2} />}
                </div>
              ))}
            </Window>
            {LAYERS.slice(0, -1).map((_, i) => {
              const a = pos(i)
              const b = pos(i + 1)
              const from = compact ? (i % 2 === 0 ? { x: a.x + CHIP.w + 8, y: a.y + 22 } : { x: a.x + CHIP.w / 2, y: a.y + CHIP.h + 8 }) : { x: a.x + CHIP.w + 4, y: a.y + 22 }
              const to = compact ? (i % 2 === 0 ? { x: b.x - 8, y: b.y + 22 } : { x: b.x + CHIP.w / 2, y: b.y - 8 }) : { x: b.x - 4, y: b.y + 22 }
              if (compact && i % 2 === 1) return null
              return <Connector key={i} from={from} to={to} show arrow dots="none" route="straight" />
            })}
          </>
        )
      }}
    </Stage>
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
