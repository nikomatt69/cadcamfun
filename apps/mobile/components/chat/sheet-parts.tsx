import { Children, Fragment, useEffect, useState, type PropsWithChildren, type ReactNode } from "react"
import { LayoutAnimation, Pressable, StyleSheet, Switch, Text, View, useWindowDimensions, type ViewStyle } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated"
import { Check, ChevronDown, type LucideIcon } from "lucide-react-native"
import { EASE_OUT, usePrefersReducedMotion } from "@/lib/animation"
import { haptic } from "@/lib/haptics"
import { layout } from "@/lib/layout"
import { hexToRgba, useTheme, type Palette } from "@/lib/theme"
import { caps, type } from "@/lib/typography"
import { PressableScale } from "@/components/ui/PressableScale"
import { SurfaceCard } from "@/components/ui/SurfaceCard"

/**
 * The building blocks the assistant's sheets share (nikcli: SheetShell header, PermissionModeSheet rows,
 * InfoChip, CollapsibleSection). One vocabulary so the model picker, the controls and the context sheet
 * read as one family: an icon tile, a title with a quiet line under it, a check for the choice in force.
 */

export type Tone = "neutral" | "accent" | "success" | "warning" | "info" | "danger"

export const toneColor = (palette: Palette, tone: Tone): string => {
  switch (tone) {
    case "accent": return palette.accent
    case "success": return palette.success
    case "warning": return palette.warning
    case "info": return palette.info
    case "danger": return palette.danger
    default: return palette.soft
  }
}

/** Rows of one grouped card with a hairline between them, inset to the text like a native grouped list. */
export function DividedRows({ children, inset = 16 }: PropsWithChildren<{ inset?: number }>) {
  const { palette } = useTheme()
  const rows = Children.toArray(children)
  return (
    <SurfaceCard inset={false}>
      {rows.map((row, index) => (
        <Fragment key={index}>
          {index > 0 ? <View style={{ height: StyleSheet.hairlineWidth, marginLeft: inset, backgroundColor: palette.border }} /> : null}
          {row}
        </Fragment>
      ))}
    </SurfaceCard>
  )
}

/** The hairline inset that lines up with the text of a row that has a 40pt icon tile. */
export const TILE_INSET = 16 + 40 + 12

/** A sheet section: a small-caps header over its content, 8pt apart, with an optional quiet footnote. */
export function SheetSection({ title, accessory, footer, children }: PropsWithChildren<{ title: string; accessory?: ReactNode; footer?: string }>) {
  const { palette } = useTheme()
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Text accessibilityRole="header" style={{ flexShrink: 1, color: palette.muted, paddingHorizontal: 4, ...caps(11) }}>{title}</Text>
        {accessory}
      </View>
      {children}
      {footer ? <Text selectable style={{ color: palette.muted, paddingHorizontal: 4, ...type(12, { leadingScale: 1.05 }) }}>{footer}</Text> : null}
    </View>
  )
}

/** The opening block of a sheet: what is chosen now (18pt bold) and one line of what the sheet is for. */
export function SheetSummary({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  const { palette } = useTheme()
  return (
    <View style={{ gap: 4 }}>
      {eyebrow ? <Text style={{ color: palette.muted, ...type(12, { weight: "500" }) }}>{eyebrow}</Text> : null}
      <Text selectable accessibilityRole="header" style={{ color: palette.ink, ...type(18, { weight: "700" }) }}>{title}</Text>
      {description ? <Text selectable style={{ color: palette.muted, ...type(13, { leadingScale: 1.05 }) }}>{description}</Text> : null}
    </View>
  )
}

/** The 40pt rounded tile that leads a row; it takes the tone of the choice when that choice is the one in force. */
export function IconBadge({ children, tone = "neutral", active = false, size = 40 }: PropsWithChildren<{ tone?: Tone; active?: boolean; size?: number }>) {
  const { palette } = useTheme()
  const color = toneColor(palette, tone)
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size, height: size, flexShrink: 0, alignItems: "center", justifyContent: "center",
        borderRadius: size * 0.3, borderCurve: "continuous", borderWidth: 1,
        backgroundColor: active ? hexToRgba(color, 0.14) : hexToRgba(palette.ink, 0.06),
        borderColor: active ? hexToRgba(color, 0.28) : hexToRgba(palette.ink, 0.1),
      }}
    >
      {children}
    </View>
  )
}

