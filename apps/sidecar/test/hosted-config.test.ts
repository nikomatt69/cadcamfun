import { describe, expect, test } from "bun:test"
import { ConfigProvider, Context, Effect, Layer, Redacted } from "effect"
import { AppConfigService } from "../src/config.ts"

const base = { CADCAMFUN_TOKEN: "private-test-token", CADCAMFUN_DATA_DIR: "/private/tmp/cadcamfun-config-test" }
const hosted = {
  ...base,
  CADCAMFUN_RUNTIME: "server",
  CADCAMFUN_PUBLIC_ORIGIN: "https://cloud.example.com",
  CADCAMFUN_WORKSPACE_ID: "workspace_123",
  CADCAMFUN_CLOUD_OWNER_SUBJECT: "owner-subject",
  CADCAMFUN_CLOUD_INTERNAL_TOKEN: "private-coordinator-token-long-enough",
}
const load = (values: Record<string, string>) => Effect.runPromise(Effect.gen(function*() {
  const context = yield* Layer.build(AppConfigService.layer)
  return Context.get(context, AppConfigService)
}).pipe(Effect.scoped, Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord(values)))))

describe("hosted runtime configuration", () => {
  test("desktop remains the default and does not require cloud credentials", async () => {
    const config = await load(base)
    expect(config.runtime).toBe("desktop")
    expect(config.publicOrigin).toBeUndefined()
    expect(config.cloudOwnerSubject).toBeUndefined()
  })

  test("server mode requires an explicit public origin, stable workspace and owner", async () => {
    const config = await load(hosted)
    expect(config.runtime).toBe("server")
    expect(config.gatewayPort).toBe(8080)
    expect(config.workspaceId).toBe("workspace_123")
    expect(Redacted.value(config.cloudInternalToken ?? Redacted.make(""))).toBe(hosted.CADCAMFUN_CLOUD_INTERNAL_TOKEN)
    expect(JSON.stringify(config)).not.toContain(hosted.CADCAMFUN_CLOUD_INTERNAL_TOKEN)
    for (const key of ["CADCAMFUN_PUBLIC_ORIGIN", "CADCAMFUN_WORKSPACE_ID", "CADCAMFUN_CLOUD_OWNER_SUBJECT", "CADCAMFUN_CLOUD_INTERNAL_TOKEN"] as const) {
      const invalid: Record<string, string> = { ...hosted }
      delete invalid[key]
      await expect(load(invalid)).rejects.toThrow(key)
    }
  })

  test("server refuses insecure or credential-bearing public URLs and invalid ports", async () => {
    for (const origin of ["http://cloud.example.com", "https://user:password@cloud.example.com", "https://cloud.example.com/path", "https://cloud.example.com?token=secret", "not-a-url"]) await expect(load({ ...hosted, CADCAMFUN_PUBLIC_ORIGIN: origin })).rejects.toThrow("HTTPS origin")
    for (const port of ["0", "443", "65536"]) await expect(load({ ...hosted, CADCAMFUN_GATEWAY_PORT: port })).rejects.toThrow("GATEWAY_PORT")
    await expect(load({ ...hosted, CADCAMFUN_CLOUD_INTERNAL_TOKEN: "short" })).rejects.toThrow("INTERNAL_TOKEN")
  })
})
