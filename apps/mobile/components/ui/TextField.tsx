import { forwardRef, useState } from "react"
import { Text, TextInput, View, type TextInputProps } from "react-native"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"

type TextFieldProps = TextInputProps & {
  label?: string
}

/**
 * The app's single text field (nikcli-grade). Single-line fields are pills, multiline fields are
 * 20px rounded cards — both continuous curves on a raised surface with a hairline ink border
 * that strengthens on focus (border color only, so layout never shifts). The label is a quiet
 * caption above the field; Dynamic Type carries the min-height with it.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, placeholderTextColor, style, onFocus, onBlur, accessibilityLabel, multiline, editable, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false)
  const { colorScheme, palette } = useTheme()

  const borderIdle = hexToRgba(palette.ink, 0.1)
  const borderFocused = hexToRgba(palette.ink, 0.28)

  return (
    <View style={{ gap: 8 }}>
      {label ? (
        <Text selectable style={{ color: palette.muted, ...type(12, { weight: "500" }) }}>
          {label}
        </Text>
      ) : null}
      <View
        style={{
          borderRadius: multiline ? 20 : 999,
          borderCurve: "continuous",
          borderWidth: 1,
          borderColor: focused ? borderFocused : borderIdle,
          backgroundColor: palette.surface,
          opacity: editable === false ? 0.6 : 1,
        }}
      >
        <TextInput
          {...props}
          ref={ref}
          multiline={multiline}
          editable={editable}
          placeholderTextColor={placeholderTextColor ?? palette.muted}
          selectionColor={palette.accent}
          keyboardAppearance={colorScheme === "light" ? "light" : "dark"}
          onFocus={(event) => {
            setFocused(true)
            onFocus?.(event)
          }}
          onBlur={(event) => {
            setFocused(false)
            onBlur?.(event)
          }}
          accessibilityLabel={accessibilityLabel ?? label ?? props.placeholder}
          style={[
            {
              minHeight: multiline ? 120 : 44,
              paddingHorizontal: 16,
              paddingVertical: multiline ? 14 : 12,
              color: palette.ink,
              textAlignVertical: multiline ? "top" : "center",
              ...type(15, { leadingScale: multiline ? 1.05 : 1 }),
            },
            style,
          ]}
        />
      </View>
    </View>
  )
})