/**
 * One choice in a set (a permission preset, a model, an action): icon tile, title, a quiet description
 * and a check on the one in force. Meets the 44pt target by being 72pt tall; text wraps at larger sizes.
 */
export function ChoiceRow({ icon: Icon, title, description, selected, tone = "accent", emphasis, onPress, disabled, trailing, hint, destructive, busy }: {
  icon: LucideIcon
  title: string
  description?: string
  /** Omit on rows that are actions, not choices. */
  selected?: boolean
  tone?: Tone
  /** Tint the icon tile like a choice in force, for the one action that leads the list. */
  emphasis?: boolean
  onPress?: () => void
  disabled?: boolean
  trailing?: ReactNode
  hint?: string
  destructive?: boolean
  busy?: boolean
}) {
  const { palette } = useTheme()
  const { fontScale } = useWindowDimensions()
  const color = toneColor(palette, destructive ? "danger" : tone)
  const wrap = fontScale > 1
  const lit = Boolean(selected) || Boolean(destructive) || Boolean(emphasis)
  return (
    <PressableScale
      onPress={onPress ? () => { haptic("selection"); onPress() } : undefined}
      disabled={disabled || !onPress}
      tint
      subtle
      accessibilityRole="button"
      accessibilityLabel={description ? `${title}, ${description}` : title}
      accessibilityHint={hint}
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(busy), ...(selected === undefined ? {} : { selected }) }}
      disabledOpacity={busy ? 0.6 : 0.45}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 72, paddingHorizontal: 16, paddingVertical: 12 }}
    >
      <IconBadge tone={destructive ? "danger" : tone} active={lit}><Icon size={18} color={lit ? color : palette.muted} strokeWidth={2.1} /></IconBadge>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={{ color: destructive ? palette.danger : palette.ink, ...type(15, { weight: "600" }) }} numberOfLines={wrap ? undefined : 1}>{title}</Text>
        {description ? <Text style={{ color: palette.soft, ...type(13, { leadingScale: 1.05 }) }} numberOfLines={wrap ? undefined : 2}>{description}</Text> : null}
      </View>
      {trailing ? <View style={{ flexShrink: 0, maxWidth: "40%" }}>{trailing}</View> : selected ? <Check size={18} color={color} strokeWidth={2.4} /> : null}
    </PressableScale>
  )
}

/** A row with a switch: the whole row is the control (a 72pt target), the switch only shows its state. */
export function ToggleRow({ icon: Icon, title, description, value, onValueChange, hint }: {
  icon: LucideIcon
  title: string
  description?: string
  value: boolean
  onValueChange: (value: boolean) => void
  hint?: string
}) {
  const { palette } = useTheme()
  const { fontScale } = useWindowDimensions()
  const wrap = fontScale > 1
  return (
    <PressableScale
      onPress={() => { haptic("selection"); onValueChange(!value) }}
      tint
      subtle
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={hint ?? description}
      accessibilityState={{ checked: value }}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 72, paddingHorizontal: 16, paddingVertical: 12 }}
    >
      <IconBadge tone="accent" active={value}><Icon size={18} color={value ? palette.accent : palette.muted} strokeWidth={2.1} /></IconBadge>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={{ color: palette.ink, ...type(15, { weight: "600" }) }} numberOfLines={wrap ? undefined : 1}>{title}</Text>
        {description ? <Text style={{ color: palette.soft, ...type(13, { leadingScale: 1.05 }) }} numberOfLines={wrap ? undefined : 3}>{description}</Text> : null}
      </View>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Switch value={value} trackColor={{ true: palette.accent }} />
      </View>
    </PressableScale>
  )
}

