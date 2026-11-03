import { Caret, Prompt, Stage, Window } from "../../stageshow/kit"
import { useSiteTheme } from "./useSiteTheme"
import "./quickstart.css"

const COMMANDS = ["bun install", "bun test packages apps", "bun run desktop:dev"]

// 16px gutter + 38px bar + 28px per prompt line + 16px foot
const heightFor = (lines: number) => 16 + 38 + lines * 28 + 16

export default function QuickstartTerminal({ commands = COMMANDS, title = "cadcamfun — zsh", path = "~/cadcamfun" }: { commands?: string[]; title?: string; path?: string }) {
  const height = heightFor(commands.length)
  const theme = useSiteTheme()
  return (
    <Stage width={520} height={height} compact={{ below: 420, width: 358, height }} theme={theme} greys="cool" className="qt">
      {() => (
        <Window chrome="terminal" title={title} className="qt-window" style={{ height: height - 16 }}>
          {commands.map((c, i) => (
            <Prompt key={c} path={path}>{c}{i === commands.length - 1 ? <Caret /> : null}</Prompt>
          ))}
        </Window>
      )}
    </Stage>
  )
}
