import { useEffect, useMemo, useRef } from "react"
import { AccessibilityInfo, FlatList, Text, View, useWindowDimensions } from "react-native"
import { Box, Check, Sparkles } from "lucide-react-native"
import type { MeshPart, MeshPreview, PreviewFeatureTree, PreviewParameter } from "@cadcamfun/api"
import { SafeAreaView } from "react-native-screens/experimental"
import { useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"
import { haptic } from "@/lib/haptics"
import { previewHeight, layout } from "@/lib/layout"
import { formatSize, partBounds } from "@/lib/preview-sim"
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
export function MeshReview({ title, mesh, loading, error, onRetry, parameters, features, selectedPartId, onSelectPart, actionLabel, onAction }: {
  /** Shown in the full-screen viewer. */
  title?: string
  mesh: MeshPreview | undefined
  loading: boolean
  error: string | undefined
  onRetry: () => void
  parameters?: readonly PreviewParameter[]
  /** What the parametric elements are made of (preview format 4). */
  features?: readonly PreviewFeatureTree[]
  selectedPartId: string | undefined
  onSelectPart: (id: string | undefined) => void
  actionLabel: string
  onAction: () => void
}) {
  const { palette } = useTheme()
  const { width: windowWidth, height } = useWindowDimensions()
  // Landscape phones and iPads: the viewer takes the full height beside the element list instead of a short strip.
  const split = windowWidth >= 700 && windowWidth > height
  const { gutter, fontScale, onLayout } = useContentLayout()
  const parts = mesh?.parts ?? []
  const triangles = mesh ? Math.floor(mesh.indices.length / 3) : 0
  const selectedPart = parts.find((part) => part.id === selectedPartId)
  const selectedSize = useMemo(() => {
    if (!mesh || !selectedPart) return undefined
    const bounds = partBounds(mesh.positions, mesh.indices, selectedPart)
    return bounds ? formatSize(bounds) : undefined
  }, [mesh, selectedPart])

  // A part picked in the 3D view is brought into the element list (and announced); a pick from the list stays put.
  const listRef = useRef<FlatList<MeshPart>>(null)
  const pickedInView = useRef(false)
  useEffect(() => {
    if (!pickedInView.current) return
    pickedInView.current = false
    const index = selectedPartId ? parts.findIndex((part) => part.id === selectedPartId) : -1
    if (index >= 0) listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true })
    AccessibilityInfo.announceForAccessibility(selectedPart ? `Selected ${selectedPart.name || selectedPart.id}${selectedSize ? `, ${selectedSize}` : ""}` : "Selection cleared")
  }, [selectedPartId])

  const viewport = mesh ? <PreviewViewport bounds={mesh.bounds} revision={mesh.revision} mesh={mesh} selectedPartId={selectedPartId} fullscreenTitle={title ?? "Design"}
    fullscreenFooter={selectedPart ? <Text numberOfLines={2} style={{ color: palette.soft, fontVariant: ["tabular-nums"], ...type(13) }}>
      <Text style={{ color: palette.ink, fontWeight: "600" }}>{selectedPart.name || selectedPart.id}</Text>{selectedSize ? ` · ${selectedSize}` : ""}
    </Text> : undefined}
    accessibilityLabel="Design preview" accessibilityHint="Drag to orbit. Pinch to zoom. Tap an element to select it, double tap to frame it."
    onSelectPart={(id) => { haptic("selection"); pickedInView.current = true; onSelectPart(id) }} /> : <Skeleton style={{ flex: 1, borderRadius: 0 }} />
  const frame = { borderRadius: layout.cardRadius, borderCurve: "continuous" as const, overflow: "hidden" as const, borderWidth: 0.5, borderColor: palette.border }

  return <SafeAreaView edges={{ bottom: true, left: true, right: true }} onLayout={onLayout} style={{ flex: 1, backgroundColor: palette.background }}>
    <View style={{ flex: 1, flexDirection: split ? "row" : "column" }}>
    {split && (mesh || loading) ? <View style={{ flex: 1.35, padding: 12, paddingRight: 0 }}><View style={{ flex: 1, ...frame }}>{viewport}</View></View> : null}
    <FlatList ref={listRef} style={split ? { flex: 1, maxWidth: 440 } : undefined} data={parts} keyExtractor={(item) => item.id} extraData={selectedPartId}
      // Rows above the target are not measured yet: jump near it by the average row height, then land exactly.
      onScrollToIndexFailed={(info) => {
        listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false })
        setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: true }), 120)
      }}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{ paddingHorizontal: split ? 16 : gutter, paddingTop: 12, paddingBottom: 16 }}
      ListHeaderComponent={<View>
        {!split && (mesh || loading) ? <View style={{ height: previewHeight(height, fontScale, "mesh"), ...frame }}>{viewport}</View> : null}
        {mesh ? <Text selectable style={{ color: palette.muted, paddingTop: split ? 0 : 10, fontVariant: ["tabular-nums"], ...type(12) }}>
          <Text style={{ color: palette.ink, fontWeight: "600" }}>{formatSize(mesh.bounds)}</Text> · {parts.length.toLocaleString("en")} {parts.length === 1 ? "element" : "elements"} · {triangles.toLocaleString("en")} triangles
          {selectedPart ? `\nSelected ${selectedPart.name || selectedPart.id}${selectedSize ? ` · ${selectedSize}` : ""}` : ""}
        </Text> : null}
        {mesh && loading ? <Text accessibilityLiveRegion="polite" style={{ color: palette.muted, paddingTop: 4, ...type(12) }}>Updating to the latest desktop revision…</Text> : null}
        {error ? <View style={{ paddingTop: 12 }}><ErrorBanner message={error} actionLabel="Retry" onAction={onRetry} /></View> : null}
        {mesh?.truncated ? <Text style={{ color: palette.warning, paddingTop: 12, ...type(13) }}>Showing a simplified preview to keep navigation responsive.</Text> : null}
        {parameters?.length ? <>
          <SectionHeader padded={false}>Parameters</SectionHeader>
          <SurfaceCard inset={false}>{parameters.map((parameter, index) => <View key={parameter.key}>
            {index ? <Divider inset={16} /> : null}
            <ListRow title={parameter.key} subtitle={parameter.value} showChevron={false} />
          </View>)}</SurfaceCard>
        </> : null}
        {features?.length ? <>
          <SectionHeader padded={false}>Feature tree</SectionHeader>
          {features.map((tree) => <FeatureTree key={tree.elementId} tree={tree} />)}
        </> : null}
        <SectionHeader padded={false}>Elements</SectionHeader>
      </View>}
      ListEmptyComponent={loading && !mesh ? <View style={{ gap: 12 }}>{[0, 1].map((key) => <Skeleton key={key} style={{ height: 74 }} />)}</View> : !error ?
        <EmptyState title={mesh ? "No solid elements" : "No preview available"} description="Solid geometry from your desktop will appear here." icon={<Box size={25} color={palette.accent} />} /> : null}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      renderItem={({ item }) => <SurfaceCard inset={false} style={item.id === selectedPartId ? { borderColor: palette.accent, borderWidth: 1 } : undefined}>
        <PartRow part={item} selected={item.id === selectedPartId} onPress={() => { haptic("selection"); onSelectPart(item.id === selectedPartId ? undefined : item.id) }} />
      </SurfaceCard>}
    />
    </View>
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

/**
 * What a parametric element is made of, in the order it was built.
 *
 * The desktop shows the same tree in its property panel: the phone reads a part without the desktop, which is what a
 * companion is for.
 */
function FeatureTree({ tree }: { tree: PreviewFeatureTree }) {
  const { palette } = useTheme()
  return <SurfaceCard inset={false}>
    <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>
      <Text style={{ color: palette.ink, ...type(14, { weight: "600" }) }}>{tree.name}</Text>
    </View>
    {tree.features.map((feature, index) => <View key={feature.id}>
      {index ? <Divider inset={16} /> : null}
      <ListRow title={feature.type} subtitle={feature.parameters.map((parameter) => `${parameter.key} ${parameter.value}`).join(" · ")}
        showChevron={false} />
    </View>)}
  </SurfaceCard>
}
