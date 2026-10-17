import { Pressable, ScrollView, Text } from "react-native"
import { hexToRgba, useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"

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
          backgroundColor: hexToRgba(selected ? palette.accent : palette.ink, pressed ? 0.18 : selected ? 0.12 : 0.05),
        })}>
        <Text style={{ color: selected ? palette.accentStrong : palette.soft, fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
          {option.label}{count === undefined ? "" : ` ${count}`}
        </Text>
      </Pressable>
    })}
  </ScrollView>
}
