import { useEffect, useRef, useState } from "react"
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { Image } from "expo-image"
import { ArrowUp, Camera, ChevronDown, Plus, ShieldCheck, Square, X } from "lucide-react-native"
import Animated, { FadeIn, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated"
import { hexToRgba, useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { EASE_OUT, usePrefersReducedMotion, usePressScale } from "@/lib/animation"
import { AdaptiveBlur } from "@/components/GlassView"
import { layout } from "@/lib/layout"
import { type as typeStyle } from "@/lib/typography"
import { useContentLayout } from "@/components/layout/use-content-layout"
import type { PendingAttachment } from "@/lib/attachments"
import { composerPlaceholder, modelPillLabel, type ComposerMode } from "@/lib/composer"
import { ComposerContextSheet } from "./composer-context-sheet"

export type AssistantMode = ComposerMode

/** Send and Stop; the bare toolbar icons use the smaller `ICON_TARGET`. */
const CONTROL = 44
const ICON_TARGET = 36
const CARD_RADIUS = 24
/** The character count only appears once a message is long enough to need watching. */
const COUNT_FROM = 100
const COUNT_WARN = 400

/**
 * The CADCAMFUN composer follows nikcli's SessionComposer while staying domain-specific:
 * one glass capsule, a growing editor, a hairline, then a toolbar of bare icons on the left
 * (photograph the part, permissions, add context) and the model pill plus a round send on the right.
 * Where nikcli switches Plan/Code, ours focuses the assistant on CAD, CAM, toolpaths or G-code;
 * that focus is named in the model pill and chosen in the "Add context" sheet.
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
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<TextInput>(null)
  const sendScale = usePressScale()
  const stopScale = usePressScale()
  const reduced = usePrefersReducedMotion()
  const canSubmit = text.trim().length > 0 && !disabled
  const stacked = content.fontScale > 1.3
  /** One slot on the right: Send while there is something to send, Stop while a turn runs with nothing typed. */
  const showSend = canSubmit || !busy
  const roundButton = { width: CONTROL, height: CONTROL, borderRadius: CONTROL / 2, alignItems: "center", justifyContent: "center" } as const
  const bareIcon = { width: ICON_TARGET, height: ICON_TARGET, borderRadius: ICON_TARGET / 2, alignItems: "center", justifyContent: "center" } as const
  const showCount = text.length > COUNT_FROM && !busy
  const hairline = hexToRgba(palette.ink, isDark ? 0.16 : 0.12)

  // Stop breathes while the desktop works, so a running turn is visible from the corner of the eye.
  const pulse = useSharedValue(1)
  const pulsing = busy && !stopping && !reduced
  useEffect(() => {
    if (!pulsing) { cancelAnimation(pulse); pulse.value = 1; return }
    pulse.value = withRepeat(withSequence(withTiming(1.12, { duration: 680 }), withTiming(1, { duration: 680 })), -1)
    return () => cancelAnimation(pulse)
  }, [pulsing, pulse])
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }))

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
        <View
          style={{
            alignSelf: "center",
            maxWidth: "100%",
            minHeight: 26,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginBottom: 8,
            paddingHorizontal: 12,
            paddingVertical: 4,
            borderRadius: 999,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: hexToRgba(stopping ? palette.danger : palette.ink, stopping ? 0.22 : isDark ? 0.1 : 0.12),
            backgroundColor: hexToRgba(stopping ? palette.danger : palette.ink, stopping ? 0.08 : 0.05),
          }}
        >
          <View style={{ width: 6, height: 6, flexShrink: 0, borderRadius: 3, backgroundColor: stopping ? palette.danger : palette.warning }} />
          <Text accessibilityLiveRegion="polite" numberOfLines={stacked ? undefined : 1} style={{ flexShrink: 1, color: palette.muted, fontVariant: ["tabular-nums"], ...typeStyle(12, { weight: "600" }) }}>
            {status ?? "Desktop assistant working"}{stopping ? "" : " · send to steer"}
          </Text>
        </View>
      ) : null}

      {/* The shadow sits outside the clipped capsule so it can render. */}
      <View style={{ borderRadius: CARD_RADIUS, borderCurve: "continuous", boxShadow: `0 10px 24px ${hexToRgba(palette.overlay, isDark ? 0.34 : 0.1)}` }}>
        <View style={{ borderRadius: CARD_RADIUS, borderCurve: "continuous", overflow: "hidden" }}>
          <AdaptiveBlur
            tint={isDark ? "dark" : "light"}
            intensity={72}
            fallbackColor={hexToRgba(palette.surface, isDark ? 0.94 : 0.96)}
            opaqueFallbackColor={palette.surface}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {/* Keeps the field legible over a busy transcript. */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(255,255,255,0.015)" : "rgba(247,248,250,0.2)" }]} />
          {/* The border wakes up with focus instead of snapping. */}
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: CARD_RADIUS,
                borderCurve: "continuous",
                borderWidth: 1,
                borderColor: focused ? hexToRgba(palette.ink, 0.28) : hexToRgba(palette.ink, isDark ? 0.16 : 0.1),
                transitionProperty: "borderColor",
                transitionDuration: reduced ? "0ms" : "220ms",
                transitionTimingFunction: "ease-out",
              },
            ]}
          />

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

          <View style={{ minHeight: 46, justifyContent: "center", paddingHorizontal: 18, paddingTop: 14, paddingBottom: 8 }}>
            {disabled ? (
              <Text selectable style={{ color: palette.muted, ...typeStyle(15, { leadingScale: 1.05 }) }}>
                {disabledNote ?? "Configure the assistant on the desktop"}
              </Text>
            ) : (
              <TextInput
                ref={inputRef}
                value={text}
                onChangeText={setText}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
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

          {/* Input / toolbar separator */}
          <View style={{ height: StyleSheet.hairlineWidth, marginHorizontal: 16, backgroundColor: hexToRgba(palette.ink, 0.08) }} />

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 8 }}>
            {/* Left: bare icons, no chrome. Each opens one thing; the plus gathers the rest. */}
            <View style={{ flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 2 }}>
              {onAddAttachment ? (
                <Pressable
                  onPress={() => { haptic("selection"); Keyboard.dismiss(); onAddAttachment() }}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel="Photograph the part or a drawing"
                  accessibilityState={{ disabled }}
                  hitSlop={4}
                  style={({ pressed }) => ({ ...bareIcon, opacity: disabled ? 0.3 : pressed ? 0.6 : 1 })}
                >
                  <Camera size={20} color={palette.soft} strokeWidth={2} />
                  {attachments.length > 0 ? (
                    <View style={{ position: "absolute", top: 1, right: 1, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: palette.accent }}>
                      <Text style={{ color: palette.onAccent, fontVariant: ["tabular-nums"], ...typeStyle(9, { weight: "800" }) }}>{attachments.length}</Text>
                    </View>
                  ) : null}
                </Pressable>
              ) : null}

              {!stacked ? (
                <Pressable
                  onPress={() => { haptic("selection"); Keyboard.dismiss(); onOpenControls() }}
                  accessibilityRole="button"
                  accessibilityLabel={`Permissions: ${permissionLabel}`}
                  accessibilityHint="Choose how the desktop asks before it changes the model or runs a tool"
                  hitSlop={4}
                  style={({ pressed }) => ({ ...bareIcon, opacity: pressed ? 0.6 : 1 })}
                >
                  <ShieldCheck size={20} color={palette.soft} strokeWidth={2} />
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => { haptic("selection"); Keyboard.dismiss(); setContextOpen(true) }}
                accessibilityRole="button"
                accessibilityLabel="Add context, change focus and permissions"
                hitSlop={4}
                style={({ pressed }) => ({ ...bareIcon, opacity: pressed ? 0.6 : 1 })}
              >
                <Plus size={21} color={palette.soft} strokeWidth={2} />
              </Pressable>
            </View>

            <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
              <Pressable
                onPress={() => { haptic("selection"); onOpenModels() }}
                accessibilityRole="button"
                accessibilityLabel={`Model: ${modelLabel}. Focus: ${mode}. Change provider, model or thinking effort`}
                style={({ pressed }) => ({
                  flexShrink: 1,
                  minWidth: 0,
                  minHeight: ICON_TARGET,
                  paddingHorizontal: 12,
                  gap: 5,
                  flexDirection: "row",
                  alignItems: "center",
                  borderRadius: ICON_TARGET / 2,
                  borderWidth: 1,
                  borderColor: hexToRgba(palette.ink, isDark ? 0.12 : 0.1),
                  backgroundColor: hexToRgba(palette.ink, pressed ? 0.1 : isDark ? 0.05 : 0.03),
                })}
              >
                <Text numberOfLines={stacked ? undefined : 1} style={{ flexShrink: 1, color: palette.soft, ...typeStyle(12.5, { weight: "600" }) }}>{modelPillLabel(modelLabel, mode)}</Text>
                <ChevronDown size={13} color={palette.muted} style={{ flexShrink: 0 }} />
              </Pressable>

              {showCount ? (
                <Text style={{ flexShrink: 0, color: text.length > COUNT_WARN ? palette.warning : palette.muted, fontVariant: ["tabular-nums"], ...typeStyle(11, { weight: "500" }) }}>
                  {text.length}
                </Text>
              ) : null}

              {busy ? (
                <Animated.View entering={reduced ? undefined : FadeIn.duration(150).easing(EASE_OUT)} style={pulseStyle}>
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
                    <Animated.View style={[{ ...roundButton, borderWidth: 1, borderColor: hexToRgba(palette.danger, 0.35), backgroundColor: hexToRgba(palette.danger, 0.14) }, stopScale.style]}>
                      {stopping ? <ActivityIndicator size="small" color={palette.danger} /> : <Square size={14} color={palette.danger} fill={palette.danger} strokeWidth={0} />}
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
                  {/* An outlined circle that fills with the accent once there is something to send. */}
                  <Animated.View
                    style={[
                      {
                        ...roundButton,
                        flexShrink: 0,
                        borderWidth: 1,
                        borderColor: canSubmit ? palette.accent : hairline,
                        backgroundColor: canSubmit ? palette.accent : "transparent",
                        transitionProperty: ["backgroundColor", "borderColor"],
                        transitionDuration: reduced ? "0ms" : "200ms",
                        transitionTimingFunction: "ease-out",
                      },
                      sendScale.style,
                    ]}
                  >
                    <ArrowUp size={19} color={canSubmit ? palette.onAccent : palette.muted} strokeWidth={2.4} />
                  </Animated.View>
                </Pressable>
              ) : null}
            </View>
          </View>
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
