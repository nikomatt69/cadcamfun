import type { ReactNode } from "react"
import { View } from "react-native"
import { SafeAreaView } from "react-native-screens/experimental"
import { useRouter } from "expo-router"
import { ChevronLeft } from "lucide-react-native"
import { haptic } from "@/lib/haptics"
import { useTheme } from "@/lib/theme"
import { IconCircleButton } from "@/components/ui/IconCircleButton"
import { CenteredScreenHeader } from "@/components/layout/CenteredScreenHeader"
import { useContentLayout } from "@/components/layout/use-content-layout"

/**
 * A screen that draws its own header, laid out like the conversations list: the native bar is hidden (the layout
 * registers it as `headerShown: false`), a centred title sits between two 44pt slots and the safe area is
 * handled on every edge exactly as in the assistant. A screen with `backLabel` gets the round back control;
 * a tab root has none. The back control falls back to the settings root when the screen was opened by a link
 * and there is nothing to go back to.
 */
export function ScreenFrame({ title, subtitle, backLabel, right, children }: {
  title: string
  subtitle?: string
  /** Accessibility label of the back control ("Back to settings"); omit on a tab root. */
  backLabel?: string
  right?: ReactNode
  children: ReactNode
}) {
  const { palette } = useTheme()
  const router = useRouter()
  const { gutter } = useContentLayout()
  const back = () => {
    haptic("selection")
    if (router.canGoBack()) router.back()
    else router.replace("/(app)/settings" as never)
  }
  return (
    <SafeAreaView edges={{ top: true, bottom: true, left: true, right: true }} style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={{ paddingHorizontal: gutter, paddingTop: 8, paddingBottom: 4 }}>
        <CenteredScreenHeader
          title={title}
          subtitle={subtitle}
          left={backLabel ? (
            <IconCircleButton accessibilityLabel={backLabel} onPress={back}>
              <ChevronLeft size={21} color={palette.ink} strokeWidth={2.2} />
            </IconCircleButton>
          ) : undefined}
          right={right}
        />
      </View>
      {children}
    </SafeAreaView>
  )
}
