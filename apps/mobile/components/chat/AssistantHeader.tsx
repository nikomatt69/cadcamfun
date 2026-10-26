import type { ReactNode } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Bot, ChevronDown, History, Plus } from "lucide-react-native"
import { AdaptiveBlur } from "@/components/GlassView"
import { hexToRgba, useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { usePrefersReducedMotion } from "@/lib/animation"
import { type as typeStyle } from "@/lib/typography"

/** nikcli's chrome button: an 18pt icon in 12pt of padding inside a 1pt ring, which is also the minimum touch target. */
const BUTTON = 44

/** A round glass button: the chrome the nikcli session header uses, so the header floats over the transcript. */
function ChromeButton({ label, hint, disabled, onPress, children }: { label: string; hint?: string; disabled?: boolean; onPress: () => void; children: ReactNode }) {
  const { palette, isDark } = useTheme()
  const reduced = usePrefersReducedMotion()
  return (
    <Pressable
      onPress={() => { haptic("selection"); onPress() }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        width: BUTTON,
        height: BUTTON,
        borderRadius: BUTTON / 2,
        borderCurve: "continuous",
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: isDark ? hexToRgba(palette.ink, 0.16) : hexToRgba(palette.border, 0.82),
        opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
        transform: [{ scale: pressed && !reduced ? 0.95 : 1 }],
      })}
    >
      <AdaptiveBlur
        tint={isDark ? "dark" : "light"}
        intensity={44}
        style={StyleSheet.absoluteFill}
        fallbackColor={isDark ? "rgba(22,22,22,0.88)" : "rgba(255,255,255,0.88)"}
        opaqueFallbackColor={palette.surface}
        pointerEvents="none"
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.16)" }]} />
      {children}
    </Pressable>
  )
}

/**
 * The assistant's header, laid out like nikcli's session header: conversations on the left, the working
 * context in the middle (the project the turn runs in; the agent and model that run it), and the two
 * actions you reach for next on the right. Tapping the context chooses the project.
 */
export function AssistantHeader({ gutter, project, detail, hasProject, onChooseProject, onChooseAgent, onHistory, onNew }: {
  gutter: number
  /** The project name, or a prompt to choose one. */
  project: string
  /** Agent and model, the line under the project. */
  detail: string
  hasProject: boolean
  onChooseProject: () => void
  onChooseAgent: () => void
  onHistory: () => void
  onNew: () => void
}) {
  const { palette } = useTheme()
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 12 }}>
      <ChromeButton label="Conversations" hint="Opens the conversations of this project" disabled={!hasProject} onPress={onHistory}>
        <History size={18} color={palette.ink} strokeWidth={2.1} />
      </ChromeButton>

      <Pressable
        onPress={() => { haptic("selection"); onChooseProject() }}
        accessibilityRole="button"
        accessibilityLabel={hasProject ? `Project: ${project}. ${detail}` : "Choose a project"}
        accessibilityHint="Choose the project the assistant works in"
        style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: BUTTON, justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ flexShrink: 1, color: palette.ink, ...typeStyle(16, { weight: "600" }) }}>{project}</Text>
          <ChevronDown size={14} color={palette.muted} style={{ flexShrink: 0 }} />
        </View>
        {hasProject ? <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ marginTop: 4, color: palette.soft, ...typeStyle(14) }}>{detail}</Text> : null}
      </Pressable>

      <ChromeButton label="Choose agent" hint="Choose which CADCAMFUN agent answers" onPress={onChooseAgent}>
        <Bot size={18} color={palette.ink} strokeWidth={2.1} />
      </ChromeButton>
      <ChromeButton label="New conversation" hint="Starts a fresh conversation in this project" disabled={!hasProject} onPress={onNew}>
        <Plus size={19} color={palette.ink} strokeWidth={2.2} />
      </ChromeButton>
    </View>
  )
}
