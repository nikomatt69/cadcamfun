import { Caret, Prompt, Stage, Window } from "../../stageshow/kit"
import { useSiteTheme } from "./useSiteTheme"
import "./quickstart.css"

const COMMANDS = ["bun install", "bun test packages apps", "bun run desktop:dev"]

export default function QuickstartTerminal() {
  const theme = useSiteTheme()
  return (
    <Stage width={520} height={230} compact={{ below: 420, width: 358, height: 230 }} theme={theme} greys="cool" className="qt">
      {() => (
        <Window chrome="terminal" title="cadcamfun — zsh" className="qt-window">
          {COMMANDS.map((c, i) => (
            <Prompt key={c} path="~/cadcamfun">{c}{i === COMMANDS.length - 1 ? <Caret /> : null}</Prompt>
          ))}
        </Window>
      )}
    </Stage>
  )
}
