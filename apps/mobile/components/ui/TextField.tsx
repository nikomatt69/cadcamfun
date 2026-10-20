import { layout } from "@/lib/layout"
import { forwardRef, useState } from "react"
import { Text, TextInput, View, type TextInputProps } from "react-native"
import { useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"

type TextFieldProps = TextInputProps & {
  label?: string
  /** Validation message under the field; turns the border danger-red and is announced as an alert. */
  error?: string
  /** Quiet helper text under the field (hidden while an error is shown). */
  hint?: string
}

/**
 * The app's single text field (nikcli-grade). Fields use continuous corners and
 * multiline editors grow with their content — both continuous curves on a raised surface with a hairline ink border
 * that turns accent on focus and danger on error (border color only, so layout never shifts). The label is a quiet
 * caption above the field; Dynamic Type carries the min-height with it.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, placeholderTextColor, style, onFocus, onBlur, accessibilityLabel, accessibilityHint, multiline, editable, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false)
  const { colorScheme, palette } = useTheme()

  const borderColor = error ? palette.danger : focused ? palette.accent : palette.border

  return (
    <View style={{ gap: 8 }}>
      {label ? (
        <Text selectable style={{ color: palette.soft, ...type(13, { weight: "500" }) }}>
          {label}
        </Text>
      ) : null}
      <View
        style={{
          borderRadius: layout.controlRadius,
          borderCurve: "continuous",
          borderWidth: 1,
          borderColor,
          backgroundColor: palette.surface,
          opacity: editable === false ? 0.6 : 1,
        }}
      >
        <TextInput
          clearButtonMode={multiline || props.secureTextEntry ? "never" : "while-editing"}
          {...props}
          ref={ref}
          multiline={multiline}
          editable={editable}
          placeholderTextColor={placeholderTextColor ?? palette.muted}
          selectionColor={palette.accent}
          cursorColor={palette.accent}
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
          accessibilityHint={error ?? accessibilityHint}
          style={[
            {
              minHeight: multiline ? 120 : 52,
              paddingHorizontal: 16,
              paddingVertical: multiline ? 14 : 12,
              color: palette.ink,
              textAlignVertical: multiline ? "top" : "center",
              ...type(16, { leadingScale: multiline ? 1.05 : 1 }),
            },
            style,
          ]}
        />
      </View>
      {error ? <Text accessibilityRole="alert" style={{ color: palette.danger, ...type(13) }}>{error}</Text> : hint ? <Text style={{ color: palette.muted, ...type(13) }}>{hint}</Text> : null}
    </View>
  )
})
