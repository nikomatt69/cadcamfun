import { useCallback } from "react"
import { RefreshControl, Text, View } from "react-native"
import { useRouter } from "expo-router"
import { Boxes, Calculator, CheckCircle2, DraftingCompass, GitBranch, Library, Plus, Route, Sparkles } from "lucide-react-native"
import type { CompanionClient } from "@/lib/client"
import { useResource } from "@/lib/use-resource"
import { useServer } from "@/lib/server"
import { useTheme } from "@/lib/theme"
import { shortOid } from "@/lib/format"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { ActionButton } from "@/components/ui/ActionButton"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { Skeleton } from "@/components/ui/Skeleton"
import { PageScroll } from "@/components/layout/page-scroll"
import { IconTile } from "@/components/ui/icon-tile"
import { Pill } from "@/components/ui/Pill"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { haptic } from "@/lib/haptics"
import { FlatRow, RowSeparator, SectionTitle } from "./rows"
import { caps, mono, type } from "@/lib/typography"
import { CloudDeliveryPanel } from "./cloud-delivery-panel"

const WORKSPACE = [
  { screen: "drawings", title: "Designs", detail: "Explore your geometry", Icon: DraftingCompass },
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
  const { onLayout } = useContentLayout()
  const { ai, connectivity, config } = useServer()
  const router = useRouter()
  const status = useResource(useCallback((signal) => client.status(projectId, signal), [client, projectId]), `status:${projectId}:${refreshKey}`)
  const branches = useResource(useCallback((signal) => client.branches(projectId, signal), [client, projectId]), `branches:${projectId}:${refreshKey}`)
  const vcs = status.data
  const branchList = Object.entries(branches.data?.branches ?? {}).sort(([a], [b]) => a.localeCompare(b))
  const dirtyCount = vcs?.dirty.length ?? 0
  const reload = () => { void status.reload(); void branches.reload() }

  return <PageScroll onLayout={onLayout} contentInsetAdjustmentBehavior="never" contentContainerStyle={{ gap: 4 }} refreshControl={<RefreshControl refreshing={status.loading && Boolean(vcs)} onRefresh={reload} tintColor={palette.accent} />}>
    {status.error ? <ErrorBanner message={status.error} actionLabel="Retry" onAction={reload} /> : null}
    {branches.error ? <ErrorBanner message={branches.error} actionLabel="Retry" onAction={() => void branches.reload()} /> : null}
    {config?.mode === "cloud" ? <CloudDeliveryPanel client={client} projectId={projectId} refreshKey={refreshKey} /> : null}
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

    <View>
      <SectionTitle>Workspace</SectionTitle>
      {WORKSPACE.map(({ screen, title, detail, Icon }, index) => <View key={screen}>
        {index ? <RowSeparator /> : null}
        <FlatRow leading={<Icon size={19} color={palette.muted} strokeWidth={2} />} title={title} subtitle={detail}
          onPress={() => { haptic("selection"); router.push(`/projects/${projectId}/workspace/${screen}`) }} />
      </View>)}
      <RowSeparator />
      <FlatRow leading={<Calculator size={19} color={palette.muted} strokeWidth={2} />} title="Production costs" subtitle="Calculate and review this project's estimates"
        onPress={() => { haptic("selection"); router.push({ pathname: "/settings/costs", params: { projectId } }) }} />
    </View>

    <View>
      <SectionTitle accessory={<ActionButton label="New" size="small" variant="secondary" icon={<Plus size={15} color={palette.ink} strokeWidth={2.4} />} onPress={() => { haptic("selection"); onCreateBranch() }} />}>Branches</SectionTitle>
      {branchList.map(([name, oid], index) => <View key={name}>
        {index ? <RowSeparator /> : null}
        <FlatRow mono title={name} meta={shortOid(oid)} metaMono leading={<GitBranch size={18} color={name === vcs?.branch ? palette.accent : palette.muted} strokeWidth={2} />}
          trailing={name === vcs?.branch ? <Pill tone="accent">Current</Pill> : undefined}
          selected={name === vcs?.branch}
          {...(name === vcs?.branch ? {} : { onPress: () => onCheckout(name), accessibilityHint: "Switches the working copy to this branch" })} />
      </View>)}
      {branches.data && branchList.length === 0 ? <Text style={{ color: palette.muted, paddingVertical: 12, ...type(14) }}>No branches yet.</Text> : null}
    </View>

    <View>
      <SectionTitle>Assistant</SectionTitle>
      <FlatRow leading={<Sparkles size={19} color={palette.accent} strokeWidth={2} />} title="Desktop assistant"
        subtitle={ai?.configured ? "Ready to help with this project" : ai ? "Add a model key on your Mac to get started" : connectivity === "online" ? "Checking desktop configuration…" : "Reconnect to the desktop to use the assistant"}
        trailing={<Pill tone={ai?.configured ? "success" : "neutral"}>{ai?.configured ? "Ready" : ai || connectivity === "online" ? "Setup" : "Offline"}</Pill>} />
    </View>
  </PageScroll>
}
