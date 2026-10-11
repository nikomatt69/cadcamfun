import { View } from "react-native"
import { NativeTabs } from "expo-router/unstable-native-tabs"
import { NetworkBanner } from "@/components/layout/NetworkBanner"
import { useTheme } from "@/lib/theme"

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

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <NetworkBanner />
      <NativeTabs
        tintColor={palette.accent}
        iconColor={{ default: palette.muted, selected: palette.accent }}
      >
        <NativeTabs.Trigger name="projects">
          <NativeTabs.Trigger.Icon sf={{ default: "square.stack.3d.up", selected: "square.stack.3d.up.fill" }} md="folder" />
          <NativeTabs.Trigger.Label>Projects</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="assistant">
          <NativeTabs.Trigger.Icon sf={{ default: "sparkles", selected: "sparkles" }} md="auto_awesome" />
          <NativeTabs.Trigger.Label>Assistant</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="activity">
          <NativeTabs.Trigger.Icon sf={{ default: "bell", selected: "bell.fill" }} md="notifications" />
          <NativeTabs.Trigger.Label>Activity</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings">
          <NativeTabs.Trigger.Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} md="settings" />
          <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </View>
  )
}
