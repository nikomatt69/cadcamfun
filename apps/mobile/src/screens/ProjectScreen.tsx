/**
 * Project screen — a tab container over a paired project's content.
 *
 * Tab switching follows Apple's `TabView`: an opacity cross-fade is enough (Emil: only animate
 * `opacity` for page swaps; no slide, no scale). The container owns the active tab and lets the
 * children render themselves; `tabSwap()` re-targets the active panel's opacity so a fast-tapping
 * user never sees the swap freeze mid-flight.
 *
 * Live updates
 *  - This screen owns the single SSE subscription for the project (see `lib/live-events.ts`); the
 *    tabs never open their own. A frame arrives, the matching resource is refetched, and the tab's
 *    badge updates — no polling, no pull-to-refresh.
 *  - The subscription is torn down when the screen unmounts, i.e. when the user goes back to the
 *    project list, so a phone sitting on the list holds no open TLS stream.
 *
 * Back navigation: a chevron in the nav bar pops to the projects list with the same press
 * feedback the rest of the app uses.
 */
import { Match, Switch, createEffect, createResource, createSignal, on, type Component } from "solid-js"
import type { LiveEvent } from "@cadcamfun/api"
import type { CompanionClient, ProjectSummary } from "../companion/client.ts"
import { TabBar, type TabItem } from "../components/TabBar.tsx"
import { NavBar } from "../components/NavBar.tsx"
import { ChevronLeft, Clock, Pulls, Bolt, Sparkle, Bell } from "../components/Icon.tsx"
import { HistoryScreen } from "./HistoryScreen.tsx"
import { PullsScreen } from "./PullsScreen.tsx"
import { ActionsScreen } from "./ActionsScreen.tsx"
import { AssistantScreen } from "./AssistantScreen.tsx"
import { NotificationsScreen } from "./NotificationsScreen.tsx"
import { useLiveEvents, type ConnectionState } from "../lib/live-events.ts"
import { tabSwap } from "../lib/motion.ts"
import { haptic } from "../lib/haptic.ts"

/** Three-state live indicator for the nav bar: green when streaming, amber while reconnecting, grey offline. */
const ConnectionDot: Component<{ readonly state: ConnectionState }> = (props) => (
  <span class={`conn-dot conn-${props.state}`} role="status" aria-label={`Live updates: ${props.state}`} title={`Live updates: ${props.state}`} />
)

export interface ProjectScreenProps {
  readonly client: CompanionClient
  readonly project: ProjectSummary
  readonly onBack: () => void
  readonly onOpenPr: (number: number) => void
}

type Tab = "history" | "pulls" | "actions" | "assistant" | "alerts"

/** Which tabs a given frame should refresh: the events it touches map onto the tab that shows them. */
const TAB_FOR_EVENT = (event: LiveEvent): ReadonlyArray<Tab> => {
  switch (event.type) {
    case "pr.opened":
    case "pr.merged":
    case "pr.closed":
    case "pr.reviewed":
      return ["pulls"]
    case "commit":
      return ["history", "pulls"]
    case "workflow.started":
    case "workflow.finished":
      return ["actions"]
    case "ai.session":
      return ["assistant"]
  }
}

export const ProjectScreen: Component<ProjectScreenProps> = (props) => {
  const [tab, setTab] = createSignal<Tab>("pulls")
  let panelEl: HTMLDivElement | undefined

  const projectId = () => props.project.id
  const live = useLiveEvents(props.client, projectId)

  // Bumped when a frame arrives that a tab cares about; the child resources key on it, so they
  // refetch exactly once per burst instead of once per frame.
  const [historyKey, setHistoryKey] = createSignal(0)
  const [pullsKey, setPullsKey] = createSignal(0)
  const [actionsKey, setActionsKey] = createSignal(0)
  const [alertsKey, setAlertsKey] = createSignal(0)

  // The badge is the only reason the shell reads the feed outside the Alerts tab: it has to be right
  // on the other four. It is keyed on `alertsKey` so it refetches with the same signal, and it asks
  // for `limit: 1` because only the count matters here.
  const [unread] = createResource(
    alertsKey,
    async () => (await props.client.notifications({ limit: 1, onlyUnread: true })).unreadCount,
  )

  // Cross-fade between tabs. Apple TabView pattern: opacity only, fast.
  createEffect(on(tab, () => {
    tabSwap(panelEl ?? null)
  }))

  createEffect(() => {
    const pending = live.takePending()
    if (pending.length === 0) return
    haptic("light")
    const touched = new Set(pending.flatMap(TAB_FOR_EVENT))
    if (touched.has("history")) setHistoryKey((n) => n + 1)
    if (touched.has("pulls")) setPullsKey((n) => n + 1)
    if (touched.has("actions")) setActionsKey((n) => n + 1)
    // Any project activity may have written a notification row, so the badge is re-read too.
    setAlertsKey((n) => n + 1)
  })

  const TABS: ReadonlyArray<TabItem<Tab>> = [
    { id: "history", label: "History", icon: Clock },
    { id: "pulls", label: "Pulls", icon: Pulls },
    { id: "actions", label: "Actions", icon: Bolt },
    { id: "assistant", label: "Assistant", icon: Sparkle },
    { id: "alerts", label: "Alerts", icon: Bell, badge: unread() ?? 0 },
  ]

  return (
    <main class="screen">
      <NavBar
        variant="compact"
        title={props.project.name}
        back={{ onClick: () => { haptic("selection"); props.onBack() } }}
        // The live indicator answers the question a companion app always raises: "is this stale?".
        // It is deliberately small — the reconnects happen in the background and the tabs refetch
        // themselves, so an outage is not a state the user has to act on.
        trailing={<ConnectionDot state={live.state()} />}
      />
      <div ref={panelEl}>
        <Switch>
          <Match when={tab() === "history"}>
            <HistoryScreen client={props.client} projectId={projectId()} refreshKey={historyKey} />
          </Match>
          <Match when={tab() === "pulls"}>
            <PullsScreen client={props.client} projectId={projectId()} refreshKey={pullsKey} onOpen={props.onOpenPr} />
          </Match>
          <Match when={tab() === "actions"}>
            <ActionsScreen client={props.client} projectId={projectId()} refreshKey={actionsKey} />
          </Match>
          <Match when={tab() === "assistant"}>
            <AssistantScreen client={props.client} projectId={projectId()} />
          </Match>
          <Match when={tab() === "alerts"}>
            <NotificationsScreen client={props.client} refreshKey={alertsKey} />
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
