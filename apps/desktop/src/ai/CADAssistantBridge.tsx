/**
 * Bridge between the CAD editor state and the AI assistant.
 *
 * `CADPage` mounts it while the docked AI panel is open. It listens to the app
 * state (entity count, active layer) and publishes a snapshot of the CAD context
 * next to the panel so the assistant's tools can read what the user is looking at.
 *
 * nikcli's session model owns the *conversation* state; this bridge owns the
 * UI side of the context, and the store derives the `context` string it sends
 * with each chat payload from the same drawing state.
 */
import { Show, createEffect, createSignal, type JSX } from "solid-js"
import { useApp } from "../state/context.ts"
import { useAiStore } from "./context.tsx"

export interface CadContextData {
  readonly totalElementCount: number
  readonly selectedElementCount: number
  readonly selectedElements: ReadonlyArray<Record<string, unknown>>
  readonly activeLayer: { id: string; name: string } | null
}

interface Props {
  readonly isVisible: boolean
  readonly initialContextData: CadContextData
}

export function CADAssistantBridge(props: Props): JSX.Element {
  const app = useApp()
  const ai = useAiStore()
  const [bridgeData, setBridgeData] = createSignal<CadContextData>(props.initialContextData)

  createEffect(() => {
    const drawing = app.drawing()
    setBridgeData({
      totalElementCount: drawing.entities.length,
      selectedElementCount: 0,
      selectedElements: [],
      activeLayer: drawing.layers[0] ? { id: drawing.layers[0].id, name: drawing.layers[0].name } : null
    })
  })

  // The panel itself is the shell's docked AI panel; this node only publishes the
  // CAD context snapshot for the assistant while that panel is open.
  return (
    <Show when={props.isVisible}>
      <div
        class="hidden"
        data-assistant-context={JSON.stringify(bridgeData())}
        data-ai-status={ai.aiStatus()?.host ?? "direct"}
      />
    </Show>
  )
}