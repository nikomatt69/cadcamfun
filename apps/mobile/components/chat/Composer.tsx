import { useEffect, useRef, useState } from "react"
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native"
import { Image } from "expo-image"
import { ArrowUp, Camera, CircleAlert, CloudOff, Plus, ShieldCheck, Square, X } from "lucide-react-native"
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, withSpring } from "react-native-reanimated"
import { hexToRgba, useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { EASE_OUT, SHEET_SPRING, spring, usePrefersReducedMotion, usePressScale } from "@/lib/animation"
import { AdaptiveBlur } from "@/components/GlassView"
import { PressableScale } from "@/components/ui/PressableScale"
import { type as typeStyle } from "@/lib/typography"
import { useContentLayout } from "@/components/layout/use-content-layout"
import type { PendingAttachment } from "@/lib/attachments"
import {
  canAttachMore,
  characterCount,
  composerPlaceholder,
  inputHeights,
  savedMessagesLabel,
} from "@/lib/composer"
import { ComposerContextSheet } from "./composer-context-sheet"
import { ImageViewer } from "./image-preview"

/** Send and Stop; the bare toolbar icons use the smaller `ICON_TARGET`. */
const CONTROL = 44
const ICON_TARGET = 36
const CARD_RADIUS = 24
/** nikcli hides the model pill below this width; the context sheet still reaches the model. */
const MODEL_PILL_MIN_WIDTH = 375

/**
 * The CADCAMFUN composer follows nikcli's SessionComposer while staying domain-specific:
 * one glass capsule, a growing editor, a hairline, then a toolbar of bare icons on the left
 * (photograph the part, permissions, add context) and the model pill and a round send on the right.
 * The assistant chooses its own focus; there is no mode to pick here.
 * A new message typed while the desktop is working steers that same session instead of being
 * blocked; with nothing typed the same corner becomes Stop, so the two actions never compete for it.
 */
export function Composer({
  busy,
  offline = false,
  stopping = false,
  disabled,
  disabledNote,
  onSend,
  onQueue,
  onStop,
  seed,
  seedToken,
  modelLabel, permissionLabel, onOpenModels, onOpenControls,
  attachments = [],
  onAddAttachment,
  onRemoveAttachment,
  error,
  onRetryError,
  onDismissError,
  savedCount = 0,
}: {
  busy: boolean
  /** The desktop is unreachable: a message is saved to the outbox instead of starting a turn. */
  offline?: boolean
  /** Stop was sent; the desktop has not ended the turn yet. */
  stopping?: boolean
  disabled: boolean
  disabledNote?: string
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
  /** Pictures waiting to go with the next message. */
  attachments?: readonly PendingAttachment[]
  /** Opens the camera for a picture of the part. */
  onAddAttachment?: () => void
  /** Removes a picture the user no longer wants to send. */
  onRemoveAttachment?: (index: number) => void
  /** A failed action, shown above the capsule like nikcli's error banner. Cleared when it is null or empty. */
  error?: string | null
  /** Offers Retry on the error banner. */
  onRetryError?: () => void
  /** Offers a dismiss button on the error banner. */
  onDismissError?: () => void
  /** Messages saved on this iPhone until the desktop is reachable; a pill shows while there are any. */
  savedCount?: number
}) {
  const { palette, isDark } = useTheme()
  const content = useContentLayout()
  const { width: windowWidth } = useWindowDimensions()
  const [text, setText] = useState("")
  const [contextOpen, setContextOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [viewing, setViewing] = useState<number | null>(null)
  const inputRef = useRef<TextInput>(null)
  const sendScale = usePressScale()
  const stopScale = usePressScale()
  const reduced = usePrefersReducedMotion()
  // Stop and Send zoom into place when they swap, but not when the screen first opens.
  const settled = useRef(false)
  useEffect(() => { settled.current = true }, [])
  const canSubmit = text.trim().length > 0 && !disabled
  const stacked = content.fontScale > 1.3
  /** One slot on the right: Stop while a turn runs with nothing to send, Send otherwise (nikcli's morph). */
  const showStop = busy && !canSubmit
  const showModel = windowWidth >= MODEL_PILL_MIN_WIDTH || stacked
  const count = characterCount(text.length)
  const heights = inputHeights(content.fontScale)
  const canAttach = canAttachMore(attachments.length)
  const idleFill = isDark ? "rgba(22,22,22,0.88)" : "rgba(255,255,255,0.88)"
  const edge = isDark ? hexToRgba(palette.ink, 0.16) : hexToRgba(palette.border, 0.82)
  const roundButton = { width: CONTROL, height: CONTROL, borderRadius: CONTROL / 2, alignItems: "center", justifyContent: "center" } as const
  const bareIcon = { width: ICON_TARGET, height: ICON_TARGET, borderRadius: ICON_TARGET / 2, alignItems: "center", justifyContent: "center" } as const
  const swapIn = reduced || !settled.current ? undefined : ZoomIn.duration(150).easing(EASE_OUT)
  const swapOut = reduced ? undefined : ZoomOut.duration(110).easing(EASE_OUT)
  const enter = (duration: number) => (reduced ? undefined : FadeIn.duration(duration).easing(EASE_OUT))
  const leave = (duration: number) => (reduced ? undefined : FadeOut.duration(duration).easing(EASE_OUT))

  // Stop breathes while the desktop works, so a running turn is visible from the corner of the eye.
  const pulse = useSharedValue(1)
  const pulsing = showStop && !stopping && !reduced
  useEffect(() => {
    if (!pulsing) { cancelAnimation(pulse); pulse.value = 1; return }
    pulse.value = withRepeat(withSequence(withTiming(1.14, { duration: 680 }), withTiming(1, { duration: 680 })), -1)
    return () => cancelAnimation(pulse)
  }, [pulsing, pulse])
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }))

  // Send rests slightly small and pops to full size once there is something to send.
  const pop = useSharedValue(canSubmit ? 1 : 0.88)
  useEffect(() => {
    pop.value = reduced ? (canSubmit ? 1 : 0.88) : withSpring(canSubmit ? 1 : 0.88, spring(SHEET_SPRING))
  }, [canSubmit, reduced, pop])
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }))

  useEffect(() => {
    if (seedToken === undefined || !seed) return
    setText(seed)
  }, [seed, seedToken])

  // The viewer follows the list: removing the photo that is open closes it.
  const viewed = viewing === null ? undefined : attachments[viewing]
  useEffect(() => { if (viewing !== null && !viewed) setViewing(null) }, [viewing, viewed])

  const submit = () => {
    const value = text.trim()
    if (!value || disabled) return
    haptic("light")
    setText("")
    if (busy) onQueue(value)
    else onSend(value)
  }

  const sendLabel = offline ? "Save message to send when the desktop reconnects" : busy ? "Steer current assistant turn" : "Send message"

  return (
    <View onLayout={content.onLayout} style={{ paddingHorizontal: content.gutter, paddingTop: 8, paddingBottom: 8 }}>
      {/* A failed action: the message, Retry when it can be retried, a dismiss when it can be put away. */}
      {error ? (
        <Animated.View
          entering={enter(160)}
          exiting={leave(120)}
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          accessibilityLabel={error}
          style={{
            marginBottom: 8,
            borderRadius: 14,
            borderCurve: "continuous",
            borderWidth: 1,
            borderColor: hexToRgba(palette.danger, 0.22),
            backgroundColor: hexToRgba(palette.danger, 0.08),
            paddingLeft: 12,
            paddingRight: 6,
            paddingVertical: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <CircleAlert size={13} color={palette.danger} strokeWidth={2.4} />
          <Text numberOfLines={stacked ? undefined : 2} style={{ flex: 1, color: palette.danger, ...typeStyle(11.5, { weight: "600" }), lineHeight: 16 }}>{error}</Text>
          {onRetryError ? (
            <Pressable
              onPress={() => { haptic("selection"); onRetryError() }}
              accessibilityRole="button"
              accessibilityLabel="Retry failed action"
              hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
              style={({ pressed }) => ({
                borderRadius: 999,
                borderWidth: 1,
                borderColor: hexToRgba(palette.danger, 0.35),
                paddingHorizontal: 10,
                paddingVertical: 3,
                opacity: pressed ? 0.68 : 1,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              })}
            >
              <Text style={{ color: palette.danger, ...typeStyle(10.5, { weight: "700" }) }}>Retry</Text>
            </Pressable>
          ) : null}
          {onDismissError ? (
            <Pressable
              onPress={() => { haptic("selection"); onDismissError() }}
              accessibilityRole="button"
              accessibilityLabel="Dismiss error"
              hitSlop={{ top: 12, bottom: 12, left: 4, right: 4 }}
              style={({ pressed }) => ({ padding: 6, opacity: pressed ? 0.55 : 1 })}
            >
              <X size={14} color={palette.danger} strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}

      {/* Messages saved on this iPhone, waiting for the desktop. */}
      {savedCount > 0 ? (
        <Animated.View
          entering={enter(160)}
          exiting={leave(120)}
          accessible
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
          accessibilityLabel={savedMessagesLabel(savedCount)}
          style={{
            marginBottom: 8,
            borderRadius: 999,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: hexToRgba(palette.warning, 0.22),
            backgroundColor: hexToRgba(palette.warning, 0.1),
            paddingHorizontal: 12,
            paddingVertical: 5,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <CloudOff size={12} color={palette.warning} strokeWidth={2.2} />
          <Text numberOfLines={stacked ? undefined : 1} style={{ flex: 1, color: palette.warning, ...typeStyle(11.5, { weight: "600" }) }}>{savedMessagesLabel(savedCount)}</Text>
        </Animated.View>
      ) : null}


      {/* The shadow sits outside the clipped capsule so it can render. */}
      <View style={{ borderRadius: CARD_RADIUS, borderCurve: "continuous", boxShadow: `0 10px 24px ${hexToRgba(palette.overlay, isDark ? 0.34 : 0.1)}` }}>
        <View style={{ borderRadius: CARD_RADIUS, borderCurve: "continuous", overflow: "hidden" }}>
          <AdaptiveBlur
            tint={isDark ? "dark" : "light"}
            intensity={72}
            fallbackColor={hexToRgba(palette.surface, isDark ? 0.94 : 0.96)}
            opaqueFallbackColor={isDark ? palette.surface : palette.background}
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

          {/* The pictures that go with the next message: visible, openable and removable. */}
          {attachments.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
              contentContainerStyle={{ gap: 10, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 2 }}
            >
              {attachments.map((attachment, index) => (
                <Animated.View
                  key={`${attachment.name}-${index}`}
                  entering={reduced ? undefined : ZoomIn.duration(160).easing(EASE_OUT)}
                  exiting={reduced ? undefined : ZoomOut.duration(120).easing(EASE_OUT)}
                  style={{ width: 60, height: 60 }}
                >
                  <PressableScale
                    onPress={() => { haptic("selection"); Keyboard.dismiss(); setViewing(index) }}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`Photo ${index + 1} of ${attachments.length}: ${attachment.name}`}
                    accessibilityHint="Opens the photo full screen"
                    hitSlop={0}
                    style={{ width: 60, height: 60, borderRadius: 14, borderCurve: "continuous", overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: hexToRgba(palette.ink, 0.12), backgroundColor: palette.panel }}
                  >
                    <Image
                      source={{ uri: `data:${attachment.mime};base64,${attachment.data}` }}
                      contentFit="cover"
                      transition={140}
                      style={{ width: "100%", height: "100%" }}
                    />
                  </PressableScale>
                  <Pressable
                    onPress={() => { haptic("selection"); onRemoveAttachment?.(index) }}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${attachment.name}`}
                    hitSlop={12}
                    style={({ pressed }) => ({ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: palette.ink, opacity: pressed ? 0.7 : 1 })}
                  >
                    <X size={12} color={palette.background} strokeWidth={3} />
                  </Pressable>
                </Animated.View>
              ))}
            </ScrollView>
          ) : null}

          {disabled ? (
            <View style={{ minHeight: heights.min, justifyContent: "center", paddingHorizontal: 18, paddingTop: 12, paddingBottom: 8 }}>
              <Text selectable style={{ color: palette.muted, ...typeStyle(16), lineHeight: heights.line }}>
                {disabledNote ?? "Configure the assistant on the desktop"}
              </Text>
            </View>
          ) : (
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={composerPlaceholder({ offline, busy, mode: "general" })}
              placeholderTextColor={palette.muted}
              multiline
              scrollEnabled
              returnKeyType="default"
              accessibilityLabel="Message to CADCAMFUN assistant"
              selectionColor={palette.accent}
              keyboardAppearance={isDark ? "dark" : "light"}
              submitBehavior="newline"
              style={{
                color: palette.ink,
                minHeight: heights.min,
                maxHeight: heights.max,
                paddingTop: 12,
                paddingBottom: 8,
                paddingHorizontal: 18,
                textAlignVertical: "top",
                ...typeStyle(16),
                lineHeight: heights.line,
              }}
            />
          )}

          {/* Input / toolbar separator */}
          <View style={{ height: StyleSheet.hairlineWidth, marginHorizontal: 16, backgroundColor: hexToRgba(palette.ink, 0.08) }} />

          <View style={{ flexDirection: stacked ? "column" : "row", alignItems: stacked ? "stretch" : "center", justifyContent: "space-between", gap: stacked ? 8 : 10, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 8 }}>
            {/* Left: bare icons, no chrome. Each opens one thing; the plus gathers the rest. */}
            <View style={{ flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 2 }}>
              {onAddAttachment ? (
                <PressableScale
                  onPress={() => { haptic("selection"); Keyboard.dismiss(); onAddAttachment() }}
                  disabled={disabled || !canAttach}
                  disabledOpacity={0.3}
                  dim
                  dimOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel="Photograph the part or a drawing"
                  accessibilityHint={canAttach ? undefined : "Remove a photo to add another"}
                  accessibilityValue={attachments.length > 0 ? { text: `${attachments.length} attached` } : undefined}
                  hitSlop={4}
                  style={bareIcon}
                >
                  <Camera size={20} color={palette.soft} strokeWidth={2} />
                  {attachments.length > 0 ? (
                    <View style={{ position: "absolute", top: 1, right: 1, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: palette.accent, borderWidth: 1, borderColor: palette.surface }}>
                      <Text style={{ color: palette.onAccent, fontVariant: ["tabular-nums"], ...typeStyle(9, { weight: "800" }) }}>{attachments.length}</Text>
                    </View>
                  ) : null}
                </PressableScale>
              ) : null}

              {!stacked ? (
                <PressableScale
                  onPress={() => { haptic("selection"); Keyboard.dismiss(); onOpenControls() }}
                  dim
                  dimOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={`Permissions: ${permissionLabel}`}
                  accessibilityHint="Choose how the desktop asks before it changes the model or runs a tool"
                  hitSlop={4}
                  style={bareIcon}
                >
                  <ShieldCheck size={20} color={palette.soft} strokeWidth={2} />
                </PressableScale>
              ) : null}

              <PressableScale
                onPress={() => { haptic("selection"); Keyboard.dismiss(); setContextOpen(true) }}
                dim
                dimOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel="Add context"
                accessibilityHint="Photo, model and permissions"
                hitSlop={4}
                style={bareIcon}
              >
                <Plus size={21} color={palette.soft} strokeWidth={2} />
              </PressableScale>
            </View>

            <View style={{ flex: stacked ? undefined : 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7 }}>
              {showModel ? (
                <Pressable
                  onPress={() => { haptic("selection"); onOpenModels() }}
                  accessibilityRole="button"
                  accessibilityLabel={`Model: ${modelLabel}`}
                  accessibilityHint="Change provider, model or thinking effort"
                  hitSlop={{ top: 7, bottom: 7 }}
                  style={({ pressed }) => ({
                    flexShrink: 1,
                    minWidth: 0,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: isDark ? hexToRgba(palette.ink, 0.12) : hexToRgba(palette.border, 0.7),
                    backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.62)",
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    opacity: pressed ? 0.72 : 1,
                  })}
                >
                  <Text numberOfLines={stacked ? undefined : 1} style={{ color: palette.muted, ...typeStyle(12, { weight: "600" }) }}>{modelLabel}</Text>
                </Pressable>
              ) : null}

              {count.visible ? (
                <Text
                  accessibilityLabel={`${text.length} characters`}
                  style={{ flexShrink: 0, color: count.warn ? palette.warning : palette.muted, fontVariant: ["tabular-nums"], ...typeStyle(11, { weight: "500" }) }}
                >
                  {text.length}
                </Text>
              ) : null}

              {/* Stop and Send share one 44pt slot and swap with a zoom. */}
              <View style={{ width: CONTROL, height: CONTROL, flexShrink: 0 }}>
                {showStop ? (
                  <Animated.View
                    key="stop"
                    entering={swapIn}
                    exiting={swapOut}
                    style={[StyleSheet.absoluteFill, pulseStyle]}
                  >
                    <Pressable
                      onPressIn={stopScale.onPressIn}
                      onPressOut={stopScale.onPressOut}
                      onPress={() => { haptic("error"); onStop() }}
                      disabled={stopping}
                      accessibilityRole="button"
                      accessibilityLabel={stopping ? "Stopping the desktop assistant" : "Stop the desktop assistant"}
                      accessibilityState={{ disabled: stopping, busy: stopping }}
                    >
                      <Animated.View style={[{ ...roundButton, borderWidth: 1, borderColor: edge, backgroundColor: idleFill }, stopScale.style]}>
                        {stopping ? <ActivityIndicator size="small" color={palette.ink} /> : <Square size={14} color={palette.ink} fill={palette.ink} strokeWidth={0} />}
                      </Animated.View>
                    </Pressable>
                  </Animated.View>
                ) : (
                  <Animated.View
                    key="send"
                    entering={swapIn}
                    exiting={swapOut}
                    style={[StyleSheet.absoluteFill, popStyle]}
                  >
                    <Pressable
                      onPressIn={sendScale.onPressIn}
                      onPressOut={sendScale.onPressOut}
                      onPress={submit}
                      accessibilityRole="button"
                      accessibilityLabel={sendLabel}
                      accessibilityState={{ disabled: !canSubmit }}
                      disabled={!canSubmit}
                    >
                      {/* An outlined circle that fills with the ink once there is something to send. */}
                      <Animated.View
                        style={[
                          {
                            ...roundButton,
                            borderWidth: 1,
                            borderColor: edge,
                            backgroundColor: canSubmit ? palette.ink : idleFill,
                            transitionProperty: "backgroundColor",
                            transitionDuration: reduced ? "0ms" : "200ms",
                            transitionTimingFunction: "ease-out",
                          },
                          sendScale.style,
                        ]}
                      >
                        {/* Two arrows crossfade so the glyph changes colour in step with the fill. */}
                        <ArrowUp size={18} color={palette.muted} strokeWidth={2.2} />
                        <Animated.View
                          pointerEvents="none"
                          style={{
                            position: "absolute",
                            top: 0,
                            right: 0,
                            bottom: 0,
                            left: 0,
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: canSubmit ? 1 : 0,
                            transitionProperty: "opacity",
                            transitionDuration: reduced ? "0ms" : "200ms",
                            transitionTimingFunction: "ease-out",
                          }}
                        >
                          <ArrowUp size={18} color={palette.background} strokeWidth={2.2} />
                        </Animated.View>
                      </Animated.View>
                    </Pressable>
                  </Animated.View>
                )}
              </View>
            </View>
          </View>
        </View>
      </View>

      <ImageViewer
        uri={viewed ? `data:${viewed.mime};base64,${viewed.data}` : null}
        title={viewed?.name ?? ""}
        onClose={() => setViewing(null)}
      />

      <ComposerContextSheet
        open={contextOpen}
        onClose={() => setContextOpen(false)}
        modelLabel={modelLabel}
        permissionLabel={permissionLabel}
        attachmentCount={attachments.length}
        onAddAttachment={onAddAttachment && !disabled ? onAddAttachment : undefined}
        onOpenModels={onOpenModels}
        onOpenControls={onOpenControls}
      />
    </View>
  )
}

