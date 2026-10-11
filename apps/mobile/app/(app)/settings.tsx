import { useState } from "react"
import { Alert, ScrollView, Switch, Text, View } from "react-native"
import { useRouter } from "expo-router"
import * as LocalAuthentication from "expo-local-authentication"
import { MonitorSmartphone, Palette, Unplug, Vibrate, Lock, Info } from "lucide-react-native"
import { useServer } from "@/lib/server"
import { useTheme } from "@/lib/theme"
import { useUIStore } from "@/lib/store"
import { haptic } from "@/lib/haptics"
import { toast } from "@/components/ui/ToastHost"
import { SegmentedControl } from "@/components/ui/SegmentedControl"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { ListRow } from "@/components/ui/ListRow"
import { SectionHeader } from "@/components/ui/SectionHeader"
import { ActionButton } from "@/components/ui/ActionButton"
import { usePrefersReducedMotion } from "@/lib/animation"

/**
 * Settings — grouped lists, toggles and one destructive action (Unpair) behind a confirmation.
 * Face ID is opt-in and checked live: if the device cannot authenticate, the toggle asks for the
 * reason instead of pretending it works.
 */
export default function SettingsScreen() {
  const { config, connectivity, clear, recheck } = useServer()
  const { palette, colorScheme, setColorScheme } = useTheme()
  const { themeMode, haptics, security, setThemeMode, setHaptics, setSecurity } = useUIStore()
  const router = useRouter()
  const reduced = usePrefersReducedMotion()
  const [biometricsBusy, setBiometricsBusy] = useState(false)

  const toggleBiometrics = async (value: boolean) => {
    setBiometricsBusy(true)
    try {
      const capability = await LocalAuthentication.hasHardwareAsync()
      if (!capability) {
        toast("This iPhone has no Face ID / Touch ID", "info")
        return
      }
      const enrolled = await LocalAuthentication.isEnrolledAsync()
      if (!enrolled) {
        toast("No Face ID or passcode is set up in iOS Settings", "info")
        return
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock CADCAMFUN with Face ID",
        fallbackLabel: "Use passcode",
      })
      if (result.success) {
        haptic("success")
        setSecurity({ biometricsEnabled: value, lockOnBackground: value ? true : security.lockOnBackground })
      }
    } catch {
      toast("Face ID is unavailable", "error")
    } finally {
      setBiometricsBusy(false)
    }
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
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: palette.background }}>
      {/* Paired desktop */}
      <SectionHeader>Desktop</SectionHeader>
      <View style={{ paddingHorizontal: 16 }}>
        <SurfaceCard>
          <ListRow
            leading={<MonitorSmartphone size={16} color={palette.accent} />}
            title={config?.name ?? "Not paired"}
            subtitle={config ? `${config.baseUrl} · ${config.fingerprint.slice(0, 12)}…` : undefined}
            trailing={<Text style={{ color: palette.soft, fontSize: 13 }}>{connectivity === "online" ? "Online" : connectivity === "connecting" ? "Connecting…" : "Offline"}</Text>}
            onPress={() => void recheck()}
          />
        </SurfaceCard>
        <View style={{ paddingTop: 12 }}>
          <ActionButton label="Unpair this phone" icon={<Unplug size={16} color={palette.danger} />} fullWidth variant="danger" onPress={unpair} />
        </View>
      </View>

      {/* Appearance */}
      <SectionHeader>Appearance</SectionHeader>
      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        <SegmentedControl
          segments={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          value={themeMode}
          onChange={(mode) => {
            haptic("selection")
            setThemeMode(mode)
            setColorScheme(mode)
          }}
        />
        <SurfaceCard>
          <ListRow
            leading={<Palette size={16} color={palette.accent} />}
            title="Appearance"
            trailing={<Text style={{ color: palette.soft, fontSize: 13 }}>{colorScheme === "dark" ? "Dark" : "Light"}</Text>}
            subtitle="Follows the iOS setting unless overridden above"
          />
        </SurfaceCard>
      </View>

      {/* Haptics */}
      <SectionHeader>Haptics</SectionHeader>
      <View style={{ paddingHorizontal: 16 }}>
        <SurfaceCard>
          <ListRow
            leading={<Vibrate size={16} color={palette.accent} />}
            title="Haptics"
            trailing={
              <Switch
                value={haptics.enabled}
                onValueChange={(value) => {
                  haptic("selection")
                  setHaptics({ enabled: value })
                }}
                trackColor={{ true: palette.accent }}
              />
            }
          />
          <View style={{ height: 0.5, marginLeft: 16, backgroundColor: palette.border }} />
          <ListRow
            title="Selection ticks"
            subtitle="Pickers, segments and list taps"
            trailing={
              <Switch
                value={haptics.selection}
                disabled={!haptics.enabled}
                onValueChange={(value) => setHaptics({ selection: value })}
                trackColor={{ true: palette.accent }}
              />
            }
          />
          <View style={{ height: 0.5, marginLeft: 16, backgroundColor: palette.border }} />
          <ListRow
            title="Successes and errors"
            subtitle="Commits, merges, failed requests"
            trailing={
              <Switch
                value={haptics.success && haptics.errors}
                disabled={!haptics.enabled}
                onValueChange={(value) => setHaptics({ success: value, errors: value })}
                trackColor={{ true: palette.accent }}
              />
            }
          />
        </SurfaceCard>
      </View>

      {/* Security */}
      <SectionHeader>Security</SectionHeader>
      <View style={{ paddingHorizontal: 16 }}>
        <SurfaceCard>
          <ListRow
            leading={<Lock size={16} color={palette.accent} />}
            title="Face ID lock"
            subtitle="Require Face ID when the app returns from the background"
            trailing={
              <Switch
                value={security.biometricsEnabled}
                disabled={biometricsBusy}
                onValueChange={(value) => void toggleBiometrics(value)}
                trackColor={{ true: palette.accent }}
              />
            }
          />
          {security.biometricsEnabled ? (
            <>
              <View style={{ height: 0.5, marginLeft: 16, backgroundColor: palette.border }} />
              <ListRow
                title="Lock on background"
                subtitle="Lock immediately when the app leaves the foreground"
                trailing={
                  <Switch
                    value={security.lockOnBackground}
                    onValueChange={(value) => setSecurity({ lockOnBackground: value })}
                    trackColor={{ true: palette.accent }}
                  />
                }
              />
            </>
          ) : null}
        </SurfaceCard>
      </View>

      {/* About */}
      <SectionHeader>About</SectionHeader>
      <View style={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        <SurfaceCard>
          <ListRow
            leading={<Info size={16} color={palette.accent} />}
            title="CADCAMFUN"
            subtitle="Version 6.0.0 · the iOS companion of your desktop"
          />
          <View style={{ height: 0.5, marginLeft: 16, backgroundColor: palette.border }} />
          <ListRow
            title="Connection security"
            subtitle="HTTPS with the pairing certificate pinned · scoped, revocable device token · nothing else can reach your desktop"
          />
          {reduced ? (
            <>
              <View style={{ height: 0.5, marginLeft: 16, backgroundColor: palette.border }} />
              <ListRow title="Reduce Motion" subtitle="On — system setting, the app follows it" />
            </>
          ) : null}
        </SurfaceCard>
      </View>
    </ScrollView>
  )
}
