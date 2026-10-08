/**
 * The generated Promise SDK (`@cadcamfun/api/sdk`, nikcli-style: `sdk.projects.create(...)`) against the real
 * handlers, in process. Proves the bearer token travels through `ClientOptions.headers` and that declared errors
 * come back as the contract's tagged bodies.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { CadCam, ClientError } from "@cadcamfun/api/sdk"
import { makeApp, TOKEN } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let sdk: ReturnType<typeof CadCam.make>
beforeAll(async () => {
  app = await makeApp()
  sdk = CadCam.make({ baseUrl: "http://sidecar.test", fetch: app.transport, headers: { authorization: `Bearer ${TOKEN}` } })
})
afterAll(async () => { await app.dispose() })

describe("Promise SDK generated from the contract", () => {
  test("projects: create, list, rename, remove", async () => {
    const created = await sdk.projects.create({ name: "Gearbox", description: "Housing" })
    expect(created.name).toBe("Gearbox")
    expect((await sdk.projects.list()).map((project) => project.name)).toContain("Gearbox")
    const renamed = await sdk.projects.update({ id: created.id, name: "Gearbox v2" })
    expect(renamed.name).toBe("Gearbox v2")
    await sdk.projects.remove({ id: created.id })
    expect((await sdk.projects.list()).some((project) => project.id === created.id)).toBe(false)
  })

  test("a declared error is thrown as the contract's tagged body", async () => {
    const error = await sdk.projects.get({ id: "does-not-exist" }).then(() => undefined, (cause: unknown) => cause)
    expect(error).toMatchObject({ _tag: "NotFound" })
  })

  test("a request without the token is refused as the contract says", async () => {
    const anonymous = CadCam.make({ baseUrl: "http://sidecar.test", fetch: app.transport })
    const error = await anonymous.projects.list().then(() => undefined, (cause: unknown) => cause)
    expect(error).toMatchObject({ _tag: "Unauthorized" })
  })

  test("a transport failure is a ClientError, not a hang", async () => {
    const broken = CadCam.make({ baseUrl: "http://sidecar.test", fetch: Object.assign(() => Promise.reject(new Error("offline")), { preconnect: () => {} }) as typeof fetch })
    const error = await broken.projects.list().then(() => undefined, (cause: unknown) => cause)
    expect(error).toBeInstanceOf(ClientError)
    expect((error as ClientError).reason).toBe("Transport")
  })
})
