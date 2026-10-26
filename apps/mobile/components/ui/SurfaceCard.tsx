import { layout } from "@/lib/layout"
import type { PropsWithChildren, ReactNode } from "react"
import { Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native"
import { cn } from "@/lib/cn"
import { hexToRgba, useTheme } from "@/lib/theme"
import { toneWash, type Tone } from "@/lib/tones"
import { caps, type } from "@/lib/typography"
import { PressableScale } from "./PressableScale"

type SurfaceCardProps = PropsWithChildren<{
  eyebrow?: string
  title?: string
  description?: string
  footer?: ReactNode
  className?: string
  style?: StyleProp<ViewStyle>
  /** Material weight: raised surface (default), the raised step above it, the recessed panel, or translucent background. */
  tone?: "surface" | "raised" | "panel" | "background"
  /** A tinted card in a status color (a notice, a warning strip). Overrides `tone`'s fill and border. */
  wash?: Tone
  inset?: boolean
  /** Makes the whole card one pressable target (an ink-tint press, no layout change). */
  onPress?: () => void
  onLongPress?: () => void
  /** Spoken name of a pressable card; defaults to its title. */
  accessibilityLabel?: string
  accessibilityHint?: string
}>

/**
 * The grouped card (nikcli-grade): 22pt continuous-curve radius, hairline border, 16pt padding and the
 * eyebrow/title/description/footer slots so a card's hierarchy is built from one vocabulary.
 * `tone` picks the material weight - raised surface by default, panel and translucent background
 * for nested content; `wash` turns the card into a status notice using the shared tone colors.
 * With `onPress` the whole card is one button.
 */
export function SurfaceCard({
  eyebrow, title, description, footer, className, style, tone = "surface", wash, inset = true, children,
  onPress, onLongPress, accessibilityLabel, accessibilityHint,
}: SurfaceCardProps) {
  const { width } = useWindowDimensions()
  const { palette } = useTheme()
  const compact = width < 390

  const washed = wash ? toneWash(palette, wash) : undefined
  const backgroundColor = washed
    ? washed.background
    : tone === "panel" ? palette.panel
      : tone === "raised" ? palette.surfaceRaised
        : tone === "background" ? hexToRgba(palette.background, 0.9) : palette.surface
  const borderColor = washed ? washed.border : palette.border

  const body = (
    <>
      {eyebrow ? <Text selectable={!onPress} style={{ color: wash ? washed?.accent : palette.accent, ...caps(12) }}>{eyebrow}</Text> : null}
      {title ? (
        <Text selectable={!onPress} accessibilityRole="header" style={{ marginTop: eyebrow ? 4 : 0, color: palette.ink, ...type(compact ? 18 : 19, { weight: "600" }) }}>
          {title}
        </Text>
      ) : null}
      {description ? (
        <Text selectable={!onPress} style={{ marginTop: title || eyebrow ? 8 : 0, color: palette.soft, ...type(14) }}>{description}</Text>
      ) : null}
      {children ? <View style={{ marginTop: title || description || eyebrow ? 12 : 0 }}>{children}</View> : null}
      {footer ? <View style={{ marginTop: 12 }}>{footer}</View> : null}
    </>
  )

  const frame: ViewStyle = {
    overflow: "hidden",
    padding: inset ? 16 : 0,
    borderRadius: layout.cardRadius,
    borderCurve: "continuous",
    borderWidth: 0.5,
    borderColor,
    backgroundColor,
  }

  if (onPress || onLongPress) {
    return (
      <PressableScale
        tint
        subtle
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityHint={accessibilityHint}
        style={[frame, style]}
      >
        {body}
      </PressableScale>
    )
  }

  return <View className={cn(className)} style={[frame, style]}>{body}</View>
}
