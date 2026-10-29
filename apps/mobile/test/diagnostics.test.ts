import { expect, test } from "bun:test"
import { buildDiagnostics, formatFingerprint, originOnly, shortFingerprint } from "../lib/diagnostics"

const fingerprint = "ab".repeat(32)

test("the support report never carries the pairing token or full URLs", () => {
  const report = buildDiagnostics({
    appVersion: "6.0.0", buildNumber: "12", platform: "ios", osVersion: "26.1",
    desktop: { name: "Studio Mac", baseUrl: "https://192.168.1.4:8443/api?token=secret-token", hosts: ["https://192.168.1.4:8443", "https://100.64.0.2:8443"], fingerprint },
    connectivity: "error", connectionError: "401 Bearer secret-token rejected for https://x/?token=secret-token&a=1",
    ai: { configured: true, host: "nikcli", tools: 42 }, offlineQueueCount: 2,
    security: { biometricsEnabled: true, lockAfterSeconds: 60, privacyCover: true }, now: new Date("2026-10-17T10:00:00Z"),
  })
  expect(report).not.toContain("secret-token")
  expect(report).toContain("Address: https://192.168.1.4:8443")
  expect(report).toContain("Other addresses: https://100.64.0.2:8443")
  expect(report).toContain("Assistant: configured · host nikcli · 42 tools")
  expect(report).toContain("App lock: on (60s grace) · privacy cover on")
  expect(report).toContain("Certificate: ABABAB…ABABAB")
})

test("fingerprints are grouped for side-by-side comparison", () => {
  const lines = formatFingerprint(fingerprint).split("\n")
  expect(lines).toHaveLength(4)
  expect(lines[0]).toBe("AB:AB:AB:AB:AB:AB:AB:AB")
  expect(formatFingerprint("")).toBe("")
  expect(shortFingerprint("abc")).toBe("ABC")
  expect(originOnly("cadcamfun://pair?token=x")).toBe("(withheld)")
  expect(originOnly("not a url")).toBe("(withheld)")
})

test("cloud diagnostics identify verified HTTPS and stable workspace instead of an empty certificate", () => {
  const report = buildDiagnostics({
    appVersion: "6.0.0", platform: "ios", osVersion: "27.0",
    desktop: { name: "Cloud", baseUrl: "https://cloud.cadcam.fun", fingerprint: "", mode: "cloud", workspaceId: "workspace-123" },
    connectivity: "online", offlineQueueCount: 0, security: { biometricsEnabled: false, lockAfterSeconds: 60, privacyCover: true }, now: new Date("2026-10-29T10:00:00Z"),
  })
  expect(report).toContain("Transport: verified HTTPS")
  expect(report).toContain("Cloud workspace: workspace-123")
  expect(report).not.toContain("Certificate:")
})
