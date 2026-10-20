import { useState } from "react"
import { Alert, Text, View } from "react-native"
import { useSyncExternalStore } from "react"
import { accountStore, LoginCancelled, signIn, signOut } from "@/lib/account"
import { haptic } from "@/lib/haptics"
import { ActionButton } from "@/components/ui/ActionButton"
import { ErrorBanner } from "@/components/ui/ErrorBanner"
import { SurfaceCard } from "@/components/ui/SurfaceCard"
import { toast } from "@/components/ui/ToastHost"
import { useTheme } from "@/lib/theme"
import { type } from "@/lib/typography"

/** Sign in with the CADCAMFUN account (same as `cadcamfun login`) so the paired desktop returns that account's projects. */
export function AccountCard() {
  const { palette } = useTheme()
  const account = useSyncExternalStore(accountStore.subscribe, accountStore.account)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const login = async () => {
    setBusy(true)
    setError(null)
    try {
      await signIn()
      haptic("success")
    } catch (e) {
      if (!(e instanceof LoginCancelled)) setError(e instanceof Error ? e.message : "Sign-in failed")
    } finally {
      setBusy(false)
    }
  }

  const logout = () => Alert.alert("Sign out", "Your projects on this phone switch back to the desktop's local profile.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Sign out", style: "destructive",
      onPress: () => {
        setBusy(true)
        void signOut().then(() => haptic("success"))
          .catch((e: unknown) => toast(e instanceof Error ? e.message : "Signed out locally; the server could not revoke the session", "info"))
          .finally(() => setBusy(false))
      },
    },
  ])

  return <SurfaceCard eyebrow="CADCAMFUN ACCOUNT" title={account ? account.email ?? account.name ?? "Signed in" : "Not signed in"}
    description={account ? "Projects shown are the ones of this account on your desktop." : "Sign in with your CADCAMFUN account to see your projects."}>
    <View style={{ gap: 12 }}>
      {error ? <ErrorBanner message={error} /> : null}
      {account
        ? <ActionButton label="Sign out" variant="secondary" disabled={busy} onPress={logout} />
        : <ActionButton label={busy ? "Waiting for sign-in…" : "Sign in with CADCAMFUN"} loading={busy} onPress={() => void login()} />}
      {busy ? <Text style={{ color: palette.muted, ...type(12) }}>Complete the sign-in in the browser sheet.</Text> : null}
    </View>
  </SurfaceCard>
}
