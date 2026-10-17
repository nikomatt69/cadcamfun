import { ActivityIndicator, Pressable, Text, View } from "react-native"
import { WifiOff } from "lucide-react-native"
import { useServer, type Connectivity } from "@/lib/server"
import { useTheme } from "@/lib/theme"
import { useUIStore } from "@/lib/store"

/**
 * Connection state lives in the native tab accessory on iOS 26+, clear of titles and controls.
 * Older platforms reserve a footer row. No navigation target is covered by the status.
 */
export function NetworkBanner({ accessory = false }: { accessory?: boolean }) {
  const { connectivity, connectionError, recheck } = useServer()
  const { palette } = useTheme()
  const waiting = useUIStore((state) => state.offlineQueueCount)

  if (connectivity === "online" || connectivity === "disconnected") return null

  const config: Record<Exclude<Connectivity, "online" | "disconnected" | "background">, { color: string; label: string }> = {
    connecting: { color: palette.warning, label: "Connecting…" },
    // Messages written meanwhile wait in the outbox; saying so here keeps them from looking lost.
    offline: { color: palette.muted, label: waiting > 0 ? `Desktop offline · ${waiting} ${waiting === 1 ? "message" : "messages"} waiting` : "Desktop offline" },
    error: { color: palette.danger, label: connectionError ?? "Connection failed" },
    "auth-required": { color: palette.danger, label: "Desktop revoked this phone — pair again" },
  }
  if (connectivity === "background") return null
  const { color, label } = config[connectivity]

  return (
    <View
      style={{
        minHeight: 44,
        flex: accessory ? 1 : undefined,
        paddingHorizontal: 16,
        paddingVertical: accessory ? 0 : 6,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: accessory ? "transparent" : palette.surface,
      }}
    >
      {connectivity === "connecting" ? <ActivityIndicator size="small" color={color} /> : <WifiOff size={15} color={color} />}
      <Text accessibilityLiveRegion="polite" style={{ flex: 1, minWidth: 0, color: palette.ink, fontSize: 13, lineHeight: 18, fontWeight: "500" }} numberOfLines={accessory ? 1 : undefined}>
        {label}
      </Text>
      {connectivity !== "connecting" ? (
        <Pressable style={({ pressed }) => ({ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, opacity: pressed ? 0.55 : 1 })} onPress={() => void recheck()} accessibilityRole="button" accessibilityLabel="Retry the desktop connection">
          <Text style={{ color, fontSize: 13, fontWeight: "600" }}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
