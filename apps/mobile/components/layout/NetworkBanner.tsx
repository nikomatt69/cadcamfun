import { useEffect } from "react"
import { AccessibilityInfo, View } from "react-native"
import { useRouter } from "expo-router"
import { useServer } from "@/lib/server"
import { useTheme } from "@/lib/theme"
import { useUIStore } from "@/lib/store"
import { connectionBanner } from "@/lib/connection-banner"
import { StatusPill } from "./StatusPill"

/**
 * Connection state lives in the native tab accessory on iOS 26+, clear of titles and controls; older platforms
 * reserve a footer row. It is the assistant's status pill (dot or spinner, one line, one action), so the
 * connection reads the same here, in the session line and in Settings. The words come from `connectionBanner`.
 */
export function NetworkBanner({ accessory = false }: { accessory?: boolean }) {
  const { connectivity, connectionError, recheck, config } = useServer()
  const { palette } = useTheme()
  const router = useRouter()
  const waiting = useUIStore((state) => state.offlineQueueCount)
  const banner = connectionBanner({ connectivity, connectionError, waiting, cloud: config?.mode === "cloud" })

  // VoiceOver ignores a view that merely appears or changes; say each state once, never the changing counter.
  const key = banner?.key
  const announcement = banner?.announcement
  useEffect(() => { if (announcement) AccessibilityInfo.announceForAccessibility(announcement) }, [key, announcement])

  if (!banner) return null
  const action = banner.action ? {
    label: banner.action.label,
    hint: banner.action.hint,
    onPress: banner.action.kind === "settings" ? () => router.navigate("/settings") : () => void recheck(),
  } : null

  return (
    <View style={{ minHeight: 44, flex: accessory ? 1 : undefined, justifyContent: "center", paddingHorizontal: accessory ? 12 : 16, paddingVertical: accessory ? 0 : 6, backgroundColor: accessory ? "transparent" : palette.background }}>
      <StatusPill tone={banner.tone} label={banner.label} busy={banner.busy} action={action} bare={accessory} fill maxLines={accessory ? 1 : 2} />
    </View>
  )
}
