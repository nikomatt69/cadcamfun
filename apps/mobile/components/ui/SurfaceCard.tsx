import { layout } from "@/lib/layout"
import type { PropsWithChildren, ReactNode } from "react"
import { Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native"
import { cn } from "@/lib/cn"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"

type SurfaceCardProps = PropsWithChildren<{
  eyebrow?: string
  title?: string
  description?: string
  footer?: ReactNode
  className?: string
  style?: StyleProp<ViewStyle>
  tone?: "surface" | "panel" | "background"
  inset?: boolean
}>

/**
 * The grouped card (nikcli-grade): 22pt continuous-curve radius, hairline ink border, and the
 * eyebrow/title/description/footer slots so a card's hierarchy is built from one vocabulary.
 * `tone` picks the material weight — raised surface by default, panel and translucent background
 * for nested content.
 */
export function SurfaceCard({ eyebrow, title, description, footer, className, style, tone = "surface", inset = true, children }: SurfaceCardProps) {
  const { width } = useWindowDimensions()
  const { palette } = useTheme()
  const compact = width < 390

  const backgroundColor =
    tone === "panel" ? palette.panel : tone === "background" ? hexToRgba(palette.background, 0.9) : palette.surface
  const borderColor = hexToRgba(palette.ink, 0.08)

  return (
    <View
      className={cn(className)}
      style={[
        {
          overflow: "hidden",
          padding: inset ? 18 : 0,
          borderRadius: layout.cardRadius,
          borderCurve: "continuous",
          borderWidth: 0.5,
          borderColor,
          backgroundColor,
        },
        style,
      ]}
    >
      {eyebrow ? <Text selectable style={{ color: palette.accent, ...type(12, { weight: "600" }) }}>{eyebrow}</Text> : null}
      {title ? (
        <Text selectable style={{ marginTop: eyebrow ? 6 : 0, color: palette.ink, ...type(compact ? 18 : 19, { weight: "600" }) }}>
          {title}
        </Text>
      ) : null}
      {description ? (
        <Text selectable style={{ marginTop: 8, color: palette.soft, ...type(14) }}>{description}</Text>
      ) : null}
      {children ? <View style={{ marginTop: title || description || eyebrow ? 12 : 0 }}>{children}</View> : null}
      {footer ? <View style={{ marginTop: 12 }}>{footer}</View> : null}
    </View>
  )
}