/** A selectable pill (thinking effort, provider filter). Looks 36pt tall like nikcli's chips; the hit area is 44pt. */
export function ChoiceChip({ title, selected, onPress, icon }: { title: string; selected: boolean; onPress: () => void; icon?: ReactNode }) {
  const { palette } = useTheme()
  return (
    <PressableScale
      onPress={() => { haptic("selection"); onPress() }}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ selected }}
      noScale
      dim
      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
      style={{
        minHeight: 36, minWidth: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
        paddingHorizontal: 14, borderRadius: 999, borderCurve: "continuous", borderWidth: 1,
        borderColor: selected ? hexToRgba(palette.accent, 0.4) : hexToRgba(palette.ink, 0.12),
        backgroundColor: selected ? hexToRgba(palette.accent, 0.14) : hexToRgba(palette.ink, 0.06),
      }}
    >
      {icon}
      <Text style={{ color: selected ? palette.accentStrong : palette.soft, ...type(13, { weight: selected ? "700" : "600" }) }}>{title}</Text>
    </PressableScale>
  )
}

/** Borderless soft status pill: tinted fill, medium-weight tabular text. */
export function InfoChip({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const { palette } = useTheme()
  const color = toneColor(palette, tone)
  return (
    <View style={{ borderRadius: 999, borderCurve: "continuous", paddingHorizontal: 10, paddingVertical: 5, backgroundColor: tone === "neutral" ? hexToRgba(palette.ink, 0.06) : hexToRgba(color, 0.14) }}>
      <Text selectable style={{ color, fontVariant: ["tabular-nums"], ...type(12, { weight: "500" }) }}>{label}</Text>
    </View>
  )
}

/** A thin usage bar (context window, token budget); the fill eases in and the value is announced as a percentage. */
export function Meter({ fraction, tone, label }: { fraction: number; tone: Tone; label: string }) {
  const { palette } = useTheme()
  const reduced = usePrefersReducedMotion()
  const clamped = Math.min(1, Math.max(0, fraction))
  const width = useSharedValue(reduced ? clamped : 0)
  useEffect(() => { width.set(reduced ? clamped : withTiming(clamped, { duration: 320, easing: EASE_OUT })) }, [clamped, reduced, width])
  const fill = useAnimatedStyle(() => ({ width: `${width.get() * 100}%` }))
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{ height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: palette.panel }}
    >
      <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: toneColor(palette, tone === "neutral" ? "accent" : tone) }, fill]} />
    </View>
  )
}

/** A section that folds away (nikcli: CollapsibleSection). The chevron turns instead of swapping; Reduce Motion skips the layout animation. */
export function CollapsibleSection({ title, count, defaultOpen = true, children }: PropsWithChildren<{ title: string; count?: number; defaultOpen?: boolean }>) {
  const { palette } = useTheme()
  const reduced = usePrefersReducedMotion()
  const [open, setOpen] = useState(defaultOpen)
  const turn = useSharedValue(defaultOpen ? 1 : 0)
  useEffect(() => { turn.set(reduced ? (open ? 1 : 0) : withTiming(open ? 1 : 0, { duration: 200, easing: EASE_OUT })) }, [open, reduced, turn])
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${(turn.get() - 1) * 90}deg` }] }))
  const toggle = () => {
    if (!reduced) LayoutAnimation.configureNext(LayoutAnimation.create(200, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity))
    haptic("selection")
    setOpen((value) => !value)
  }
  const label = count === undefined ? title : `${title}, ${count}`
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        accessibilityHint={open ? "Collapses the list" : "Expands the list"}
        style={({ pressed }) => ({ minHeight: layout.touchTarget, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, opacity: pressed ? 0.7 : 1 })}
      >
        <Text style={{ flexShrink: 1, color: palette.muted, ...caps(11) }}>{title}</Text>
        {count !== undefined ? <InfoChip label={String(count)} /> : null}
        <View style={{ flex: 1 }} />
        <Animated.View style={chevron}><ChevronDown size={18} color={palette.muted} strokeWidth={2} /></Animated.View>
      </Pressable>
      {open ? children : null}
    </View>
  )
}

/** Padding that keeps a horizontally scrolling chip row aligned with the sheet's gutter. */
export const chipRowStyle = (gutter: number): ViewStyle => ({ gap: 8, paddingHorizontal: gutter })
