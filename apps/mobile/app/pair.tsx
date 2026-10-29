import { useCallback, useEffect, useState } from "react"
import { Platform, Text, View } from "react-native"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { parsePairingLink } from "@/lib/pairing"
import { nativeAvailable } from "@/lib/native"
import { useServer } from "@/lib/server"
import { useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { BrandMark } from "@/components/layout/BrandMark"
import { CapsuleButton } from "@/components/layout/CapsuleButton"
import { EntryScreen } from "@/components/layout/EntryScreen"
import { StatusPill } from "@/components/layout/StatusPill"
import { AccountCard } from "@/components/layout/AccountCard"

/** Pairing URLs share the scanner's validation and never render their credentials. */
export default function PairLinkScreen() {
  const params = useLocalSearchParams<{ host?: string; token?: string; fp?: string; name?: string; hosts?: string; mode?: string; workspace?: string }>()
  const router = useRouter()
  const { palette } = useTheme()
  const { save, booting } = useServer()
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const supported = Platform.OS === "web" || nativeAvailable
  const host = params.host, token = params.token, fingerprint = params.fp, name = params.name, extraHosts = params.hosts
  const mode = params.mode, workspace = params.workspace
  const connect = useCallback(async () => {
    if (!supported) throw new Error("Secure pairing requires the CADCAMFUN development build. Install it with bun run ios from apps/mobile and open it instead of Expo Go.")
    if (typeof host !== "string" || typeof token !== "string" || fingerprint !== undefined && typeof fingerprint !== "string" || name !== undefined && typeof name !== "string") throw new Error("The pairing link is incomplete. Scan a new pairing QR code.")
    const query = new URLSearchParams({ host, token, fp: fingerprint ?? "", name: name ?? (mode === "cloud" ? "Cloud workspace" : "Desktop") })
    if (typeof extraHosts === "string" && extraHosts) query.set("hosts", extraHosts)
    if (typeof mode === "string") query.set("mode", mode)
    if (typeof workspace === "string") query.set("workspace", workspace)
    const pairing = parsePairingLink(`cadcamfun://pair?${query}`)
    if (!await save(pairing)) throw new Error("The desktop did not answer. Join the same Wi-Fi or Personal Hotspot as the Mac, or type a Tailscale address, then retry.")
  }, [supported, host, token, fingerprint, name, extraHosts, mode, workspace, save])
  useEffect(() => {
    if (booting) return
    let active = true
    setBusy(true)
    setError(null)
    void connect().then(() => { if (active) router.replace("/projects") }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not pair with the desktop")
    }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [connect, attempt, booting, router])
  const working = busy || booting
  return (
    <EntryScreen
      centered
      footer={error ? (
        <>
          {supported ? <CapsuleButton label="Try again" onPress={() => setAttempt((previous) => previous + 1)} /> : null}
          <CapsuleButton variant="glass" label="Back to pairing" onPress={() => router.replace("/connect")} />
        </>
      ) : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ alignItems: "center", gap: 16 }}>
        <BrandMark size={64} />
        <Text accessibilityRole="header" style={{ color: palette.ink, textAlign: "center", ...type(24, { weight: "700" }) }}>{mode === "cloud" ? "Connect to your cloud workspace" : "Pair with your desktop"}</Text>
        {error ? null : <StatusPill tone="warning" busy={working} label={name ? `Checking the secure connection to ${name}…` : "Checking the secure connection…"} />}
      </View>
      {error ? <ErrorBanner message={error} /> : null}
      {mode === "cloud" ? <AccountCard /> : null}
    </EntryScreen>
  )
}
