/**
 * One place that turns the connection state into words and a tone, so the footer banner, the tab
 * accessory and the Settings pill always agree (nikcli: ConnectionStatus + NetworkBanner).
 */
import type { Connectivity } from "./server-context"

export type StatusTone = "success" | "warning" | "danger" | "muted"

export interface ConnectivityStatus {
  readonly tone: StatusTone
  readonly label: string
}

/** The short pill label: "Online", "Offline"… */
export const connectivityStatus = (connectivity: Connectivity): ConnectivityStatus => {
  switch (connectivity) {
    case "online": return { tone: "success", label: "Online" }
    case "connecting": return { tone: "warning", label: "Connecting" }
    case "background": return { tone: "warning", label: "Background" }
    // The Mac asleep or out of range is a state to wait out, not a fault.
    case "offline": return { tone: "warning", label: "Offline" }
    case "auth-required": return { tone: "danger", label: "Sign in required" }
    case "error": return { tone: "danger", label: "Error" }
    default: return { tone: "muted", label: "Not paired" }
  }
}

export type BannerAction = {
  readonly kind: "retry" | "settings"
  readonly label: string
  readonly hint: string
}

export interface BannerModel {
  readonly tone: StatusTone
  readonly label: string
  /** A spinner replaces the dot while the app is still trying. */
  readonly busy: boolean
  readonly action: BannerAction | null
  /** What VoiceOver says when the banner appears. It never contains the changing parts (a counter), so it is said once. */
  readonly announcement: string
  /** Changes only when the announcement should be repeated. */
  readonly key: string
}

const RETRY: BannerAction = { kind: "retry", label: "Retry", hint: "Checks the connection to your desktop again" }

/** `null` while there is nothing to say: online, not paired yet, or suspended in the background. */
export const connectionBanner = (input: { connectivity: Connectivity; connectionError: string | null; waiting: number; cloud?: boolean }): BannerModel | null => {
  const { connectivity, connectionError, waiting } = input
  switch (connectivity) {
    case "connecting":
      if (input.cloud) return { tone: "warning", label: "Connecting to your cloud workspace…", busy: true, action: null, announcement: "Connecting to your cloud workspace", key: "cloud:connecting" }
      return { tone: "warning", label: "Connecting to your desktop…", busy: true, action: null, announcement: "Connecting to your desktop", key: "connecting" }
    case "offline": {
      // Messages written meanwhile wait in the outbox; saying so keeps them from looking lost.
      const target = input.cloud ? "Cloud workspace offline" : "Desktop offline"
      const label = waiting > 0 ? `${target} · ${waiting} ${waiting === 1 ? "message" : "messages"} waiting` : target
      return { tone: "warning", label, busy: false, action: input.cloud ? { ...RETRY, hint: "Checks the connection to your cloud workspace again" } : RETRY, announcement: target, key: input.cloud ? "cloud:offline" : "offline" }
    }
    case "error": {
      const label = connectionError?.trim() || "Connection failed"
      return { tone: "danger", label, busy: false, action: RETRY, announcement: label, key: `error:${label}` }
    }
    case "auth-required":
      if (input.cloud) return {
        tone: "danger", label: "Cloud access needs attention. Check your sign-in and pairing in Settings.", busy: false,
        action: { kind: "settings", label: "Settings", hint: "Opens Settings to sign in again or renew this cloud pairing" },
        announcement: "Cloud access needs attention. Check your sign-in and pairing in Settings.", key: "cloud:auth-required",
      }
      return {
        tone: "danger",
        label: "The desktop revoked this phone. Pair it again in Settings.",
        busy: false,
        action: { kind: "settings", label: "Settings", hint: "Opens Settings to pair this phone again" },
        announcement: "The desktop revoked this phone. Pair it again in Settings.",
        key: "auth-required",
      }
    default:
      return null
  }
}
