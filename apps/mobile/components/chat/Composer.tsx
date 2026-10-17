import { useEffect, useRef, useState } from "react"
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { ArrowUp, ChevronDown, Plus, Shield, Square } from "lucide-react-native"
import Animated from "react-native-reanimated"
import { AdaptiveBlur } from "@/components/GlassView"
import { hexToRgba, useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { usePressScale } from "@/lib/animation"
import { layout } from "@/lib/layout"
import { useContentLayout } from "@/components/layout/use-content-layout"

export type AssistantMode = "general" | "cad" | "cam" | "gcode" | "toolpath"

const MODES: ReadonlyArray<{ value: AssistantMode; label: string }> = [
  { value: "general", label: "General" },
  { value: "cad", label: "CAD" },
  { value: "cam", label: "CAM" },
  { value: "toolpath", label: "Toolpath" },
  { value: "gcode", label: "G-code" },
]

/**
 * The CADCAMFUN composer follows nikcli's mobile interaction model while staying domain-specific:
 * one floating material, a growing editor, a compact mode rail, and explicit live-turn controls.
 * A new message typed while the desktop is working steers that same session instead of being
 * blocked; Stop remains a separate target so the two actions can never be confused.
 */
export function Composer({
  busy,
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
}: {
  busy: boolean
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
}) {
  const { palette, glass, isDark } = useTheme()
  const content = useContentLayout()
  const [text, setText] = useState("")
  const inputRef = useRef<TextInput>(null)
  const sendScale = usePressScale()
  const stopScale = usePressScale()
  const canSubmit = text.trim().length > 0 && !disabled
  const stacked = content.fontScale > 1.3

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
    <View onLayout={content.onLayout} style={{ paddingHorizontal: content.gutter, paddingTop: 8, paddingBottom: 10, backgroundColor: "transparent" }}>
      {busy ? (
        <View style={{ minHeight: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingBottom: 6 }}>
          <View style={{ width: 6, height: 6, flexShrink: 0, borderRadius: 3, backgroundColor: palette.warning }} />
          <Text selectable style={{ flexShrink: 1, color: palette.muted, fontSize: 12, lineHeight: 17, fontWeight: "500" }}>
            Desktop assistant working · send to steer
          </Text>
        </View>
      ) : null}

      <View
        style={{
          overflow: "hidden",
          borderRadius: 24,
          borderCurve: "continuous",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: hexToRgba(palette.ink, isDark ? 0.16 : 0.1),
          boxShadow: isDark ? "0 10px 30px rgba(0,0,0,0.34)" : "0 10px 30px rgba(0,0,0,0.12)",
        }}
      >
        <AdaptiveBlur
          tint={isDark ? "dark" : "light"}
          intensity={82}
          fallbackColor={glass.shellStrong}
          opaqueFallbackColor={palette.surface}
          style={{ paddingTop: 5 }}
        >
          <View style={{ minHeight: 52, flexDirection: stacked ? "column" : "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 10, paddingTop: 7, paddingBottom: 7 }}>
            <View style={{ flex: stacked ? undefined : 1, alignSelf: stacked ? "stretch" : undefined, minWidth: 0, justifyContent: "center", paddingLeft: 6, paddingVertical: 5 }}>
              {disabled ? (
                <Text selectable style={{ color: palette.muted, fontSize: 15, lineHeight: 21 }}>
                  {disabledNote ?? "Configure the assistant on the desktop"}
                </Text>
              ) : (
                <TextInput
                  ref={inputRef}
                  value={text}
                  onChangeText={setText}
                  placeholder={busy ? "Steer the current turn…" : "Ask CADCAMFUN…"}
                  placeholderTextColor={palette.muted}
                  multiline
                  editable
                  accessibilityLabel="Message to CADCAMFUN assistant"
                  selectionColor={palette.accent}
                  keyboardAppearance={isDark ? "dark" : "light"}
                  style={{ color: palette.ink, fontSize: 16, lineHeight: 22, maxHeight: Math.max(112, 66 * content.fontScale), padding: 0 }}
                  onSubmitEditing={submit}
                  blurOnSubmit={false}
                />
              )}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {busy ? (
              <Pressable
                onPressIn={stopScale.onPressIn}
                onPressOut={stopScale.onPressOut}
                onPress={onStop}
                accessibilityRole="button"
                accessibilityLabel="Stop the desktop assistant"
                style={{ width: layout.touchTarget, height: layout.touchTarget, flexShrink: 0, alignItems: "center", justifyContent: "center" }}
              >
                <Animated.View style={[{ width: layout.touchTarget, height: layout.touchTarget, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: hexToRgba(palette.danger, 0.14) }, stopScale.style]}>
                  <Square size={13} color={palette.danger} fill={palette.danger} />
                </Animated.View>
              </Pressable>
            ) : null}

            <Pressable
              onPressIn={sendScale.onPressIn}
              onPressOut={sendScale.onPressOut}
              onPress={submit}
              accessibilityRole="button"
              accessibilityLabel={busy ? "Steer current assistant turn" : "Send message"}
              accessibilityState={{ disabled: !canSubmit }}
              disabled={!canSubmit}
              style={{ width: layout.touchTarget, height: layout.touchTarget, flexShrink: 0, alignItems: "center", justifyContent: "center" }}
            >
              <Animated.View
                style={[
                  {
                    width: layout.touchTarget,
                    height: layout.touchTarget,
                    borderRadius: 22,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: palette.accent,
                    opacity: canSubmit ? 1 : 0.32,
                  },
                  sendScale.style,
                ]}
              >
                <ArrowUp size={19} color={palette.onAccent} strokeWidth={2.6} />
              </Animated.View>
            </Pressable>
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingBottom: 5 }}>
            <Pressable onPress={onOpenControls} accessibilityRole="button" accessibilityLabel="Tools, permissions and session controls" style={({ pressed }) => ({ minWidth: 44, minHeight: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: hexToRgba(palette.ink, pressed ? 0.13 : 0.06) })}><Plus size={20} color={palette.soft} /></Pressable>
            <Pressable onPress={onOpenModels} accessibilityRole="button" accessibilityLabel={`Model: ${modelLabel}. Change provider, model or thinking effort`} style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 10, gap: 6, flexDirection: "row", alignItems: "center", borderRadius: 16, backgroundColor: pressed ? hexToRgba(palette.ink, 0.06) : "transparent" })}>
              <Text numberOfLines={stacked ? undefined : 1} style={{ flexShrink: 1, color: palette.soft, fontSize: 12, fontWeight: "600" }}>{modelLabel}</Text><ChevronDown size={13} color={palette.muted} />
            </Pressable>
            <Pressable onPress={onOpenControls} accessibilityRole="button" accessibilityLabel={`Permissions: ${permissionLabel}`} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><Shield size={17} color={palette.muted} /></Pressable>
          </View>
          <View style={{ height: StyleSheet.hairlineWidth, marginHorizontal: 12, backgroundColor: hexToRgba(palette.ink, 0.08) }} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 5, paddingHorizontal: 10, paddingVertical: 8 }}
          >
            {MODES.map((item) => {
              const active = item.value === mode
              return (
                <Pressable
                  key={item.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    if (active) return
                    haptic("selection")
                    onModeChange(item.value)
                  }}
                  style={({ pressed }) => ({
                    minHeight: 44,
                    justifyContent: "center",
                    paddingHorizontal: 11,
                    borderRadius: 999,
                    backgroundColor: active ? hexToRgba(palette.accent, 0.14) : pressed ? hexToRgba(palette.ink, 0.06) : "transparent",
                  })}
                >
                  <Text style={{ color: active ? palette.accentStrong : palette.soft, fontSize: 12, lineHeight: 16, fontWeight: active ? "700" : "500" }}>{item.label}</Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </AdaptiveBlur>
      </View>
    </View>
  )
}
