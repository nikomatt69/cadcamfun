import { Database, schema } from "@cadcamfun/db"
import { Context, Effect } from "effect"
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { parsePairingGrant } from "../../mobile/lib/pairing.ts"
import { companionProof, hashToken } from "../src/services/companion-gateway.ts"
import { makeApp, TOKEN } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app?.dispose() })

describe("account-bound phone pairing", () => {
  test("the QR is single-use, stored as a hash, and the phone acts as the signed-in account", async () => {
    expect((await app.call("/api/auth/signup", { method: "POST", json: { email: "ada@example.com", name: "Ada", password: "password1", confirmPassword: "password1" } })).status).toBe(201)
    const signin = await app.call("/api/auth/signin-direct", { method: "POST", json: { email: "ada@example.com", password: "password1" } })
    expect(signin.status).toBe(200)
    const session = signin.body.token as string
    const ada = await app.call("/api/projects", { method: "POST", json: { name: "Ada part" }, headers: { "x-session-token": session } })
    expect(ada.status).toBe(201)
    const local = await app.call("/api/projects", { method: "POST", json: { name: "Local part" } })
    expect(local.status).toBe(201)

    const paired = await app.call("/api/companion/pair", { method: "POST", json: { name: "Ada phone" }, headers: { "x-session-token": session } })
    expect(paired.status).toBe(201)
    expect(paired.body.link).not.toContain("token=")
    const grant = parsePairingGrant(paired.body.link)
    const db = Context.get(await app.database(), Database)
    const stored = await Effect.runPromise(db.query("pairing.row", (database) => database.select().from(schema.companionPairingCodeTable).all()))
    expect(stored).toHaveLength(1)
    expect(stored[0]!.codeHash).toBe(hashToken(grant.code))
    expect(JSON.stringify(stored)).not.toContain(grant.code)
    expect((await app.call("/api/companion")).body.devices).toEqual([])

    const redeemed = await app.call("/api/companion/redeem", { method: "POST", json: { code: grant.code } })
    expect(redeemed.status).toBe(201)
    expect(redeemed.body.user.email).toBe("ada@example.com")
    expect(redeemed.body.token).not.toBe(grant.code)
    expect((await app.call("/api/companion/redeem", { method: "POST", json: { code: grant.code } })).status).toBe(400)

    const devices = await Effect.runPromise(db.query("device.row", (database) => database.select().from(schema.companionDeviceTable).all()))
    expect(devices).toHaveLength(1)
    expect(devices[0]!.hash).toBe(hashToken(redeemed.body.token))
    expect(devices[0]!.userId).toBe(redeemed.body.user.id)
    expect(JSON.stringify(devices)).not.toContain(redeemed.body.token)

    const proof = companionProof(redeemed.body.id, redeemed.body.user.id, TOKEN)
    const phone = await app.call("/api/projects", { headers: {
      "x-cadcamfun-companion-device": redeemed.body.id,
      "x-cadcamfun-companion-user": redeemed.body.user.id,
      "x-cadcamfun-companion-proof": proof,
      "x-identity-token": "not-a-jwt",
      "x-session-token": session,
    } })
    expect(phone.status).toBe(200)
    expect(phone.body.map((row: { name: string }) => row.name)).toEqual(["Ada part"])

    const ignored = await app.call("/api/projects", { headers: { "x-cadcamfun-companion-user": redeemed.body.user.id } })
    expect(ignored.body.map((row: { name: string }) => row.name)).toContain("Local part")
    expect(ignored.body.map((row: { name: string }) => row.name)).not.toContain("Ada part")

    const expired = await app.call("/api/companion/pair", { method: "POST", json: { name: "Late phone" }, headers: { "x-session-token": session } })
    const late = parsePairingGrant(expired.body.link)
    await Effect.runPromise(db.query("pairing.expire", (database) => database.update(schema.companionPairingCodeTable).set({ expiresAt: new Date(0) }).where(eq(schema.companionPairingCodeTable.codeHash, hashToken(late.code))).run()))
    expect((await app.call("/api/companion/redeem", { method: "POST", json: { code: late.code } })).status).toBe(400)

    expect((await app.call(`/api/companion/devices/${redeemed.body.id}`, { method: "DELETE" })).status).toBe(200)
    expect((await app.call("/api/projects", { headers: {
      "x-cadcamfun-companion-device": redeemed.body.id,
      "x-cadcamfun-companion-user": redeemed.body.user.id,
      "x-cadcamfun-companion-proof": proof,
    } })).status).toBe(401)
  }, 30_000)
})
