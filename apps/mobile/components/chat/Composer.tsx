import { useRef, useState } from "react"
import { Pressable, ScrollView, Text, TextInput, View } from "react-native"
import { ArrowUp, Square } from "lucide-react-native"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { usePressScale } from "@/lib/animation"
import Animated from "react-native-reanimated"

export type AssistantMode = "general" | "cad" | "cam" | "gcode" | "toolpath"

const MODES: ReadonlyArray<{ value: AssistantMode; label: string }> = [
  { value: "general", label: "General" },
  { value: "cad", label: "CAD" },
  { value: "cam", label: "CAM" },
  { value: "gcode", label: "G-code" },
  { value: "toolpath", label: "Toolpath" },
]

/**
 * The assistant input: mode chips (the CADCAMFUN assistant is mode-aware), the growing message
 * field and a send button that becomes Stop while a turn is running (state indication: the same
 * control flips function, so the eye never leaves the action). Send fires on the same frame as
 * the haptic.
 */
export function Composer({
  busy,
  disabled,
  disabledNote,
  mode,
  onModeChange,
  onSend,
  onStop,
}: {
  busy: boolean
  disabled: boolean
  disabledNote?: string
  mode: AssistantMode
  onModeChange: (mode: AssistantMode) => void
  onSend: (text: string) => void
  onStop: () => void
}) {
  const { palette } = useTheme()
  const [text, setText] = useState("")
  const inputRef = useRef<TextInput>(null)
  const sendScale = usePressScale()

  const canSend = text.trim().length > 0 && !busy && !disabled

  const send = () => {
    const value = text.trim()
    if (!value || busy || disabled) return
    haptic("light")
    setText("")
    onSend(value)
  }

  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 12,
        borderTopWidth: 0.5,
        borderTopColor: palette.border,
        backgroundColor: palette.background,
        gap: 8,
      }}
    >
      {/* Mode chips — peers, no slide; a chip press is a selection tick. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 4 }} keyboardShouldPersistTaps="handled">
        {MODES.map((item) => {
          const active = item.value === mode
          return (
            <Pressable
              key={item.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                haptic("selection")
                onModeChange(item.value)
              }}
              style={{
                paddingHorizontal: 11,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: active ? palette.accent : palette.panel,
              }}
            >
              <Text style={{ color: active ? palette.onAccent : palette.soft, fontSize: 12, lineHeight: 16, fontWeight: "600" }}>{item.label}</Text>
            </Pressable>
          )
        })}
      </ScrollView>

      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        <View
          style={{
            flex: 1,
            minHeight: 40,
            maxHeight: 120,
            borderRadius: 20,
            paddingHorizontal: 16,
            paddingVertical: 9,
            backgroundColor: palette.panel,
            justifyContent: "center",
          }}
        >
          {disabled ? (
            <Text style={{ color: palette.muted, fontSize: 15, lineHeight: 21 }}>
              {disabledNote ?? "Add a model key on the desktop to chat"}
            </Text>
          ) : (
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder="Ask about this project…"
              placeholderTextColor={palette.muted}
              multiline
              editable={!busy}
              style={{ color: palette.ink, fontSize: 16, lineHeight: 21, maxHeight: 100, padding: 0 }}
              onSubmitEditing={send}
              blurOnSubmit={false}
            />
          )}
        </View>

        <Pressable
          onPressIn={sendScale.onPressIn}
          onPressOut={sendScale.onPressOut}
          onPress={busy ? onStop : send}
          accessibilityRole="button"
          accessibilityLabel={busy ? "Stop the assistant" : "Send message"}
          accessibilityState={{ disabled: !busy && !canSend, busy }}
          disabled={!busy && !canSend}
          hitSlop={6}
        >
          <Animated.View
            style={[
              {
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: busy ? palette.danger : palette.accent,
                opacity: !busy && !canSend ? 0.4 : 1,
              },
              sendScale.style,
            ]}
          >
            {busy ? <Square size={14} color={palette.onAccent} fill={palette.onAccent} /> : <ArrowUp size={20} color={palette.onAccent} strokeWidth={2.5} />}
          </Animated.View>
        </Pressable>
      </View>
    </View>
  )
}
