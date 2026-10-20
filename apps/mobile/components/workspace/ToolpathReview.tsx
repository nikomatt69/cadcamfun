import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FlatList, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native"
import { ChevronDown, ChevronUp, Eye, EyeOff, Pause, Play, SkipBack, SkipForward } from "lucide-react-native"
import type { PreviewCollisionEvent, PreviewMachine, PreviewOperation, ToolpathPreview, ToolpathReview as ToolpathReviewPayload, ToolpathSegment } from "@cadcamfun/api"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { MACHINE_LABELS, MACHINE_SOURCE_LABELS } from "@/lib/machine-bodies"
import { clampPlayhead, segmentIndexForLine } from "@/lib/preview-math"
import { operationColor } from "@/lib/preview-scene"
import { cutterAt, describeCutter, orderedContacts } from "@/lib/toolpath-review"
import {
  PLAYBACK_SPEEDS,
  cumulativeTimes,
  formatDuration,
  formatLength,
  formatSize,
  indexAtTime,
  modalFeeds,
  pathTotals,
  segmentDurations,
  spinIsClockwise,
  spinRateAt,
  startTimeOf,
} from "@/lib/preview-sim"
import { mono } from "@/lib/typography"
import { PreviewViewport } from "@/components/preview/PreviewViewport"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { SectionHeader } from "@/components/ui/SectionHeader"
import { Skeleton } from "@/components/ui/Skeleton"
import { previewHeight, layout } from "@/lib/layout"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { SafeAreaView } from "react-native-screens/experimental"

const KIND_COLOR = {
  rapid: "#6194F5",
  linear: "#47C775",
  circular: "#A875F0",
} as const

/** Playback publishes the block at most this often; the Metal view and the listing do not need 60 Hz. */
const PLAYBACK_TICK_MS = 50
/** How many lines of a program the phone keeps in memory; the listing renders a screenful at a time. */
const MAX_GCODE_LINES = 20_000

