import { describe, expect, test } from "bun:test"
import { cameraAccess, scannerHint, SCAN_RETRY_MS } from "../lib/camera-access"
import { connectionBanner, connectivityStatus } from "../lib/connection-banner"
import { canRestart, crashReport, crashSummary, MAX_RESTARTS } from "../lib/crash-report"
import { hasErrors, looksLikePairingLink, manualPairingLink, normalizeFingerprint, splitOrigins, validateManualFields, withScheme } from "../lib/pairing-form"
import { parsePairingLink } from "../lib/pairing"

const fp = "ab".repeat(32)
const token = "t".repeat(24)

describe("camera access", () => {
  test("maps the permission to the three states the scanner shows", () => {
    expect(cameraAccess(null)).toBe("pending")
    expect(cameraAccess({ granted: true, canAskAgain: true })).toBe("granted")
    expect(cameraAccess({ granted: false, canAskAgain: true })).toBe("ask")
    // iOS asks once: after a refusal only Settings can turn the camera back on.
    expect(cameraAccess({ granted: false, canAskAgain: false })).toBe("blocked")
  })

  test("the hint follows the scan", () => {
    expect(scannerHint({ busy: false, failed: false })).toContain("Point the camera")
    expect(scannerHint({ busy: true, failed: false, desktop: "Studio Mac" })).toBe("Connecting to Studio Mac…")
    expect(scannerHint({ busy: true, failed: true })).toBe("Connecting to your desktop…")
    expect(scannerHint({ busy: false, failed: true })).toContain("not a CADCAMFUN pairing code")
    expect(SCAN_RETRY_MS).toBeGreaterThan(1000)
  })
})

describe("manual pairing form", () => {
  test("builds a link the pairing contract accepts, with extra addresses raced", () => {
    const link = manualPairingLink({ address: "192.168.1.10:8443\n100.64.0.2:8443, https://mac.local:8443", token: ` ${token} `, fingerprint: fp.toUpperCase().match(/../g)!.join(":") })
    const pairing = parsePairingLink(link)
    expect(pairing.baseUrl).toBe("https://192.168.1.10:8443")
    expect(pairing.hosts).toEqual(["https://192.168.1.10:8443", "https://100.64.0.2:8443", "https://mac.local:8443"])
    expect(pairing.fingerprint).toBe(fp)
    expect(pairing.token).toBe(token)
  })

  test("accepts the colon-separated fingerprint the desktop prints", () => {
    expect(normalizeFingerprint("AB:CD:ef 01-23")).toBe("abcdef0123")
    expect(validateManualFields({ address: "https://a.local:8443", token, fingerprint: fp.match(/../g)!.join(":").toUpperCase() })).toEqual({})
  })

  test("names what is wrong with each field", () => {
    const empty = validateManualFields({ address: "", token: "", fingerprint: "" })
    expect(Object.keys(empty).sort()).toEqual(["address", "fingerprint", "token"])
    expect(hasErrors(empty)).toBe(true)

    expect(validateManualFields({ address: "http://a.local", token, fingerprint: fp }).address).toContain("https")
    expect(validateManualFields({ address: "https://a.local/path", token, fingerprint: fp }).address).toContain("no path")
    expect(validateManualFields({ address: "https://a.local", token: "short", fingerprint: fp }).token).toContain("incomplete")
    expect(validateManualFields({ address: "https://a.local", token: `${token} ${token}`, fingerprint: fp }).token).toContain("incomplete")
    expect(validateManualFields({ address: "https://a.local", token, fingerprint: "abcd" }).fingerprint).toContain("this one has 4")
    expect(validateManualFields({ address: "https://a.local", token, fingerprint: `zz${fp.slice(2)}` }).fingerprint).toContain("0–9")
    // One bad address among several is reported.
    expect(validateManualFields({ address: "https://a.local, http://b.local", token, fingerprint: fp }).address).toContain("https")
  })

  test("recognises a pasted pairing link and adds the scheme to bare hosts", () => {
    expect(looksLikePairingLink(`see cadcamfun://pair?host=x`)).toBe(true)
    expect(looksLikePairingLink("https://192.168.1.10:8443")).toBe(false)
    expect(withScheme("mac.local:8443")).toBe("https://mac.local:8443")
    expect(withScheme("https://mac.local")).toBe("https://mac.local")
    expect(splitOrigins("a,b  c\nd")).toEqual(["a", "b", "c", "d"])
  })
})

