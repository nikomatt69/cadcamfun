import { useCallback } from "react"
import { ScrollView, Text, View } from "react-native"
import { GitBranch, Sparkles } from "lucide-react-native"
import type { CompanionClient } from "@/lib/client"
import { useResource } from "@/lib/use-resource"
import { useServer } from "@/lib/server"
import { useTheme } from "@/lib/theme"
import { shortOid } from "@/lib/format"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { ListRow } from "@/components/ui/ListRow"
import { ActionButton } from "@/components/ui/ActionButton"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { Skeleton } from "@/components/ui/Skeleton"

/**
 * The Overview panel: where the project stands — branch, HEAD, dirty working copy, the branches
 * it has and whether the AI companion is ready. Commit and branch actions are the only writes;
 * they live here, at the top of the project, where the state they change is visible.
 */
export function OverviewPanel({
  client,
  projectId,
  onCommit,
  refreshKey,
  onCheckout,
}: {
  client: CompanionClient
  projectId: string
  refreshKey: number
  onCommit: () => void
  onCheckout: (branch: string) => void
}) {
  const { palette } = useTheme()
  const { ai } = useServer()

  const status = useResource(useCallback((signal) => client.status(projectId, signal), [client, projectId]), `status:${projectId}:${refreshKey}`)
  const branches = useResource(useCallback((signal) => client.branches(projectId, signal), [client, projectId]), `branches:${projectId}:${refreshKey}`)

  if (status.loading) {
    return (
      <View style={{ padding: 16, gap: 12 }}>
        <Skeleton style={{ height: 110 }} />
        <Skeleton style={{ height: 200 }} />
      </View>
    )
  }

  const vcs = status.data
  const branchList = Object.entries(branches.data?.branches ?? {}).sort(([a], [b]) => a.localeCompare(b))

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ flex: 1 }}>
      <View style={{ padding: 16, gap: 14 }}>
        {status.error ? <ErrorBanner message={status.error} actionLabel="Retry" onAction={() => void status.reload()} /> : null}

        {branches.error ? <ErrorBanner message={branches.error} actionLabel="Retry" onAction={() => void branches.reload()} /> : null}
        {/* Working copy state */}
        <SurfaceCard>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 }}>
            <GitBranch size={17} color={palette.accent} />
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={{ color: palette.ink, fontSize: 16, lineHeight: 21, fontWeight: "600" }}>{vcs?.branch ?? "—"}</Text>
              <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 16 }} numberOfLines={1}>
                {vcs?.head ? `HEAD ${shortOid(vcs.head)}` : "No commits yet"}
              </Text>
            </View>
            {vcs && vcs.dirty.length > 0 ? (
              <Text style={{ color: palette.warning, fontSize: 13, fontWeight: "600" }}>
                {vcs.dirty.length} file{vcs.dirty.length === 1 ? "" : "s"} changed
              </Text>
            ) : null}
          </View>
          {vcs && vcs.dirty.length > 0 ? (
            <View>
              <View style={{ height: 0.5, marginLeft: 14, backgroundColor: palette.border }} />
              <View style={{ paddingHorizontal: 14, paddingVertical: 10, gap: 3 }}>
                {vcs.dirty.slice(0, 5).map((path) => (
                  <Text key={path} style={{ color: palette.soft, fontSize: 13, lineHeight: 18, fontFamily: "Menlo" }} numberOfLines={1}>
                    {path}
                  </Text>
                ))}
                {vcs.dirty.length > 5 ? (
                  <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 16 }}>+{vcs.dirty.length - 5} more</Text>
                ) : null}
              </View>
            </View>
          ) : null}
          <View style={{ padding: 14, paddingTop: 0 }}>
            <ActionButton label="Commit changes" fullWidth small variant="secondary" disabled={!vcs || vcs.dirty.length === 0} onPress={onCommit} />
          </View>
        </SurfaceCard>

        {/* Branches */}
        {branchList.length > 0 ? (
          <SurfaceCard>
            <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 }}>
              <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18, textTransform: "uppercase", fontWeight: "600", letterSpacing: 0.08 }}>
                Branches
              </Text>
            </View>
            {branchList.map(([name, oid], index) => (
              <View key={name}>
                {index > 0 ? <View style={{ height: 0.5, marginLeft: 14, backgroundColor: palette.border }} /> : null}
                <ListRow
                  title={
                    <Text style={{ color: palette.ink, fontSize: 15, lineHeight: 20, fontFamily: "Menlo" }}>
                      {name}
                      {name === vcs?.branch ? "  ·" : ""}
                    </Text>
                  }
                  subtitle={`${shortOid(oid)}`}
                  trailing={name === vcs?.branch ? <Text style={{ color: palette.soft, fontSize: 13 }}>Current</Text> : undefined}
                  onPress={name === vcs?.branch ? undefined : () => onCheckout(name)}
                />
              </View>
            ))}
          </SurfaceCard>
        ) : null}

        {/* AI companion */}
        <SurfaceCard>
          <ListRow
            leading={<Sparkles size={16} color={palette.accent} />}
            title="AI companion"
            subtitle={
              ai
                ? ai.configured
                  ? `Ready — the ${ai.host} host is configured on the desktop`
                  : "No model key yet — add one in CADCAMFUN on your Mac"
                : "Checking the desktop…"
            }
            trailing={<Text style={{ color: palette.soft, fontSize: 13 }}>{ai?.configured ? "On" : "Off"}</Text>}
          />
        </SurfaceCard>
      </View>
    </ScrollView>
  )
}