/**
 * G-code review: the 3D path, a simulation bar, and the NC listing stay on the same block.
 * This is the phone's stand-in for the desktop toolpath visualizer. Playback runs on the program's own
 * feeds (see `lib/preview-sim.ts`), so its clock is an estimate of the machine's.
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
  const { width: windowWidth, height } = useWindowDimensions()
  // Landscape phones and iPads: the viewer and transport take the left, the summary and listing the right.
  const split = windowWidth >= 700 && windowWidth > height
  const { gutter, fontScale, onLayout } = useContentLayout()
  const [availableHeight, setAvailableHeight] = useState(height)
  const [previewExpanded, setPreviewExpanded] = useState<boolean | undefined>()
  const expanded = previewExpanded ?? fontScale < 1.6
  const segments = preview?.segments ?? []
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speedIndex, setSpeedIndex] = useState(1)
  /** The operation the user put away: the phone shows that one alone, like the desktop's operation browser. */
  const [isolated, setIsolated] = useState<number | undefined>(undefined)
  /** The path is coloured by move class or by operation; the desktop offers both. */
  const [colorMode, setColorMode] = useState<"move" | "operation">("move")
  /** Playing across a contact stops there, like the desktop's "stop at collision". */
  const [stopAtContact, setStopAtContact] = useState(true)
  const listRef = useRef<FlatList<string>>(null)
  const clock = useRef(0)
  // A phone lists a screenful of lines at a time: the program is read up to a bound instead of split whole.
  const lines = useMemo(() => {
    const text = review?.gcode
    if (!text) return []
    const out: string[] = []
    let start = 0
    while (out.length < MAX_GCODE_LINES) {
      const end = text.indexOf("\n", start)
      if (end < 0) { out.push(text.slice(start)); break }
      out.push(text.slice(start, end))
      start = end + 1
    }
    return out
  }, [review?.gcode])
  const kindByLine = useMemo(() => {
    const kinds = new Map<number, ToolpathSegment["kind"]>()
    for (const segment of segments) kinds.set(segment.line, segment.kind)
    return kinds
  }, [segments])
  const durations = useMemo(() => segmentDurations(segments, modalFeeds(review?.gcode ?? "")), [segments, review?.gcode])
  const ends = useMemo(() => cumulativeTimes(durations), [durations])
  const totals = useMemo(() => pathTotals(segments, durations), [segments, durations])
  const activeLine = segments[playhead]?.line ?? 0
  const stats = preview?.stats ?? review?.stats
  const speed = PLAYBACK_SPEEDS[speedIndex] ?? 1
  const simulating = playing || playhead > 0
  const machine = preview?.machine
  const machineSpin = machine ? spinRateAt(machine.spin, playhead, simulating) : 0
  const operations = machine?.operations ?? []
  const contacts = useMemo(() => orderedContacts(machine?.events ?? []), [machine?.events])
  const cutter = useMemo(() => cutterAt(operations, playhead), [operations, playhead])
  const hiddenOperations = useMemo(() => (isolated === undefined ? undefined : new Set([isolated])), [isolated])

  useEffect(() => {
    setPlayhead(0)
    setPlaying(false)
    clock.current = 0
  }, [preview?.revision])

  useEffect(() => {
    if (activeLine < 1) return
    listRef.current?.scrollToIndex({ index: Math.min(activeLine - 1, Math.max(lines.length - 1, 0)), viewPosition: 0.35, animated: false })
  }, [activeLine, lines.length])

  // "Stop at contact": playing across a contact pauses there, the contact in view (the desktop's "stop at collision").
  useEffect(() => {
    if (!playing || !stopAtContact) return
    const hit = contacts.find((event) => event.segment === playhead)
    if (hit === undefined) return
    setPlaying(false)
    haptic(hit.severity === "error" ? "error" : "warning")
  }, [playing, playhead, contacts, stopAtContact])

  // The simulated clock advances in real time × speed; the block shown is the one running at that time.
  useEffect(() => {
    if (!playing || ends.length === 0) return
    let last = Date.now()
    const timer = setInterval(() => {
      const now = Date.now()
      clock.current += ((now - last) / 1000) * speed
      last = now
      const total = ends[ends.length - 1]!
      const next = indexAtTime(ends, clock.current)
      setPlayhead(next)
      if (clock.current >= total) {
        setPlaying(false)
        haptic("success")
      }
    }, PLAYBACK_TICK_MS)
    return () => clearInterval(timer)
  }, [playing, speed, ends])

  /** Manual moves stop playback and put the clock at the start of the chosen block. */
  const seek = (index: number) => {
    const next = clampPlayhead(index, segments.length)
    setPlaying(false)
    clock.current = startTimeOf(ends, next)
    setPlayhead(next)
  }

  const togglePlay = () => {
    if (segments.length === 0) return
    haptic("selection")
    if (playing) {
      setPlaying(false)
      return
    }
    // Replay from the start once the end is reached.
    if (playhead >= segments.length - 1) {
      clock.current = 0
      setPlayhead(0)
    } else clock.current = Math.max(clock.current, startTimeOf(ends, playhead))
    setPlaying(true)
  }

  // One stable handler for every listing row, so a playback tick re-renders only the rows whose highlight changed.
  const seekRef = useRef(seek)
  seekRef.current = seek
  const segmentsRef = useRef(segments)
  segmentsRef.current = segments
  const seekLine = useCallback((lineNumber: number) => {
    haptic("selection")
    seekRef.current(segmentIndexForLine(segmentsRef.current, lineNumber))
  }, [])
  const listingDisabled = segments.length === 0 || loading

  const bar = <SimulationBar
    count={segments.length}
    playhead={playhead}
    playing={playing}
    speed={speed}
    elapsed={Math.min(clock.current, totals.seconds)}
    total={totals.seconds}
    onSeek={seek}
    onTogglePlay={togglePlay}
    onCycleSpeed={() => { haptic("selection"); setSpeedIndex((index) => (index + 1) % PLAYBACK_SPEEDS.length) }}
  />

  const viewer = preview ? (
    <PreviewViewport
      bounds={preview.bounds}
      revision={preview.revision}
      mesh={preview.part}
      segments={segments}
      stock={preview.stock}
      machine={preview.machine}
      operations={operations}
      hiddenOperations={hiddenOperations}
      colorMode={colorMode}
      playhead={playhead}
      simulating={simulating}
      fullscreenTitle={review?.name ?? "Toolpath"}
      fullscreenFooter={bar}
      accessibilityLabel={machine ? `${MACHINE_LABELS[machine.kind]} toolpath preview` : "Toolpath preview"}
      accessibilityHint="Drag to orbit. Pinch to zoom. The listing follows the current block."
    />
  ) : (
    <Skeleton style={{ flex: 1, borderRadius: 0 }} />
  )
  const frame = { borderRadius: layout.cardRadius, borderCurve: "continuous" as const, overflow: "hidden" as const, borderWidth: 0.5, borderColor: palette.border }
  const summary = <>
      {error ? (
        <View>
          <ErrorBanner message={error} actionLabel="Retry" onAction={onRetry} />
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        {stats ? (
          <View accessibilityRole="summary" style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {[
              { label: "Rapid", count: stats.rapidMoves, color: KIND_COLOR.rapid },
              { label: "Linear", count: stats.linearMoves, color: KIND_COLOR.linear },
              { label: "Arcs", count: stats.circularMoves, color: KIND_COLOR.circular },
            ].map(({ label, count, color }) => <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={{ width: 8, height: 3, borderRadius: 1.5, backgroundColor: color }} />
              <Text selectable style={{ color: palette.soft, fontSize: 12, lineHeight: 18, fontVariant: ["tabular-nums"] }}>{label} {count.toLocaleString("en")}</Text>
            </View>)}
          </View>
        ) : null}
        {machine ? (
          <View accessibilityRole="summary" style={{ gap: 3 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: `${palette.accent}1f` }}>
                <Text style={{ color: palette.accent, fontSize: 12, fontWeight: "700" }}>{MACHINE_LABELS[machine.kind]}</Text>
              </View>
              <Text selectable style={{ color: palette.muted, fontSize: 12, fontVariant: ["tabular-nums"] }}>
                {MACHINE_SOURCE_LABELS[machine.source]} · {machine.axes} axes
                {machine.turret ? ` · ${machine.turret} turret` : ""}{machine.xMode ? ` · X is a ${machine.xMode}` : ""}
              </Text>
            </View>
            <Text selectable style={{ color: palette.soft, fontSize: 12, lineHeight: 18 }}>{machine.turns}.</Text>
            <Text selectable style={{ color: palette.soft, fontSize: 12, lineHeight: 18 }}>{machine.workholding}.</Text>
            {machine.assumed.length ? (
              <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18 }}>Assumed: {machine.assumed.join(", ")}.</Text>
            ) : null}
            {machine.mismatch ? (
              <Text style={{ color: palette.warning, fontSize: 12, lineHeight: 17 }}>
                The G-code reads like a {MACHINE_LABELS[machine.mismatch.inferred].toLowerCase()} program, not this one. {machine.mismatch.reasons.join("; ")}
              </Text>
            ) : null}
            {machine.collisions.length ? (
              <Text style={{ color: palette.warning, fontSize: 12, lineHeight: 17 }}>
                {machine.collisions.length === 1 ? "One move runs" : `${machine.collisions.length.toLocaleString("en")} moves run`} into the workholding (red on the path).
              </Text>
            ) : null}
            {machine.spin.length ? (
              <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 17, fontVariant: ["tabular-nums"] }}>{spinText(machine, machineSpin)}</Text>
            ) : null}
          </View>
        ) : null}
        {segments.length > 0 && preview ? <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 4 }}>
          {[
            { label: "Cycle", value: `≈ ${formatDuration(totals.seconds)}` },
            { label: "Cutting", value: `${formatLength(totals.cutLength)} mm` },
            { label: "Rapid", value: `${formatLength(totals.rapidLength)} mm` },
            { label: machine?.kind === "3dprinter" ? "Build volume" : machine?.kind === "lathe" ? "Bar" : "Stock", value: formatSize(preview.stock) },
          ].map(({ label, value }) => <Text key={label} selectable style={{ color: palette.muted, fontSize: 12, lineHeight: 18, fontVariant: ["tabular-nums"] }}>
            {label} <Text style={{ color: palette.ink, fontWeight: "600" }}>{value}</Text>
          </Text>)}
        </View> : null}
        {preview?.truncated ? (
          <Text style={{ color: palette.warning, fontSize: 12, lineHeight: 16 }}>Path truncated so it fits on the phone. The G-code listing is complete.</Text>
        ) : null}
        {cutter ? (
          <Text selectable style={{ color: palette.soft, fontSize: 12, lineHeight: 18 }}>
            Tool at the playhead: <Text style={{ color: palette.ink, fontWeight: "600" }}>{describeCutter(cutter)}</Text>
          </Text>
        ) : null}
        {operations.length > 0 ? (
          <View style={{ gap: 8 }}>
            <SectionHeader padded={false}>Operations</SectionHeader>
            <OperationLegend
              operations={operations}
              isolated={isolated}
              colorMode={colorMode}
              onIsolate={(index) => { haptic("selection"); setIsolated((current) => (current === index ? undefined : index)) }}
              onColorMode={setColorMode}
            />
          </View>
        ) : null}
        {contacts.length > 0 ? (
          <View style={{ gap: 6 }}>
            <SectionHeader padded={false}>Contacts</SectionHeader>
            <ContactList
              contacts={contacts}
              playhead={playhead}
              stopAtContact={stopAtContact}
              onToggleStop={() => { haptic("selection"); setStopAtContact((value) => !value) }}
              onSeek={(event) => { haptic("selection"); seek(event.segment) }}
            />
          </View>
        ) : null}
        {split ? null : bar}
      </View>
  </>
  const listing = <>
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
        initialNumToRender={30}
        windowSize={9}
        contentContainerStyle={{ paddingHorizontal: Math.max(0, gutter - 12), paddingBottom: 16 }}
        ListEmptyComponent={loading ? <View style={{ padding: 16, gap: 8 }}><Skeleton style={{ height: 44 }} /><Skeleton style={{ height: 44 }} /></View> : <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 21, padding: 20 }}>No G-code in this program yet.</Text>}
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false })
        }}
        renderItem={({ item, index }) => (
          <GcodeRow lineNumber={index + 1} text={item} kind={kindByLine.get(index + 1)} active={index + 1 === activeLine} disabled={listingDisabled} onSeekLine={seekLine} />
        )}
      />
  </>

  if (split) {
    return (
      <SafeAreaView edges={{ bottom: true, left: true, right: true }} onLayout={(event) => { onLayout(event); setAvailableHeight(event.nativeEvent.layout.height) }} style={{ flex: 1, flexDirection: "row", backgroundColor: palette.background }}>
        <View style={{ flex: 1.35, padding: 12, paddingRight: 0, gap: 10 }}>
          <View style={{ flex: 1, ...frame }}>{viewer}</View>
          {bar}
        </View>
        <View style={{ flex: 1, maxWidth: 460 }}>
          <ScrollView contentInsetAdjustmentBehavior="never" style={{ flexGrow: 0, maxHeight: Math.max(140, availableHeight * 0.45) }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, gap: 10 }}>
            <Text accessibilityRole="header" style={{ color: palette.ink, fontSize: 15, fontWeight: "600" }}>Simulation</Text>
            <Text selectable style={{ color: palette.muted, fontSize: 12, lineHeight: 18, fontVariant: ["tabular-nums"] }}>
              {segments.length ? `Block ${(playhead + 1).toLocaleString("en")} of ${segments.length.toLocaleString("en")} · NC line ${activeLine}` : loading ? "Loading the program…" : "No motion blocks"}
            </Text>
            {summary}
          </ScrollView>
          {listing}
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={{ bottom: true }} onLayout={(event) => { onLayout(event); setAvailableHeight(event.nativeEvent.layout.height) }} style={{ flex: 1, backgroundColor: palette.background }}>
      <ScrollView contentInsetAdjustmentBehavior="never" style={{ flexGrow: 0, maxHeight: Math.max(160, availableHeight * 0.62) }}
        contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 10, paddingBottom: 12, gap: 10 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 120, gap: 3 }}>
          <Text accessibilityRole="header" style={{ color: palette.ink, fontSize: 15, fontWeight: "600" }}>Simulation</Text>
          <Text selectable style={{ color: palette.muted, fontSize: 12, lineHeight: 18, fontVariant: ["tabular-nums"] }}>
            {segments.length ? `Block ${(playhead + 1).toLocaleString("en")} of ${segments.length.toLocaleString("en")} · NC line ${activeLine}` : loading ? "Loading the program…" : "No motion blocks"}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={expanded ? "Hide 3D preview" : "Show 3D preview"}
          onPress={() => { haptic("selection"); setPreviewExpanded(!expanded) }}
          style={({ pressed }) => ({ width: layout.touchTarget, height: layout.touchTarget, alignItems: "center", justifyContent: "center", borderRadius: layout.controlRadius, backgroundColor: palette.surface, borderWidth: 0.5, borderColor: palette.border, opacity: pressed ? 0.55 : 1 })}>
          {expanded ? <ChevronUp size={18} color={palette.accent} /> : <ChevronDown size={18} color={palette.accent} />}
        </Pressable>
      </View>
      {expanded ? <View style={{ height: Math.min(previewHeight(height, fontScale, "toolpath"), Math.max(180, availableHeight * 0.32)), ...frame }}>
        {viewer}
      </View> : null}

      {summary}
      </ScrollView>
      {listing}
    </SafeAreaView>
  )
}