describe("connection banner", () => {
  const base = { connectionError: null, waiting: 0 }

  test("says nothing while online, unpaired or suspended", () => {
    for (const connectivity of ["online", "disconnected", "background"] as const) expect(connectionBanner({ ...base, connectivity })).toBeNull()
  })

  test("connecting is busy and has no action", () => {
    const model = connectionBanner({ ...base, connectivity: "connecting" })!
    expect(model.busy).toBe(true)
    expect(model.action).toBeNull()
    expect(model.tone).toBe("warning")
  })

  test("offline counts waiting messages without changing what VoiceOver says", () => {
    const none = connectionBanner({ ...base, connectivity: "offline" })!
    const two = connectionBanner({ ...base, connectivity: "offline", waiting: 2 })!
    const one = connectionBanner({ ...base, connectivity: "offline", waiting: 1 })!
    expect(none.label).toBe("Desktop offline")
    expect(two.label).toBe("Desktop offline · 2 messages waiting")
    expect(one.label).toBe("Desktop offline · 1 message waiting")
    expect(two.key).toBe(none.key)
    expect(two.announcement).toBe(none.announcement)
    expect(none.action?.kind).toBe("retry")
  })

  test("errors show the cause, a revoked phone points to Settings", () => {
    expect(connectionBanner({ connectivity: "error", connectionError: " Certificate changed ", waiting: 0 })!.label).toBe("Certificate changed")
    expect(connectionBanner({ ...base, connectivity: "error" })!.label).toBe("Connection failed")
    const revoked = connectionBanner({ ...base, connectivity: "auth-required" })!
    expect(revoked.tone).toBe("danger")
    expect(revoked.action?.kind).toBe("settings")
  })

  test("the status pill agrees with the banner on tone", () => {
    expect(connectivityStatus("online")).toEqual({ tone: "success", label: "Online" })
    expect(connectivityStatus("offline").tone).toBe("warning")
    expect(connectivityStatus("auth-required").tone).toBe("danger")
    expect(connectivityStatus("disconnected").label).toBe("Not paired")
  })

  test("cloud connectivity explains sign-in and internet recovery without claiming desktop revocation", () => {
    const auth = connectionBanner({ ...base, connectivity: "auth-required", cloud: true })
    expect(auth?.label).toContain("sign-in")
    expect(auth?.label).not.toContain("revoked")
    expect(auth?.action?.kind).toBe("settings")
    expect(connectionBanner({ ...base, connectivity: "offline", cloud: true })?.label).toBe("Cloud workspace offline")
    expect(connectionBanner({ ...base, connectivity: "connecting", cloud: true })?.announcement).toContain("cloud workspace")
  })
})

describe("crash report", () => {
  test("carries the build and the component trail, never a token", () => {
    const error = Object.assign(new Error("fetch https://mac:8443/x?token=secret-token failed with Bearer abc.def"), { stack: "Error: x\n at a\n at b" })
    const report = crashReport(error, "\n in Foo\n in Bar", "0.1.32", "ios 26.1", new Date("2026-10-26T10:00:00Z"))
    expect(report).toContain("CADCAMFUN 0.1.32 · ios 26.1 · 2026-10-26T10:00:00.000Z")
    expect(report).toContain("Components:")
    expect(report).not.toContain("secret-token")
    expect(report).not.toContain("abc.def")
  })

  test("summary is one trimmed line and restarts stop after the limit", () => {
    expect(crashSummary("")).toBe("An unexpected error occurred.")
    expect(crashSummary("a\n\n  b")).toBe("a b")
    expect(crashSummary("x".repeat(500)).length).toBe(238)
    expect(canRestart(MAX_RESTARTS - 1)).toBe(true)
    expect(canRestart(MAX_RESTARTS)).toBe(false)
  })
})
