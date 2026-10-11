import { Platform } from "react-native"
import * as SecureStore from "expo-secure-store"
import CompanionNet from "@/modules/companion-net"
import { validatePairing, type Pairing } from "./pairing"
import { createFetchTransport, createPinnedTransport } from "../modules/companion-net/transport"
import type { Transport } from "./client"

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

const PAIRING_KEY = "cadcamfun.pairing.v1"

export const launchPairLink = async (): Promise<string | null> => {
  if (!nativeAvailable) return null
  try {
    return CompanionNet?.launchPairLink() ?? null
  } catch {
    return null
  }
}

export const pairingStore = {
  load: async (): Promise<Pairing | undefined> => {
    const raw = Platform.OS === "web" ? globalThis.localStorage?.getItem(PAIRING_KEY) : await SecureStore.getItemAsync(PAIRING_KEY)
    if (!raw) return undefined
    try {
      return validatePairing(JSON.parse(raw))
    } catch {
      return undefined
    }
  },
  save: async (pairing: Pairing): Promise<void> => {
    const validated = validatePairing(pairing)
    if (Platform.OS === "web") { globalThis.localStorage?.setItem(PAIRING_KEY, JSON.stringify(validated)); return }
    await SecureStore.setItemAsync(PAIRING_KEY, JSON.stringify(validated), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    })
  },
  clear: async (): Promise<void> => {
    if (Platform.OS === "web") { globalThis.localStorage?.removeItem(PAIRING_KEY); return }
    await SecureStore.deleteItemAsync(PAIRING_KEY)
  },
}

/** Never downgrade a native device to an unpinned browser connection. */
export const pinnedTransport = (pairing: Pairing): Transport => {
  if (Platform.OS === "web") return createFetchTransport(pairing)
  if (!nativeAvailable || !CompanionNet) throw new Error("Certificate pinning requires the CADCAMFUN iOS development build. Expo Go cannot connect to a paired desktop.")
  return createPinnedTransport(pairing, CompanionNet)
}
