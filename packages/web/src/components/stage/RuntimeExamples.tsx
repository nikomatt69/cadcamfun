import { Bar, Icon, Stage, Text, Window } from "../../stageshow/kit"
import { useSiteTheme } from "./useSiteTheme"
import "./tiles.css"

const TILE = { width: 400, height: 300, compact: { below: 400, width: 358, height: 300 } } as const

type RuntimeExample = "guide" | "sidecar" | "diagnostics" | "project"

/** Illustrative states only: these scenes never read or change the user's workspace. */
export default function RuntimeExamples({ kind }: { kind: RuntimeExample }) {
  const theme = useSiteTheme()
  return (
    <div aria-hidden="true">
      <Stage {...TILE} theme={theme} greys="cool" className={`tile tile-${kind}`}>
        {() => (
          <Window title={kind === "guide" ? "Getting started" : kind === "sidecar" ? "Sidecar" : kind === "project" ? "Project" : "Desktop startup"} toolbar={<Icon name="more" size={16} />} className="tile-window" body={{ className: "tile-body" }}>
            {kind === "guide" ? <Guide /> : kind === "sidecar" ? <Sidecar /> : kind === "project" ? <Project /> : <Diagnostics />}
          </Window>
        )}
      </Stage>
    </div>
  )
}

function Project() {
  return (
    <div className="tile-runtime">
      <div className="tile-runtime__heading"><Text>Bracket study</Text><span>Workspace</span></div>
      {["Drawings", "Components", "Toolpaths"].map((item) => (
        <div className="tile-runtime__row" key={item}>
          <Icon name="file" size={14} /><Text>{item}</Text><Icon name="chevron-right" size={13} />
        </div>
      ))}
    </div>
  )
}

function Guide() {
  return (
    <div className="tile-runtime">
      <div className="tile-runtime__heading"><Text>First project</Text><span>Guide</span></div>
      {["Install the desktop app", "Create a project", "Open the workbench"].map((step, index) => (
        <div className="tile-runtime__row" key={step}>
          <span className="tile-runtime__number">0{index + 1}</span><Text>{step}</Text><Icon name="chevron-right" size={13} />
        </div>
      ))}
    </div>
  )
}

function Sidecar() {
  return (
    <div className="tile-runtime">
      <div className="tile-runtime__heading"><Text>Local service</Text><span>HTTP API</span></div>
      <div className="tile-runtime__request"><span>GET</span><code>/health</code></div>
      <div className="tile-runtime__row"><Icon name="check" size={14} /><Text>Health response</Text><span className="tile-runtime__status">200</span></div>
      <div className="tile-runtime__placeholder"><Bar w={110} h={6} tone={2} /><Bar w={56} h={6} tone={2} /></div>
    </div>
  )
}

function Diagnostics() {
  return (
    <div className="tile-runtime">
      <div className="tile-runtime__heading"><Text>Startup checks</Text><span>Local</span></div>
      {["Desktop shell", "Sidecar readiness", "Database path"].map((step) => (
        <div className="tile-runtime__row" key={step}>
          <span className="tile-runtime__check"><Icon name="check" size={12} /></span><Text>{step}</Text><span className="tile-runtime__status">Checked</span>
        </div>
      ))}
    </div>
  )
}
