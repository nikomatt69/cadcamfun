import { useEffect, useMemo, useRef, useState } from "react"
import { FlatList, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native"
import { ChevronDown, ChevronUp, SkipBack, SkipForward } from "lucide-react-native"
import type { ToolpathPreview, ToolpathReview as ToolpathReviewPayload, ToolpathSegment } from "@cadcamfun/api"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { clampPlayhead, segmentIndexForLine } from "@/lib/preview-math"
import { mono } from "@/lib/typography"
import { PreviewViewport } from "@/components/preview/PreviewViewport"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { Skeleton } from "@/components/ui/Skeleton"
import { previewHeight, layout } from "@/lib/layout"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { SafeAreaView } from "react-native-screens/experimental"

const KIND_COLOR = {
  rapid: "#6194F5",
  linear: "#47C775",
  circular: "#A875F0",
} as const

/**
 * G-code review: the 3D path, a scrubber, and the NC listing stay on the same block.
 * This is the phone's stand-in for the desktop toolpath visualizer.
 */
export function ToolpathReview({
  review,
  preview,
  loading,
  error,
  onRetry,
}: {
  review: ToolpathReviewPayload | undefined
  preview: ToolpathPreview | undefined
  loading: boolean
  error: string | undefined
  onRetry: () => void
}) {
  const { palette } = useTheme()
  const { height } = useWindowDimensions()
  const { gutter, fontScale, onLayout } = useContentLayout()
  const [availableHeight, setAvailableHeight] = useState(height)
  const [previewExpanded, setPreviewExpanded] = useState<boolean | undefined>()
  const expanded = previewExpanded ?? fontScale < 1.6
  const segments = preview?.segments ?? []
  const [playhead, setPlayhead] = useState(0)
  const listRef = useRef<FlatList<string>>(null)
  const lines = useMemo(() => review?.gcode ? review.gcode.split(/\r?\n/) : [], [review?.gcode])
  const kindByLine = useMemo(() => {
    const kinds = new Map<number, ToolpathSegment["kind"]>()
    for (const segment of segments) kinds.set(segment.line, segment.kind)
    return kinds
  }, [segments])
  const activeLine = segments[playhead]?.line ?? 0
  const stats = preview?.stats ?? review?.stats

  useEffect(() => {
    setPlayhead(0)
  }, [preview?.revision])

  useEffect(() => {
    if (activeLine < 1) return
    listRef.current?.scrollToIndex({ index: Math.min(activeLine - 1, Math.max(lines.length - 1, 0)), viewPosition: 0.35, animated: false })
  }, [activeLine, lines.length])

  return (
    <SafeAreaView edges={{ bottom: true }} onLayout={(event) => { onLayout(event); setAvailableHeight(event.nativeEvent.layout.height) }} style={{ flex: 1, backgroundColor: palette.background }}>
      <ScrollView contentInsetAdjustmentBehavior="never" style={{ flexGrow: 0, maxHeight: Math.max(140, availableHeight * 0.6) }}
        contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 10, paddingBottom: 12, gap: 10 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 100, gap: 3 }}>
          <Text accessibilityRole="header" style={{ color: palette.ink, fontSize: 15, fontWeight: "600" }}>Simulation</Text>
          <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18, fontVariant: ["tabular-nums"] }}>{segments.length ? `Block ${playhead + 1} of ${segments.length}` : "No motion blocks"}</Text>
        </View>
        <View style={{ flexDirection: "row", borderRadius: layout.controlRadius, backgroundColor: palette.surface, borderWidth: 0.5, borderColor: palette.border }}>
          {[
            { label: "Previous block", Icon: SkipBack, disabled: !segments.length || playhead <= 0, action: () => setPlayhead(clampPlayhead(playhead - 1, segments.length)) },
            { label: "Next block", Icon: SkipForward, disabled: !segments.length || playhead >= segments.length - 1, action: () => setPlayhead(clampPlayhead(playhead + 1, segments.length)) },
            { label: expanded ? "Hide 3D preview" : "Show 3D preview", Icon: expanded ? ChevronUp : ChevronDown, disabled: false, action: () => setPreviewExpanded(!expanded) },
          ].map(({ label, Icon, disabled, action }) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
            onPress={() => { haptic("selection"); action() }} style={({ pressed }) => ({ width: layout.touchTarget, height: layout.touchTarget, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : pressed ? 0.55 : 1 })}>
            <Icon size={18} color={palette.accent} />
          </Pressable>)}
        </View>
      </View>
      {expanded ? <View style={{ height: Math.min(previewHeight(height, fontScale, "toolpath"), availableHeight * 0.28), borderRadius: layout.cardRadius, borderCurve: "continuous", overflow: "hidden", borderWidth: 0.5, borderColor: palette.border }}>
        {preview ? (
          <PreviewViewport
            bounds={preview.bounds}
            revision={preview.revision}
            segments={segments}
            stock={preview.stock}
            playhead={playhead}
            accessibilityLabel="Toolpath preview"
            accessibilityHint="Drag to orbit. Pinch to zoom. The listing follows the current block."
          />
        ) : (
          <Skeleton style={{ flex: 1, borderRadius: 0 }} />
        )}
      </View> : null}

      {error ? (
        <View>
          <ErrorBanner message={error} actionLabel="Retry" onAction={onRetry} />
        </View>
      ) : null}

      <View style={{ gap: 6 }}>
        {stats ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {[
              { label: "Rapid", count: stats.rapidMoves, color: KIND_COLOR.rapid },
              { label: "Linear", count: stats.linearMoves, color: KIND_COLOR.linear },
              { label: "Arcs", count: stats.circularMoves, color: KIND_COLOR.circular },
            ].map(({ label, count, color }) => <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
              <Text selectable style={{ color: palette.soft, fontSize: 12, lineHeight: 18, fontVariant: ["tabular-nums"] }}>{label} {count.toLocaleString("en")}</Text>
            </View>)}
          </View>
        ) : null}
        {preview?.truncated ? (
          <Text style={{ color: palette.warning, fontSize: 12, lineHeight: 16 }}>Path truncated so it fits on the phone. The G-code listing is complete.</Text>
        ) : null}
        <Scrubber count={segments.length} value={playhead} onChange={setPlayhead} />
        <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 16 }}>
          {segments.length === 0 ? "No motion in this program" : `NC line ${activeLine}` }
        </Text>
      </View>
      </ScrollView>
      <View style={{ paddingHorizontal: gutter, paddingVertical: 10, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: palette.border }}>
        <Text accessibilityRole="header" style={{ color: palette.ink, fontSize: 14, fontWeight: "600" }}>G-code</Text>
        <Text style={{ color: palette.muted, fontSize: 12, fontVariant: ["tabular-nums"] }}>{lines.length.toLocaleString("en")} lines</Text>
      </View>
      <FlatList
        ref={listRef}
        style={{ flex: 1, backgroundColor: palette.surface }}
        data={lines}
        keyExtractor={(_, index) => String(index)}
        extraData={activeLine}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingHorizontal: Math.max(0, gutter - 12), paddingBottom: 16 }}
        ListEmptyComponent={loading ? <View style={{ padding: 16, gap: 8 }}><Skeleton style={{ height: 44 }} /><Skeleton style={{ height: 44 }} /></View> : <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 21, padding: 20 }}>No G-code in this program yet.</Text>}
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false })
        }}
        renderItem={({ item, index }) => {
          const lineNumber = index + 1
          const active = lineNumber === activeLine
          return (
            <GcodeRow
              lineNumber={lineNumber}
              text={item}
              kind={kindByLine.get(lineNumber)}
              active={active}
              disabled={segments.length === 0 || loading}
              onPress={() => {
                haptic("selection")
                setPlayhead(clampPlayhead(segmentIndexForLine(segments, lineNumber), segments.length))
              }}
            />
          )
        }}
      />
    </SafeAreaView>
  )
}

