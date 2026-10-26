import { useCallback, useRef, useState } from "react"
import { Platform, Text, TextInput, View } from "react-native"
import * as Clipboard from "expo-clipboard"
import { Keyboard, Link2, MonitorSmartphone, QrCode, ScanLine, ShieldCheck } from "lucide-react-native"
import { nativeAvailable } from "@/lib/native"
import { useServer } from "@/lib/server"
import { desktopLabel, parsePairingLink, type Pairing } from "@/lib/pairing"
import { hasErrors, looksLikePairingLink, manualPairingLink, validateManualFields, type ManualErrors } from "@/lib/pairing-form"
import { useTheme } from "@/lib/theme"
import { haptic } from "@/lib/haptics"
import { caps, type } from "@/lib/typography"
import { ActionButton } from "@/components/ui/ActionButton"
import { BottomSheet } from "@/components/ui/BottomSheet"
import { TextField } from "@/components/ui/TextField"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { AccountCard } from "@/components/layout/AccountCard"
import { BrandMark } from "@/components/layout/BrandMark"
import { CapsuleButton } from "@/components/layout/CapsuleButton"
import { EntryScreen } from "@/components/layout/EntryScreen"
import { PairingScanner } from "@/components/pairing/PairingScanner"
import { DividedRows, IconBadge, SheetSection, TILE_INSET } from "@/components/chat/sheet-parts"

const UNSUPPORTED = "Open the installed CADCAMFUN app to pair securely. Expo Go cannot use the CompanionNet module."

const STEPS = [
  { icon: MonitorSmartphone, title: "Open your desktop", detail: "Go to Settings → Mobile companion on your Mac." },
  { icon: QrCode, title: "Show the pairing code", detail: "Turn on the companion and display its QR code." },
  { icon: ScanLine, title: "Scan it with this iPhone", detail: "Stay on the same Wi-Fi, Personal Hotspot or Tailscale network." },
] as const

/**
 * The Pair screen — the phone's front door, in the language of the assistant: a quiet header, the three steps as
 * sheet rows, and the actions resting in the dock above the home indicator. Scan the QR shown on the desktop,
 * paste a pairing link, or type the address, token and fingerprint by hand. On success the pairing is sealed in
 * the Keychain and the root gate drops the user into Projects.
 */
