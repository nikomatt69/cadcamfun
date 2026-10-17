import { ScrollView, type ScrollViewProps } from "react-native"
import { useTheme } from "@/lib/theme"
import { useContentLayout } from "./use-content-layout"

/** Scrollable content owns its padding; native navigation owns the system insets. */
export function PageScroll({ children, contentContainerStyle, style, onLayout, ...props }: ScrollViewProps) {
  const content = useContentLayout()
  const { palette } = useTheme()
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      style={[{ flex: 1, backgroundColor: palette.background }, style]}
      onLayout={(event) => { content.onLayout(event); onLayout?.(event) }}
      contentContainerStyle={[{ paddingHorizontal: content.gutter, paddingTop: 12, paddingBottom: 32, gap: 16 }, contentContainerStyle]}
      {...props}
    >
      {children}
    </ScrollView>
  )
}