function Scrubber({ count, value, onChange }: { count: number; value: number; onChange: (index: number) => void }) {
  const { palette } = useTheme()
  const width = useRef(1)
  const move = (x: number) => {
    if (count <= 1) {
      onChange(0)
      return
    }
    const ratio = Math.min(1, Math.max(0, x / Math.max(width.current, 1)))
    onChange(clampPlayhead(Math.round(ratio * (count - 1)), count))
  }
  const fraction = count <= 1 ? 0 : value / (count - 1)

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel="Toolpath playback"
      accessibilityState={{ disabled: count === 0 }}
      accessibilityValue={{ min: count === 0 ? 0 : 1, max: Math.max(count, 1), now: count === 0 ? 0 : value + 1, text: count === 0 ? "No motion" : `Block ${value + 1} of ${count}` }}
      accessibilityActions={count ? [
        { name: "increment", label: "Next block" },
        { name: "decrement", label: "Previous block" },
      ] : []}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "increment") onChange(clampPlayhead(value + 1, count))
        if (event.nativeEvent.actionName === "decrement") onChange(clampPlayhead(value - 1, count))
      }}
      style={{ height: layout.touchTarget, justifyContent: "center", opacity: count ? 1 : 0.4 }}
      onLayout={(event) => {
        width.current = event.nativeEvent.layout.width
      }}
      onStartShouldSetResponder={() => count > 0}
      onMoveShouldSetResponder={() => count > 0}
      onResponderGrant={(event) => move(event.nativeEvent.locationX)}
      onResponderMove={(event) => move(event.nativeEvent.locationX)}
    >
      <View style={{ height: 4, borderRadius: 2, backgroundColor: palette.panel, overflow: "hidden" }}>
        <View style={{ width: `${fraction * 100}%`, height: 4, backgroundColor: palette.accent }} />
      </View>
      <View pointerEvents="none" style={{ position: "absolute", left: `${fraction * 100}%`, top: 13, width: 18, height: 18, borderRadius: 9, backgroundColor: palette.accent, transform: [{ translateX: -9 }] }} />
    </View>
  )
}

function GcodeRow({
  lineNumber,
  text,
  kind,
  active,
  disabled,
  onPress,
}: {
  lineNumber: number
  text: string
  kind: ToolpathSegment["kind"] | undefined
  active: boolean
  disabled: boolean
  onPress: () => void
}) {
  const { palette } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Line ${lineNumber}${text.trim() ? `, ${text.trim()}` : ""}`}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        minHeight: 44,
        backgroundColor: active ? `${palette.accent}18` : "transparent",
      }}
    >
      <View style={{ width: 4, alignSelf: "stretch", borderRadius: 2, backgroundColor: kind ? KIND_COLOR[kind] : "transparent" }} />
      <Text style={{ width: 44, color: palette.muted, ...mono(12) }}>{lineNumber}</Text>
      <Text style={{ flex: 1, color: active ? palette.ink : palette.soft, ...mono(13) }}>{text || " "}</Text>
    </Pressable>
  )
}
