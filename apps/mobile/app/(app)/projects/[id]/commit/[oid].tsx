import { useCallback, useState } from "react"
import { Alert, RefreshControl, Text, View } from "react-native"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { commitTime, commitTitle, relativeTime, shortOid } from "@/lib/format"
import { commitBody } from "@/lib/workspace-filter"
import { DiffView } from "@/components/DiffView"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { ActionButton } from "@/components/ui/ActionButton"
import { Skeleton } from "@/components/ui/Skeleton"
import { PageScroll } from "@/components/layout/page-scroll"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { haptic } from "@/lib/haptics"
import { errorMessage } from "@/lib/throttle"
import { toast } from "@/components/ui/ToastHost"

/**
 * One commit, read as the project sees it: message, author, oid, and the CAD-aware property diff
 * against its first parent. Root commits diff against the empty tree.
 */
export default function CommitScreen() {
  const { id, oid } = useLocalSearchParams<{ id: string; oid: string }>()
  const { client } = useServer()
  const { palette } = useTheme()
  const router = useRouter()
  const [restoring, setRestoring] = useState(false)

  const log = useResource(useCallback((signal) => (client ? client.log(id, 100, signal) : Promise.reject(new Error("Not connected"))), [client, id]), `log:${id}:commit`)
  const commit = (log.data ?? []).find((candidate) => candidate.oid === oid)
  const parent = commit?.parents[0]

  const diff = useResource(
    useCallback(
      (signal) => (client ? client.diff(id, oid, parent, signal) : Promise.reject(new Error("Not connected"))),
      [client, id, oid, parent],
    ),
    `diff:${id}:${oid}`,
  )

  /**
   * Restore puts this revision back as a *new* commit: history is never rewritten. A dirty working copy
   * refuses it, exactly like git, so the phone says so instead of pretending it worked.
   */
  const restore = () => {
    if (!client || !oid || restoring) return
    Alert.alert(
      "Restore this version?",
      "The files of this commit come back as a new commit. Nothing in the history is rewritten.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          onPress: () => {
            setRestoring(true)
            void client.restore(id, oid).then(() => {
              haptic("success")
              toast("Restored as a new commit", "success")
              router.back()
            }).catch((error: unknown) => {
              haptic("error")
              toast(errorMessage(error, "Could not restore this version"), "error")
            }).finally(() => setRestoring(false))
          },
        },
      ],
    )
  }

  if (!client) return null

  return (
    <View collapsable={false} style={{ flex: 1, backgroundColor: palette.background }}>
      <Stack.Screen options={{ title: oid ? shortOid(oid) : "Commit" }} />

      <PageScroll refreshControl={<RefreshControl refreshing={(log.loading || diff.loading) && Boolean(diff.data)} onRefresh={() => { void log.reload(); void diff.reload() }} tintColor={palette.accent} />}>
          {log.loading && !log.data ? <Skeleton style={{ height: 120 }} /> : null}
          {log.error ? <ErrorBanner message={log.error} actionLabel="Retry" onAction={() => void log.reload()} /> : null}
          {commit ? (
            <SurfaceCard eyebrow="COMMIT DETAILS">
              <Text selectable style={{ color: palette.ink, fontSize: 22, lineHeight: 27, fontWeight: "700", letterSpacing: -0.5 }}>{commitTitle(commit.message)}</Text>
              {commitBody(commit.message) ? <Text selectable style={{ marginTop: 10, color: palette.soft, fontSize: 14, lineHeight: 21 }}>{commitBody(commit.message)}</Text> : null}
              <Text selectable style={{ marginTop: 10, color: palette.muted, fontSize: 13, lineHeight: 19 }}>
                {commit.author.name} · {relativeTime(commitTime(commit.author.time))}
                {commitTime(commit.author.time) ? ` · ${new Date(commitTime(commit.author.time)).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}` : ""}
              </Text>
              <Text selectable style={{ marginTop: 4, color: palette.muted, fontSize: 12, lineHeight: 18, fontFamily: "Menlo" }}>
                {commit.oid}{parent ? `\nparent ${shortOid(parent)}` : "\nroot commit"}
              </Text>
            </SurfaceCard>
          ) : log.data && !log.loading ? (
            <Text selectable style={{ color: palette.muted, fontSize: 13, lineHeight: 19 }}>
              Commit <Text style={{ fontFamily: "Menlo" }}>{shortOid(oid)}</Text> is older than the latest 100 commits; its changes are shown below.
            </Text>
          ) : null}

          {diff.loading && !diff.data ? <Skeleton style={{ height: 160 }} /> : null}
          {diff.error ? <ErrorBanner message={diff.error} actionLabel="Retry" onAction={() => void diff.reload()} /> : null}
          {diff.data && diff.data.length > 0 ? <DiffView changes={diff.data} /> : diff.data ? (
            <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 20, textAlign: "center", paddingTop: 24 }}>Empty commit</Text>
          ) : null}

          {/* Restore is a desktop-grade action: the phone may do it, but it says what it does first. */}
          {commit ? (
            <View style={{ paddingTop: 20 }}>
              <ActionButton label="Restore this version" variant="secondary" onPress={restore} loading={restoring} />
            </View>
          ) : null}
      </PageScroll>
    </View>
  )
}
