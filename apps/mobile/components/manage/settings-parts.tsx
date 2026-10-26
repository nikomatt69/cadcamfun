import type { PropsWithChildren, ReactNode } from "react"
import { Switch, Text, View, useWindowDimensions } from "react-native"
import { ChevronRight, type LucideIcon } from "lucide-react-native"
import { haptic } from "@/lib/haptics"
import { useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"
import { PressableScale } from "@/components/ui/PressableScale"
import { DividedRows, IconBadge, SheetSection, TILE_INSET, type Tone } from "@/components/chat/sheet-parts"

/**
 * The settings vocabulary, built from the assistant sheets' pieces so a row here reads like a row there:
 * a 40pt icon badge, a 15pt title with a quiet line under it, and one trailing element — a value and a
 * chevron, a switch, or a quiet action word. Every row is at least 72pt tall, so it is a 44pt target at any
 * text size, and its text wraps instead of truncating once Dynamic Type grows.
 */

/** A titled group: small-caps heading, one grouped card of rows, an optional footnote under it. */
export function SettingsSection({ title, footer, children }: PropsWithChildren<{ title: string; footer?: string }>) {
  return (
    <SheetSection title={title} footer={footer}>
      <DividedRows inset={TILE_INSET}>{children}</DividedRows>
    </SheetSection>
  )
}

function RowText({ title, description, destructive, wrap }: { title: string; description?: string; destructive?: boolean; wrap: boolean }) {
  const { palette } = useTheme()
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
      <Text style={{ color: destructive ? palette.danger : palette.ink, ...type(15, { weight: "600" }) }} numberOfLines={wrap ? undefined : 1}>{title}</Text>
      {description ? <Text style={{ color: palette.soft, ...type(13, { leadingScale: 1.05 }) }} numberOfLines={wrap ? undefined : 3}>{description}</Text> : null}
    </View>
  )
}

const ROW = { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 72, paddingHorizontal: 16, paddingVertical: 12 } as const

/** A row that goes somewhere or does something: icon, title, quiet line, then a value and a chevron (or a custom trailing). */
export function NavRow({ icon: Icon, title, description, value, trailing, tone = "accent", active, destructive, chevron = true, busy, onPress, hint, label }: {
  icon: LucideIcon
  title: string
  description?: string
  /** What is chosen now, quietly, before the chevron. */
  value?: string
  trailing?: ReactNode
  tone?: Tone
  /** Tint the badge like a choice in force. */
  active?: boolean
  destructive?: boolean
  chevron?: boolean
  busy?: boolean
  onPress?: () => void
  hint?: string
  label?: string
}) {
  const { palette } = useTheme()
  const { fontScale } = useWindowDimensions()
  const wrap = fontScale > 1
  const color = destructive ? palette.danger : palette.accent
  const body = (
    <>
      <IconBadge tone={destructive ? "danger" : tone} active={active || destructive}><Icon size={18} color={active || destructive ? color : palette.muted} strokeWidth={2.1} /></IconBadge>
      <RowText title={title} description={description} destructive={destructive} wrap={wrap} />
      {trailing ? <View style={{ flexShrink: 0, maxWidth: "42%" }}>{trailing}</View> : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, maxWidth: "42%" }}>
          {value ? <Text style={{ flexShrink: 1, color: palette.muted, textAlign: "right", ...type(14) }} numberOfLines={wrap ? undefined : 1}>{value}</Text> : null}
          {onPress && chevron ? <ChevronRight size={16} color={palette.muted} strokeWidth={2} /> : null}
        </View>
      )}
    </>
  )
  if (!onPress) return <View accessible style={ROW} accessibilityLabel={label ?? (description ? `${title}, ${description}` : title)}>{body}</View>
  return (
    <PressableScale
      onPress={() => { haptic("selection"); onPress() }}
      disabled={busy}
      tint
      subtle
      accessibilityRole="button"
      accessibilityLabel={label ?? [title, value, description].filter(Boolean).join(", ")}
      accessibilityHint={hint}
      accessibilityState={{ disabled: Boolean(busy), busy: Boolean(busy) }}
      disabledOpacity={0.6}
      style={ROW}
    >
      {body}
    </PressableScale>
  )
}

/** A row with a switch: the whole row is the control, the switch only shows its state (nikcli's toggle rows). */
export function SwitchRow({ icon: Icon, title, description, value, onValueChange, disabled, busy, hint }: {
  icon: LucideIcon
  title: string
  description?: string
  value: boolean
  onValueChange: (value: boolean) => void
  disabled?: boolean
  busy?: boolean
  hint?: string
}) {
  const { palette } = useTheme()
  const { fontScale } = useWindowDimensions()
  return (
    <PressableScale
      onPress={() => { haptic("selection"); onValueChange(!value) }}
      disabled={disabled || busy}
      tint
      subtle
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={hint ?? description}
      accessibilityState={{ checked: value, disabled: Boolean(disabled), busy: Boolean(busy) }}
      disabledOpacity={busy ? 0.6 : 0.45}
      style={ROW}
    >
      <IconBadge tone="accent" active={value && !disabled}><Icon size={18} color={value && !disabled ? palette.accent : palette.muted} strokeWidth={2.1} /></IconBadge>
      <RowText title={title} description={description} wrap={fontScale > 1} />
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Switch value={value} disabled={disabled || busy} trackColor={{ true: palette.accent }} />
      </View>
    </PressableScale>
  )
}

/** A read-only fact: a label on the left and its value on the right, both wrapping. Selectable, so it can be copied. */
export function FactRow({ label, value }: { label: string; value: string }) {
  const { palette } = useTheme()
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16, minHeight: 48, paddingHorizontal: 16, paddingVertical: 13 }}>
      <Text style={{ flexShrink: 0, color: palette.muted, ...type(15) }}>{label}</Text>
      <Text selectable style={{ flex: 1, minWidth: 0, textAlign: "right", color: palette.ink, fontVariant: ["tabular-nums"], ...type(15, { weight: "600" }) }}>{value}</Text>
    </View>
  )
}

/** Plain facts card: rows separated by a hairline inset to the text. */
export function FactsCard({ children }: PropsWithChildren) {
  return <DividedRows>{children}</DividedRows>
}
