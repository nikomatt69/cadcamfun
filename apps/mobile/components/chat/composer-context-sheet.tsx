import type { ComponentType, ReactNode } from "react"
import { ScrollView, StyleSheet, Text, View } from "react-native"
import { Box, Camera, ChevronRight, Cog, Cpu, FileCode, MessageSquare, Route, ShieldCheck, SlidersHorizontal } from "lucide-react-native"
import Animated from "react-native-reanimated"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { PressableScale } from "@/components/ui/PressableScale"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { hexToRgba, useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { usePrefersReducedMotion } from "@/lib/animation"
import { type as typeStyle } from "@/lib/typography"
import { COMPOSER_MODES, cameraRowSubtitle, canAttachMore, type ComposerMode } from "@/lib/composer"

/** iOS cannot present a modal over a modal that is still dismissing, so the next one waits for it. */
const AFTER_DISMISS_MS = 350

type Icon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>

const MODE_ICON: Record<ComposerMode, Icon> = {
  general: MessageSquare,
  cad: Box,
  cam: Cog,
  toolpath: Route,
  gcode: FileCode,
}

/**
 * The composer's drawer, after nikcli's ComposerToolDrawer: a one-line description, a row of focus chips that
 * work like its tabs, and flat 72pt rows with an icon tile for everything that leaves the composer
 * (camera, model, permissions, session). The composer itself keeps one line of controls.
 */
export function ComposerContextSheet({ open, onClose, mode, onModeChange, modelLabel, permissionLabel, attachmentCount = 0, onAddAttachment, onOpenModels, onOpenControls }: {
  open: boolean
  onClose: () => void
  mode: ComposerMode
  onModeChange: (mode: ComposerMode) => void
  modelLabel?: string
  permissionLabel: string
  /** Pictures already waiting to go with the next message. */
  attachmentCount?: number
  onAddAttachment?: () => void
  onOpenModels?: () => void
  onOpenControls: () => void
}) {
  const { palette } = useTheme()
  const content = useContentLayout()
  const then = (next: () => void) => { onClose(); setTimeout(next, AFTER_DISMISS_MS) }
  const selected = COMPOSER_MODES.find((item) => item.value === mode)
  const cameraFull = !canAttachMore(attachmentCount)
  const hairline = hexToRgba(palette.ink, 0.08)

  return (
    <BottomSheet open={open} onClose={onClose} title="Add context">
      <View style={{ paddingHorizontal: content.gutter, paddingBottom: 4 }}>
        <Text style={{ color: palette.muted, ...typeStyle(13) }}>
          Add a photo, or choose what the assistant focuses on for your next message.
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, flexShrink: 0 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: content.gutter, paddingVertical: 12, alignItems: "center" }}
        accessibilityRole="radiogroup"
        accessibilityLabel="Focus"
      >
        {COMPOSER_MODES.map((item) => (
          <FocusChip
            key={item.value}
            Icon={MODE_ICON[item.value]}
            label={item.label}
            hint={item.hint}
            active={item.value === mode}
            onPress={() => { if (item.value !== mode) { haptic("selection"); onModeChange(item.value) } }}
          />
        ))}
      </ScrollView>

      {/* What the chosen focus does, so the chip is never a guess. */}
      <View style={{ paddingHorizontal: content.gutter, paddingBottom: 12 }}>
        <Text accessibilityLiveRegion="polite" style={{ color: palette.soft, ...typeStyle(13) }}>{selected?.hint}</Text>
      </View>

      <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hairline }}>
        {onAddAttachment ? (
          <SheetRow
            Icon={Camera}
            title="Camera"
            subtitle={cameraRowSubtitle(attachmentCount)}
            disabled={cameraFull}
            hairline={hairline}
            gutter={content.gutter}
            onPress={() => then(onAddAttachment)}
          />
        ) : null}
        {onOpenModels ? (
          <SheetRow
            Icon={Cpu}
            title="Model"
            subtitle={modelLabel ? `${modelLabel} · provider, model and thinking effort` : "Provider, model and thinking effort"}
            hairline={hairline}
            gutter={content.gutter}
            onPress={() => then(onOpenModels)}
          />
        ) : null}
        <SheetRow
          Icon={ShieldCheck}
          title="Permissions"
          subtitle={permissionLabel}
          hairline={hairline}
          gutter={content.gutter}
          onPress={() => then(onOpenControls)}
        />
        <SheetRow
          Icon={SlidersHorizontal}
          title="Tools and session"
          subtitle="Context, tools and conversation controls"
          hairline={hairline}
          gutter={content.gutter}
          last
          onPress={() => then(onOpenControls)}
        />
      </View>
    </BottomSheet>
  )
}

/** A focus chip: the drawer's tab. The active one fills with the accent; the colour change eases instead of snapping. */
function FocusChip({ Icon, label, hint, active, onPress }: { Icon: Icon; label: string; hint: string; active: boolean; onPress: () => void }) {
  const { palette } = useTheme()
  const reduced = usePrefersReducedMotion()
  const color = active ? palette.onAccent : palette.muted
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ selected: active }}
      hitSlop={0}
    >
      <Animated.View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          minHeight: 44,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 16,
          borderCurve: "continuous",
          backgroundColor: active ? palette.accent : hexToRgba(palette.ink, 0.08),
          transitionProperty: "backgroundColor",
          transitionDuration: reduced ? "0ms" : "200ms",
          transitionTimingFunction: "ease-out",
        }}
      >
        <Icon size={13} color={color} strokeWidth={2.2} />
        <Text style={{ color, ...typeStyle(13, { weight: "600" }) }}>{label}</Text>
      </Animated.View>
    </PressableScale>
  )
}

/** A flat drawer row: a 44pt icon tile, the title over its meta line, a chevron; a hairline under all but the last. */
function SheetRow({ Icon, title, subtitle, disabled = false, last = false, hairline, gutter, onPress }: {
  Icon: Icon
  title: string
  subtitle: ReactNode
  disabled?: boolean
  last?: boolean
  hairline: string
  gutter: number
  onPress: () => void
}) {
  const { palette } = useTheme()
  return (
    <PressableScale
      onPress={() => { haptic("selection"); onPress() }}
      disabled={disabled}
      tint
      subtle
      accessibilityRole="button"
      accessibilityLabel={typeof subtitle === "string" ? `${title}, ${subtitle}` : title}
      style={{
        alignSelf: "stretch",
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        minHeight: 72,
        paddingHorizontal: gutter,
        paddingVertical: 14,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: hairline,
      }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 14, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: hexToRgba(palette.ink, 0.08) }}>
        <Icon size={20} color={palette.accent} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ color: palette.ink, ...typeStyle(15, { weight: "600" }) }}>{title}</Text>
        <Text style={{ color: palette.muted, ...typeStyle(12.5) }}>{subtitle}</Text>
      </View>
      <ChevronRight size={16} color={palette.muted} strokeWidth={2} />
    </PressableScale>
  )
}
