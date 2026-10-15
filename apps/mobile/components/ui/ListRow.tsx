import type { ReactNode } from "react"
import { Text, View, useWindowDimensions } from "react-native"
import { ChevronRight } from "lucide-react-native"
import { PressableScale } from "./PressableScale"
import { useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"

type ListRowProps = {
  /** Leading element: status dot, icon tile, avatar. */
  leading?: ReactNode
  /** One-line title; a string renders in the row's title style, a node keeps its own. */
  title: ReactNode
  /** Meta line under the title. */
  subtitle?: string
  /** Trailing element; defaults to a chevron when the row is pressable. */
  trailing?: ReactNode
  showChevron?: boolean
  disabled?: boolean
  onPress?: () => void
  onLongPress?: () => void
  accessibilityLabel?: string
  /** Selection state for a row that is one choice in a set. Omit it on rows that are not selectable. */
  selected?: boolean
}

/**
 * Flat themable list row (nikcli-grade): leading element, one-line title, quiet meta line.
 * The pressed state is a 4% ink tint plus the app-wide scale — it works with every theme in
 * both modes. Pair rows with `<Divider inset={...} />`. Row height follows Dynamic Type: the
 * subtitle may wrap to two lines at larger font scales instead of truncating.
 */
export function ListRow({ leading, title, subtitle, trailing, showChevron, disabled, onPress, onLongPress, accessibilityLabel, selected }: ListRowProps) {
  const { palette } = useTheme()
  const { fontScale } = useWindowDimensions()

  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled || !onPress}
      tint={Boolean(onPress)}
      subtle
      style={{
        alignSelf: "stretch",
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        minHeight: 64,
        opacity: disabled ? 0.5 : 1,
      }}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel ?? (typeof title === "string" ? (subtitle ? `${title}, ${subtitle}` : title) : undefined)}
      accessibilityState={{ disabled: Boolean(disabled), ...(selected === undefined ? {} : { selected }) }}
    >
      {leading ? <View style={{ alignSelf: "flex-start", marginTop: 4 }}>{leading}</View> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={{ color: palette.ink, ...type(15, { weight: "600" }) }} numberOfLines={fontScale > 1 ? undefined : 1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: palette.muted, ...type(13) }} numberOfLines={fontScale > 1 ? undefined : 2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (showChevron ?? Boolean(onPress) ? <ChevronRight size={16} color={palette.muted} strokeWidth={2} /> : null)}
    </PressableScale>
  )
}

/** 8px status dot for ListRow leading slots — unread markers, live indicators, branch colors. */
export function StatusDot({ color }: { color: string }) {
  return <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: color }} />
}
