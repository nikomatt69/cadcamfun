import type { ComponentType, ReactNode } from "react"
import { StyleSheet, Text, View } from "react-native"
import { Camera, ChevronRight, Cpu, ShieldCheck, SlidersHorizontal } from "lucide-react-native"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { PressableScale } from "@/components/ui/PressableScale"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { hexToRgba, useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { type as typeStyle } from "@/lib/typography"
import { cameraRowSubtitle, canAttachMore } from "@/lib/composer"

/** iOS cannot present a modal over a modal that is still dismissing, so the next one waits for it. */
export const AFTER_DISMISS_MS = 350

type Icon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>

/**
 * The composer's drawer, after nikcli's ComposerToolDrawer: a one-line description and flat 72pt rows
 * with an icon tile for everything that leaves the composer
 * (camera, model, permissions, session). The composer itself keeps one line of controls.
 * The assistant chooses its own focus, so there is no mode picker here.
 */
export function ComposerContextSheet({ open, onClose, modelLabel, permissionLabel, attachmentCount = 0, onAddAttachment, onOpenModels, onOpenControls }: {
  open: boolean
  onClose: () => void
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
  const cameraFull = !canAttachMore(attachmentCount)
  const hairline = hexToRgba(palette.ink, 0.08)

  return (
    <BottomSheet open={open} onClose={onClose} title="Add context">
      <View style={{ paddingHorizontal: content.gutter, paddingBottom: 12 }}>
        <Text style={{ color: palette.muted, ...typeStyle(13) }}>
          Add a photo, or adjust the model and permissions for your next message.
        </Text>
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