export default function ConnectScreen() {
  const { palette } = useTheme()
  const { save, connectionError } = useServer()
  const supported = Platform.OS === "web" || nativeAvailable
  const pairingBusy = useRef(false)

  const [scanning, setScanning] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [desktop, setDesktop] = useState<string | undefined>()
  const [connectedTo, setConnectedTo] = useState<string | null>(null)

  /** Resolves true once the pairing is saved; the scanner keeps scanning after a false. */
  const pair = useCallback(
    async (link: string): Promise<boolean> => {
      if (pairingBusy.current) return false
      if (!supported) { setError(UNSUPPORTED); return false }
      pairingBusy.current = true
      setBusy(true)
      setError(null)
      try {
        const pairing: Pairing = parsePairingLink(link)
        setDesktop(desktopLabel(pairing))
        const ok = await save(pairing)
        if (!ok) {
          setError(`The desktop at ${desktopLabel(pairing)} did not answer. Join the same Wi-Fi or Personal Hotspot as the Mac, or type a Tailscale address. Is the companion gateway on?`)
          haptic("error")
          return false
        }
        haptic("success")
        setConnectedTo(desktopLabel(pairing))
        setManualOpen(false)
        return true
      } catch (err) {
        setError(err instanceof Error ? err.message : "That is not a CADCAMFUN pairing link")
        haptic("error")
        return false
      } finally {
        pairingBusy.current = false
        setBusy(false)
      }
    },
    [save, supported],
  )

  const openScanner = () => {
    haptic("selection")
    if (!supported) { setError(UNSUPPORTED); return }
    setError(null)
    setScanning(true)
  }

  const paste = async () => {
    haptic("selection")
    if (!supported) { setError(UNSUPPORTED); return }
    try {
      const text = (await Clipboard.getStringAsync()).trim()
      if (!text) { setError("The clipboard is empty. Copy the pairing link on your Mac first."); return }
      if (!looksLikePairingLink(text)) { setError("The clipboard does not hold a CADCAMFUN pairing link. Copy it again on your Mac."); return }
      await pair(text)
    } catch { setError("Could not read the clipboard. Enter the connection details instead.") }
  }

  const openManual = () => {
    haptic("selection")
    if (!supported) { setError(UNSUPPORTED); return }
    setError(null)
    setManualOpen(true)
  }

  if (scanning) {
    return (
      <>
        <PairingScanner
          busy={busy}
          {...(desktop ? { desktop } : {})}
          error={error}
          connectedTo={connectedTo}
          onScanned={pair}
          onClose={() => { haptic("selection"); setScanning(false) }}
          onManual={() => { setScanning(false); openManual() }}
        />
        <ManualSheet open={manualOpen} busy={busy} error={error} onClose={() => setManualOpen(false)} onPair={(link) => void pair(link)} />
      </>
    )
  }

  return (
    <EntryScreen
      footer={(
        <>
          {error || connectionError ? <ErrorBanner message={error ?? connectionError!} /> : null}
          <CapsuleButton label={busy ? "Connecting to your desktop…" : "Scan pairing code"} icon={<ScanLine size={19} color={palette.onAccent} strokeWidth={2.2} />} loading={busy} hint="Opens the camera to read the QR code on your Mac" onPress={openScanner} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <CapsuleButton variant="glass" label="Paste link" icon={<Link2 size={17} color={palette.ink} strokeWidth={2.2} />} disabled={busy} hint="Pairs with the link copied on your Mac" onPress={() => void paste()} />
            </View>
            <View style={{ flex: 1 }}>
              <CapsuleButton variant="glass" label="Enter details" icon={<Keyboard size={17} color={palette.ink} strokeWidth={2.2} />} disabled={busy} hint="Type the address, token and fingerprint" onPress={openManual} />
            </View>
          </View>
        </>
      )}
    >
      <View style={{ alignItems: "center", paddingTop: 8 }}>
        <BrandMark size={64} />
      </View>
      <View style={{ gap: 10 }}>
        <Text style={{ color: palette.accent, textAlign: "center", ...caps(12, { weight: "700" }) }}>Your work. With you.</Text>
        <Text accessibilityRole="header" style={{ color: palette.ink, textAlign: "center", ...type(30, { weight: "700" }) }}>Pair with your Mac</Text>
        <Text style={{ color: palette.soft, textAlign: "center", ...type(16, { leadingScale: 1.05 }) }}>Review designs, check toolpaths and work with your assistant, wherever you are.</Text>
      </View>

      {!supported ? <ErrorBanner message="Secure pairing requires the installed CADCAMFUN app. Expo Go does not include the native connection module." /> : null}

      <SheetSection title="How to pair">
        <DividedRows inset={TILE_INSET}>
          {STEPS.map(({ icon: Icon, title, detail }, index) => (
            <View key={title} accessible accessibilityLabel={`Step ${index + 1}. ${title}. ${detail}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 72, paddingHorizontal: 16, paddingVertical: 12 }}>
              <IconBadge tone="accent" active={index === 0}><Icon size={18} color={index === 0 ? palette.accent : palette.muted} strokeWidth={2.1} /></IconBadge>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text style={{ color: palette.ink, ...type(15, { weight: "600" }) }}>{title}</Text>
                <Text style={{ color: palette.soft, ...type(13, { leadingScale: 1.05 }) }}>{detail}</Text>
              </View>
            </View>
          ))}
        </DividedRows>
      </SheetSection>

      <AccountCard />

      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 4 }}>
        <ShieldCheck size={18} color={palette.success} style={{ marginTop: 1 }} />
        <Text style={{ flex: 1, color: palette.muted, ...type(12, { leadingScale: 1.1 }) }}>A private, encrypted connection to your Mac, pinned to its certificate. Nothing passes through a cloud service.</Text>
      </View>

      <ManualSheet open={manualOpen} busy={busy} error={error} onClose={() => setManualOpen(false)} onPair={(link) => void pair(link)} />
    </EntryScreen>
  )
}

/**
 * Advanced pairing: type the gateway address, scoped token and certificate fingerprint. Each field says what is
 * wrong with it once a pairing was tried; a pasted pairing link in the address field pairs straight away.
 */
function ManualSheet({ open, busy, error, onClose, onPair }: { open: boolean; busy: boolean; error: string | null; onClose: () => void; onPair: (link: string) => void }) {
  const { palette } = useTheme()
  const [address, setAddress] = useState("")
  const [token, setToken] = useState("")
  const [fingerprint, setFingerprint] = useState("")
  const [errors, setErrors] = useState<ManualErrors>({})
  const [tried, setTried] = useState(false)
  const tokenRef = useRef<TextInput>(null)
  const fingerprintRef = useRef<TextInput>(null)
  const ready = Boolean(address.trim() && token.trim() && fingerprint.trim())

  const recheck = (fields: { address: string; token: string; fingerprint: string }) => { if (tried) setErrors(validateManualFields(fields)) }

  /**
   * Several addresses may be typed, one per line or separated by commas: the phone races them exactly like
   * the QR does, so a Mac that is on Wi-Fi *and* Tailscale still connects when only one path works.
   */
  const submit = () => {
    if (looksLikePairingLink(address)) { onPair(address.trim()); return }
    const fields = { address, token, fingerprint }
    const found = validateManualFields(fields)
    setTried(true)
    setErrors(found)
    if (hasErrors(found)) { haptic("error"); return }
    onPair(manualPairingLink(fields))
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Enter connection details" padded>
      <Text style={{ color: palette.soft, ...type(14, { leadingScale: 1.05 }) }}>On your Mac, open Settings → Mobile companion and choose “Show details”.</Text>
      <TextField label="Desktop address" value={address} onChangeText={(value) => { setAddress(value); recheck({ address: value, token, fingerprint }) }} placeholder="https://192.168.1.10:8443" hint="Several addresses can be separated by commas." error={errors.address} autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => tokenRef.current?.focus()} editable={!busy} />
      <TextField ref={tokenRef} label="Pairing token" value={token} onChangeText={(value) => { setToken(value); recheck({ address, token: value, fingerprint }) }} placeholder="Token from your desktop" error={errors.token} autoCapitalize="none" autoCorrect={false} secureTextEntry returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => fingerprintRef.current?.focus()} editable={!busy} />
      <TextField ref={fingerprintRef} label="Certificate fingerprint" value={fingerprint} onChangeText={(value) => { setFingerprint(value); recheck({ address, token, fingerprint: value }) }} placeholder="64 hexadecimal characters" hint="Colons and spaces are fine." error={errors.fingerprint} autoCapitalize="none" autoCorrect={false} returnKeyType="go" onSubmitEditing={() => { if (ready && !busy) submit() }} editable={!busy} />
      {/* The failure belongs inside the sheet: the screen behind it cannot be seen while it is open. */}
      {error ? <ErrorBanner message={error} /> : null}
      <ActionButton label="Pair" fullWidth loading={busy} disabled={busy || !ready} onPress={submit} />
    </BottomSheet>
  )
}
