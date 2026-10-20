import { useCallback } from "react"
import { RefreshControl, Text, View } from "react-native"
import { useRouter } from "expo-router"
import { ArrowUpRight, Box, Boxes, CheckCircle2, GitBranch, Library, Route, Sparkles } from "lucide-react-native"
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
import { PageScroll } from "@/components/layout/page-scroll"
import { IconTile } from "@/components/ui/icon-tile"
import { Pill } from "@/components/ui/Pill"
import { PressableScale } from "@/components/ui/PressableScale"
import { Divider } from "@/components/ui/SectionHeader"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { layout } from "@/lib/layout"
import { caps, mono, type } from "@/lib/typography"

const WORKSPACE = [
  { screen: "drawings", title: "Designs", detail: "Explore your geometry", Icon: Box },
  { screen: "components", title: "Components", detail: "Parts & parameters", Icon: Boxes },
  { screen: "toolpaths", title: "Toolpaths", detail: "Preview paths & G-code", Icon: Route },
  { screen: "library", title: "Library", detail: "Tools, materials & machines", Icon: Library },
] as const

export function OverviewPanel({ client, projectId, onCommit, refreshKey, onCheckout, onCreateBranch }: {
  client: CompanionClient; projectId: string; refreshKey: number
  onCommit: (summary: { branch: string; files: number }) => void
  onCheckout: (branch: string) => void
  onCreateBranch: () => void
}) {
  const { palette } = useTheme()
  const { width, fontScale, gutter, onLayout } = useContentLayout()
  const { ai, connectivity } = useServer()
  const router = useRouter()
  const status = useResource(useCallback((signal) => client.status(projectId, signal), [client, projectId]), `status:${projectId}:${refreshKey}`)
  const branches = useResource(useCallback((signal) => client.branches(projectId, signal), [client, projectId]), `branches:${projectId}:${refreshKey}`)
  const vcs = status.data
  const branchList = Object.entries(branches.data?.branches ?? {}).sort(([a], [b]) => a.localeCompare(b))
  const dirtyCount = vcs?.dirty.length ?? 0
  const stacked = width - gutter * 2 < 320 || fontScale > 1.3
  const reload = () => { void status.reload(); void branches.reload() }

  return <PageScroll onLayout={onLayout} refreshControl={<RefreshControl refreshing={status.loading && Boolean(vcs)} onRefresh={reload} tintColor={palette.accent} />}>
    {status.error ? <ErrorBanner message={status.error} actionLabel="Retry" onAction={reload} /> : null}
    {branches.error ? <ErrorBanner message={branches.error} actionLabel="Retry" onAction={() => void branches.reload()} /> : null}
    {status.loading && !vcs ? <Skeleton style={{ height: 160 }} /> : <SurfaceCard>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <IconTile><GitBranch size={22} color={palette.accent} /></IconTile>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text style={{ color: palette.muted, ...caps(11) }}>Working branch</Text>
          <Text selectable numberOfLines={2} ellipsizeMode="middle" style={{ color: palette.ink, ...type(21, { weight: "700" }) }}>{vcs?.branch ?? "Unavailable"}</Text>
        </View>
      </View>
      <View style={{ marginVertical: 16, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          {vcs && dirtyCount === 0 ? <CheckCircle2 size={16} color={palette.success} /> : null}
          <Text accessibilityLiveRegion="polite" style={{ flex: 1, minWidth: 0, color: dirtyCount ? palette.warning : palette.soft, fontVariant: ["tabular-nums"], ...type(14) }}>{!vcs ? "Could not load working copy" : dirtyCount ? `${dirtyCount} ${dirtyCount === 1 ? "file has" : "files have"} uncommitted changes` : "All changes committed"}</Text>
        </View>
        {vcs?.head ? <Text selectable style={{ color: palette.muted, ...type(12) }}>Latest commit <Text style={mono(12)}>{shortOid(vcs.head)}</Text></Text> : null}
        {vcs?.dirty.slice(0, 4).map((path) => <Text key={path} selectable numberOfLines={1} ellipsizeMode="middle" style={{ color: palette.soft, ...mono(12) }}>{path}</Text>)}
        {dirtyCount > 4 ? <Text style={{ color: palette.muted, fontVariant: ["tabular-nums"], ...type(12) }}>+{dirtyCount - 4} more {dirtyCount - 4 === 1 ? "file" : "files"}</Text> : null}
      </View>
      <ActionButton label="Commit changes" variant={dirtyCount ? "primary" : "secondary"} disabled={!vcs || !dirtyCount} onPress={() => onCommit({ branch: vcs?.branch ?? "", files: dirtyCount })} />
    </SurfaceCard>}

    <Text accessibilityRole="header" style={{ color: palette.ink, marginTop: 8, ...type(19, { weight: "700" }) }}>Explore workspace</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
      {WORKSPACE.map(({ screen, title, detail, Icon }) => <PressableScale key={screen} subtle tint accessibilityLabel={`Open ${title.toLowerCase()}`} onPress={() => router.push(`/projects/${projectId}/workspace/${screen}`)}
        style={{ width: stacked ? "100%" : "48%", flexGrow: 1, minHeight: 140, padding: 16, borderRadius: layout.cardRadius, borderCurve: "continuous", backgroundColor: palette.surface, borderWidth: 0.5, borderColor: palette.border, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><IconTile size={40}><Icon size={21} color={palette.accent} /></IconTile><ArrowUpRight size={16} color={palette.muted} /></View>
        <View style={{ gap: 3 }}><Text numberOfLines={1} style={{ color: palette.ink, ...type(17, { weight: "600" }) }}>{title}</Text><Text style={{ color: palette.muted, ...type(12) }}>{detail}</Text></View>
      </PressableScale>)}
    </View>

    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={{ color: palette.ink, marginTop: 8, ...type(19, { weight: "700" }) }}>Branches</Text>
      {branchList.length ? <SurfaceCard inset={false}>{branchList.map(([name, oid], index) => <View key={name}>
        {index ? <Divider inset={16} /> : null}
        <ListRow title={name} subtitle={shortOid(oid)} leading={<GitBranch size={18} color={palette.muted} />}
          trailing={name === vcs?.branch ? <Pill tone="accent">Current</Pill> : undefined}
          onPress={name === vcs?.branch ? undefined : () => onCheckout(name)} />
      </View>)}</SurfaceCard> : null}
      <ActionButton label="New branch" variant="secondary" onPress={onCreateBranch} />
    </View>

    <SurfaceCard inset={false}>
      <ListRow leading={<IconTile size={40}><Sparkles size={20} color={palette.accent} /></IconTile>} title="Desktop assistant"
        subtitle={ai?.configured ? "Ready to help with this project" : ai ? "Add a model key on your Mac to get started" : connectivity === "online" ? "Checking desktop configuration…" : "Reconnect to the desktop to use the assistant"}
        trailing={<Pill tone={ai?.configured ? "success" : "neutral"}>{ai?.configured ? "Ready" : ai || connectivity === "online" ? "Setup" : "Offline"}</Pill>} />
    </SurfaceCard>
  </PageScroll>
}
