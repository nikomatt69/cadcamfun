import type { ReactNode } from "react"
import { Text, View } from "react-native"
import { layout } from "@/lib/layout"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { haptic } from "@/lib/haptics"
import { useTheme } from "@/lib/theme"
import { mono, type } from "@/lib/typography"
import { IconTile } from "./icon-tile"
import { PressableScale } from "./PressableScale"

type RecordCardProps = {
  title: string
  subtitle?: string
  meta?: string
  /** Render `meta` in the monospaced face — commit oids, hashes, ids. Off by default. */
  metaMono?: boolean
  leading: ReactNode
  status?: ReactNode
  onPress?: () => void
  /** Opens the row's actions (rename, delete…). */
  onLongPress?: () => void
  accessibilityLabel?: string
  /** What activating the card does, when the title alone does not say it. */
  accessibilityHint?: string
}

/** Metadata moves below the title at accessibility sizes instead of squeezing the reading column. */
export function RecordCard({ title, subtitle, meta, metaMono = false, leading, status, onPress, onLongPress, accessibilityLabel, accessibilityHint }: RecordCardProps) {
  const { palette } = useTheme()
  const { width, fontScale, onLayout } = useContentLayout()
  const stacked = fontScale > 1.3 || width < 320
  const content = (
    <>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <IconTile size={40}>{leading}</IconTile>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={{ color: palette.ink, ...type(16, { weight: "600" }) }} numberOfLines={fontScale > 1.3 ? undefined : 3}>{title}</Text>
          {subtitle ? <Text style={{ color: palette.soft, ...type(13, { leadingScale: 1.05 }) }} numberOfLines={fontScale > 1.3 ? undefined : 2}>{subtitle}</Text> : null}
        </View>
        {!stacked && status ? <View style={{ maxWidth: "34%" }}>{status}</View> : null}
      </View>
      {meta || (stacked && status) ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          {meta ? <Text selectable={!onPress} style={{ flexShrink: 1, color: palette.muted, ...(metaMono ? mono(12) : type(12)) }}>{meta}</Text> : null}
          {stacked ? status : null}
        </View>
      ) : null}
    </>
  )
  const style = { padding: 16, gap: 12, borderRadius: layout.cardRadius, borderCurve: "continuous" as const, backgroundColor: palette.surface, borderWidth: 0.5, borderColor: palette.border }
  // Opening a record is navigation: the push transition is its feedback, so there is no haptic here.
  return onPress ? (
    <PressableScale onLayout={onLayout} subtle tint style={style} accessibilityLabel={accessibilityLabel ?? [title, subtitle, meta].filter(Boolean).join(". ")}
      accessibilityHint={accessibilityHint}
      onPress={() => { haptic("selection"); onPress() }}
      {...(onLongPress ? { onLongPress: () => { haptic("selection"); onLongPress() } } : {})}>
      {content}
    </PressableScale>
  ) : <View onLayout={onLayout} style={style}>{content}</View>
}
