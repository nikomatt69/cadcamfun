import { useState } from "react"
import { Alert, Platform, Text, View } from "react-native"
import Constants from "expo-constants"
import * as Clipboard from "expo-clipboard"
import { useRouter } from "expo-router"
import { Accessibility, AppWindow, Ban, BellRing, Building2, Calculator, ClipboardCopy, EyeOff, Fingerprint, Inbox, Layers3, ListChecks, Lock, MonitorSmartphone, MousePointerClick, Network, Palette, ShieldCheck, Sparkles, Timer, Unplug, Vibrate, type LucideIcon } from "lucide-react-native"
import { useServer } from "@/lib/server"
import { useTheme } from "@/lib/theme"
import { useUIStore } from "@/lib/store"
import { haptic } from "@/lib/haptics"
import { authenticate, biometricLabel, getBiometricCapability } from "@/lib/biometrics"
import { toast } from "@/components/ui/ToastHost"
import { SegmentedControl } from "@/components/ui/SegmentedControl"
import { AccountCard } from "@/components/layout/AccountCard"
import { ConnectionStatus } from "@/components/layout/ConnectionStatus"
import { usePrefersReducedMotion } from "@/lib/animation"
import { PageScroll } from "@/components/layout/page-scroll"
import { BrandMark } from "@/components/layout/BrandMark"
import { LOCK_AFTER_OPTIONS, lockAfterLabel } from "@/lib/app-lock"
import { buildDiagnostics, formatFingerprint, originOnly } from "@/lib/diagnostics"
import { type } from "@/lib/typography"
import { PERMISSION_MODES, type AssistantPermissionMode } from "@/lib/assistant-preferences"
import { permissionTone } from "@/lib/assistant-inspector"
import { ChoiceRow, DividedRows, IconBadge, InfoChip, SheetSection, SheetSummary, TILE_INSET } from "@/components/chat/sheet-parts"
import { NavRow, SettingsSection, SwitchRow } from "@/components/manage/settings-parts"
import { ScreenFrame } from "@/components/manage/ScreenFrame"
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

  return (
    <ScreenFrame title="Settings" {...(config?.name ? { subtitle: config.name } : {})}>
      <PageScroll contentInsetAdjustmentBehavior="never" contentContainerStyle={{ gap: 24 }}>
        <View style={{ gap: 12 }}>
          <SheetSummary eyebrow="Connected workspace" title={config?.name ?? "Your desktop"} description="Manage your connection and make the companion your own." />
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <ConnectionStatus connectivity={connectivity} />
            {offlineQueueCount > 0 ? <InfoChip label={`${offlineQueueCount} queued`} tone="warning" /> : null}
          </View>
        </View>

        <AccountCard />

        <SettingsSection title="Workspace">
          <NavRow icon={Calculator} title="Production costs" description="Estimates, material costs, tool wear and operation rates" onPress={() => router.push("/settings/costs")} />
          <NavRow icon={Building2} title="Organizations" description="Your organizations, members and roles — synced with the desktop" onPress={() => router.push("/settings/organizations")} />
          <NavRow icon={Layers3} title="Materials, tools & machines" description="Search, create and edit your resources — synced with the desktop" onPress={() => router.push("/settings/resources")} />
        </SettingsSection>

        <SettingsSection title="Desktop">
          <NavRow icon={MonitorSmartphone} title={config?.name ?? "Not paired"} {...(config?.baseUrl ? { description: config.baseUrl } : {})} active={connectivity === "online"}
            trailing={<Text style={{ color: palette.accent, ...type(14, { weight: "600" }) }}>Reconnect</Text>} hint="Checks the connection to the desktop again" onPress={() => void recheck()} />
          {offlineQueueCount > 0 ? (
            <NavRow icon={Inbox} tone="warning" active title="Queued messages" description={`${offlineQueueCount === 1 ? "1 message sends" : `${offlineQueueCount} messages send`} when the desktop reconnects`}
              trailing={<Text style={{ color: palette.danger, ...type(14, { weight: "600" }) }}>Discard</Text>} hint="Discards the messages waiting for the desktop" onPress={clearQueue} />
          ) : null}
          {config ? (
            <NavRow icon={Fingerprint} title="Certificate fingerprint" description={formatFingerprint(config.fingerprint)} chevron={false}
              trailing={<ClipboardCopy size={17} color={palette.muted} strokeWidth={2} />} label={`Certificate fingerprint ${config.fingerprint.split("").join(" ")}`}
              hint="Copies the fingerprint. It matches the one under the QR code on your Mac." onPress={() => void copy(config.fingerprint, "Fingerprint copied")} />
          ) : null}
          {config && (config.hosts?.length ?? 0) > 1 ? <NavRow icon={Network} title="Desktop addresses" description={(config.hosts ?? []).map(originOnly).join("\n")} /> : null}
          <NavRow icon={Unplug} destructive title="Unpair this phone" description="Remove this desktop connection" chevron={false} onPress={unpair} />
        </SettingsSection>

        <SettingsSection title="Appearance" footer="System follows the appearance selected in iOS Settings.">
          <View style={{ padding: 16, gap: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <IconBadge tone="accent"><Palette size={18} color={palette.muted} strokeWidth={2.1} /></IconBadge>
              <Text style={{ flex: 1, color: palette.ink, ...type(15, { weight: "600" }) }}>Theme</Text>
              <Text style={{ color: palette.muted, ...type(14) }}>{colorScheme === "dark" ? "Dark" : "Light"}</Text>
            </View>
            <SegmentedControl segments={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} value={themeMode} onChange={setThemeMode} />
          </View>
        </SettingsSection>

        <SettingsSection title="Touch & feedback">
          <SwitchRow icon={Vibrate} title="Haptic feedback" description="Subtle feedback for meaningful actions" value={haptics.enabled} onValueChange={(enabled) => setHaptics({ enabled })} />
          <SwitchRow icon={MousePointerClick} title="Selection feedback" description="Project pickers and segmented controls" disabled={!haptics.enabled} value={haptics.selection} onValueChange={(selection) => setHaptics({ selection })} />
          <SwitchRow icon={BellRing} title="Results & alerts" description="Successes, errors and completed operations" disabled={!haptics.enabled} value={haptics.success && haptics.errors} onValueChange={(value) => setHaptics({ success: value, errors: value })} />
        </SettingsSection>

        <SettingsSection title="Privacy & security" footer="Your projects stay on your desktop. This phone uses a scoped, revocable connection.">
          <SwitchRow icon={Lock} title="Biometric lock" description="Unlock with Face ID or Touch ID" value={security.biometricsEnabled} busy={biometricsBusy} onValueChange={(value) => void toggleBiometrics(value)} />
          {security.biometricsEnabled ? <SwitchRow icon={AppWindow} title="Lock on background" description="Lock when you leave the app" value={security.lockOnBackground} onValueChange={(value) => setSecurity({ lockOnBackground: value })} /> : null}
          <SwitchRow icon={EyeOff} title="Hide in app switcher" description="Cover your projects while iOS shows recent apps" value={security.privacyCover} onValueChange={(privacyCover) => setSecurity({ privacyCover })} />
        </SettingsSection>

        {security.biometricsEnabled && security.lockOnBackground ? (
          <SheetSection title="Require unlock">
            <DividedRows inset={TILE_INSET}>
              {LOCK_AFTER_OPTIONS.map((option) => (
                <ChoiceRow key={option.seconds} icon={Timer} title={option.label} {...(option.seconds === 0 ? { description: "Require Face ID every time you return" } : {})}
                  selected={security.lockAfterSeconds === option.seconds} onPress={() => setSecurity({ lockAfterSeconds: option.seconds })} />
              ))}
            </DividedRows>
          </SheetSection>
        ) : null}

        <SettingsSection title="Assistant defaults" footer="Used by projects you have not configured yet. Each project keeps its own choices from the assistant controls.">
          <SwitchRow icon={Sparkles} title="Project context" description="Include the desktop workspace, project rules and memory" value={assistantDefaults.includeContext} onValueChange={(includeContext) => setAssistantDefaults({ includeContext })} />
        </SettingsSection>

        <SheetSection title="Default permissions">
          <DividedRows inset={TILE_INSET}>
            {PERMISSION_MODES.map((mode) => (
              <ChoiceRow key={mode.id} icon={PERMISSION_ICONS[mode.id]} tone={permissionTone(mode.id)} title={mode.title} description={mode.description}
                selected={assistantDefaults.permissionMode === mode.id} onPress={() => setAssistantDefaults({ permissionMode: mode.id })} />
            ))}
          </DividedRows>
        </SheetSection>

        <SettingsSection title="About">
          <View accessible accessibilityLabel={`CADCAMFUN, version ${APP_VERSION}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 72, paddingHorizontal: 16, paddingVertical: 12 }}>
            <BrandMark size={40} wordmark={false} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text style={{ color: palette.ink, ...type(15, { weight: "600" }) }}>CADCAMFUN</Text>
              <Text style={{ color: palette.soft, ...type(13) }}>{`Version ${APP_VERSION}${BUILD_NUMBER ? ` (${BUILD_NUMBER})` : ""} · iOS companion`}</Text>
            </View>
          </View>
          <NavRow icon={ShieldCheck} title="Encrypted connection" description="Certificate-pinned HTTPS to your paired desktop" />
          {reduced ? <NavRow icon={Accessibility} title="Reduce Motion" description="Following your iOS accessibility preference" /> : null}
          {security.biometricsEnabled ? <NavRow icon={Lock} title="App lock" description={security.lockOnBackground ? `Requires Face ID ${lockAfterLabel(security.lockAfterSeconds).toLowerCase()}` : "Locks when the app starts"} /> : null}
          <NavRow icon={ClipboardCopy} title="Copy diagnostics" description="Version, connection and assistant status for support. Never includes your pairing token." chevron={false} onPress={() => void copy(diagnostics(), "Diagnostics copied")} />
        </SettingsSection>
        <Text style={{ color: palette.muted, textAlign: "center", paddingBottom: 8, ...type(12) }}>Designed for the work you care about.</Text>
      </PageScroll>
    </ScreenFrame>
  )
}

const PERMISSION_ICONS: Record<AssistantPermissionMode, LucideIcon> = { approve: ListChecks, ask: Ban, auto: ShieldCheck }
