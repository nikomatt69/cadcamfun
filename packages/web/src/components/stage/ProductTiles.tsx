import { Avatar, Bar, Caret, Code, Icon, Prompt, Row, Segmented, Stage, Stream, Text, Toggle, Window } from "../../stageshow/kit"
import { PartView } from "./PartView"
import { useSiteTheme } from "./useSiteTheme"
import { workflowScript, WORKFLOW_POSTER, WORKFLOW_STEPS } from "./workflow-sequence"
import "./workbench.css"
import "./tiles.css"

// Product examples for the home page and documentation topics.
// Each is a still: the payoff is on screen, real words only where the story is.

const TILE = { width: 400, height: 300, compact: { below: 400, width: 358, height: 300 } } as const

function Tile({ children, name }: { children: (layout: "wide" | "compact") => React.ReactNode; name: string }) {
  const theme = useSiteTheme()
  return (
    <div aria-hidden="true">
      <Stage {...TILE} theme={theme} greys="cool" className={`tile tile-${name}`}>
        {(_s, _r, layout) => children(layout)}
      </Stage>
    </div>
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
            <Text className="tile-card__value">GRBL</Text>
            <Bar w={60} h={5} tone={2} />
          </div>
        </>
      )}
    </Tile>
  )
}

function CadTile() {
  return (
    <Tile name="cad">
      {() => (
        <>
          <Window title="Bracket" className="tile-window" body={{ className: "tile-body" }}>
            <div className="wb-view">
              <PartView />
            </div>
          </Window>
          <div className="tile-card tile-card--cad">
            <Text className="tile-card__label">Extrude</Text>
            <Text className="tile-card__value">12 mm</Text>
            <Bar w={56} h={5} tone={2} />
          </div>
        </>
      )}
    </Tile>
  )
}

export type ApiExample = { title: string; method: string; path: string }

function ApiTile({ example = { title: "Projects", method: "GET", path: "/api/projects" } }: { example?: ApiExample }) {
  return (
    <Tile name="api">
      {() => (
        <Window title="HTTP API" toolbar={<Icon name="more" size={16} />} className="tile-window" body={{ className: "tile-body" }}>
          <div className="tile-api">
            <div className="tile-api__heading"><Text>{example.title}</Text><span>Endpoint</span></div>
            <div className="tile-api__request"><span>{example.method}</span><code>{example.path}</code></div>
            <div className="tile-api__detail"><Text>Contract</Text><span>OpenAPI</span></div>
            <div className="tile-api__detail"><Text>Client</Text><span>SDK</span></div>
          </div>
        </Window>
      )}
    </Tile>
  )
}

function HistoryTile() {
  const rows = [
    { name: "Add pocket 1", meta: "now", selected: true },
    { name: "Round top edges", meta: "2 h" },
  ]
  return (
    <Tile name="history">
      {() => (
        <>
          <Window title="History" className="tile-window" body={{ className: "tile-body" }}>
            <div className="tile-list">
              {rows.map((r) => (
                <Row key={r.name} pad={8} selected={r.selected} lead={<Avatar name="Niko" tone={r.selected ? "accent" : "person"} size={20} />} title={<Text>{r.name}</Text>} meta={<Text>{r.meta}</Text>} />
              ))}
              {[96, 76, 88].map((w, i) => (
                <Row key={i} pad={8} lead={<Bar w={20} h={20} r={10} tone={2} />} title={<Bar w={w} tone={3} />} meta={<Bar w={24} tone={2} />} />
              ))}
            </div>
          </Window>
          <div className="tile-card tile-card--history">
            <Text className="tile-card__label">Branch</Text>
            <Text className="tile-card__value">main</Text>
            <Bar w={40} h={5} tone={2} />
          </div>
        </>
      )}
    </Tile>
  )
}

function ArchTile() {
  const layers = ["core", "api", "sidecar", "desktop"]
  return (
    <Tile name="arch">
      {() => (
        <>
          <Window title="Workspace" className="tile-window" body={{ className: "tile-body" }}>
            <div className="tile-list">
              {layers.map((name, i) => (
                <Row key={name} pad={8} selected={i === 2} lead={<Bar w={20} h={20} r={6} tone={i === 2 ? 4 : 2} />} title={<Text>{name}</Text>} meta={<Icon name="chevron-right" size={12} />} />
              ))}
              <Row pad={8} lead={<Bar w={20} h={20} r={6} tone={2} />} title={<Bar w={70} tone={3} />} />
            </div>
          </Window>
          <div className="tile-card tile-card--arch">
            <Text className="tile-card__label">Imports</Text>
            <Text className="tile-card__value">inward only</Text>
            <Bar w={64} h={5} tone={2} />
          </div>
        </>
      )}
    </Tile>
  )
}

