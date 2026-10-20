import { useState, type ReactNode } from "react"
import { Alert, Platform, Switch, Text, View } from "react-native"
import Constants from "expo-constants"
import * as Clipboard from "expo-clipboard"
import { useRouter } from "expo-router"
import { Check, ClipboardCopy, EyeOff, Fingerprint, MonitorSmartphone, Palette, Sparkles, Unplug, Vibrate, Lock, Layers3 } from "lucide-react-native"
import { useServer } from "@/lib/server"
import { useTheme } from "@/lib/theme"
import { useUIStore } from "@/lib/store"
import { haptic } from "@/lib/haptics"
import { authenticate, biometricLabel, getBiometricCapability } from "@/lib/biometrics"
import { toast } from "@/components/ui/ToastHost"
import { SegmentedControl } from "@/components/ui/SegmentedControl"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { ListRow } from "@/components/ui/ListRow"
import { AccountCard } from "@/components/layout/AccountCard"
import { ConnectionStatus } from "@/components/layout/ConnectionStatus"
import { usePrefersReducedMotion } from "@/lib/animation"
import { PageScroll } from "@/components/layout/page-scroll"
import { IconTile } from "@/components/ui/icon-tile"
import { BrandMark } from "@/components/layout/BrandMark"
import { Divider } from "@/components/ui/SectionHeader"
import { LOCK_AFTER_OPTIONS, lockAfterLabel } from "@/lib/app-lock"
import { buildDiagnostics, formatFingerprint, originOnly } from "@/lib/diagnostics"
import { mono, type } from "@/lib/typography"
import { PERMISSION_MODES } from "@/lib/assistant-preferences"
import { clearOfflineQueue } from "@/lib/offline-queue"

const APP_VERSION = Constants.expoConfig?.version ?? "6.0.0"
const BUILD_NUMBER = Constants.expoConfig?.ios?.buildNumber

/**
 * Settings — grouped lists, toggles and one destructive action (Unpair) behind a confirmation.
 * Face ID is opt-in and checked live: if the device cannot authenticate, the toggle asks for the
 * reason instead of pretending it works.
 */
