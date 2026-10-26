import type { ReactNode } from "react"
import { View, type LayoutChangeEvent } from "react-native"
import { SafeAreaView } from "react-native-screens/experimental"
import { useRouter } from "expo-router"
import { ChevronLeft, X } from "lucide-react-native"
import { haptic } from "@/lib/haptics"
import { useTheme } from "@/lib/theme"
import { IconCircleButton } from "@/components/ui/IconCircleButton"
import { CenteredScreenHeader } from "@/components/layout/CenteredScreenHeader"
import { useContentLayout } from "@/components/layout/use-content-layout"

/**
 * The frame of every pushed screen in the Projects stack (the shape of the conversations screen): the native
 * bar is hidden by the stack, so the safe area is explicit, and the header is drawn in the content — a back
 * control on the left, the screen's name in the middle, at most one action on the right.
 *
 * `sheet` is for a route presented as a form sheet: there is nothing to go back to, so the left slot stays
 * empty and a dismiss control takes the right one; the grabber gets a little more room above the header.
 */
export function ScreenFrame({ title, subtitle, right, sheet = false, backLabel = "Back", dismissLabel = "Done", onLayout, children }: {
  title: string
  subtitle?: string
  /** The one action of the screen, as a 44pt `IconCircleButton`. */
  right?: ReactNode
  sheet?: boolean
  backLabel?: string
  dismissLabel?: string
  onLayout?: (event: LayoutChangeEvent) => void
  children: ReactNode
}) {
  const { palette } = useTheme()
  const router = useRouter()
  const { gutter, onLayout: measure } = useContentLayout()
  const close = () => {
    haptic("selection")
    if (router.canGoBack()) router.back()
    else router.replace("/projects")
  }
  return (
    <SafeAreaView
      edges={{ top: true, bottom: true, left: true, right: true }}
      onLayout={(event) => { measure(event); onLayout?.(event) }}
      style={{ flex: 1, backgroundColor: palette.background }}
    >
      <View style={{ paddingHorizontal: gutter, paddingTop: sheet ? 16 : 8, paddingBottom: 4 }}>
        <CenteredScreenHeader
          title={title}
          {...(subtitle ? { subtitle } : {})}
          left={sheet ? undefined : (
            <IconCircleButton accessibilityLabel={backLabel} onPress={close}>
              <ChevronLeft size={21} color={palette.ink} strokeWidth={2.2} />
            </IconCircleButton>
          )}
          right={sheet ? (
            <IconCircleButton accessibilityLabel={dismissLabel} accessibilityHint="Closes this screen" onPress={close}>
              <X size={19} color={palette.ink} strokeWidth={2.2} />
            </IconCircleButton>
          ) : right}
        />
      </View>
      {children}
    </SafeAreaView>
  )
}
