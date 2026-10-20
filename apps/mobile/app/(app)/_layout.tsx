import { Platform, View } from "react-native"
import { NativeTabs } from "expo-router/unstable-native-tabs"
import { SafeAreaView } from "react-native-safe-area-context"
import { NetworkBanner } from "@/components/layout/NetworkBanner"
import { useTheme } from "@/lib/theme"
import { useServer } from "@/lib/server"
import { useUIStore } from "@/lib/store"
import { usePoll } from "@/lib/use-poll"

/**
 * The signed-in shell: four native tabs (the platform's real tab bar — its materials, transitions
 * and behaviors included; a JS tab bar would be a downgrade). Tab switches never animate between
 * screens: tabs are peers, not a hierarchy. SF Symbols adapt their weight when selected.
 *
 * - Projects — the CAD/CAM workspaces, their history, pull requests and workflows
 * - Assistant — the AI companion, one conversation per project, shared with the desktop
 * - Activity — the notification feed, shared with the desktop
 * - Settings — pairing, appearance, haptics, security
 */
export default function AppLayout() {
  const { palette } = useTheme()
  const { client, connectivity } = useServer()
  const showConnection = !["online", "disconnected", "background"].includes(connectivity)
  const unread = useUIStore((state) => state.unreadCount)
  const setUnreadCount = useUIStore((state) => state.setUnreadCount)
  const nativeAccessory = Platform.OS === "ios" && Number.parseInt(String(Platform.Version), 10) >= 26

  // The badge tells the user there is something to read without opening the app: one cheap read of the
  // count, not the whole feed.
  usePoll(() => {
    if (!client) return
    void client.notifications({ limit: 1 }).then((feed) => setUnreadCount(feed.unreadCount)).catch(() => undefined)
  }, 30_000, connectivity === "online")

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <NativeTabs
        tintColor={palette.accent}
        iconColor={{ default: palette.muted, selected: palette.accent }}
        backgroundColor={palette.background}
      >
        <NativeTabs.Trigger name="projects" disableAutomaticContentInsets={Platform.OS === "ios"}>
          <NativeTabs.Trigger.Icon sf={{ default: "square.stack.3d.up", selected: "square.stack.3d.up.fill" }} md="folder" />
          <NativeTabs.Trigger.Label>Projects</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="assistant" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Icon sf={{ default: "sparkles", selected: "sparkles" }} md="auto_awesome" />
          <NativeTabs.Trigger.Label>Assistant</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="activity">
          <NativeTabs.Trigger.Icon sf={{ default: "bell", selected: "bell.fill" }} md="notifications" />
          <NativeTabs.Trigger.Label>Activity</NativeTabs.Trigger.Label>
          {unread > 0 ? <NativeTabs.Trigger.Badge>{String(unread)}</NativeTabs.Trigger.Badge> : null}
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings">
          <NativeTabs.Trigger.Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} md="settings" />
          <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        {showConnection && nativeAccessory ? <NativeTabs.BottomAccessory><NetworkBanner accessory /></NativeTabs.BottomAccessory> : null}
      </NativeTabs>
      {showConnection && !nativeAccessory ? <SafeAreaView edges={["bottom", "left", "right"]} style={{ backgroundColor: palette.surface }}><NetworkBanner /></SafeAreaView> : null}
    </View>
  )
}
