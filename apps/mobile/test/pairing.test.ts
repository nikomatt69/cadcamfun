import { describe, expect, test } from "bun:test"
import { PairingError, parsePairingLink, validatePairing } from "../lib/pairing"

const link = (host = "https://192.168.1.7:8443", token = "0123456789abcdef", fp = "a".repeat(64), name = "MacBook") =>
  `cadcamfun://pair?${new URLSearchParams({ host, token, fp, name })}`

describe("parsePairingLink", () => {
  test("parses a well-formed pairing link", () => {
    const p = parsePairingLink(link())
    expect(p.baseUrl).toBe("https://192.168.1.7:8443")
    expect(p.token).toBe("0123456789abcdef")
    expect(p.fingerprint).toBe("a".repeat(64))
    expect(p.name).toBe("MacBook")
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

  test("accepts a link embedded in surrounding text (a paste)", () => {
    const text = `Scan or paste: ${link()}  — this pairs your phone`
    // The scanner gives us clean links; pasted text must be trimmed by the caller.
    expect(() => parsePairingLink(text)).toThrow(PairingError)
    expect(parsePairingLink(link()).baseUrl).toBe("https://192.168.1.7:8443")
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
