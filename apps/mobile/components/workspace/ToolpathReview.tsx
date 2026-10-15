import { useEffect, useMemo, useRef, useState } from "react"
import { FlatList, Pressable, Text, View } from "react-native"
import type { ToolpathPreview, ToolpathReview as ToolpathReviewPayload, ToolpathSegment } from "@cadcamfun/api"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { clampPlayhead, segmentIndexForLine } from "@/lib/preview-math"
import { PreviewViewport } from "@/components/preview/PreviewViewport"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { Skeleton } from "@/components/ui/Skeleton"

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
  const segments = preview?.segments ?? []
  const [playhead, setPlayhead] = useState(0)
  const listRef = useRef<FlatList<string>>(null)
  const lines = useMemo(() => (review?.gcode ?? "").split(/\r?\n/), [review?.gcode])
  const activeLine = segments[playhead]?.line ?? 0
  const stats = preview?.stats ?? review?.stats

  useEffect(() => {
    setPlayhead(0)
  }, [preview?.revision])

  useEffect(() => {
    if (activeLine < 1) return
    listRef.current?.scrollToIndex({ index: Math.min(activeLine - 1, Math.max(lines.length - 1, 0)), viewPosition: 0.35, animated: true })
  }, [activeLine, lines.length])

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={{ height: 240 }}>
        {preview ? (
          <PreviewViewport bounds={preview.bounds} revision={preview.revision} segments={segments} stock={preview.stock} playhead={playhead} />
        ) : (
          <Skeleton style={{ flex: 1, borderRadius: 0 }} />
        )}
      </View>

      {error ? (
        <View style={{ padding: 16 }}>
          <ErrorBanner message={error} actionLabel="Retry" onAction={onRetry} />
        </View>
      ) : null}

      <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 8 }}>
        {stats ? (
          <Text style={{ color: palette.soft, fontSize: 13, lineHeight: 18 }}>
            Rapid {stats.rapidMoves} · Linear {stats.linearMoves} · Arcs {stats.circularMoves}
            {stats.machineFunctions > 0 ? ` · M${stats.machineFunctions}` : ""}
          </Text>
        ) : null}
        {preview?.truncated ? (
          <Text style={{ color: palette.warning, fontSize: 12, lineHeight: 16 }}>Path truncated so it fits on the phone. The G-code listing is complete.</Text>
        ) : null}
        <Scrubber count={segments.length} value={playhead} onChange={setPlayhead} />
        <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 16 }}>
          {segments.length === 0 ? "No motion in this program" : `Block ${playhead + 1} of ${segments.length}${activeLine > 0 ? ` · NC ${activeLine}` : ""}`}
        </Text>
      </View>

      <FlatList
        ref={listRef}
        style={{ flex: 1, marginTop: 8 }}
        data={lines}
        keyExtractor={(_, index) => String(index)}
        extraData={activeLine}
        contentInsetAdjustmentBehavior="automatic"
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false })
        }}
        renderItem={({ item, index }) => {
          const lineNumber = index + 1
          const segment = segments.find((entry) => entry.line === lineNumber)
          const active = lineNumber === activeLine
          return (
            <GcodeRow
              lineNumber={lineNumber}
              text={item}
              kind={segment?.kind}
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
    </View>
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
      style={{ height: 28, justifyContent: "center" }}
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
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: active ? `${palette.accent}18` : "transparent",
      }}
    >
      <View style={{ width: 4, alignSelf: "stretch", borderRadius: 2, backgroundColor: kind ? KIND_COLOR[kind] : "transparent" }} />
      <Text style={{ width: 36, color: palette.muted, fontSize: 12, fontFamily: "Menlo" }}>{lineNumber}</Text>
      <Text style={{ flex: 1, color: active ? palette.ink : palette.soft, fontSize: 13, lineHeight: 18, fontFamily: "Menlo" }}>{text || " "}</Text>
    </Pressable>
  )
}
