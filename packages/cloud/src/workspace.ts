import { DurableObject } from "cloudflare:workers"
import { CheckpointStore } from "./checkpoint-store.ts"
import type { CheckpointManifest } from "./checkpoint-protocol.ts"
import { secretMatches, type CloudPrincipal } from "./owner.ts"

export interface CloudEnv {
  WORKSPACE: DurableObjectNamespace<CloudWorkspace>
  STATE: R2Bucket
  WORKSPACE_ID: string
  PUBLIC_ORIGIN: string
  IDENTITY_ISSUER: string
  /** Optional fixed owner; otherwise the private setup code binds the first verified account. */
  OWNER_SUBJECT?: string
  INTERNAL_TOKEN: string
  CHECKPOINT_TOKEN: string
  BOOTSTRAP_TOKEN?: string
}

/** One personal workspace, one active container, one durable manifest. Container disk is only a working copy. */
export class CloudWorkspace extends DurableObject<CloudEnv> {
  private starting: Promise<void> | undefined
  private readonly checkpoints: CheckpointStore

  constructor(ctx: DurableObjectState, env: CloudEnv) {
    super(ctx, env)
    const prefix = `${env.WORKSPACE_ID}/chunks/`
    this.checkpoints = new CheckpointStore({
      epoch: () => ctx.storage.get<string>("epoch"),
      manifest: async () => await ctx.storage.get<CheckpointManifest>("manifest") ?? null,
      publish: (epoch, expected, manifest) => ctx.storage.transaction(async (transaction) => {
        if (epoch !== await transaction.get<string>("epoch")) return false
        const current = await transaction.get<CheckpointManifest>("manifest")
        if (current?.revision === manifest.revision) return true
        if ((current?.revision ?? null) !== expected) return false
        await transaction.put("manifest", manifest)
        return true
      }),
    }, {
      exists: async (hash) => (await env.STATE.head(prefix + hash)) !== null,
      put: async (hash, bytes) => { await env.STATE.put(prefix + hash, bytes, { httpMetadata: { contentType: "application/octet-stream" } }) },
      get: async (hash) => (await env.STATE.get(prefix + hash))?.body ?? null,
    })
  }

  async owner(): Promise<CloudPrincipal | null> {
    if (this.env.OWNER_SUBJECT) return { subject: this.env.OWNER_SUBJECT, issuer: this.env.IDENTITY_ISSUER.replace(/\/$/, "") }
    return await this.ctx.storage.get<CloudPrincipal>("owner") ?? null
  }

  /** Caller identity is verified by the Worker before this internal RPC. Enrollment is atomic. */
  async authorize(principal: CloudPrincipal, setupCode?: string): Promise<boolean> {
    const current = await this.owner()
    if (current) return current.subject === principal.subject && current.issuer === principal.issuer
    if (!await secretMatches(setupCode, this.env.BOOTSTRAP_TOKEN)) return false
    return this.ctx.storage.transaction(async (transaction) => {
      const existing = await transaction.get<CloudPrincipal>("owner")
      if (existing) return existing.subject === principal.subject && existing.issuer === principal.issuer
      await transaction.put("owner", principal)
      return true
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith("/__cadcamfun/state/")) {
      if (!await secretMatches(request.headers.get("authorization")?.replace(/^Bearer /, ""), this.env.CHECKPOINT_TOKEN)) return new Response(null, { status: 401 })
      return this.checkpoints.fetch(request)
    }
    // The public Worker is the only caller of this binding; recheck ownership before any billed compute.
    const owner = await this.owner()
    if (!owner || request.headers.get("x-cadcamfun-cloud-subject") !== owner.subject) return new Response(null, { status: 403 })
    try {
      this.starting ??= this.startAndWait().finally(() => { this.starting = undefined })
      await this.starting
      const container = this.ctx.container
      if (!container) throw new Error("Workspace compute is unavailable")
      const headers = new Headers(request.headers)
      headers.delete("host")
      headers.delete("x-cadcamfun-cloud-subject")
      headers.set("x-cadcamfun-cloud-internal", this.env.INTERNAL_TOKEN)
      const path = url.pathname === "/api/cloud/enroll" ? "/internal/pair" : url.pathname
      const forwarded = new Request(`http://container${path}${url.search}`, { method: request.method, headers, body: request.body, redirect: "error", signal: request.signal })
      const response = await container.getTcpPort(8080).fetch(forwarded)
      if (response.headers.get("x-cadcamfun-durability-failed") === "1") await container.destroy()
      return response
    } catch {
      return Response.json({ message: "The cloud workspace could not start. Your saved checkpoint is retained." }, { status: 503, headers: { "retry-after": "5" } })
    }
  }

  private async startAndWait(): Promise<void> {
    const container = this.ctx.container
    if (!container) throw new Error("No Cloudflare Container is configured")
    const owner = await this.owner()
    if (!owner) throw new Error("Set up the workspace owner first")
    if (!this.env.INTERNAL_TOKEN || !this.env.CHECKPOINT_TOKEN) throw new Error("Workspace secrets are missing")
    if (!container.running) {
      const epoch = crypto.randomUUID()
      await this.ctx.storage.put("epoch", epoch)
      container.start({ enableInternet: true, env: {
        CADCAMFUN_RUNTIME: "server",
        CADCAMFUN_TOKEN: this.env.INTERNAL_TOKEN,
        CADCAMFUN_DATA_DIR: "/data",
        CADCAMFUN_MIGRATIONS_DIR: "/app/migrations",
        CADCAMFUN_GATEWAY_PORT: "8080",
        CADCAMFUN_PUBLIC_ORIGIN: this.env.PUBLIC_ORIGIN,
        CADCAMFUN_WORKSPACE_ID: this.env.WORKSPACE_ID,
        CADCAMFUN_IDENTITY_ISSUER: owner.issuer,
        CADCAMFUN_CLOUD_OWNER_SUBJECT: owner.subject,
        CADCAMFUN_CLOUD_INTERNAL_TOKEN: this.env.INTERNAL_TOKEN,
        CADCAMFUN_CLOUD_CHECKPOINT_URL: `${this.env.PUBLIC_ORIGIN}/__cadcamfun/state`,
        CADCAMFUN_CLOUD_CHECKPOINT_TOKEN: this.env.CHECKPOINT_TOKEN,
        CADCAMFUN_CLOUD_EPOCH: epoch,
      } })
    }
    await container.setInactivityTimeout(10 * 60 * 1000)
    for (let attempt = 0; attempt < 120; attempt++) {
      try {
        const response = await container.getTcpPort(8080).fetch("http://container/internal/ready", {
          headers: { "x-cadcamfun-cloud-internal": this.env.INTERNAL_TOKEN }, signal: AbortSignal.timeout(2_000),
        })
        await response.body?.cancel()
        if (response.ok) return
      } catch { /* The gateway is not ready until migrations and checkpoint restoration finish. */ }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    await container.destroy()
    throw new Error("Cloud workspace startup timed out")
  }
}
