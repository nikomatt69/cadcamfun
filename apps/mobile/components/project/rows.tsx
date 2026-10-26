import type { ReactNode } from "react"
import { StyleSheet, Text, View, useWindowDimensions } from "react-native"
import { ChevronRight } from "lucide-react-native"
import { useTheme } from "@/lib/theme"
import { type, mono } from "@/lib/typography"
import { PressableScale } from "@/components/ui/PressableScale"
import { Skeleton } from "@/components/ui/Skeleton"
import { toneColor, type Tone } from "@/components/chat/sheet-parts"

/** The width of the glyph column and the gap after it: a hairline inset by this lines up with the row's text. */
export const GLYPH_WIDTH = 22
export const ROW_INSET = 4 + GLYPH_WIDTH + 12

/**
 * One flat row of a list, the shape of the conversations screen's row: a glyph, a title, a quiet line or two
 * under it and, when it opens something, a chevron. Rows sit on the page itself and are told apart by the hairline
 * between them. Text wraps instead of truncating once the text size is raised.
 */
export function FlatRow({
  leading, title, subtitle, subtitleTone, meta, metaMono = false, mono: monoTitle = false, trailing, chevron, selected,
  onPress, onLongPress, accessibilityLabel, accessibilityHint, disabled, children,
}: {
  leading?: ReactNode
  title: string
  subtitle?: string
  /** Colours the subtitle: a status the row is reporting ("3 files changed") rather than a description. */
  subtitleTone?: Tone
  meta?: string
  /** Set the meta line in the monospaced face: oids, hashes, paths. */
  metaMono?: boolean
  /** Set the title in the monospaced face: branch names. */
  mono?: boolean
  trailing?: ReactNode
  /** Defaults to true for a row that opens something and has no trailing element. */
  chevron?: boolean
  selected?: boolean
  onPress?: () => void
  onLongPress?: () => void
  accessibilityLabel?: string
  accessibilityHint?: string
  disabled?: boolean
  /** Extra body under the lines: a list of changed files, a status strip. */
  children?: ReactNode
}) {
  const { palette } = useTheme()
  const { fontScale } = useWindowDimensions()
  const wrap = fontScale > 1.3
  const interactive = Boolean(onPress || onLongPress)
  const showChevron = chevron ?? (Boolean(onPress) && !trailing)
  const body = (
    <>
      {leading !== undefined ? <View style={{ width: GLYPH_WIDTH, alignItems: "center", marginTop: 2 }}>{leading}</View> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={{ color: palette.ink, ...(monoTitle ? mono(16, { weight: "600" }) : type(17, { weight: "600" })) }} numberOfLines={wrap ? undefined : monoTitle ? 1 : 2} ellipsizeMode={monoTitle ? "middle" : "tail"}>{title}</Text>
        {subtitle ? <Text style={{ color: subtitleTone ? toneColor(palette, subtitleTone) : palette.soft, ...type(14, { leadingScale: 1.05 }) }} numberOfLines={wrap ? undefined : 2}>{subtitle}</Text> : null}
        {meta ? <Text style={{ color: palette.muted, ...(metaMono ? mono(12) : type(13)), fontVariant: ["tabular-nums"] }} numberOfLines={wrap ? undefined : 1}>{meta}</Text> : null}
        {children}
      </View>
      {trailing ? <View style={{ flexShrink: 0, maxWidth: "40%", alignSelf: "center" }}>{trailing}</View> : showChevron ? <ChevronRight size={16} color={palette.muted} strokeWidth={2} style={{ alignSelf: "center" }} /> : null}
    </>
  )
  const frame = { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 12, minHeight: 44, paddingVertical: 13, paddingHorizontal: 4, borderRadius: 12, borderCurve: "continuous" as const }
  if (!interactive) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel ?? [title, subtitle, meta].filter(Boolean).join(". ")} style={frame}>{body}</View>
    )
  }
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={380}
      disabled={disabled}
      tint
      subtle
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, meta].filter(Boolean).join(". ")}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled), ...(selected === undefined ? {} : { selected }) }}
      style={frame}
    >
      {body}
    </PressableScale>
  )
}

/** The hairline between two flat rows, inset to the row's text. */
export function RowSeparator({ inset = ROW_INSET }: { inset?: number }) {
  const { palette } = useTheme()
  return <View style={{ height: StyleSheet.hairlineWidth, marginLeft: inset, backgroundColor: palette.border }} />
}

/** A muted section heading over a run of rows (nikcli's day headings). */
export function SectionTitle({ children, accessory, first = false }: { children: string; accessory?: ReactNode; first?: boolean }) {
  const { palette } = useTheme()
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: first ? 8 : 16, paddingBottom: 8 }}>
      <Text accessibilityRole="header" style={{ flexShrink: 1, color: palette.muted, ...type(15, { weight: "500" }) }}>{children}</Text>
      {accessory}
    </View>
  )
}

/** Row-shaped placeholders: a glyph slot, a title and a quiet line, as many as fill a screen. */
export function RowsSkeleton({ label, count = 5, lines = 2 }: { label: string; count?: number; lines?: 1 | 2 }) {
  const { palette } = useTheme()
  return (
    <View accessible accessibilityLabel={label} accessibilityLiveRegion="polite">
      {Array.from({ length: count }, (_, key) => (
        <View key={key}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 44, paddingVertical: 13, paddingHorizontal: 4 }}>
            <View style={{ width: GLYPH_WIDTH, alignItems: "center", marginTop: 3 }}><Skeleton style={{ width: 16, height: 16, borderRadius: 5 }} /></View>
            <View style={{ flex: 1, gap: 8 }}>
              <Skeleton style={{ height: 17, width: `${72 - key * 6}%`, borderRadius: 6 }} />
              {lines === 2 ? <Skeleton style={{ height: 13, width: "42%", borderRadius: 6 }} /> : null}
            </View>
          </View>
          {key < count - 1 ? <View style={{ height: StyleSheet.hairlineWidth, marginLeft: ROW_INSET, backgroundColor: palette.border }} /> : null}
        </View>
      ))}
    </View>
  )
}
