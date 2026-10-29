import { describe, expect, test } from "bun:test"
import { PairingError, desktopLabel, firstReachable, pairingCandidates, pairingIdentity, pairingScope, parsePairingLink, validatePairing } from "../lib/pairing"

const link = (host = "https://192.168.1.7:8443", token = "0123456789abcdef", fp = "a".repeat(64), name = "MacBook", hosts?: string) => {
  const params = new URLSearchParams({ host, token, fp, name })
  if (hosts) params.set("hosts", hosts)
  return `cadcamfun://pair?${params}`
}

describe("parsePairingLink", () => {
  test("parses a well-formed pairing link", () => {
    const p = parsePairingLink(link())
    expect(p.baseUrl).toBe("https://192.168.1.7:8443")
    expect(p.token).toBe("0123456789abcdef")
    expect(p.fingerprint).toBe("a".repeat(64))
    expect(p.name).toBe("MacBook")
    expect(p.hosts).toEqual(["https://192.168.1.7:8443"])
  })

  test("uppercases the fingerprint", () => {
    expect(parsePairingLink(link(undefined, undefined, "ABCD".repeat(16))).fingerprint).toBe("abcd".repeat(16))
  })

  test("falls back to the hostname as the name", () => {
    const url = new URL(`cadcamfun://pair?${new URLSearchParams({ host: "https://desk.local:8443", token: "0123456789abcdef", fp: "a".repeat(64) })}`)
    expect(parsePairingLink(url.toString()).name).toBe("desk.local")
  })

  test("rejects a non-cadcamfun scheme", () => {
    expect(() => parsePairingLink("https://example.com")).toThrow(PairingError)
  })

  test("rejects an http host", () => {
    expect(() => parsePairingLink(link("http://192.168.1.7:8080"))).toThrow(/https/)
  })

  test("rejects a short token", () => {
    expect(() => parsePairingLink(link(undefined, "short"))).toThrow(/token/i)
  })

  test("rejects a bad fingerprint", () => {
    expect(() => parsePairingLink(link(undefined, undefined, "zz"))).toThrow(/fingerprint/i)
  })

  test("extracts a link embedded in surrounding text (a paste)", () => {
    const text = `Scan or paste: ${link()}  — this pairs your phone`
    expect(parsePairingLink(text).baseUrl).toBe("https://192.168.1.7:8443")
  })

  test("parses extra Wi-Fi, hotspot and Tailscale hosts from the QR", () => {
    const p = parsePairingLink(link("https://192.168.1.7:8443", undefined, undefined, undefined, "https://172.20.10.4:8443,https://100.64.96.71:8443"))
    expect(p.hosts).toEqual(["https://192.168.1.7:8443", "https://172.20.10.4:8443", "https://100.64.96.71:8443"])
  })

  test("skips a malformed extra host instead of rejecting the whole QR", () => {
    const p = parsePairingLink(link("https://192.168.1.7:8443", undefined, undefined, undefined, "http://bad,https://172.20.10.4:8443"))
    expect(p.hosts).toEqual(["https://192.168.1.7:8443", "https://172.20.10.4:8443"])
  })
})

test("rejects credential-bearing URLs, unexpected URL paths and header injection", () => {
  for (const host of ["https://user:password@desktop.local", "https://desktop.local/private", "https://desktop.local?token=x", "https://desktop.local#fragment"]) expect(() => parsePairingLink(link(host))).toThrow(PairingError)
  expect(() => parsePairingLink(link(undefined, "abcdefghijklmnop\r\nInjected"))).toThrow(PairingError)
})

test("persisted pairing credentials are fully validated before connecting", () => {
  const pairing = parsePairingLink(link())
  expect(validatePairing(pairing)).toEqual(pairing)
  expect(() => validatePairing({ baseUrl: pairing.baseUrl, fingerprint: pairing.fingerprint })).toThrow(PairingError)
  expect(() => validatePairing({ ...pairing, token: "missing" })).toThrow(PairingError)
  expect(() => validatePairing({ ...pairing, baseUrl: "http://desktop.local" })).toThrow(PairingError)
})

