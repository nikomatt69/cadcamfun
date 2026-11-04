import { Bar, Stage, Stream, Text, Window, type Act } from "../../stageshow/kit"
import { useSiteTheme } from "./useSiteTheme"
import "./docsshot.css"

// The docs assistant answering from the pages: a question lands, a short
// pause, the answer streams in place, the pages it read arrive last.

const A = "The built-in posts include generic, Fanuc, GRBL and Haas. LinuxCNC is recognized, but is not implemented in this registry."
const WORDS = A.split(" ").length

type S = { asked: boolean; thinking: boolean; words: number; sources: boolean }
const initial: S = { asked: false, thinking: false, words: 0, sources: false }
const POSTER: S = { asked: true, thinking: false, words: WORDS, sources: true }

async function script(a: Act<S>) {
  await a.wait(800)
  await a.set({ asked: true })
  await a.wait(500)
  await a.set({ thinking: true })
  await a.wait(900)
  await a.set({ thinking: false })
  for (let n = 1; n <= WORDS; n++) {
    await a.set({ words: n })
    await a.wait(40)
  }
  await a.wait(300)
  await a.set({ sources: true })
  await a.wait(3200)
  await a.set({ ...initial })
  await a.wait(600)
}

export default function DocsAssistantShot() {
  const theme = useSiteTheme()
  return (
    <Stage width={720} height={300} compact={{ below: 480, width: 358, height: 340 }} initial={initial} poster={POSTER} script={script} theme={theme} greys="cool" className="ds">
      {(s) => (
        <Window url="cadcam.fun/docs" className="ds-window">
          <div className="ds-body">
            <nav className="ds-nav">
              <Bar w={56} h={7} tone={4} />
              {[48, 64, 40, 58, 44].map((w, i) => (
                <Bar key={i} w={w} h={6} tone={2} />
              ))}
            </nav>
            <div className="ds-chat">
              <div className="ds-msg ds-msg--me" data-show={s.asked || undefined}>
                <Text>Which post processors are available?</Text>
              </div>
              <div className="ds-think" data-show={s.thinking || undefined}>
                <Text>Reading the docs…</Text>
              </div>
              <div className="ds-msg ds-msg--ai">
                <Stream text={A} count={s.words} />
              </div>
              <div className="ds-sources" data-show={s.sources || undefined}>
                <span className="ds-source"><Text>CAM</Text></span>
                <span className="ds-source"><Text>Controller dialects</Text></span>
              </div>
            </div>
          </div>
        </Window>
      )}
    </Stage>
  )
}