/**
 * The program's operations: one chip each, with the colour the path uses for it.
 *
 * A chip isolates its operation (the phone shows that one alone) and a second tap puts it back. The colour mode
 * switch is the desktop's: the path coloured by move class or by operation.
 */
function OperationLegend({ operations, isolated, colorMode, onIsolate, onColorMode }: {
  operations: readonly PreviewOperation[]
  isolated: number | undefined
  colorMode: "move" | "operation"
  onIsolate: (index: number) => void
  onColorMode: (mode: "move" | "operation") => void
}) {
  const { palette } = useTheme()
  const swatch = (index: number) => {
    const [r, g, b] = operationColor(index)
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
  }
  return <View style={{ gap: 8 }}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="Operations"
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {operations.map((operation) => {
        const shown = isolated === undefined || isolated === operation.index
        return <Pressable key={operation.index} accessibilityRole="button"
          accessibilityState={{ selected: isolated === operation.index }}
          accessibilityLabel={`${operation.name}${shown ? "" : ", hidden"}`}
          onPress={() => onIsolate(operation.index)}
          style={({ pressed }) => ({
            minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, borderRadius: 22,
            borderCurve: "continuous" as const, borderWidth: 0.5,
            borderColor: isolated === operation.index ? palette.accent : palette.border,
            backgroundColor: pressed ? `${palette.ink}18` : isolated === operation.index ? `${palette.accent}1f` : "transparent",
            opacity: shown ? 1 : 0.45,
          })}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: swatch(operation.index) }} />
          <Text numberOfLines={1} style={{ color: palette.ink, fontSize: 13, fontWeight: "600" }}>{operation.name}</Text>
          {operation.cutter ? (
            <Text style={{ color: palette.muted, fontSize: 12, fontVariant: ["tabular-nums"] }}>
              Ø{operation.cutter.diameter}
            </Text>
          ) : null}
          {isolated === operation.index ? <EyeOff size={15} color={palette.accent} /> : null}
        </Pressable>
      })}
    </ScrollView>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={{ color: palette.muted, fontSize: 12 }}>Path colour</Text>
      {(["move", "operation"] as const).map((mode) => <Pressable key={mode} accessibilityRole="radio" accessibilityState={{ checked: colorMode === mode }}
        accessibilityLabel={`Colour the path by ${mode}`}
        onPress={() => { haptic("selection"); onColorMode(mode) }}
        style={({ pressed }) => ({
          minHeight: 32, justifyContent: "center", paddingHorizontal: 12, borderRadius: 16, borderWidth: 0.5,
          borderColor: colorMode === mode ? palette.accent : palette.border,
          backgroundColor: colorMode === mode ? `${palette.accent}1f` : pressed ? `${palette.ink}12` : "transparent",
        })}>
        <Text style={{ color: colorMode === mode ? palette.accentStrong : palette.soft, fontSize: 12, fontWeight: "600" }}>
          {mode === "move" ? "Move" : "Operation"}
        </Text>
      </Pressable>)}
    </View>
  </View>
}