test("a pairing saved without hosts still validates", () => {
  const pairing = parsePairingLink(link())
  const { hosts: _ignored, ...legacy } = pairing
  expect(validatePairing(legacy).hosts).toEqual([pairing.baseUrl])
})

test("pairingCandidates tries last-known-good first, then extras", () => {
  const pairing = parsePairingLink(link("https://172.20.10.4:8443", undefined, undefined, undefined, "https://192.168.1.7:8443,https://100.64.96.71:8443"))
  expect(pairingCandidates(pairing).map((p) => p.baseUrl)).toEqual([
    "https://172.20.10.4:8443",
    "https://192.168.1.7:8443",
    "https://100.64.96.71:8443",
  ])
})

test("firstReachable keeps the first host that answers and aborts the rest", async () => {
  const pairing = parsePairingLink(link("https://192.168.1.7:8443", undefined, undefined, undefined, "https://172.20.10.4:8443"))
  const seen: string[] = []
  const { pairing: won } = await firstReachable(pairing, async (candidate, signal) => {
    seen.push(candidate.baseUrl)
    if (candidate.baseUrl.includes("172.20.10.4")) {
      await new Promise((resolve) => setTimeout(resolve, 20))
      if (signal.aborted) throw new Error("aborted")
      return "hotspot"
    }
    throw new Error("wifi down")
  })
  expect(won.baseUrl).toBe("https://172.20.10.4:8443")
  expect(seen).toContain("https://192.168.1.7:8443")
})

test("desktopLabel uses the host, not the phone name in the QR", () => {
  expect(desktopLabel(parsePairingLink(link()))).toBe("192.168.1.7:8443")
})

const cloudLink = (changes: Record<string, string> = {}) => `cadcamfun://pair?${new URLSearchParams({ host: "https://cloud.cadcam.fun", token: "0123456789abcdef", mode: "cloud", workspace: "workspace-123", name: "Cloud", ...changes })}`

test("hosted pairing explicitly selects HTTPS trust and a stable workspace identity", () => {
  const cloud = parsePairingLink(cloudLink())
  expect(cloud.mode).toBe("cloud")
  expect(cloud.workspaceId).toBe("workspace-123")
  expect(cloud.fingerprint).toBe("")
  expect(validatePairing(cloud)).toEqual(cloud)
  expect(pairingIdentity(cloud)).toBe(pairingIdentity(parsePairingLink(cloudLink({ name: "Renamed after a certificate renewal" }))))
  expect(pairingIdentity(cloud)).not.toBe(pairingIdentity(parsePairingLink(cloudLink({ workspace: "another-workspace" }))))
  expect(pairingIdentity(cloud)).not.toBe(pairingIdentity(parsePairingLink(cloudLink({ host: "https://another.cadcam.fun" }))))
  expect(pairingScope(cloud, "first-account")).not.toBe(pairingScope(cloud, "second-account"))
  expect(pairingScope(cloud, "first-account")).not.toBe(pairingScope(cloud))
  expect(pairingIdentity(parsePairingLink(link()))).toBe("a".repeat(64))
})

test("cloud pairing cannot silently downgrade a local pin or leak a grant to another origin", () => {
  const invalid: Record<string, string>[] = [{ workspace: "" }, { workspace: "../private" }, { mode: "unknown" }, { fp: "a".repeat(64) }, { hosts: "https://another.cadcam.fun" }, { host: "http://cloud.cadcam.fun" }]
  for (const changes of invalid) {
    expect(() => parsePairingLink(cloudLink(changes))).toThrow(PairingError)
  }
  expect(() => parsePairingLink(link(undefined, undefined, ""))).toThrow(/fingerprint/i)
  const cloud = parsePairingLink(cloudLink())
  expect(() => validatePairing({ ...cloud, mode: undefined })).toThrow(PairingError)
  expect(() => validatePairing({ ...cloud, workspaceId: undefined })).toThrow(PairingError)
})
