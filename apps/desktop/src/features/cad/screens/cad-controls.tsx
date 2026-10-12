import { For, type JSX } from "solid-js"
import { MousePointer2, Minus, Square, Circle, CircleDashed, Spline, Type, Ruler, Move, RotateCcw, Maximize2, FlipHorizontal, Ellipsis, GitBranch, Scissors, CornerUpRight, Triangle } from "lucide-solid"
import { AVAILABLE_TOOLS, type ToolId } from "../../../viewport/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { t, type Key } from "../../../i18n/index.ts"

export function CadButton(props: { label: string; children: JSX.Element; onClick: () => void; active?: boolean; disabled?: boolean; class?: string }) {
  return <button type="button" class={`cad-button ${props.class ?? ""}`} title={props.label} aria-label={props.label} aria-pressed={props.active} disabled={props.disabled} onClick={props.onClick}>{props.children}</button>
}

export function CadToolIcon(props: { tool: string; size?: number }) {
  const icons: Record<string, typeof MousePointer2> = {
    select: MousePointer2,
    line: Minus,
    rectangle: Square,
    circle: Circle,
    ellipse: CircleDashed,
    polyline: Spline,
    arc: CircleDashed,
    text: Type,
    dimension: Ruler,
    move: Move,
    rotate: RotateCcw,
    scale: Maximize2,
    mirror: FlipHorizontal,
    offset: GitBranch,
    trim: Scissors,
    fillet: CornerUpRight,
    chamfer: Triangle
  }
  const Icon = icons[props.tool] ?? Ellipsis
  return <Icon size={props.size ?? 17} />
}

export function CadToolPalette(props: { compact?: boolean; transform?: boolean; modify?: boolean }) {
  const app = useApp()
  const transforms: readonly ToolId[] = ["move", "rotate", "scale", "mirror"]
  const modify: readonly ToolId[] = ["offset", "trim", "fillet", "chamfer"]
  const tools = () =>
    AVAILABLE_TOOLS.filter((tool) =>
      props.transform ? transforms.includes(tool) : props.modify ? modify.includes(tool) : !transforms.includes(tool) && !modify.includes(tool)
    )
  return <div class={props.compact ? "cad-tool-grid compact" : "cad-tool-grid"}>
    <For each={tools()}>{(tool) => <CadButton label={t(`cad.${tool}` as Key)} active={app.tool() === tool} onClick={() => app.setTool(tool as ReturnType<typeof app.tool>)}>
      <CadToolIcon tool={tool} /><span>{t(`cad.${tool}` as Key)}</span>
    </CadButton>}</For>
  </div>
}
