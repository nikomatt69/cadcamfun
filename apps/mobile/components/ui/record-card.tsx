import type { ReactNode } from "react"
import { Text, View } from "react-native"
import { layout } from "@/lib/layout"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { haptic } from "@/lib/haptics"
import { useTheme } from "@/lib/theme"
import { IconTile } from "./icon-tile"
import { PressableScale } from "./PressableScale"

type RecordCardProps = {
  title: string
  subtitle?: string
  meta?: string
  leading: ReactNode
  status?: ReactNode
  onPress?: () => void
  accessibilityLabel?: string
}

/** Metadata moves below the title at accessibility sizes instead of squeezing the reading column. */
export function RecordCard({ title, subtitle, meta, leading, status, onPress, accessibilityLabel }: RecordCardProps) {
  const { palette } = useTheme()
  const { width, fontScale, onLayout } = useContentLayout()
  const stacked = fontScale > 1.3 || width < 320
  const content = (
    <>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <IconTile size={40}>{leading}</IconTile>
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <Text style={{ color: palette.ink, fontSize: 16, lineHeight: 23, fontWeight: "600" }} numberOfLines={fontScale > 1.3 ? undefined : 3}>{title}</Text>
          {subtitle ? <Text style={{ color: palette.soft, fontSize: 13, lineHeight: 20 }} numberOfLines={fontScale > 1.3 ? undefined : 2}>{subtitle}</Text> : null}
        </View>
        {!stacked && status ? <View style={{ maxWidth: "34%" }}>{status}</View> : null}
      </View>
      {meta || (stacked && status) ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          {meta ? <Text selectable={!onPress} style={{ flexShrink: 1, color: palette.muted, fontSize: 12, lineHeight: 18 }}>{meta}</Text> : null}
          {stacked ? status : null}
        </View>
      ) : null}
    </>
  )
  const style = { padding: 16, gap: 12, borderRadius: layout.cardRadius, borderCurve: "continuous" as const, backgroundColor: palette.surface, borderWidth: 0.5, borderColor: palette.border }
  return onPress ? (
    <PressableScale onLayout={onLayout} subtle tint style={style} accessibilityLabel={accessibilityLabel ?? [title, subtitle, meta].filter(Boolean).join(". ")}
      onPress={() => { haptic("selection"); onPress() }}>
      {content}
    </PressableScale>
  ) : <View onLayout={onLayout} style={style}>{content}</View>
}
