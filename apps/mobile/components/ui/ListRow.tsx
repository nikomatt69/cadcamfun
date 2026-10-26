import type { ReactNode } from "react"
import { Text, View, useWindowDimensions } from "react-native"
import { Check, ChevronRight } from "lucide-react-native"
import { PressableScale } from "./PressableScale"
import { haptic } from "@/lib/haptics"
import { layout } from "@/lib/layout"
import { useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"

type ListRowProps = {
  /** Leading element: status dot, icon tile, avatar. */
  leading?: ReactNode
  /** A string renders in the row's title style, a node keeps its own. */
  title: ReactNode
  /** Meta line under the title. */
  subtitle?: string
  /** Trailing element; defaults to a chevron when the row is pressable. */
  trailing?: ReactNode
  /** A quiet value on the right (iOS Settings style: "On", "Metric", "3 min"). Shown before the chevron when no `trailing` is given. */
  value?: string
  showChevron?: boolean
  disabled?: boolean
  onPress?: () => void
  onLongPress?: () => void
  accessibilityLabel?: string
  /** What happens on activation, when the title alone does not say it. */
  accessibilityHint?: string
  /** Selection state for a row that is one choice in a set. Omit it on rows that are not selectable. */
  selected?: boolean
  /**
   * How a selected row says so. "check" (default) draws a check mark on the right when `selected` is true and
   * no `trailing` is given; "none" leaves the row to its own `trailing`.
   */
  selectionMark?: "check" | "none"
  /** "destructive" colors the title with the danger tone (delete, unpair, sign out). */
  tone?: "default" | "destructive"
  /** Single-line rows can drop to 48pt; rows with a subtitle keep 64pt. The 44pt touch target holds either way. */
  dense?: boolean
  /** Haptic on press. Off by default: opening a record is navigation and the push is its feedback; pass "selection" for choices. */
  haptic?: "selection" | "none"
}

/**
 * Flat themable list row: leading element, a readable title and quiet metadata.
 * The pressed state is a 4% ink tint plus the app-wide scale - it works with every theme in
 * both modes. Pair rows with `<Divider inset={...} />`. Row height follows Dynamic Type: the
 * title and subtitle wrap at larger font scales instead of truncating, and the trailing slot yields
 * width to the text before the text yields to it.
 */
export function ListRow({
  leading, title, subtitle, trailing, value, showChevron, disabled, onPress, onLongPress, accessibilityLabel, accessibilityHint,
  selected, selectionMark = "check", tone = "default", dense = false, haptic: hapticKind = "none",
}: ListRowProps) {
  const { palette } = useTheme()
  const { fontScale } = useWindowDimensions()
  const interactive = Boolean(onPress || onLongPress)
  const Container = interactive ? PressableScale : View
  const wrap = fontScale > 1
  const destructive = tone === "destructive"
  const compact = dense && !subtitle

  const end = trailing ? (
    <View style={{ flexShrink: 0, maxWidth: "42%" }}>{trailing}</View>
  ) : selected === true && selectionMark === "check" ? (
    <Check size={18} color={palette.accent} strokeWidth={2.4} />
  ) : null
  const chevron = !trailing && selected !== true && (showChevron ?? Boolean(onPress))
    ? <ChevronRight size={16} color={palette.muted} strokeWidth={2} />
    : null

  return (
    <Container
      onPress={onPress ? () => { if (hapticKind === "selection") haptic("selection"); onPress() } : undefined}
      onLongPress={onLongPress}
      disabled={disabled}
      accessible={interactive ? true : undefined}
      {...(interactive ? { tint: true, subtle: true } : {})}
      style={{
        alignSelf: "stretch",
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: compact ? 8 : 12,
        paddingHorizontal: 16,
        minHeight: compact ? layout.rowMinHeightDense : layout.rowMinHeight,
        opacity: disabled ? 0.5 : 1,
      }}
      accessibilityRole={interactive ? "button" : undefined}
      accessibilityLabel={interactive ? accessibilityLabel ?? (typeof title === "string" ? [title, subtitle, value].filter(Boolean).join(", ") : undefined) : undefined}
      accessibilityHint={interactive ? accessibilityHint : undefined}
      accessibilityState={interactive ? { disabled: Boolean(disabled), ...(selected === undefined ? {} : { selected }) } : undefined}
    >
      {leading ? <View style={{ flexShrink: 0 }}>{leading}</View> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={{ color: destructive ? palette.danger : palette.ink, ...type(15, { weight: "600" }) }} numberOfLines={wrap ? undefined : 1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: palette.muted, ...type(13) }} numberOfLines={wrap ? undefined : 2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value && !trailing ? (
        <Text style={{ flexShrink: 1, maxWidth: "42%", color: palette.muted, textAlign: "right", ...type(15) }} numberOfLines={wrap ? undefined : 1}>{value}</Text>
      ) : null}
      {end}
      {chevron}
    </Container>
  )
}

/** 8px status dot for ListRow leading slots - unread markers, live indicators, branch colors. */
export function StatusDot({ color }: { color: string }) {
  return <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: color }} />
}
