import { FlatList, Text, View, useWindowDimensions } from "react-native"
import { Box, Check, Sparkles } from "lucide-react-native"
import type { MeshPart, MeshPreview, PreviewParameter } from "@cadcamfun/api"
import { SafeAreaView } from "react-native-screens/experimental"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { previewHeight, layout } from "@/lib/layout"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { PreviewViewport } from "@/components/preview/PreviewViewport"
import { ActionButton } from "@/components/ui/ActionButton"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { EmptyState } from "@/components/ui/EmptyState"
import { ListRow } from "@/components/ui/ListRow"
import { SectionHeader, Divider } from "@/components/ui/SectionHeader"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { Skeleton } from "@/components/ui/Skeleton"

/** One reading surface keeps preview, parameters and elements reachable on every phone size. */
export function MeshReview({ mesh, loading, error, onRetry, parameters, selectedPartId, onSelectPart, actionLabel, onAction }: {
  mesh: MeshPreview | undefined
  loading: boolean
  error: string | undefined
  onRetry: () => void
  parameters?: readonly PreviewParameter[]
  selectedPartId: string | undefined
  onSelectPart: (id: string | undefined) => void
  actionLabel: string
  onAction: () => void
}) {
  const { palette } = useTheme()
  const { height } = useWindowDimensions()
  const { gutter, fontScale, onLayout } = useContentLayout()
  const parts = mesh?.parts ?? []
  const triangles = mesh ? Math.floor(mesh.indices.length / 3) : 0

  return <SafeAreaView edges={{ bottom: true }} onLayout={onLayout} style={{ flex: 1, backgroundColor: palette.background }}>
    <FlatList data={parts} keyExtractor={(item) => item.id} extraData={selectedPartId}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 12, paddingBottom: 16 }}
      ListHeaderComponent={<View>
        {mesh || loading ? <View style={{ height: previewHeight(height, fontScale, "mesh"), borderRadius: layout.cardRadius, borderCurve: "continuous", overflow: "hidden", borderWidth: 0.5, borderColor: palette.border }}>
          {mesh ? <PreviewViewport bounds={mesh.bounds} revision={mesh.revision} mesh={mesh} selectedPartId={selectedPartId}
            accessibilityLabel="Design preview" accessibilityHint="Drag to orbit. Pinch to zoom. Camera controls and element selection are also available."
            onSelectPart={(id) => { haptic("selection"); onSelectPart(id) }} /> : <Skeleton style={{ flex: 1, borderRadius: 0 }} />}
        </View> : null}
        {mesh ? <Text selectable style={{ color: palette.muted, fontSize: 12, lineHeight: 18, paddingTop: 10, fontVariant: ["tabular-nums"] }}>{parts.length.toLocaleString("en")} elements · {triangles.toLocaleString("en")} triangles</Text> : null}
        {error ? <View style={{ paddingTop: 12 }}><ErrorBanner message={error} actionLabel="Retry" onAction={onRetry} /></View> : null}
        {mesh?.truncated ? <Text style={{ color: palette.warning, fontSize: 13, lineHeight: 20, paddingTop: 12 }}>Showing a simplified preview to keep navigation responsive.</Text> : null}
        {parameters?.length ? <>
          <SectionHeader padded={false}>Parameters</SectionHeader>
          <SurfaceCard inset={false}>{parameters.map((parameter, index) => <View key={parameter.key}>
            {index ? <Divider inset={16} /> : null}
            <ListRow title={parameter.key} subtitle={parameter.value} showChevron={false} />
          </View>)}</SurfaceCard>
        </> : null}
        <SectionHeader padded={false}>Elements</SectionHeader>
      </View>}
      ListEmptyComponent={loading && !mesh ? <View style={{ gap: 12 }}>{[0, 1].map((key) => <Skeleton key={key} style={{ height: 74 }} />)}</View> : !error ?
        <EmptyState title={mesh ? "No solid elements" : "No preview available"} description="Solid geometry from your desktop will appear here." icon={<Box size={25} color={palette.accent} />} /> : null}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      renderItem={({ item }) => <SurfaceCard inset={false}>
        <PartRow part={item} selected={item.id === selectedPartId} onPress={() => { haptic("selection"); onSelectPart(item.id === selectedPartId ? undefined : item.id) }} />
      </SurfaceCard>}
    />
    <View style={{ paddingHorizontal: gutter, paddingTop: 12, paddingBottom: 12, borderTopWidth: 0.5, borderTopColor: palette.border, backgroundColor: palette.background }}>
      <ActionButton label={actionLabel} icon={<Sparkles size={18} color={palette.onAccent} />} disabled={!mesh} onPress={onAction} />
    </View>
  </SafeAreaView>
}

function PartRow({ part, selected, onPress }: { part: MeshPart; selected: boolean; onPress: () => void }) {
  const { palette } = useTheme()
  return <ListRow title={part.name || part.id}
    subtitle={part.triangleCount > 0 ? `${part.triangleCount.toLocaleString("en")} triangles` : "Not in this preview"}
    trailing={selected ? <Check size={20} color={palette.accent} /> : undefined}
    showChevron={false} selected={selected} onPress={onPress} />
}
