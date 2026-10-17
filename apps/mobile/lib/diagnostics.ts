/**
 * Support report and desktop identity formatting (Settings → About & diagnostics).
 * The report is pasted into tickets and chats, so it is built from an explicit allow-list:
 * the scoped pairing token is never an input, and URLs are reduced to their origin.
 */

export interface DiagnosticsInput {
  readonly appVersion: string
  readonly buildNumber?: string
  readonly platform: string
  readonly osVersion: string
  readonly desktop?: { readonly name: string; readonly baseUrl: string; readonly hosts?: readonly string[]; readonly fingerprint: string }
  readonly connectivity: string
  readonly connectionError?: string | null
  readonly ai?: { readonly configured: boolean; readonly host?: string; readonly tools?: number } | null
  readonly offlineQueueCount: number
  readonly security: { readonly biometricsEnabled: boolean; readonly lockAfterSeconds: number; readonly privacyCover: boolean }
  readonly now: Date
}

/** `https://192.168.1.4:8443/path?token=x` → `https://192.168.1.4:8443`; anything unparsable is withheld. */
export const originOnly = (url: string): string => {
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? `${parsed.protocol}//${parsed.host}` : "(withheld)"
  } catch {
    return "(withheld)"
  }
}

/** SHA-256 hex as colon-separated byte pairs, eight per line, for comparison with the desktop's QR screen. */
export const formatFingerprint = (hex: string): string => {
  const clean = hex.toLowerCase().replace(/[^0-9a-f]/g, "")
  if (clean.length === 0) return ""
  const bytes = clean.match(/.{1,2}/g) ?? []
  const lines: string[] = []
  for (let index = 0; index < bytes.length; index += 8) lines.push(bytes.slice(index, index + 8).join(":").toUpperCase())
  return lines.join("\n")
}

/** First and last bytes, enough to recognise the desktop in a list. */
export const shortFingerprint = (hex: string): string => {
  const clean = hex.toUpperCase().replace(/[^0-9A-F]/g, "")
  return clean.length <= 12 ? clean : `${clean.slice(0, 6)}…${clean.slice(-6)}`
}

const redact = (text: string): string => text
  // Bearer tokens and token-like query values, in case a transport error echoed a request.
  .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
  .replace(/([?&](?:token|access_token|key)=)[^&\s]+/gi, "$1[redacted]")

export const buildDiagnostics = (input: DiagnosticsInput): string => {
  const lines = [
    "CADCAMFUN mobile diagnostics",
    `Generated: ${input.now.toISOString()}`,
    `App: ${input.appVersion}${input.buildNumber ? ` (${input.buildNumber})` : ""}`,
    `Device: ${input.platform} ${input.osVersion}`,
    `Connectivity: ${input.connectivity}`,
  ]
  if (input.connectionError) lines.push(`Last connection error: ${redact(input.connectionError)}`)
  if (input.desktop) {
    lines.push(`Desktop: ${input.desktop.name}`)
    lines.push(`Address: ${originOnly(input.desktop.baseUrl)}`)
    const others = (input.desktop.hosts ?? []).map(originOnly).filter((origin) => origin !== originOnly(input.desktop!.baseUrl))
    if (others.length) lines.push(`Other addresses: ${others.join(", ")}`)
    lines.push(`Certificate: ${shortFingerprint(input.desktop.fingerprint)}`)
  } else {
    lines.push("Desktop: not paired")
  }
  if (input.ai) lines.push(`Assistant: ${input.ai.configured ? "configured" : "no model key"}${input.ai.host ? ` · host ${input.ai.host}` : ""}${input.ai.tools !== undefined ? ` · ${input.ai.tools} tools` : ""}`)
  lines.push(`Queued messages: ${input.offlineQueueCount}`)
  lines.push(`App lock: ${input.security.biometricsEnabled ? `on (${input.security.lockAfterSeconds}s grace)` : "off"} · privacy cover ${input.security.privacyCover ? "on" : "off"}`)
  return lines.join("\n")
}
