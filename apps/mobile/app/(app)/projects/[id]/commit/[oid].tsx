import { useCallback } from "react"
import { ScrollView, Text, View } from "react-native"
import { Stack, useLocalSearchParams } from "expo-router"
import { useServer } from "@/lib/server"
import { useResource } from "@/lib/use-resource"
import { useTheme } from "@/lib/theme"
import { commitTime, commitTitle, relativeTime, shortOid } from "@/lib/format"
import { DiffView } from "@/components/DiffView"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { Skeleton } from "@/components/ui/Skeleton"

/**
 * One commit, read as the project sees it: message, author, oid, and the CAD-aware property diff
 * against its first parent. Root commits diff against the empty tree.
 */
export default function CommitScreen() {
  const { id, oid } = useLocalSearchParams<{ id: string; oid: string }>()
  const { client } = useServer()
  const { palette } = useTheme()

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

  if (!client) return null

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <Stack.Screen options={{ title: oid ? shortOid(oid) : "Commit" }} />

      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <View style={{ padding: 16, gap: 14 }}>
          {commit ? (
            <View style={{ gap: 4 }}>
              <Text style={{ color: palette.ink, fontSize: 22, lineHeight: 27, fontWeight: "700", letterSpacing: -0.02 }}>{commitTitle(commit.message)}</Text>
              <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18 }}>
                {commit.author.name} · {relativeTime(commitTime(commit.author.time))} ·{" "}
                <Text style={{ fontFamily: "Menlo" }}>{shortOid(commit.oid)}</Text>
              </Text>
            </View>
          ) : null}

          {diff.loading ? <Skeleton style={{ height: 160 }} /> : null}
          {diff.error ? <ErrorBanner message={diff.error} actionLabel="Retry" onAction={() => void diff.reload()} /> : null}
          {diff.data && diff.data.length > 0 ? <DiffView changes={diff.data} /> : diff.data ? (
            <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 20, textAlign: "center", paddingTop: 24 }}>Empty commit</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  )
}