/**
 * The contacts on the playback clock: the tool into the workholding, into the stock left, a near miss.
 *
 * Each row seeks to the move that made the contact, so the phone shows what the desktop's timeline marks.
 */
function ContactList({ contacts, playhead, stopAtContact, onToggleStop, onSeek }: {
  contacts: readonly PreviewCollisionEvent[]
  playhead: number
  stopAtContact: boolean
  onToggleStop: () => void
  onSeek: (event: PreviewCollisionEvent) => void
}) {
  const { palette } = useTheme()
  return <View style={{ gap: 6 }}>
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: stopAtContact }}
      accessibilityLabel="Stop the simulation at a contact"
      onPress={onToggleStop}
      style={({ pressed }) => ({
        minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, opacity: pressed ? 0.6 : 1,
      })}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: stopAtContact ? palette.accent : palette.border }} />
      <Text style={{ color: palette.soft, fontSize: 13 }}>Stop the simulation at a contact</Text>
    </Pressable>
    {contacts.map((event) => {
      const current = event.segment === playhead
      const tone = event.severity === "error" ? palette.danger : palette.warning
      return <Pressable key={`${event.code}:${event.segment}`} accessibilityRole="button"
        accessibilityLabel={`${event.severity === "error" ? "Error" : "Warning"}: ${event.message}`}
        onPress={() => onSeek(event)}
        style={({ pressed }) => ({
          minHeight: 44, flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 8,
          paddingHorizontal: 10, borderRadius: 10, borderCurve: "continuous" as const,
          backgroundColor: current ? `${tone}18` : pressed ? `${palette.ink}12` : "transparent",
        })}>
        <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 5, backgroundColor: tone }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text selectable style={{ color: palette.ink, fontSize: 13, lineHeight: 18 }}>{event.message}</Text>
          <Text style={{ color: palette.muted, fontSize: 11, fontVariant: ["tabular-nums"] }}>
            {event.code}{event.line !== undefined ? ` · line ${event.line}` : ""} · {formatDuration(event.seconds)}
          </Text>
        </View>
      </Pressable>
    })}
  </View>
}