function TermTile() {
  return (
    <Tile name="term">
      {() => (
        <>
          <Window chrome="terminal" title="cadcamfun — zsh" className="tile-window">
            <Prompt path="~/cadcamfun">bun install</Prompt>
            <Prompt path="~/cadcamfun">bun test packages apps</Prompt>
            <Prompt path="~/cadcamfun">bun run desktop:dev<Caret /></Prompt>
          </Window>
          <div className="tile-card tile-card--term">
            <Text className="tile-card__label">Runtime</Text>
            <Text className="tile-card__value">Bun</Text>
            <Bar w={44} h={5} tone={2} />
          </div>
        </>
      )}
    </Tile>
  )
}

function DbTile() {
  const rows = [
    ["Bracket", "12 drawings"],
    ["Vise jaw", "4 drawings"],
  ]
  return (
    <Tile name="db">
      {() => (
        <>
          <Window title="cadcamfun.db" className="tile-window" body={{ className: "tile-body" }}>
            <div className="tile-list">
              <div className="tile-head"><Text>Project</Text><Text>Contents</Text></div>
              {rows.map(([a, b], i) => (
                <div key={a} className="tile-trow" data-on={i === 0 || undefined}><Text>{a}</Text><Text>{b}</Text></div>
              ))}
              {[[70, 52], [56, 44], [64, 48]].map(([a, b], i) => (
                <div key={i} className="tile-trow"><Bar w={a} h={7} tone={2} /><Bar w={b} h={7} tone={2} /></div>
              ))}
            </div>
          </Window>
          <div className="tile-card tile-card--db">
            <Text className="tile-card__label">Engine</Text>
            <Text className="tile-card__value">SQLite</Text>
            <Bar w={40} h={5} tone={2} />
          </div>
        </>
      )}
    </Tile>
  )
}

function ConfigTile() {
  return (
    <Tile name="config">
      {() => (
        <>
          <Window title="Settings" className="tile-window" body={{ className: "tile-body" }}>
            <div className="tile-list tile-settings">
              <div className="tile-setting"><Text>Units</Text><Segmented items={["mm", "in"]} value={0} /></div>
              <div className="tile-setting"><Text>Autosave</Text><Toggle on /></div>
              <div className="tile-setting"><Text>Snap to grid</Text><Toggle on={false} /></div>
              <div className="tile-setting"><Bar w={80} h={7} tone={2} /><Bar w={34} h={14} r={7} tone={2} /></div>
            </div>
          </Window>
          <div className="tile-card tile-card--config">
            <Text className="tile-card__label">Stored</Text>
            <Text className="tile-card__value">Locally</Text>
            <Bar w={44} h={5} tone={2} />
          </div>
        </>
      )}
    </Tile>
  )
}

function UpdateTile() {
  return (
    <Tile name="update">
      {() => (
        <>
          <Window title="CADCAMFUN" className="tile-window" body={{ className: "tile-body" }}>
            <div className="tile-list tile-settings">
              <div className="tile-setting"><Text>Desktop app</Text><Icon name="check" size={14} /></div>
              <div className="tile-setting"><Text>Check for updates</Text><Toggle on /></div>
              <div className="tile-setting"><Bar w={90} h={7} tone={2} /><Bar w={30} h={7} tone={2} /></div>
            </div>
          </Window>
          <div className="tile-card tile-card--update">
            <Text className="tile-card__label">latest.json</Text>
            <Text className="tile-card__value">Up to date</Text>
            <Bar w={52} h={5} tone={2} />
          </div>
        </>
      )}
    </Tile>
  )
}

function PairTile() {
  return (
    <Tile name="pair">
      {() => (
        <>
          <Window title="Pair a phone" className="tile-window" body={{ className: "tile-body" }}>
            <div className="tile-pair">
              <div className="tile-code">
                {["4", "8", "2", "9", "1", "7"].map((d, i) => (
                  <span key={i} className="tile-digit"><Text>{d}</Text></span>
                ))}
              </div>
            </div>
          </Window>
          <div className="tile-card tile-card--pair">
            <Text className="tile-card__label">Companion</Text>
            <Text className="tile-card__value">Paired</Text>
            <Bar w={44} h={5} tone={2} />
          </div>
        </>
      )}
    </Tile>
  )
}

