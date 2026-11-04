import { Box, Download, Layers, PenLine } from "lucide-react"
import { Bar, Code, Stage, Text, Window, Caret, type Act } from "../../stageshow/kit"
import { PartView } from "./PartView"
import { useSiteTheme } from "./useSiteTheme"
import "./workbench.css"

// The home hero: pick the Pocket operation, watch the toolpath draw across the
// bracket, post it. One sketch, one operation, one file of G-code.

type S = {
  tool: "sketch" | "extrude" | "pocket"
  path: boolean
  cycle: boolean
  post: boolean
  lines: number
}

const initial: S = { tool: "extrude", path: false, cycle: false, post: false, lines: 0 }
const POSTER: S = { tool: "pocket", path: true, cycle: true, post: true, lines: 6 }

const GCODE = ["G21 G90 G54", "T1 M6 S9000", "G0 X18 Y14", "G1 Z-4 F300", "G1 X62 Y14 F900", "G1 X62 Y44"]

async function script(a: Act<S>) {
  await a.wait(700)
  await a.move("tool-pocket")
  await a.wait(250)
  await a.click()
  await a.set({ tool: "pocket" })
  await a.wait(500)
  await a.set({ path: true })
  await a.wait(2000)
  await a.set({ cycle: true })
  await a.wait(900)
  await a.move("post")
  await a.wait(250)
  await a.click()
  await a.set({ post: true })
  await a.wait(500)
  for (let n = 1; n <= GCODE.length; n++) {
    await a.set({ lines: n })
    await a.wait(140)
  }
  await a.move("rest")
  await a.wait(2400)
  await a.set({ post: false })
  await a.wait(500)
  await a.set({ ...initial })
  await a.wait(500)
}

const TOOLS = [
  { id: "sketch", icon: PenLine },
  { id: "extrude", icon: Box },
  { id: "pocket", icon: Layers },
] as const

export default function HeroWorkbench() {
  const theme = useSiteTheme()
  return (
    <Stage
      width={720}
      height={340}
      compact={{ below: 460, width: 358, height: 380 }}
      initial={initial}
      poster={POSTER}
      script={script}
      theme={theme}
      greys="cool"
      cursor={{ at: { wide: { x: 520, y: 250 }, compact: { x: 250, y: 300 } }, style: "arrow" }}
      className="wb"
    >
      {(s) => (
        <>
          <Window
            title="Bracket"
            className="wb-window"
            sidebar={
              <div className="wb-side">
                <Text className="wb-side__head">History</Text>
                {(["Sketch 1", "Extrude", "Pocket"] as const).map((name, i) => (
                  <div key={name} className="wb-step" data-on={(s.tool === "pocket" ? 2 : 1) === i || undefined}>
                    <Bar w={10} h={10} r={3} tone={(s.tool === "pocket" ? 2 : 1) === i ? 4 : 3} />
                    <Text className="wb-step__label">{name}</Text>
                  </div>
                ))}
                <div className="wb-step" data-quiet>
                  <Bar w={10} h={10} r={3} tone={2} />
                  <Bar w={44} h={6} tone={2} />
                </div>
              </div>
            }
            sidebarWidth={140}
            toolbar={
              <div className="wb-tools">
                {TOOLS.map(({ id, icon: I }) => (
                  <span key={id} className="wb-tool" data-target={`tool-${id}`} data-cursor="pointer" data-on={s.tool === id || undefined}>
                    <I size={14} strokeWidth={1.6} />
                  </span>
                ))}
                <span className="wb-post" data-target="post" data-cursor="pointer">
                  <Download size={12} strokeWidth={1.8} />
                  <Text>Post</Text>
                </span>
              </div>
            }
          >
            <div className="wb-view">
              <PartView pocket={s.tool === "pocket"} path={s.path} />
              <div className="wb-chip" data-show={s.cycle || undefined}>
                <Text>Cycle 04:12</Text>
              </div>
            </div>
          </Window>

          <Window chrome="terminal" title="bracket.nc" className="wb-terminal" data-show={s.post || undefined}>
            <Code lines={GCODE} count={s.lines} className="wb-code" />
            <Caret />
          </Window>
        </>
      )}
    </Stage>
  )
}
