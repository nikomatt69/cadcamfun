import { Text, View } from "react-native"
import { hexToRgba, useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"
import type { Connectivity } from "@/lib/server-context"

/**
 * Connectivity pill (nikcli: ConnectionStatus, CADCAMFUN connectivity).
 * One place decides label + tone so projects/assistant/settings agree.
 */
export function ConnectionStatus({ connectivity, label }: { connectivity: Connectivity; label?: string }) {
  const { palette } = useTheme()
  const online = connectivity === "online"
  const busy = connectivity === "connecting"
  const background = connectivity === "background"
  const color = online ? palette.success : busy || background ? palette.warning : palette.danger
  const text = label ?? (online ? "Online" : busy ? "Connecting" : background ? "Background" : connectivity === "offline" ? "Offline" : connectivity === "auth-required" ? "Sign in required" : connectivity === "error" ? "Error" : "Not paired")

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderRadius: 999,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: hexToRgba(color, 0.28),
        backgroundColor: hexToRgba(color, 0.12),
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: color }} />
      <Text selectable style={{ color, fontWeight: "600", ...type(12) }}>
        {text}
      </Text>
    </View>
  )
}
