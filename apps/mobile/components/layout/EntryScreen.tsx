import type { ReactNode } from "react"
import { ScrollView, View } from "react-native"
import { SafeAreaView } from "react-native-screens/experimental"
import { useTheme } from "@/lib/theme"
import { layout } from "@/lib/layout"
import { useContentLayout } from "./use-content-layout"

/**
 * The frame of the entry screens (boot, pairing link, pairing): the page background, the safe area the
 * assistant screens use, one reading column on the shared gutter, and an optional dock under the scroll where the
 * screen's actions rest above the home indicator, exactly where the conversations dock sits.
 *
 * `centered` vertically centres short content (boot, link pairing); the pairing screen scrolls from the top.
 */
export function EntryScreen({ children, footer, centered = false }: { children: ReactNode; footer?: ReactNode; centered?: boolean }) {
  const { palette } = useTheme()
  const { gutter, onLayout } = useContentLayout()
  return (
    <SafeAreaView edges={{ top: true, bottom: true, left: true, right: true }} style={{ flex: 1, backgroundColor: palette.background }}>
      <ScrollView
        onLayout={onLayout}
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        alwaysBounceVertical={!centered}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: centered ? "center" : "flex-start",
          paddingHorizontal: gutter,
          paddingTop: centered ? 16 : 32,
          paddingBottom: 24,
        }}
      >
        <View style={{ width: "100%", maxWidth: layout.contentWidth, alignSelf: "center", gap: 20 }}>{children}</View>
      </ScrollView>
      {footer ? (
        <View style={{ paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 8 }}>
          <View style={{ width: "100%", maxWidth: layout.contentWidth, alignSelf: "center", gap: 10 }}>{footer}</View>
        </View>
      ) : null}
    </SafeAreaView>
  )
}
