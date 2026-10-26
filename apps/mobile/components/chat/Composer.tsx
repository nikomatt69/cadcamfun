import { useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native"
import { Image } from "expo-image"
import { ArrowUp, Camera, CircleAlert, CloudOff, Plus, ShieldCheck, Square, X } from "lucide-react-native"
import Animated, { FadeIn, FadeInDown, FadeOut, ZoomIn, ZoomOut, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, withSpring } from "react-native-reanimated"
import { hexToRgba, useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { EASE_OUT, SHEET_SPRING, spring, usePrefersReducedMotion, usePrefersReducedTransparency, usePressScale } from "@/lib/animation"
import { AdaptiveBlur } from "@/components/GlassView"
import { PressableScale } from "@/components/ui/PressableScale"
import { type as typeStyle, caps } from "@/lib/typography"
import { useContentLayout } from "@/components/layout/use-content-layout"
import type { PendingAttachment } from "@/lib/attachments"
import {
  canAttachMore,
  characterCount,
  composerPlaceholder,
  inputHeights,
  modeChipAccessibilityLabel,
  modeLabel,
  parseSlashCommand,
  savedMessagesLabel,
  slashCommands,
  stepMode,
  type ComposerMode,
  type SlashCommand,
} from "@/lib/composer"
import { ComposerContextSheet } from "./composer-context-sheet"
import { ImageViewer } from "./image-preview"

export type AssistantMode = ComposerMode

/** Send and Stop; the bare toolbar icons use the smaller `ICON_TARGET`. */
const CONTROL = 44
const ICON_TARGET = 36
const CARD_RADIUS = 24
/** nikcli hides the model pill below this width; the context sheet still reaches the model. */
const MODEL_PILL_MIN_WIDTH = 375

/**
 * The CADCAMFUN composer follows nikcli's SessionComposer while staying domain-specific:
 * one glass capsule, a growing editor, a hairline, then a toolbar of bare icons on the left
 * (photograph the part, permissions, add context) and the focus chip, model pill and a round send on the right.
 * Where nikcli switches Plan/Code, ours focuses the assistant on General, CAD, CAM, toolpaths or G-code,
 * from the chip, from the "Add context" sheet, or by typing a slash command (`/cam`).
 * A new message typed while the desktop is working steers that same session instead of being
 * blocked; with nothing typed the same corner becomes Stop, so the two actions never compete for it.
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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const [text, setText] = useState("")
  const [contextOpen, setContextOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [viewing, setViewing] = useState<number | null>(null)
  const inputRef = useRef<TextInput>(null)
  const sendScale = usePressScale()
  const stopScale = usePressScale()
  const reduced = usePrefersReducedMotion()
  const reducedTransparency = usePrefersReducedTransparency()
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
  const slash = useMemo(() => (disabled ? [] : slashCommands(text)), [disabled, text])
  const showSlash = !disabled && /^\s*\/\S*$/.test(text)
  const pendingCommand = useMemo(() => parseSlashCommand(text), [text])
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

  const chooseCommand = (command: SlashCommand) => {
    haptic("selection")
    onModeChange(command.mode)
    setText("")
    inputRef.current?.focus()
  }

  const submit = () => {
    const value = text.trim()
    if (!value || disabled) return
    // A finished slash command moves the focus instead of being sent; what follows it stays in the field.
    const command = parseSlashCommand(value)
    if (command) {
      haptic("selection")
      onModeChange(command.command.mode)
      setText(command.rest)
      return
    }
    haptic("light")
    setText("")
    if (busy) onQueue(value)
    else onSend(value)
  }

  const sendLabel = pendingCommand
    ? `Switch focus to ${pendingCommand.command.label}`
    : offline ? "Save message to send when the desktop reconnects" : busy ? "Steer current assistant turn" : "Send message"

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

      {/* Slash commands: typing "/" offers the focus modes, like nikcli's command row. */}
      {showSlash ? (
        <Animated.View
          entering={reduced ? undefined : FadeInDown.duration(180).easing(EASE_OUT).withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] })}
          exiting={leave(120)}
          style={{ marginBottom: 8, borderRadius: 22, borderCurve: "continuous", boxShadow: `0 8px 20px ${hexToRgba(palette.overlay, isDark ? 0.24 : 0.1)}` }}
        >
          <View
            style={{
              borderRadius: 22,
              borderCurve: "continuous",
              overflow: "hidden",
              borderWidth: 1,
              borderColor: isDark ? "rgba(255,255,255,0.12)" : hexToRgba(palette.ink, 0.1),
              backgroundColor: reducedTransparency ? palette.surface : hexToRgba(palette.surface, isDark ? 0.94 : 0.96),
            }}
          >
            <View
              style={{
                minHeight: 44,
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 18,
                paddingVertical: 11,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: hexToRgba(palette.ink, 0.08),
              }}
            >
              <Text accessibilityRole="header" style={{ color: palette.muted, ...caps(10, { weight: "700", trackingBoost: 0.6 }) }}>
                {slash.length ? `${slash.length} command${slash.length > 1 ? "s" : ""}` : "Commands"}
              </Text>
            </View>
            {slash.length ? (
              <ScrollView
                style={{ maxHeight: Math.min(320, windowHeight * 0.28) }}
                contentContainerStyle={{ padding: 8, gap: 4 }}
                keyboardShouldPersistTaps="always"
                showsVerticalScrollIndicator={slash.length > 4}
              >
                {slash.map((command, index) => (
                  <Pressable
                    key={command.name}
                    onPress={() => chooseCommand(command)}
                    accessibilityRole="button"
                    accessibilityLabel={`${command.label}, ${command.hint}`}
                    accessibilityHint="Focuses the assistant on this kind of work"
                    accessibilityState={{ selected: command.mode === mode }}
                    style={({ pressed }) => ({
                      borderRadius: 14,
                      borderCurve: "continuous",
                      overflow: "hidden",
                      backgroundColor: pressed
                        ? hexToRgba(palette.ink, isDark ? 0.1 : 0.06)
                        : index === 0
                          ? hexToRgba(palette.ink, isDark ? 0.055 : 0.035)
                          : "transparent",
                    })}
                  >
                    <View style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10 }}>
                      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                        <Text numberOfLines={stacked ? undefined : 1} style={{ color: palette.ink, ...typeStyle(15, { weight: "600" }) }}>{`/${command.name}`}</Text>
                        <Text numberOfLines={2} style={{ color: palette.muted, ...typeStyle(12.5) }}>{command.hint}</Text>
                      </View>
                      {command.mode === mode ? (
                        <View
                          style={{
                            maxWidth: 92,
                            flexShrink: 0,
                            borderRadius: 999,
                            borderWidth: StyleSheet.hairlineWidth,
                            borderColor: hexToRgba(palette.ink, 0.1),
                            backgroundColor: hexToRgba(palette.ink, isDark ? 0.08 : 0.045),
                            paddingHorizontal: 9,
                            paddingVertical: 4,
                          }}
                        >
                          <Text numberOfLines={1} style={{ color: palette.soft, ...typeStyle(10, { weight: "600" }) }}>Current</Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <View style={{ alignItems: "center", paddingVertical: 16 }}>
                <Text style={{ color: palette.muted, ...typeStyle(13, { weight: "500" }) }}>No matching commands</Text>
              </View>
            )}
          </View>
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
              placeholder={composerPlaceholder({ offline, busy, mode })}
              placeholderTextColor={palette.muted}
              multiline
              scrollEnabled
              returnKeyType="default"
              accessibilityLabel="Message to CADCAMFUN assistant"
              accessibilityHint="Type a slash for focus commands"
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
                accessibilityHint="Photo, focus, model and permissions"
                hitSlop={4}
                style={bareIcon}
              >
                <Plus size={21} color={palette.soft} strokeWidth={2} />
              </PressableScale>
            </View>

            <View style={{ flex: stacked ? undefined : 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7 }}>
              {/* The focus, as nikcli's Plan/Code segment: a capsule that names the mode and lights up when it is not General. */}
              <FocusChip mode={mode} onOpen={() => { haptic("selection"); Keyboard.dismiss(); setContextOpen(true) }} onStep={(direction) => { haptic("selection"); onModeChange(stepMode(mode, direction)) }} />

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
        mode={mode}
        onModeChange={onModeChange}
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

/**
 * nikcli's Plan/Code segment, adapted to five modes: a 26pt capsule with the mode's name. General is quiet;
 * any other focus lights an inner pill and the accent so it is never hidden. A tap opens the sheet where the
 * five choices live; VoiceOver can also swipe up and down to step through them.
 */
function FocusChip({ mode, onOpen, onStep }: { mode: ComposerMode; onOpen: () => void; onStep: (direction: 1 | -1) => void }) {
  const { palette, isDark } = useTheme()
  const reduced = usePrefersReducedMotion()
  const lit = mode !== "general"
  const transition = { transitionDuration: reduced ? "0ms" : "200ms", transitionTimingFunction: "ease-out" } as const
  return (
    <PressableScale
      onPress={onOpen}
      accessibilityRole="adjustable"
      accessibilityLabel={modeChipAccessibilityLabel(mode)}
      accessibilityHint="Opens the focus choices. Swipe up or down to change it."
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "increment") onStep(1)
        else if (event.nativeEvent.actionName === "decrement") onStep(-1)
      }}
      hitSlop={{ top: 9, bottom: 9, left: 4, right: 4 }}
      style={{ flexShrink: 0 }}
    >
      <View
        style={{
          minHeight: 26,
          justifyContent: "center",
          borderRadius: 999,
          borderWidth: 1,
          borderColor: isDark ? hexToRgba(palette.ink, 0.13) : hexToRgba(palette.border, 0.78),
          overflow: "hidden",
        }}
      >
        {/* The sliding pill of nikcli's segment: here it fades in behind the label. */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            bottom: 2,
            left: 2,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: hexToRgba(palette.ink, 0.18),
            backgroundColor: isDark ? "rgba(255,255,255,0.13)" : "rgba(255,255,255,0.95)",
            opacity: lit ? 1 : 0,
            transitionProperty: "opacity",
            ...transition,
          }}
        />
        <Animated.Text
          numberOfLines={1}
          style={{
            paddingHorizontal: 12,
            color: lit ? palette.accent : palette.muted,
            ...typeStyle(11.5, { weight: "600" }),
            transitionProperty: "color",
            ...transition,
          }}
        >
          {modeLabel(mode)}
        </Animated.Text>
      </View>
    </PressableScale>
  )
}
