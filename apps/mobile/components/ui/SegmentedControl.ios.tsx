import { requireOptionalNativeModule } from "expo"
import { View } from "react-native"
import { useContentLayout } from "@/components/layout/use-content-layout"
import { layout } from "@/lib/layout"
import { useTheme } from "@/lib/theme"
import { SegmentedControlFallback, type SegmentedControlProps } from "./segmented-control-fallback"

// Modifiers resolve ExpoUI at import time. Keep them behind the module check so an older
// development build can render the React Native control until its next native rebuild.
const nativeUI = requireOptionalNativeModule("ExpoUI") ? {
  views: require("@expo/ui/swift-ui") as typeof import("@expo/ui/swift-ui"),
  modifiers: require("@expo/ui/swift-ui/modifiers") as typeof import("@expo/ui/swift-ui/modifiers"),
} : null

/** SwiftUI owns the standard iOS control; large text keeps the fully wrapping choice layout. */
export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>) {
  const { segments, value, onChange, accessibilityLabel = "Options" } = props
  const content = useContentLayout()
  const { colorScheme } = useTheme()
  const labelWidth = Math.max(0, ...segments.map((segment) => segment.label.length)) * 6.5 * content.fontScale + 20
  const fits = content.fontScale <= 1.3 && segments.length <= 4 && content.width / Math.max(1, segments.length) >= labelWidth

  if (!segments.length) return null
  if (!nativeUI || !fits) return <View onLayout={content.onLayout}><SegmentedControlFallback {...props} /></View>

  const { Host, Picker, Text } = nativeUI.views
  const { accessibilityLabel: label, frame, pickerStyle, tag } = nativeUI.modifiers

  return <View onLayout={content.onLayout} style={{ minHeight: layout.touchTarget }}>
    <Host matchContents={{ vertical: true }} ignoreSafeArea="all" colorScheme={colorScheme} style={{ width: "100%", minHeight: layout.touchTarget }}>
      <Picker selection={value} onSelectionChange={(selection: T) => {
        if (selection !== value && segments.some((segment) => segment.value === selection)) onChange(selection)
      }} modifiers={[pickerStyle("segmented"), frame({ minHeight: layout.touchTarget }), label(accessibilityLabel)]}>
        {segments.map((segment) => <Text key={segment.value} modifiers={[tag(segment.value)]}>{segment.label}</Text>)}
      </Picker>
    </Host>
  </View>
}

export type { SegmentedControlProps } from "./segmented-control-fallback"
