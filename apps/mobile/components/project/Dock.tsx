import { useState, type ReactNode } from "react"
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import Animated from "react-native-reanimated"
import { Search, X } from "lucide-react-native"
import { AdaptiveBlur } from "@/components/GlassView"
import { usePressScale } from "@/lib/animation"
import { haptic } from "@/lib/haptics"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type as typeStyle } from "@/lib/typography"

/**
 * The foot of a list screen when its primary action is not "create something" (that is `SearchDock`, with its
 * plus): the same glass search field and accent action, with the action's own glyph and the search optional.
 * It sits in the page's flow under the list, so it never hides a row or collides with the tab bar.
 */
export function Dock({ gutter, search, action }: {
  gutter: number
  search?: { value: string; onChange: (value: string) => void; placeholder: string }
  action?: { label: string; icon: ReactNode; onPress: () => void; loading?: boolean; disabled?: boolean }
}) {
  const { palette, isDark } = useTheme()
  const press = usePressScale()
  const [focused, setFocused] = useState(false)
  if (!search && !action) return null
  const inactive = Boolean(action?.loading || action?.disabled)
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 8 }}>
      {search ? (
        <View
          style={{
            flex: 1, minWidth: 0, overflow: "hidden", borderRadius: 26, borderCurve: "continuous", borderWidth: 1,
            borderColor: hexToRgba(palette.ink, focused ? 0.22 : isDark ? 0.14 : 0.1),
            boxShadow: `0 4px 14px ${hexToRgba(palette.overlay, isDark ? 0.32 : 0.1)}`,
          }}
        >
          <AdaptiveBlur tint={isDark ? "dark" : "light"} intensity={isDark ? 80 : 70} style={StyleSheet.absoluteFill} fallbackColor={hexToRgba(palette.surface, 0.92)} opaqueFallbackColor={palette.surface} pointerEvents="none" />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 16, paddingRight: 6, minHeight: 52 }}>
            <Search size={18} color={palette.muted} strokeWidth={2} />
            <TextInput
              value={search.value}
              onChangeText={search.onChange}
              placeholder={search.placeholder}
              placeholderTextColor={palette.muted}
              selectionColor={palette.accent}
              keyboardAppearance={isDark ? "dark" : "light"}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel={search.placeholder}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={{ flex: 1, minWidth: 0, color: palette.ink, paddingVertical: 14, ...typeStyle(16) }}
            />
            {search.value.length > 0 ? (
              <Pressable onPress={() => { haptic("selection"); search.onChange("") }} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={6} style={({ pressed }) => ({ width: 40, height: 40, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.5 : 1 })}>
                <X size={16} color={palette.muted} strokeWidth={2.4} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {action ? (
        <Pressable
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          onPress={() => { haptic("selection"); action.onPress() }}
          disabled={inactive}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityState={{ disabled: inactive, busy: Boolean(action.loading) }}
          hitSlop={4}
          style={{ flexShrink: 0, flexGrow: search ? 0 : 1 }}
        >
          <Animated.View
            style={[
              {
                minHeight: 52, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                borderRadius: 26, borderCurve: "continuous", backgroundColor: palette.accent,
                opacity: action.loading ? 0.82 : action.disabled ? 0.45 : 1,
                boxShadow: `0 6px 16px ${hexToRgba(palette.overlay, isDark ? 0.4 : 0.18)}`,
              },
              press.style,
            ]}
          >
            {action.loading ? <ActivityIndicator size="small" color={palette.onAccent} /> : action.icon}
            <Text style={{ color: palette.onAccent, ...typeStyle(16, { weight: "600" }) }}>{action.label}</Text>
          </Animated.View>
        </Pressable>
      ) : null}
    </View>
  )
}

/**
 * A fixed action bar for a screen that is read top to bottom (a commit, a pull request, a model): the action stays
 * in reach while the content scrolls under it. Glass behind, one hairline on top.
 */
export function ActionDock({ gutter, children }: { gutter: number; children: ReactNode }) {
  const { palette, isDark, glass } = useTheme()
  return (
    <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, overflow: "hidden" }}>
      <AdaptiveBlur tint={isDark ? "dark" : "light"} intensity={isDark ? 80 : 70} style={StyleSheet.absoluteFill} fallbackColor={glass.shellStrong} opaqueFallbackColor={palette.surface} pointerEvents="none" />
      <View style={{ paddingHorizontal: gutter, paddingTop: 10, paddingBottom: 10, gap: 8 }}>{children}</View>
    </View>
  )
}
