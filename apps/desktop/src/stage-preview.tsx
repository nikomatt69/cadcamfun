import { render } from "solid-js/web"
import type { JSX } from "solid-js"
import {
  AnalyticsScene, CommitScene, DocumentScene, FlagsScene, PasskeyScene, SessionsScene, TimelineScene
} from "./shared/ui/stageshow/index.ts"

// `?still=1` shows every poster, the frame a reduced-motion user and a screenshot get.
if (new URLSearchParams(window.location.search).has("still")) {
  const original = window.matchMedia.bind(window)
  window.matchMedia = (query: string): MediaQueryList =>
    query.includes("prefers-reduced-motion") ? ({ ...original(query), matches: true } as MediaQueryList) : original(query)
}

const SCENES: ReadonlyArray<readonly [string, () => JSX.Element]> = [
  ["Analytics · chart scrub", AnalyticsScene],
  ["Timeline · a row arrives", TimelineScene],
  ["Commit · a node lands", CommitScene],
  ["Document · the seal", DocumentScene],
  ["Passkey · the first key", PasskeyScene],
  ["Sessions · a device leaves", SessionsScene],
  ["Flags · a switch opens a row", FlagsScene]
]

function Grid(props: { readonly dark?: boolean }): JSX.Element {
  return (
    <section class={props.dark === true ? "dark" : undefined} style={{ background: props.dark === true ? "#12161c" : "#eef0f3", padding: "20px" }}>
      <div style={{ display: "grid", "grid-template-columns": "repeat(2, 360px)", gap: "20px" }}>
        {SCENES.map(([label, Scene]) => (
          <figure style={{ margin: "0" }}>
            <figcaption style={{ "font-family": "ui-monospace, monospace", "font-size": "10px", color: props.dark === true ? "#9aa4b2" : "#5b6575", margin: "0 0 6px" }}>{label}</figcaption>
            <div style={{ overflow: "hidden", border: `1px solid ${props.dark === true ? "#2b323d" : "#dde1e7"}`, "border-radius": "6px" }}>
              <Scene />
            </div>
          </figure>
        ))}
      </div>
    </section>
  )
}

render(() => <><div style={{ "font-family": "system-ui", "font-size": "12px", padding: "16px 20px 0", background: "#eef0f3" }}>Light · 360 px design width, shown 1:1 (poster frames)</div><Grid /><div style={{ "font-family": "system-ui", "font-size": "12px", padding: "16px 20px 0", background: "#12161c", color: "#9aa4b2" }}>Dark</div><Grid dark /></>, document.getElementById("root")!)
