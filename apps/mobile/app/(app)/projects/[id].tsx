import { useCallback, useMemo, useState } from "react"
import { Platform, Text, View, useWindowDimensions } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { Sparkles } from "lucide-react-native"
import type { LiveEvent } from "@cadcamfun/api"
import { useServer } from "@/lib/server"
import { useTheme } from "@/lib/theme"
import { contentGutter } from "@/lib/layout"
import { useLiveEvents } from "@/lib/live-events"
import { useResource } from "@/lib/use-resource"
import { useUIStore } from "@/lib/store"
import { haptic } from "@/lib/haptics"
import { errorMessage } from "@/lib/throttle"
import { toast } from "@/components/ui/ToastHost"
import { SegmentedControl } from "@/components/ui/SegmentedControl"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { TextField } from "@/components/ui/TextField"
import { ActionButton } from "@/components/ui/ActionButton"
import { OverviewPanel } from "@/components/project/OverviewPanel"
import { HistoryPanel } from "@/components/project/HistoryPanel"
import { PullsPanel } from "@/components/project/PullsPanel"
import { ActionsPanel } from "@/components/project/ActionsPanel"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
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
  const { width, fontScale } = useWindowDimensions()
  const router = useRouter()
  const setAssistantProject = useUIStore((state) => state.setAssistantProject)

  const [tab, setTab] = useState<Tab>("overview")
  const [refresh, setRefresh] = useState<Record<Tab, number>>({ overview: 0, history: 0, pulls: 0, actions: 0 })

  // Commit sheet
  const [commitOpen, setCommitOpen] = useState(false)
  const [commitMessage, setCommitMessage] = useState("")
  const [committing, setCommitting] = useState(false)
  /** What the commit will capture, so the sheet can say it before the user sends it. */
  const [commitTarget, setCommitTarget] = useState<{ branch: string; files: number } | null>(null)

  // Checkout sheet
  const [checkoutBranch, setCheckoutBranch] = useState<string | null>(null)
  const [checkingOut, setCheckingOut] = useState(false)

  // New branch sheet
  const [branchOpen, setBranchOpen] = useState(false)
  const [branchName, setBranchName] = useState("")
  const [creatingBranch, setCreatingBranch] = useState(false)

  // Dispatch
  const [dispatching, setDispatching] = useState(false)
  /** The ref a manual workflow run is made on; the desktop runs the workflows of that branch. */
  const [dispatchOpen, setDispatchOpen] = useState(false)
  const [dispatchRef, setDispatchRef] = useState<string | null>(null)

  const branches = useResource(
    useCallback((signal) => (client ? client.branches(id, signal) : Promise.reject(new Error("Not connected"))), [client, id]),
    `branches:${id}:${dispatchOpen ? "open" : "closed"}`,
  )

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
      toast(errorMessage(error, "Commit failed"), "error")
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
      toast(errorMessage(error, "Checkout failed"), "error")
    } finally {
      setCheckingOut(false)
    }
  }

  const doCreateBranch = async () => {
    const name = branchName.trim()
    if (!name || !client || creatingBranch) return
    setCreatingBranch(true)
    try {
      await client.createBranch(id, name)
      haptic("success")
      toast(`Branch ${name} created`, "success")
      setBranchOpen(false)
      setBranchName("")
      bump("overview")
      bump("history")
    } catch (error) {
      haptic("error")
      toast(errorMessage(error, "Could not create the branch"), "error")
    } finally {
      setCreatingBranch(false)
    }
  }

  const doDispatch = async (ref?: string) => {
    if (!client || dispatching) return
    setDispatching(true)
    try {
      await client.dispatch(id, ref)
      haptic("success")
      toast(ref ? `Workflows dispatched on ${ref}` : "Workflows dispatched", "success")
      setDispatchOpen(false)
      bump("actions")
    } catch (error) {
      haptic("error")
      toast(errorMessage(error, "Dispatch failed"), "error")
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
    <View collapsable={false} style={{ flex: 1, backgroundColor: palette.background }}>
      <Stack.Screen
        options={{
          title,
          headerRight: Platform.OS === "ios" ? undefined : () => (
            <PressableScale onPress={openAssistant} subtle accessibilityLabel="Open project assistant" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <Sparkles size={22} color={palette.accent} />
            </PressableScale>
          ),
        }}
      />

      {Platform.OS === "ios" ? <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="sparkles" accessibilityLabel="Open project assistant" onPress={openAssistant} tintColor={palette.accent} />
      </Stack.Toolbar> : null}

      <SafeAreaView edges={["left", "right"]}>
      <View style={{ paddingHorizontal: contentGutter(width), paddingTop: 8, paddingBottom: 12 }}>
        <SegmentedControl segments={TABS} value={tab} onChange={setTab} />
      </View>
      </SafeAreaView>

      {/* The project itself could not be read: the panels below would be empty without saying why. */}
      {project.error ? (
        <View style={{ paddingHorizontal: contentGutter(width), paddingBottom: 8 }}>
          <ErrorBanner message={project.error} actionLabel="Try again" onAction={() => void project.reload()} />
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        {tab === "overview" ? (
          <OverviewPanel
            client={client}
            projectId={id}
            refreshKey={refresh.overview}
            onCommit={(summary) => {
              haptic("selection")
              setCommitTarget(summary)
              setCommitOpen(true)
            }}
            onCheckout={(branch) => {
              haptic("selection")
              setCheckoutBranch(branch)
            }}
            onCreateBranch={() => {
              haptic("selection")
              setBranchOpen(true)
            }}
          />
        ) : tab === "history" ? (
          <HistoryPanel client={client} projectId={id} refreshKey={refresh.history} />
        ) : tab === "pulls" ? (
          <PullsPanel client={client} projectId={id} refreshKey={refresh.pulls} />
        ) : (
          <ActionsPanel client={client} projectId={id} refreshKey={refresh.actions} onDispatch={() => { haptic("selection"); setDispatchOpen(true) }} dispatching={dispatching} />
        )}
      </View>

      {/* Commit message sheet — a deliberate action; release is snappy, enter is the sheet spring. */}
      <BottomSheet open={commitOpen} onClose={() => setCommitOpen(false)} title="Commit changes">
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {commitTarget ? (
            <Text style={{ color: palette.soft, fontSize: 13, lineHeight: 19 }}>
              {commitTarget.files} {commitTarget.files === 1 ? "file" : "files"} on{" "}
              <Text style={{ fontFamily: "Menlo", color: palette.ink }}>{commitTarget.branch}</Text>
            </Text>
          ) : null}
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

      {/* New branch */}
      <BottomSheet open={branchOpen} onClose={() => setBranchOpen(false)} title="New branch">
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <TextField
            value={branchName}
            onChangeText={setBranchName}
            placeholder="feature/wider-plate"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <ActionButton label="Create branch" fullWidth onPress={() => void doCreateBranch()} disabled={branchName.trim().length === 0} loading={creatingBranch} />
        </View>
      </BottomSheet>

      {/* A manual workflow run: the ref decides which branch's workflows run. */}
      <BottomSheet open={dispatchOpen} onClose={() => setDispatchOpen(false)} title="Run workflows">
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {branches.error ? <ErrorBanner message={branches.error} actionLabel="Try again" onAction={() => void branches.reload()} /> : null}
          {branches.loading && !branches.data ? <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 20, textAlign: "center" }}>Loading branches…</Text> : null}
          {(Object.keys(branches.data?.branches ?? {})).sort().map((name) => (
            <PressableScale
              key={name}
              onPress={() => { haptic("selection"); setDispatchRef(name); void doDispatch(name) }}
              accessibilityRole="button"
              accessibilityLabel={`Run the workflows of ${name}`}
              style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, borderRadius: 16, borderCurve: "continuous", borderWidth: 0.5, borderColor: palette.border, backgroundColor: palette.surface }}
            >
              <Text style={{ color: palette.ink, fontFamily: "Menlo", fontSize: 15 }}>{name}</Text>
              {dispatchRef === name ? <Text style={{ color: palette.accent, fontSize: 13, fontWeight: "600" }}>Running…</Text> : null}
            </PressableScale>
          ))}
          {branches.data && Object.keys(branches.data.branches).length === 0 ? (
            <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 20, textAlign: "center" }}>This project has no branches yet.</Text>
          ) : null}
        </View>
      </BottomSheet>

      {/* Branch checkout confirmation */}
      <BottomSheet open={checkoutBranch !== null} onClose={() => setCheckoutBranch(null)} title="Switch branch">
        <View style={{ paddingHorizontal: 20, gap: 14 }}>
          <Text style={{ color: palette.soft, fontSize: 15, lineHeight: 21, textAlign: "center" }}>
            Check out <Text style={{ fontFamily: "Menlo", color: palette.ink }}>{checkoutBranch}</Text>? Commit your changes first; switching branches requires a clean working copy.
          </Text>
          <View style={{ flexDirection: fontScale > 1.2 || width < 375 ? "column" : "row", gap: 10 }}>
            <View style={{ flex: fontScale > 1.2 || width < 375 ? undefined : 1 }}>
              <ActionButton label="Cancel" fullWidth variant="secondary" onPress={() => setCheckoutBranch(null)} />
            </View>
            <View style={{ flex: fontScale > 1.2 || width < 375 ? undefined : 1 }}>
              <ActionButton label="Check out" fullWidth onPress={() => void doCheckout()} loading={checkingOut} />
            </View>
          </View>
        </View>
      </BottomSheet>
    </View>
  )
}
