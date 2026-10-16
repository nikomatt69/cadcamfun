import { exportJWK, generateKeyPair } from "jose"
import { timingSafeEqual } from "node:crypto"

const encoder = new TextEncoder()

export function base64url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

export function randomDigits(length: number): string {
  const output: string[] = []
  const limit = 256 - (256 % 10)
  while (output.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length - output.length))
    for (const byte of bytes) {
      if (byte < limit) output.push(String(byte % 10))
      if (output.length === length) break
    }
  }
  return output.join("")
}

export async function sha256(value: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))))
}

export async function secureEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ])
  return timingSafeEqual(new Uint8Array(leftHash), new Uint8Array(rightHash))
}

export async function createSigningJwks(kid: string): Promise<{ privateJwk: JsonWebKey; publicJwk: JsonWebKey }> {
  const pair = await generateKeyPair("ES256", { extractable: true })
  const [privateJwk, publicJwk] = await Promise.all([exportJWK(pair.privateKey), exportJWK(pair.publicKey)])
  privateJwk.kid = kid
  privateJwk.alg = "ES256"
  privateJwk.use = "sig"
  publicJwk.kid = kid
  publicJwk.alg = "ES256"
  publicJwk.use = "sig"
  return { privateJwk, publicJwk }
}

export function createID(prefix: string, now = Date.now()): string {
  const time = now.toString(36).padStart(10, "0")
  return `${prefix}_${time}${randomToken(16)}`
}
