import { createRemoteJWKSet, jwtVerify } from "jose"

export interface CloudPrincipal { readonly subject: string; readonly issuer: string }
const issuers = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

export const verifyCloudIdentity = async (request: Request, issuer: string): Promise<CloudPrincipal> => {
  const token = request.headers.get("x-identity-token")
  if (!token || token.length > 16_384) throw new Error("Sign in to your CADCAMFUN account")
  const normalized = new URL(issuer)
  if (normalized.protocol !== "https:" || normalized.username || normalized.password || normalized.search || normalized.hash || normalized.pathname !== "/") throw new Error("Invalid identity issuer")
  const origin = normalized.origin
  let keys = issuers.get(origin)
  if (!keys) { keys = createRemoteJWKSet(new URL(`${origin}/.well-known/jwks.json`), { timeoutDuration: 10_000 }); issuers.set(origin, keys) }
  const { payload } = await jwtVerify(token, keys, {
    issuer: origin, audience: "cadcamfun-api", algorithms: ["ES256"], requiredClaims: ["sub", "exp", "iat", "email", "client_id"],
  })
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 512 ||
    !["cadcamfun-desktop", "cadcamfun-mobile"].includes(String(payload.client_id))) throw new Error("Invalid identity account")
  return { subject: payload.sub, issuer: origin }
}

export const secretMatches = async (received: string | null | undefined, expected: string | undefined): Promise<boolean> => {
  if (!received || !expected || expected.length < 32) return false
  const encode = (value: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  const [a, b] = await Promise.all([encode(received), encode(expected)])
  const first = new Uint8Array(a), second = new Uint8Array(b)
  let different = 0
  for (let i = 0; i < first.length; i++) different |= (first[i] ?? 0) ^ (second[i] ?? 0)
  return different === 0
}
