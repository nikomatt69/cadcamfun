import { Bar, Code, Icon, Stage, Stream, Text, Window } from "../../stageshow/kit"
import { PartView } from "./PartView"
import { useSiteTheme } from "./useSiteTheme"
import "./workbench.css"
import "./tiles.css"

// Three feature tiles for the home page, one per thing the app does: toolpaths
// over the part, an assistant that edits the model, G-code posted from it.
// Each is a still: the payoff is on screen, real words only where the story is.

const TILE = { width: 400, height: 300, compact: { below: 400, width: 358, height: 300 } } as const

function Tile({ children, name }: { children: (layout: "wide" | "compact") => React.ReactNode; name: string }) {
  const theme = useSiteTheme()
  return (
    <Stage {...TILE} theme={theme} greys="cool" className={`tile tile-${name}`}>
      {(_s, _r, layout) => children(layout)}
    </Stage>
  )
}

function CamTile() {
  return (
    <Tile name="cam">
      {() => (
        <>
          <Window title="Pocket 1" className="tile-window" body={{ className: "tile-body" }}>
            <div className="wb-view">
              <PartView pocket path />
              <div className="wb-chip" data-show>
                <Text>Cycle 04:12</Text>
              </div>
            </div>
          </Window>
          <div className="tile-card tile-card--cam">
            <Text className="tile-card__label">Tool</Text>
            <Text className="tile-card__value">Ø6 flat · 9000 rpm</Text>
            <Bar w={72} h={5} tone={2} />
          </div>
        </>
      )}
    </Tile>
  )
}

const REPLY = "Filleted the four top edges at 6 mm. The pocket still clears."

function AssistantTile() {
  return (
    <Tile name="ai">
      {() => (
        <>
          <Window title="Assistant" className="tile-window" body={{ className: "tile-body" }}>
            <div className="tile-chat">
              <div className="tile-chat__earlier">
                <Bar w={150} h={6} tone={2} />
                <Bar w={110} h={6} tone={2} />
              </div>
              <div className="tile-msg tile-msg--me">
                <Text>Round the top edges, 6 mm.</Text>
              </div>
              <div className="tile-msg tile-msg--ai">
                <Stream text={REPLY} count={REPLY.split(" ").length} />
              </div>
              <div className="tile-chips">
                <span className="tile-pill">
                  <Icon name="check" size={11} />
                  <Text>Fillet</Text>
                </span>
                <Bar w={52} h={18} r={9} tone={2} />
              </div>
            </div>
          </Window>
          <div className="tile-card tile-card--ai">
            <PartView className="tile-mini" pocket />
          </div>
        </>
      )}
    </Tile>
  )
}

const GCODE = [
  "G21 G90 G54",
  "T1 M6 S9000",
  "G0 X18 Y14",
  { text: "G1 Z-4 F300", kind: "add" as const },
  { text: "G1 X62 Y14 F900", kind: "add" as const },
  "G1 X62 Y44",
  "G0 Z5",
  "M30",
]

function PostTile() {
  return (
    <Tile name="post">
      {() => (
        <>
          <Window chrome="terminal" title="bracket.nc" className="tile-window">
            <Code lines={GCODE} className="tile-code" />
          </Window>
          <div className="tile-card tile-card--post">
            <Text className="tile-card__label">Post</Text>
            <Text className="tile-card__value">LinuxCNC</Text>
            <Bar w={60} h={5} tone={2} />
          </div>
        </>
      )}
    </Tile>
  )
}

/** One tile on its own, for a docs page or a form that wants a picture of the thing it describes. */
export function TopicTile({ kind }: { kind: "cam" | "ai" | "post" }) {
  return kind === "cam" ? <CamTile /> : kind === "ai" ? <AssistantTile /> : <PostTile />
}

export default function ProductTiles({ titles }: { titles: [string, string, string] }) {
  const tiles = [<CamTile key="cam" />, <AssistantTile key="ai" />, <PostTile key="post" />]
  return (
    <div className="tiles-grid">
      {tiles.map((tile, i) => (
        <figure key={i} className="tiles-cell">
          {tile}
          <figcaption>{titles[i]}</figcaption>
        </figure>
      ))}
    </div>
  )
}
