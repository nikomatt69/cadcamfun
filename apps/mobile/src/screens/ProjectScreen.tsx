/**
 * Project screen — a tab container over a paired project's content.
 *
 * Tab switching follows Apple's `TabView`: an opacity cross-fade is enough (Emil: only animate
 * `opacity` for page swaps; no slide, no scale). The container owns the active tab and lets the
 * children render themselves; `tabSwap()` re-targets the active panel's opacity so a fast-tapping
 * user never sees the swap freeze mid-flight.
 *
 * Back navigation: a chevron in the nav bar pops to the projects list with the same press
 * feedback the rest of the app uses.
 */
import { Match, Switch, createEffect, createSignal, on, type Component } from "solid-js"
import type { CompanionClient, ProjectSummary } from "../companion/client.ts"
import { TabBar, type TabItem } from "../components/TabBar.tsx"
import { NavBar } from "../components/NavBar.tsx"
import { ChevronLeft, Clock, Pulls, Bolt, Sparkle } from "../components/Icon.tsx"
import { HistoryScreen } from "./HistoryScreen.tsx"
import { PullsScreen } from "./PullsScreen.tsx"
import { ActionsScreen } from "./ActionsScreen.tsx"
import { AssistantScreen } from "./AssistantScreen.tsx"
import { tabSwap } from "../lib/motion.ts"
import { haptic } from "../lib/haptic.ts"

export interface ProjectScreenProps {
  readonly client: CompanionClient
  readonly project: ProjectSummary
  readonly onBack: () => void
  readonly onOpenPr: (number: number) => void
}

type Tab = "history" | "pulls" | "actions" | "assistant"

const TABS: ReadonlyArray<TabItem<Tab>> = [
  { id: "history", label: "History", icon: Clock },
  { id: "pulls", label: "Pulls", icon: Pulls },
  { id: "actions", label: "Actions", icon: Bolt },
  { id: "assistant", label: "Assistant", icon: Sparkle },
]

export const ProjectScreen: Component<ProjectScreenProps> = (props) => {
  const [tab, setTab] = createSignal<Tab>("pulls")
  let panelEl: HTMLDivElement | undefined

  // Cross-fade between tabs. Apple TabView pattern: opacity only, fast.
  createEffect(on(tab, () => {
    tabSwap(panelEl ?? null)
  }))

  return (
    <main class="screen">
      <NavBar
        variant="compact"
        title={props.project.name}
        back={{ onClick: () => { haptic("selection"); props.onBack() } }}
      />
      <div ref={panelEl}>
        <Switch>
          <Match when={tab() === "history"}>
            <HistoryScreen client={props.client} projectId={props.project.id} />
          </Match>
          <Match when={tab() === "pulls"}>
            <PullsScreen client={props.client} projectId={props.project.id} onOpen={props.onOpenPr} />
          </Match>
          <Match when={tab() === "actions"}>
            <ActionsScreen client={props.client} projectId={props.project.id} />
          </Match>
          <Match when={tab() === "assistant"}>
            <AssistantScreen client={props.client} projectId={props.project.id} />
          </Match>
        </Switch>
      </div>
      <TabBar
        tabs={TABS}
        active={tab()}
        onChange={(id) => { haptic("selection"); setTab(id) }}
      />
      <div style={{ height: "calc(82px + var(--safe-bottom))" }} aria-hidden="true" />
    </main>
  )
}