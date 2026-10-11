import { useCallback, useMemo, useState } from "react"
import { Text, View } from "react-native"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { Sparkles } from "lucide-react-native"
import type { LiveEvent } from "@cadcamfun/api"
import { useServer } from "@/lib/server"
import { useTheme } from "@/lib/theme"
import { useLiveEvents } from "@/lib/live-events"
import { useResource } from "@/lib/use-resource"
import { useUIStore } from "@/lib/store"
import { haptic } from "@/lib/haptics"
import { toast } from "@/components/ui/ToastHost"
import { SegmentedControl } from "@/components/ui/SegmentedControl"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { TextField } from "@/components/ui/TextField"
import { ActionButton } from "@/components/ui/ActionButton"
import { OverviewPanel } from "@/components/project/OverviewPanel"
import { HistoryPanel } from "@/components/project/HistoryPanel"
import { PullsPanel } from "@/components/project/PullsPanel"
import { ActionsPanel } from "@/components/project/ActionsPanel"
import { PressableScale } from "@/components/ui/PressableScale"

type Tab = "overview" | "history" | "pulls" | "actions"

const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "history", label: "History" },
  { value: "pulls", label: "Pulls" },
  { value: "actions", label: "Actions" },
]

/** Which panels a live frame refreshes: the events map onto the tab that shows them. */
const TABS_FOR_EVENT = (event: LiveEvent): ReadonlyArray<Tab> => {
  switch (event.type) {
    case "pr.opened":
    case "pr.merged":
    case "pr.closed":
    case "pr.reviewed":
      return ["pulls"]
    case "commit":
      return ["history", "overview", "pulls"]
    case "workflow.started":
    case "workflow.finished":
      return ["actions"]
    default:
      return []
  }
}

/**
 * The project screen — segmented panels over one workspace. It owns the project's live SSE stream
 * (the panels never open their own): a frame arrives, the matching panel's resource key bumps and
 * it refetches exactly once per burst. The ✦ button points the Assistant tab at this project.
 */
export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { client } = useServer()
  const { palette } = useTheme()
  const router = useRouter()
  const setAssistantProject = useUIStore((state) => state.setAssistantProject)

  const [tab, setTab] = useState<Tab>("overview")
  const [refresh, setRefresh] = useState<Record<Tab, number>>({ overview: 0, history: 0, pulls: 0, actions: 0 })

  // Commit sheet
  const [commitOpen, setCommitOpen] = useState(false)
  const [commitMessage, setCommitMessage] = useState("")
  const [committing, setCommitting] = useState(false)

  // Checkout sheet
  const [checkoutBranch, setCheckoutBranch] = useState<string | null>(null)
  const [checkingOut, setCheckingOut] = useState(false)

  // Dispatch
  const [dispatching, setDispatching] = useState(false)

  const project = useResource(
    useCallback((signal) => (client ? client.project(id, signal) : Promise.reject(new Error("Not connected"))), [client, id]),
    `project:${id}`,
  )

  const bump = useCallback((which: Tab) => {
    setRefresh((previous) => ({ ...previous, [which]: previous[which] + 1 }))
  }, [])

  useLiveEvents(
    id,
    useCallback(
      (event: LiveEvent) => {
        for (const which of TABS_FOR_EVENT(event)) bump(which)
      },
      [bump],
    ),
  )

  const title = useMemo(() => project.data?.name ?? "Project", [project.data])

  const doCommit = async () => {
    const message = commitMessage.trim()
    if (!message || !client || committing) return
    setCommitting(true)
    try {
      await client.commit(id, message)
      haptic("success")
      toast("Committed", "success")
      setCommitOpen(false)
      setCommitMessage("")
      bump("overview")
      bump("history")
    } catch (error) {
      haptic("error")
      toast(error instanceof Error ? error.message : "Commit failed", "error")
    } finally {
      setCommitting(false)
    }
  }

  const doCheckout = async () => {
    if (!checkoutBranch || !client || checkingOut) return
    setCheckingOut(true)
    try {
      await client.checkout(id, checkoutBranch)
      haptic("success")
      toast(`Now on ${checkoutBranch}`, "success")
      setCheckoutBranch(null)
      bump("overview")
      bump("history")
    } catch (error) {
      haptic("error")
      toast(error instanceof Error ? error.message : "Checkout failed", "error")
    } finally {
      setCheckingOut(false)
    }
  }

  const doDispatch = async () => {
    if (!client || dispatching) return
    setDispatching(true)
    try {
      await client.dispatch(id)
      haptic("success")
      toast("Workflows dispatched", "success")
      bump("actions")
    } catch (error) {
      haptic("error")
      toast(error instanceof Error ? error.message : "Dispatch failed", "error")
    } finally {
      setDispatching(false)
    }
  }

  const openAssistant = () => {
    haptic("selection")
    setAssistantProject(id)
    router.navigate("/assistant")
  }

  if (!client) return null

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            <PressableScale onPress={openAssistant} subtle>
              <Sparkles size={22} color={palette.accent} />
            </PressableScale>
          ),
        }}
      />

      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <SegmentedControl segments={TABS} value={tab} onChange={setTab} />
      </View>

      <View style={{ flex: 1 }}>
        {tab === "overview" ? (
          <OverviewPanel
            client={client}
            projectId={id}
            refreshKey={refresh.overview}
            onCommit={() => {
              haptic("selection")
              setCommitOpen(true)
            }}
            onCheckout={(branch) => {
              haptic("selection")
              setCheckoutBranch(branch)
            }}
          />
        ) : tab === "history" ? (
          <HistoryPanel client={client} projectId={id} refreshKey={refresh.history} />
        ) : tab === "pulls" ? (
          <PullsPanel client={client} projectId={id} refreshKey={refresh.pulls} />
        ) : (
          <ActionsPanel client={client} projectId={id} refreshKey={refresh.actions} onDispatch={() => void doDispatch()} dispatching={dispatching} />
        )}
      </View>

      {/* Commit message sheet — a deliberate action; release is snappy, enter is the sheet spring. */}
      <BottomSheet open={commitOpen} onClose={() => setCommitOpen(false)} title="Commit changes">
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <TextField
            value={commitMessage}
            onChangeText={setCommitMessage}
            placeholder="Describe the change…"
            autoFocus
            multiline
            style={{ minHeight: 88, alignItems: "flex-start" }}
          />
          <ActionButton label="Commit" fullWidth onPress={() => void doCommit()} disabled={commitMessage.trim().length === 0} loading={committing} />
        </View>
      </BottomSheet>

      {/* Branch checkout confirmation */}
      <BottomSheet open={checkoutBranch !== null} onClose={() => setCheckoutBranch(null)} title="Switch branch">
        <View style={{ paddingHorizontal: 20, gap: 14 }}>
          <Text style={{ color: palette.soft, fontSize: 15, lineHeight: 21, textAlign: "center" }}>
            Check out <Text style={{ fontFamily: "Menlo", color: palette.ink }}>{checkoutBranch}</Text>? Commit your changes first; switching branches requires a clean working copy.
          </Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <ActionButton label="Cancel" fullWidth variant="secondary" onPress={() => setCheckoutBranch(null)} />
            </View>
            <View style={{ flex: 1 }}>
              <ActionButton label="Check out" fullWidth onPress={() => void doCheckout()} loading={checkingOut} />
            </View>
          </View>
        </View>
      </BottomSheet>
    </View>
  )
}