/** Transport controls and scrubber. Rendered under the inline preview and in the full-screen viewer. */
function SimulationBar({ count, playhead, playing, speed, elapsed, total, onSeek, onTogglePlay, onCycleSpeed }: {
  count: number
  playhead: number
  playing: boolean
  speed: number
  elapsed: number
  total: number
  onSeek: (index: number) => void
  onTogglePlay: () => void
  onCycleSpeed: () => void
}) {
  const { palette } = useTheme()
  const button = { width: layout.touchTarget, height: layout.touchTarget, alignItems: "center" as const, justifyContent: "center" as const }
  return <View style={{ gap: 4 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous block" accessibilityState={{ disabled: !count || playhead <= 0 }} disabled={!count || playhead <= 0}
        onPress={() => { haptic("selection"); onSeek(playhead - 1) }} style={({ pressed }) => ({ ...button, opacity: !count || playhead <= 0 ? 0.35 : pressed ? 0.55 : 1 })}>
        <SkipBack size={18} color={palette.accent} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={playing ? "Pause simulation" : "Play simulation"} accessibilityState={{ disabled: !count }} disabled={!count}
        onPress={onTogglePlay} style={({ pressed }) => ({ ...button, borderRadius: layout.touchTarget / 2, backgroundColor: palette.accent, opacity: !count ? 0.35 : pressed ? 0.75 : 1 })}>
        {playing ? <Pause size={18} color={palette.onAccent} /> : <Play size={18} color={palette.onAccent} />}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Next block" accessibilityState={{ disabled: !count || playhead >= count - 1 }} disabled={!count || playhead >= count - 1}
        onPress={() => { haptic("selection"); onSeek(playhead + 1) }} style={({ pressed }) => ({ ...button, opacity: !count || playhead >= count - 1 ? 0.35 : pressed ? 0.55 : 1 })}>
        <SkipForward size={18} color={palette.accent} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Playback speed ${speed} times. Change speed`} disabled={!count} onPress={onCycleSpeed}
        style={({ pressed }) => ({ minWidth: 52, height: 32, paddingHorizontal: 10, marginLeft: 4, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 0.5, borderColor: palette.border, backgroundColor: palette.surface, opacity: !count ? 0.35 : pressed ? 0.6 : 1 })}>
        <Text style={{ color: palette.ink, fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{speed}×</Text>
      </Pressable>
      <Text accessibilityLabel={`Elapsed ${formatDuration(elapsed)} of about ${formatDuration(total)}`} numberOfLines={1}
        style={{ flex: 1, textAlign: "right", color: palette.muted, fontSize: 12, fontVariant: ["tabular-nums"] }}>
        {formatDuration(elapsed)} / ≈ {formatDuration(total)}
      </Text>
    </View>
    <Scrubber count={count} value={playhead} onChange={onSeek} />
  </View>
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
      onResponderTerminationRequest={() => false}
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

const GcodeRow = memo(function GcodeRow({
  lineNumber,
  text,
  kind,
  active,
  disabled,
  onSeekLine,
}: {
  lineNumber: number
  text: string
  kind: ToolpathSegment["kind"] | undefined
  active: boolean
  disabled: boolean
  onSeekLine: (lineNumber: number) => void
}) {
  const { palette } = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Line ${lineNumber}${text.trim() ? `, ${text.trim()}` : ""}`}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={() => onSeekLine(lineNumber)}
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
})

/** What the block's spin run means in words (ISO 6983: a mill runs clockwise at a negative display rate). */
const spinText = (machine: PreviewMachine, rate: number): string =>
  rate === 0
    ? "Spindle stopped on this block"
    : `${machine.kind === "lathe" ? "The part turns" : "The tool turns"} ${spinIsClockwise(machine.kind, rate) ? "clockwise" : "counter-clockwise"} on this block`
