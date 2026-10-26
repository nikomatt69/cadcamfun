import { useEffect, useRef, useState } from "react"
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { Image } from "expo-image"
import { ArrowUp, ChevronDown, Plus, Square, X } from "lucide-react-native"
import Animated, { FadeIn } from "react-native-reanimated"
import { hexToRgba, useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { EASE_OUT, usePrefersReducedMotion, usePressScale } from "@/lib/animation"
import { layout } from "@/lib/layout"
import { type as typeStyle } from "@/lib/typography"
import { useContentLayout } from "@/components/layout/use-content-layout"
import type { PendingAttachment } from "@/lib/attachments"
import { composerPlaceholder, modelPillLabel, type ComposerMode } from "@/lib/composer"
import { ComposerContextSheet } from "./composer-context-sheet"

export type AssistantMode = ComposerMode

const CONTROL = 36
const CARD_RADIUS = 28

/**
 * The CADCAMFUN composer follows nikcli's mobile interaction model while staying domain-specific:
 * one solid card, a growing editor and a single line of controls — add context, model, send.
 * Modes, the camera and permissions live in the "Add context" sheet behind the plus button.
 * A new message typed while the desktop is working steers that same session instead of being
 * blocked; Stop stays its own target so the two actions can never be confused.
 */
export function Composer({
  busy,
  offline = false,
  stopping = false,
  disabled,
  disabledNote,
  mode,
  onModeChange,
  onSend,
  onQueue,
  onStop,
  seed,
  seedToken,
  modelLabel, permissionLabel, onOpenModels, onOpenControls, status,
  attachments = [],
  onAddAttachment,
  onRemoveAttachment,
}: {
  busy: boolean
  /** The desktop is unreachable: a message is saved to the outbox instead of starting a turn. */
  offline?: boolean
  /** Stop was sent; the desktop has not ended the turn yet. */
  stopping?: boolean
  disabled: boolean
  disabledNote?: string
  mode: AssistantMode
  onModeChange: (mode: AssistantMode) => void
  onSend: (text: string) => void
  onQueue: (text: string) => void
  onStop: () => void
  /** Fills the field when `seedToken` changes. The user still sends it. */
  seed?: string
  seedToken?: number
  modelLabel: string
  permissionLabel: string
  onOpenModels(): void
  onOpenControls(): void
  /** Live phase of the desktop turn (step, tool, retries, tokens); shown while busy. */
  status?: string
  /** Pictures waiting to go with the next message. */
  attachments?: readonly PendingAttachment[]
  /** Opens the camera for a picture of the part. */
  onAddAttachment?: () => void
  /** Removes a picture the user no longer wants to send. */
  onRemoveAttachment?: (index: number) => void
}) {
  const { palette, isDark } = useTheme()
  const content = useContentLayout()
  const [text, setText] = useState("")
  const [contextOpen, setContextOpen] = useState(false)
  const inputRef = useRef<TextInput>(null)
  const sendScale = usePressScale()
  const stopScale = usePressScale()
  const reduced = usePrefersReducedMotion()
  const canSubmit = text.trim().length > 0 && !disabled
  const stacked = content.fontScale > 1.3
  /** One slot on the right: Send while there is something to send, Stop while a turn runs with nothing typed. */
  const showSend = canSubmit || !busy
  const iconButton = { width: CONTROL, height: CONTROL, borderRadius: CONTROL / 2, alignItems: "center", justifyContent: "center" } as const

  useEffect(() => {
    if (seedToken === undefined || !seed) return
    setText(seed)
  }, [seed, seedToken])

  const submit = () => {
    const value = text.trim()
    if (!value || disabled) return
    haptic("light")
    setText("")
    if (busy) onQueue(value)
    else onSend(value)
  }

  return (
    <View onLayout={content.onLayout} style={{ paddingHorizontal: content.gutter, paddingTop: 8, paddingBottom: 8 }}>
      {busy ? (
        <View style={{ minHeight: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingBottom: 6 }}>
          <View style={{ width: 6, height: 6, flexShrink: 0, borderRadius: 3, backgroundColor: stopping ? palette.danger : palette.warning }} />
          <Text accessibilityLiveRegion="polite" numberOfLines={stacked ? undefined : 1} style={{ flexShrink: 1, color: palette.muted, fontVariant: ["tabular-nums"], ...typeStyle(12, { weight: "500" }) }}>
            {status ?? "Desktop assistant working"}{stopping ? "" : " · send to steer"}
          </Text>
        </View>
      ) : null}

      <View
        style={{
          borderRadius: CARD_RADIUS,
          borderCurve: "continuous",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: hexToRgba(palette.ink, isDark ? 0.16 : 0.1),
          backgroundColor: palette.surface,
          boxShadow: `0 8px 24px ${hexToRgba(palette.overlay, isDark ? 0.34 : 0.1)}`,
        }}
      >
        {/* The pictures that go with the next message: visible, and removable. */}
        {attachments.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 10, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 2 }}
          >
            {attachments.map((attachment, index) => (
              <View key={`${attachment.name}-${index}`} style={{ width: 60, height: 60 }}>
                <Image
                  source={{ uri: `data:${attachment.mime};base64,${attachment.data}` }}
                  accessibilityLabel={attachment.name}
                  contentFit="cover"
                  style={{ width: 60, height: 60, borderRadius: 14, backgroundColor: palette.panel }}
                />
                <Pressable
                  onPress={() => { haptic("selection"); onRemoveAttachment?.(index) }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${attachment.name}`}
                  hitSlop={12}
                  style={({ pressed }) => ({ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: palette.ink, opacity: pressed ? 0.7 : 1 })}
                >
                  <X size={12} color={palette.background} strokeWidth={3} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}

        <View style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 18, paddingTop: 14, paddingBottom: 6 }}>
          {disabled ? (
            <Text selectable style={{ color: palette.muted, ...typeStyle(15, { leadingScale: 1.05 }) }}>
              {disabledNote ?? "Configure the assistant on the desktop"}
            </Text>
          ) : (
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder={composerPlaceholder({ offline, busy, mode })}
              placeholderTextColor={palette.muted}
              multiline
              scrollEnabled
              accessibilityLabel="Message to CADCAMFUN assistant"
              selectionColor={palette.accent}
              keyboardAppearance={isDark ? "dark" : "light"}
              style={{ color: palette.ink, maxHeight: Math.max(132, 80 * content.fontScale), padding: 0, ...typeStyle(16, { leadingScale: 1.05 }) }}
              submitBehavior="newline"
            />
          )}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingTop: 2, paddingBottom: 10 }}>
          <Pressable
            onPress={() => { haptic("selection"); setContextOpen(true) }}
            accessibilityRole="button"
            accessibilityLabel="Add context, change focus and permissions"
            hitSlop={4}
            style={({ pressed }) => ({ ...iconButton, flexShrink: 0, backgroundColor: hexToRgba(palette.ink, pressed ? 0.14 : 0.07) })}
          >
            <Plus size={20} color={palette.soft} />
          </Pressable>

          <Pressable
            onPress={onOpenModels}
            accessibilityRole="button"
            accessibilityLabel={`Model: ${modelLabel}. Focus: ${mode}. Change provider, model or thinking effort`}
            style={({ pressed }) => ({ flexShrink: 1, minWidth: 0, minHeight: CONTROL, paddingHorizontal: 14, gap: 6, flexDirection: "row", alignItems: "center", borderRadius: CONTROL / 2, backgroundColor: hexToRgba(palette.ink, pressed ? 0.14 : 0.07) })}
          >
            <Text numberOfLines={stacked ? undefined : 1} style={{ flexShrink: 1, color: palette.soft, ...typeStyle(13, { weight: "600" }) }}>{modelPillLabel(modelLabel, mode)}</Text>
            <ChevronDown size={14} color={palette.muted} style={{ flexShrink: 0 }} />
          </Pressable>

          <View style={{ flex: 1 }} />

          {busy ? (
            <Animated.View entering={reduced ? undefined : FadeIn.duration(150).easing(EASE_OUT)}>
              <Pressable
                onPressIn={stopScale.onPressIn}
                onPressOut={stopScale.onPressOut}
                onPress={() => { haptic("light"); onStop() }}
                disabled={stopping}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={stopping ? "Stopping the desktop assistant" : "Stop the desktop assistant"}
                accessibilityState={{ disabled: stopping, busy: stopping }}
              >
                <Animated.View style={[{ ...iconButton, backgroundColor: hexToRgba(palette.danger, 0.14) }, stopScale.style]}>
                  {stopping ? <ActivityIndicator size="small" color={palette.danger} /> : <Square size={13} color={palette.danger} fill={palette.danger} />}
                </Animated.View>
              </Pressable>
            </Animated.View>
          ) : null}

          {showSend ? (
            <Pressable
              onPressIn={sendScale.onPressIn}
              onPressOut={sendScale.onPressOut}
              onPress={submit}
              accessibilityRole="button"
              accessibilityLabel={offline ? "Save message to send when the desktop reconnects" : busy ? "Steer current assistant turn" : "Send message"}
              accessibilityState={{ disabled: !canSubmit }}
              disabled={!canSubmit}
              hitSlop={4}
            >
              <Animated.View
                style={[
                  {
                    ...iconButton,
                    backgroundColor: palette.accent,
                    opacity: canSubmit ? 1 : 0.32,
                    // Typing the first character wakes the button instead of snapping it on.
                    transitionProperty: "opacity",
                    transitionDuration: "150ms",
                    transitionTimingFunction: "ease-out",
                  },
                  sendScale.style,
                ]}
              >
                <ArrowUp size={19} color={palette.onAccent} strokeWidth={2.6} />
              </Animated.View>
            </Pressable>
          ) : null}
        </View>
      </View>

      <ComposerContextSheet
        open={contextOpen}
        onClose={() => setContextOpen(false)}
        mode={mode}
        onModeChange={onModeChange}
        permissionLabel={permissionLabel}
        onAddAttachment={onAddAttachment}
        onOpenControls={onOpenControls}
      />
    </View>
  )
}