export default function SettingsScreen() {
  const { config, connectivity, connectionError, ai, clear, recheck } = useServer()
  const { palette, colorScheme } = useTheme()
  const { themeMode, haptics, security, setThemeMode, setHaptics, setSecurity } = useUIStore()
  const offlineQueueCount = useUIStore((state) => state.offlineQueueCount)
  const assistantDefaults = useUIStore((state) => state.assistantDefaults)
  const setAssistantDefaults = useUIStore((state) => state.setAssistantDefaults)
  const router = useRouter()
  const reduced = usePrefersReducedMotion()
  const [biometricsBusy, setBiometricsBusy] = useState(false)

  const toggleBiometrics = async (value: boolean) => {
    setBiometricsBusy(true)
    try {
      const capability = await getBiometricCapability()
      if (!capability.available) {
        toast("This iPhone has no Face ID / Touch ID", "info")
        return
      }
      if (!capability.enrolled) {
        toast("No Face ID or passcode is set up in iOS Settings", "info")
        return
      }
      const ok = await authenticate(`Unlock CADCAMFUN with ${biometricLabel(capability.types)}`)
      if (ok) {
        haptic("success")
        setSecurity({ biometricsEnabled: value, lockOnBackground: value ? true : security.lockOnBackground })
      }
    } catch {
      toast("Face ID is unavailable", "error")
    } finally {
      setBiometricsBusy(false)
    }
  }

  const copy = async (text: string, done: string) => {
    try {
      await Clipboard.setStringAsync(text)
      haptic("success")
      toast(done, "success")
    } catch {
      toast("Could not copy", "error")
    }
  }

  const diagnostics = () => buildDiagnostics({
    appVersion: APP_VERSION, buildNumber: BUILD_NUMBER, platform: Platform.OS, osVersion: String(Platform.Version),
    desktop: config ? { name: config.name, baseUrl: config.baseUrl, hosts: config.hosts, fingerprint: config.fingerprint } : undefined,
    connectivity, connectionError, ai: ai ? { configured: ai.configured, host: ai.host, tools: ai.tools?.length } : null,
    offlineQueueCount, security, now: new Date(),
  })

  const clearQueue = () => {
    Alert.alert(
      offlineQueueCount === 1 ? "Discard the queued message?" : `Discard ${offlineQueueCount} queued messages?`,
      "They were written while the desktop was offline and have not been sent. This cannot be undone.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            void clearOfflineQueue().then(() => {
              haptic("success")
              toast("Queued messages discarded", "success")
            }).catch((error: unknown) => toast(error instanceof Error ? error.message : "Could not clear the queue", "error"))
          },
        },
      ],
    )
  }

  const unpair = () => {
    Alert.alert("Unpair this phone", "The scoped pairing token is deleted from the Keychain. Re-pair from the QR code on your Mac.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unpair",
        style: "destructive",
        onPress: () => {
          void clear().then(() => {
            haptic("error")
            router.replace("/connect")
          }).catch((error: unknown) => toast(error instanceof Error ? error.message : "Could not remove the saved pairing", "error"))
        },
      },
    ])
  }

  return <PageScroll>
    <SurfaceCard eyebrow="CONNECTED WORKSPACE" title={config?.name ?? "Your desktop"} description="Manage your connection and make the companion your own.">
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <ConnectionStatus connectivity={connectivity} />
        {offlineQueueCount > 0 ? <Text style={{ color: palette.muted, ...type(13) }}>{offlineQueueCount} queued</Text> : null}
      </View>
    </SurfaceCard>

    <AccountCard />

    <SettingsGroup title="Library">
      <ListRow leading={<IconTile size={36}><Layers3 size={18} color={palette.accent} /></IconTile>} title="Materials, tools & machines"
        subtitle="Create, duplicate and delete your resources" onPress={() => router.push("/settings/resources")} />
    </SettingsGroup>

    <SettingsGroup title="Desktop">
      <ListRow leading={<IconTile size={36}><MonitorSmartphone size={18} color={palette.accent} /></IconTile>}
        title={config?.name ?? "Not paired"} subtitle={config?.baseUrl} onPress={() => void recheck()}
        trailing={<Text style={{ color: palette.accent, ...type(13, { weight: "600" }) }}>Reconnect</Text>} />
      {offlineQueueCount > 0 ? <><Divider inset={16} /><ListRow title="Queued messages" subtitle={`${offlineQueueCount === 1 ? "1 message sends" : `${offlineQueueCount} messages send`} when the desktop reconnects`} showChevron={false}
        accessibilityHint="Discards the messages waiting for the desktop" onPress={clearQueue}
        trailing={<Text style={{ color: palette.danger, ...type(13, { weight: "600" }) }}>Discard</Text>} /></> : null}
      {config ? <><Divider inset={16} />
        <ListRow leading={<IconTile size={36}><Fingerprint size={18} color={palette.accent} /></IconTile>} title="Certificate fingerprint"
          subtitle="Matches the fingerprint under the QR code on your Mac. Tap to copy." onPress={() => void copy(config.fingerprint, "Fingerprint copied")}
/>
        <Text selectable accessibilityLabel={`Fingerprint ${config.fingerprint.split("").join(" ")}`} style={{ color: palette.soft, paddingHorizontal: 16, paddingBottom: 14, ...mono(12), ...(Platform.OS === "ios" ? null : { fontFamily: "monospace" }) }}>{formatFingerprint(config.fingerprint)}</Text>
        {(config.hosts?.length ?? 0) > 1 ? <><Divider inset={16} /><ListRow title="Desktop addresses" subtitle={(config.hosts ?? []).map(originOnly).join("\n")} showChevron={false} /></> : null}
      </> : null}
      <Divider inset={16} />
      <ListRow title="Unpair this phone" subtitle="Remove this desktop connection" leading={<IconTile color={palette.danger} size={36}><Unplug size={18} color={palette.danger} /></IconTile>} onPress={unpair} />
    </SettingsGroup>

    <SettingsGroup title="Appearance" description="System follows the appearance selected in iOS Settings.">
      <View style={{ padding: 16, gap: 14 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 10, rowGap: 6 }}>
          <Palette size={19} color={palette.accent} />
          <Text style={{ flexGrow: 1, color: palette.ink, ...type(16, { weight: "600" }) }}>Theme</Text>
          <Text style={{ color: palette.muted, ...type(13) }}>{colorScheme === "dark" ? "Dark" : "Light"}</Text>
        </View>
        <SegmentedControl segments={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} value={themeMode} onChange={setThemeMode} />
      </View>
    </SettingsGroup>

    <SettingsGroup title="Touch & feedback">
      <ListRow title="Haptic feedback" subtitle="Subtle feedback for meaningful actions" leading={<IconTile size={36}><Vibrate size={18} color={palette.accent} /></IconTile>}
        trailing={<Switch accessibilityLabel="Haptic feedback" value={haptics.enabled} trackColor={{ true: palette.accent }} onValueChange={(enabled) => setHaptics({ enabled })} />} />
      <Divider inset={16} />
      <ListRow title="Selection feedback" subtitle="Project pickers and segmented controls" trailing={<Switch accessibilityLabel="Selection feedback" disabled={!haptics.enabled} value={haptics.selection} trackColor={{ true: palette.accent }} onValueChange={(selection) => setHaptics({ selection })} />} />
      <Divider inset={16} />
      <ListRow title="Results & alerts" subtitle="Successes, errors and completed operations" trailing={<Switch accessibilityLabel="Results and alerts feedback" disabled={!haptics.enabled} value={haptics.success && haptics.errors} trackColor={{ true: palette.accent }} onValueChange={(value) => setHaptics({ success: value, errors: value })} />} />
    </SettingsGroup>

    <SettingsGroup title="Privacy & security" description="Your projects stay on your desktop. This phone uses a scoped, revocable connection.">
      <ListRow title="Biometric lock" subtitle="Unlock with Face ID or Touch ID" leading={<IconTile size={36}><Lock size={18} color={palette.accent} /></IconTile>}
        trailing={<Switch accessibilityLabel="Biometric lock" value={security.biometricsEnabled} disabled={biometricsBusy} trackColor={{ true: palette.accent }} onValueChange={(value) => void toggleBiometrics(value)} />} />
      {security.biometricsEnabled ? <><Divider inset={16} /><ListRow title="Lock on background" subtitle="Lock when you leave the app" trailing={<Switch accessibilityLabel="Lock on background" value={security.lockOnBackground} trackColor={{ true: palette.accent }} onValueChange={(value) => setSecurity({ lockOnBackground: value })} />} /></> : null}
      {security.biometricsEnabled && security.lockOnBackground ? LOCK_AFTER_OPTIONS.map((option) => <View key={option.seconds}>
        <Divider inset={16} />
        <ListRow title={option.label} subtitle={option.seconds === 0 ? "Require Face ID every time you return" : undefined} selected={security.lockAfterSeconds === option.seconds}
          trailing={security.lockAfterSeconds === option.seconds ? <Check size={18} color={palette.accent} /> : undefined}
          accessibilityLabel={`Require unlock ${option.label.toLowerCase()}`} onPress={() => { haptic("selection"); setSecurity({ lockAfterSeconds: option.seconds }) }} />
      </View>) : null}
      <Divider inset={16} />
      <ListRow title="Hide in app switcher" subtitle="Cover your projects while iOS shows recent apps" leading={<IconTile size={36}><EyeOff size={18} color={palette.accent} /></IconTile>}
        trailing={<Switch accessibilityLabel="Hide in app switcher" value={security.privacyCover} trackColor={{ true: palette.accent }} onValueChange={(privacyCover) => setSecurity({ privacyCover })} />} />
    </SettingsGroup>

    <SettingsGroup title="Assistant defaults" description="Used by projects you have not configured yet. Each project keeps its own choices from the assistant controls.">
      <ListRow title="Project context" subtitle="Include the desktop workspace, project rules and memory" leading={<IconTile size={36}><Sparkles size={18} color={palette.accent} /></IconTile>}
        trailing={<Switch accessibilityLabel="Include project context by default" value={assistantDefaults.includeContext} trackColor={{ true: palette.accent }} onValueChange={(includeContext) => setAssistantDefaults({ includeContext })} />} />
      {PERMISSION_MODES.map((mode) => <View key={mode.id}>
        <Divider inset={16} />
        <ListRow title={mode.title} subtitle={mode.description} selected={assistantDefaults.permissionMode === mode.id}
          trailing={assistantDefaults.permissionMode === mode.id ? <Check size={18} color={palette.accent} /> : undefined}
          accessibilityLabel={`Default permissions: ${mode.title}`} onPress={() => { haptic("selection"); setAssistantDefaults({ permissionMode: mode.id }) }} />
      </View>)}
    </SettingsGroup>

    <SettingsGroup title="About">
      <ListRow title="CADCAMFUN" subtitle={`Version ${APP_VERSION}${BUILD_NUMBER ? ` (${BUILD_NUMBER})` : ""} · iOS companion`} leading={<BrandMark size={36} wordmark={false} />} />
      <Divider inset={16} />
      <ListRow title="Encrypted connection" subtitle="Certificate-pinned HTTPS to your paired desktop" />
      {reduced ? <><Divider inset={16} /><ListRow title="Reduce Motion" subtitle="Following your iOS accessibility preference" /></> : null}
      {security.biometricsEnabled ? <><Divider inset={16} /><ListRow title="App lock" subtitle={security.lockOnBackground ? `Requires Face ID ${lockAfterLabel(security.lockAfterSeconds).toLowerCase()}` : "Locks when the app starts"} showChevron={false} /></> : null}
      <Divider inset={16} />
      <ListRow title="Copy diagnostics" subtitle="Version, connection and assistant status for support. Never includes your pairing token." leading={<IconTile size={36}><ClipboardCopy size={18} color={palette.accent} /></IconTile>}
        onPress={() => void copy(diagnostics(), "Diagnostics copied")} />
    </SettingsGroup>
    <Text style={{ color: palette.muted, textAlign: "center", paddingVertical: 12, ...type(12) }}>Designed for the work you care about.</Text>
  </PageScroll>
}

function SettingsGroup({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const { palette } = useTheme()
  return <View style={{ gap: 8, paddingTop: 6 }}>
    <Text accessibilityRole="header" style={{ color: palette.ink, paddingHorizontal: 4, ...type(18, { weight: "600" }) }}>{title}</Text>
    <SurfaceCard inset={false}>{children}</SurfaceCard>
    {description ? <Text style={{ color: palette.muted, paddingHorizontal: 4, ...type(13, { leadingScale: 1.05 }) }}>{description}</Text> : null}
  </View>
}
