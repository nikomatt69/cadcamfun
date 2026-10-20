import { Pressable, ScrollView, Text } from "react-native"
import { hexToRgba, useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { type } from "@/lib/typography"

/**
 * Single-choice filter chips in a horizontal scroller. Each chip may show a count; chips stay 44 pt
 * tall for touch and scroll instead of wrapping at large text sizes.
 */
export function FilterChips<T extends string>({ options, value, onChange, counts, accessibilityLabel }: {
  options: readonly { readonly id: T; readonly label: string }[]
  value: T
  onChange: (value: T) => void
  counts?: Partial<Record<T, number>>
  accessibilityLabel?: string
}) {
  const { palette } = useTheme()
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" accessibilityLabel={accessibilityLabel}
    contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
    {options.map((option) => {
      const selected = option.id === value
      const count = counts?.[option.id]
      return <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected }}
        accessibilityLabel={count === undefined ? option.label : `${option.label}, ${count}`}
        onPress={() => { if (!selected) { haptic("selection"); onChange(option.id) } }}
        style={({ pressed }) => ({
          minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: 22, borderCurve: "continuous", borderWidth: 0.5,
          borderColor: selected ? palette.accent : palette.border,
          // Fill steps are chosen so the label keeps >= 4.5:1 in every state, on background, surface
          // and panel in both themes (the 0.18 step with an 0.8 opacity dim fell to ~4:1). Pressed adds
          // one small step and never touches opacity, which would also fade the text.
          backgroundColor: hexToRgba(selected ? palette.accent : palette.ink, selected ? (pressed ? 0.16 : 0.12) : (pressed ? 0.1 : 0.05)),
        })}>
        <Text style={{ color: selected ? palette.accentStrong : palette.soft, fontVariant: ["tabular-nums"], ...type(13, { weight: "600" }) }}>
          {option.label}{count === undefined ? "" : ` ${count}`}
        </Text>
      </Pressable>
    })}
  </ScrollView>
}