function WorkflowTile() {
  const theme = useSiteTheme()
  return (
    <div aria-hidden="true">
      <Stage {...TILE} initial={{ completed: 0 }} poster={WORKFLOW_POSTER} script={workflowScript} play="once" theme={theme} greys="cool" className="tile tile-workflow">
      {(state) => (
        <Window title="Workflow run" toolbar={<Icon name="more" size={16} />} className="tile-window" body={{ className: "tile-body" }}>
          <div className="tile-flow">
            <div className="tile-flow__heading"><Text>Bracket setup</Text><span>main</span></div>
            {WORKFLOW_STEPS.map((step, index) => (
              <div className="tile-flow__step" key={step} data-state={index < state.completed ? "done" : index === state.completed ? "running" : "pending"}>
                <span className="tile-flow__marker"><span className="tile-flow__play"><Icon name="play" size={12} /></span><span className="tile-flow__check"><Icon name="check" size={12} /></span></span>
                <Text>{step}</Text>
                <span className="tile-flow__state"><span className="tile-flow__queued">Queued</span><span className="tile-flow__running">Running</span><span className="tile-flow__done">Done</span></span>
              </div>
            ))}
          </div>
        </Window>
      )}
      </Stage>
    </div>
  )
}

function PluginTile() {
  return (
    <Tile name="plugin">
      {() => (
        <Window title="Plugins" toolbar={<Icon name="more" size={16} />} className="tile-window" body={{ className: "tile-body" }}>
          <div className="tile-plugin">
            <div className="tile-plugin__heading"><Text>Installed</Text><span>2 plugins</span></div>
            <div className="tile-plugin__row"><span className="tile-plugin__icon"><Icon name="gear" size={16} /></span><div><Text>Tool assistant</Text><small>AI tool</small></div><Toggle on /></div>
            <div className="tile-plugin__row"><span className="tile-plugin__icon"><Icon name="file" size={16} /></span><div><Text>Part inspector</Text><small>AI tool</small></div><Toggle on /></div>
            <div className="tile-plugin__footer"><Bar w={70} h={7} tone={2} /><Bar w={44} h={20} r={5} tone={2} /></div>
          </div>
        </Window>
      )}
    </Tile>
  )
}

function SketchTile() {
  return (
    <Tile name="sketch">
      {() => (
        <Window title="Sketch" toolbar={<Icon name="more" size={16} />} className="tile-window" body={{ className: "tile-body" }}>
          <div className="tile-sketch">
            <svg viewBox="0 0 290 208" aria-hidden="true" focusable="false">
              <path className="tile-sketch__axis" d="M20 150H270M72 18V192" />
              <path className="tile-sketch__shape" d="M72 150V65H220V150Z" />
              <circle className="tile-sketch__hole" cx="146" cy="108" r="23" />
              <path className="tile-sketch__dimension" d="M72 166V179M220 166V179M72 173H220" />
              <text x="146" y="190" textAnchor="middle">80 mm</text>
              <circle cx="72" cy="150" r="4" className="tile-sketch__point" />
            </svg>
            <span className="tile-sketch__badge"><Icon name="check" size={12} /><Text>Constrained</Text></span>
          </div>
        </Window>
      )}
    </Tile>
  )
}

function MeshTile() {
  return (
    <Tile name="mesh">
      {() => (
        <Window title="Mesh preview" toolbar={<Icon name="more" size={16} />} className="tile-window" body={{ className: "tile-body" }}>
          <div className="tile-mesh">
            <div className="tile-mesh__viewport"><PartView pocket /></div>
            <div className="tile-mesh__details"><Text>Part preview</Text><span>Triangle mesh</span></div>
          </div>
        </Window>
      )}
    </Tile>
  )
}

function MachineTile() {
  return (
    <Tile name="machine">
      {() => (
        <Window title="Machine setup" toolbar={<Icon name="more" size={16} />} className="tile-window" body={{ className: "tile-body" }}>
          <div className="tile-machine">
            <div className="tile-machine__row"><Text>Machine</Text><span>3-axis mill</span></div>
            <div className="tile-machine__row"><Text>Stock</Text><span>Aluminium</span></div>
            <div className="tile-machine__row"><Text>Work offset</Text><span>G54</span></div>
            <div className="tile-machine__foot"><Icon name="check" size={12} /><Text>Setup ready</Text></div>
          </div>
        </Window>
      )}
    </Tile>
  )
}

function FeatureTile() {
  const features = ["Sketch 1", "Extrude", "Pocket", "Fillet"]
  return (
    <Tile name="feature">
      {() => (
        <Window title="Feature history" toolbar={<Icon name="more" size={16} />} className="tile-window" body={{ className: "tile-body" }}>
          <div className="tile-feature">
            <div className="tile-feature__view"><PartView pocket /></div>
            <div className="tile-feature__list">
              {features.map((feature, index) => (
                <div className="tile-feature__row" key={feature} data-selected={index === 2 || undefined}>
                  <span>{String(index + 1).padStart(2, "0")}</span><Text>{feature}</Text>
                </div>
              ))}
            </div>
          </div>
        </Window>
      )}
    </Tile>
  )
}

