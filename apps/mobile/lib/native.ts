import { Platform } from "react-native"
import CompanionNet from "@/modules/companion-net"
import { parsePairingGrant, redeemPairingLink, type Pairing } from "./pairing"
import { createFetchTransport, createPinnedTransport } from "../modules/companion-net/transport"
import type { Transport } from "./client"
import { identityToken } from "./account"

export { pairingStore } from "./storage"

/**
 * The native side of the companion link.
 *
 * - `pinnedTransport` routes every request through the `companion-net` module, which accepts only
 *   the certificate whose SHA-256 fingerprint matches the pairing QR code (no trust-on-first-use,
 *   https only, no redirects). Plain browsers fall back to `fetch` + localStorage for development.
 * - `pairingStore` keeps the pairing (scoped token + fingerprint) in the iOS Keychain.
 * - `launchPairLink` reads the `--pair-link` launch argument (CI simulator runs, deep links).
 */

export const nativeAvailable = Platform.OS === "ios" && !!CompanionNet?.request

export const launchPairLink = async (): Promise<string | null> => {
  if (!nativeAvailable) return null
  try {
    return CompanionNet?.launchPairLink() ?? null
  } catch {
    return null
  }
}

/**
 * Start a Bonjour browse alongside the first LAN connection to warm the local-network prompt.
 * The native URLSession also waits for connectivity while the user answers; failures here
 * do not prevent the pinned HTTPS request from requesting access itself.
 */
export const warmLocalNetwork = (): void => {
  if (!nativeAvailable) return
  try {
    CompanionNet?.warmLocalNetwork?.()
  } catch {
    // Native module older than this build, or Expo Go: pairing still proceeds.
  }
}

/**
 * Redeems a one-time QR. On iOS the request is certificate-pinned; the browser fallback is the
 * same fetch the rest of the web dev client uses.
 */
export const redeemScannedLink = (link: string): Promise<Pairing> => {
  if (Platform.OS === "web" || !nativeAvailable || !CompanionNet) return redeemPairingLink(link, fetch)
  const net = CompanionNet
  const grant = parsePairingGrant(link)
  return redeemPairingLink(link, async (url, init) => {
    const target = new URL(url)
    const response = await net.request(
      target.origin,
      `${target.pathname}${target.search}`,
      init?.method ?? "POST",
      { accept: "application/json", "content-type": "application/json" },
      typeof init?.body === "string" ? init.body : null,
      grant.fingerprint,
    )
    return new Response(response.body, { status: response.status })
  })
}

/** Never downgrade a native device to an unpinned browser connection. */
export const pinnedTransport = (pairing: Pairing): Transport => {
  if (Platform.OS === "web") return createFetchTransport(pairing, fetch, identityToken)
  if (!nativeAvailable || !CompanionNet) throw new Error("Certificate pinning requires the CADCAMFUN iOS development build. Expo Go cannot connect to a paired desktop.")
  return createPinnedTransport(pairing, CompanionNet, identityToken)
}
