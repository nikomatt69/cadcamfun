import { ActivityIndicator, Pressable, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated"
import { WifiOff } from "lucide-react-native"
import { useServer, type Connectivity } from "@/lib/server"
import { useTheme } from "@/lib/theme"

/**
 * The connection strip under the tab bar: amber while connecting, grey offline, red on error.
 * It appears above content (it must never push content — layout stability), and tapping an error
 * retries the health check. When the phone is online the banner is nothing at all.
 */
export function NetworkBanner() {
  const { connectivity, connectionError, recheck } = useServer()
  const { palette } = useTheme()
  const insets = useSafeAreaInsets()

  if (connectivity === "online" || connectivity === "disconnected") return null

  const config: Record<Exclude<Connectivity, "online" | "disconnected">, { color: string; label: string }> = {
    connecting: { color: palette.warning, label: "Connecting…" },
    offline: { color: palette.muted, label: "Desktop offline" },
    error: { color: palette.danger, label: connectionError ?? "Connection failed" },
  }
  const { color, label } = config[connectivity]

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOutUp.duration(150)}
      style={{
        position: "absolute",
        top: insets.top + 4,
        left: 12,
        right: 12,
        zIndex: 500,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: palette.surface,
        borderWidth: 0.5,
        borderColor: color,
      }}
    >
      {connectivity === "connecting" ? <ActivityIndicator size="small" color={color} /> : <WifiOff size={15} color={color} />}
      <Text style={{ flex: 1, color: palette.ink, fontSize: 13, lineHeight: 18, fontWeight: "500" }} numberOfLines={1}>
        {label}
      </Text>
      {connectivity !== "connecting" ? (
        <Pressable onPress={() => void recheck()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Retry the desktop connection">
          <Text style={{ color, fontSize: 13, fontWeight: "600" }}>Retry</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  )
}