function PlaybackTile() {
  return (
    <Tile name="playback">
      {() => (
        <Window title="Toolpath preview" toolbar={<Icon name="more" size={16} />} className="tile-window" body={{ className: "tile-body" }}>
          <div className="tile-playback">
            <div className="tile-playback__view"><PartView pocket path /></div>
            <div className="tile-playback__controls">
              <span className="tile-playback__play"><Icon name="play" size={13} /></span>
              <span className="tile-playback__track"><span /></span>
              <Text>02:06 / 04:12</Text>
            </div>
          </div>
        </Window>
      )}
    </Tile>
  )
}

function ResourceTile() {
  const files = ["packages/core", "packages/api", "apps/sidecar", "apps/desktop"]
  return (
    <Tile name="resource">
      {() => (
        <Window title="Source map" toolbar={<Icon name="more" size={16} />} className="tile-window" body={{ className: "tile-body" }}>
          <div className="tile-resource">
            <div className="tile-resource__heading"><Text>Workspace</Text><span>Repository</span></div>
            {files.map((file, index) => (
              <div className="tile-resource__row" key={file} data-selected={index === 0 || undefined}>
                <Icon name="file" size={14} /><Text>{file}</Text><Icon name="chevron-right" size={13} />
              </div>
            ))}
          </div>
        </Window>
      )}
    </Tile>
  )
}

function ToleranceTile() {
  return (
    <Tile name="tolerance">
      {() => (
        <Window title="Tessellation" toolbar={<Icon name="more" size={16} />} className="tile-window" body={{ className: "tile-body" }}>
          <div className="tile-tolerance">
            <svg viewBox="0 0 160 150" aria-hidden="true" focusable="false">
              <circle cx="80" cy="75" r="48" className="tile-tolerance__circle" />
              <path d="M80 27 114 41 128 75 114 109 80 123 46 109 32 75 46 41Z" className="tile-tolerance__polygon" />
            </svg>
            <div className="tile-tolerance__caption"><Text>Curve tolerance</Text><span>0.1 mm</span></div>
          </div>
        </Window>
      )}
    </Tile>
  )
}

function AccountTile() {
  return (
    <Tile name="account">
      {() => (
        <Window title="Local profile" toolbar={<Icon name="more" size={16} />} className="tile-window" body={{ className: "tile-body" }}>
          <div className="tile-account">
            <div className="tile-account__person"><Avatar name="Alex" size={32} tone="person" /><div><Text>Alex Morgan</Text><span>Local account</span></div></div>
            <div className="tile-account__field"><Text>Profile</Text><span>Personal details</span><Icon name="chevron-right" size={14} /></div>
            <div className="tile-account__field"><Text>API keys</Text><span>Manage access</span><Icon name="chevron-right" size={14} /></div>
          </div>
        </Window>
      )}
    </Tile>
  )
}

export type TopicKind = "cam" | "ai" | "post" | "cad" | "api" | "history" | "arch" | "term" | "db" | "config" | "update" | "pair" | "workflow" | "plugin" | "sketch" | "mesh" | "machine" | "feature" | "playback" | "resource" | "tolerance" | "account"

/** One tile on its own, for a docs page or a form that wants a picture of the thing it describes. */
export function TopicTile({ kind, apiExample }: { kind: TopicKind; apiExample?: ApiExample }) {
  switch (kind) {
    case "cam": return <CamTile />
    case "ai": return <AssistantTile />
    case "post": return <PostTile />
    case "cad": return <CadTile />
    case "api": return <ApiTile example={apiExample} />
    case "history": return <HistoryTile />
    case "term": return <TermTile />
    case "db": return <DbTile />
    case "config": return <ConfigTile />
    case "update": return <UpdateTile />
    case "pair": return <PairTile />
    case "workflow": return <WorkflowTile />
    case "plugin": return <PluginTile />
    case "sketch": return <SketchTile />
    case "mesh": return <MeshTile />
    case "machine": return <MachineTile />
    case "feature": return <FeatureTile />
    case "playback": return <PlaybackTile />
    case "resource": return <ResourceTile />
    case "tolerance": return <ToleranceTile />
    case "account": return <AccountTile />
    case "arch": return <ArchTile />
  }
}

export default function ProductTiles({ titles }: { titles: [string, string, string, string, string, string] }) {
  const tiles = [<CamTile key="cam" />, <AssistantTile key="ai" />, <PostTile key="post" />, <SketchTile key="sketch" />, <MachineTile key="machine" />, <WorkflowTile key="workflow" />]
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
