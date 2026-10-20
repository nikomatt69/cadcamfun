import { withHeartbeat, CADCAM_SKILLS, MAX_USER_SKILLS, SKILL_NAME_PATTERN, createUserSkillStore, parseSkillMarkdown, skillProblems, AiAborted, AiConfigError, AiCredentials, AiHost, AiService, analyzeGcode as analyze, isBuiltinProviderId, isProviderId, isolatedPaths, readModIndex, removeMod, replyHostPermission, setModEnabled, type ProviderEntry, type ProviderId } from "@cadcamfun/ai"
import {
  AiBadRequest, AiFailure, AiNotFound, Api, BadRequest, CurrentUser, GcodeActionError, GcodeActionFailure, InternalError, MAX_SESSION_PAGE, StreamChatBody
} from "@cadcamfun/api"
import { Effect, Option, Redacted, Stream } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Database, schema } from "@cadcamfun/db"
import { eq } from "drizzle-orm"
import { join } from "node:path"
import { AppConfigService } from "../config.ts"
import { KvStore } from "../services/kv.ts"
import { ActingUser } from "../services/acting-user.ts"
import { AssistantTurns } from "../services/assistant-turns.ts"
import { LiveEvents } from "../services/live-events.ts"
import { AiActions } from "../services/ai.ts"
import { ToolRegistry } from "@cadcamfun/ai"
import { AiPlugins } from "../services/ai-plugins.ts"
import { BridgeTokens } from "../services/bridge-tokens.ts"
import { HttpServerRequest } from "effect/unstable/http"
import { ProjectRepo } from "../repos/project-repo.ts"
import { DrawingRepo } from "../repos/drawing-repo.ts"
import { makeAiContext } from "../services/ai-context.ts"
import { HISTORY_SCAN_LIMIT, historyPage, sessionSummaries, type HostHistoryMessage, type HostHistorySession } from "../services/assistant-history.ts"

const fail = (message: string) => (e: unknown) =>
  Effect.logError(message, e).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))
/**
 * A provider the settings may store a key for: syntactically valid *and* present in the
 * catalogue the host reports. Checking both means a typo can never become a key nobody
 * reads (it would sit in memory, never reach the host, and show as "configured").
 */
const knownProvider = (value: string | undefined, catalogue: ReadonlyArray<ProviderEntry>): value is ProviderId =>
  typeof value === "string" && isProviderId(value) && catalogue.some((p) => p.id === value)
const text = (content: unknown): string =>
  typeof content === "string" ? content
    : Array.isArray(content) ? content.map((p) => (typeof p === "string" ? p : (p as { text?: string }).text ?? "")).join("") : ""
/** `limit` of a history route: a decimal integer from 1 to `MAX_SESSION_PAGE`, or the default. */
const pageSize = (value: string | undefined, fallback: number): number | undefined =>
  value === undefined ? fallback : /^\d{1,3}$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_SESSION_PAGE ? Number(value) : undefined
/** Host message and session ids are short url-safe tokens (`msg_…`, `ses_…`). */
const HOST_ID = /^[A-Za-z0-9_-]{1,128}$/
const aiError = (e: { _tag: string; message?: string }) =>
  e._tag === "AiAborted" ? "The request was cancelled." : (e.message ?? "AI request failed")

export const AiHandlers = HttpApiBuilder.group(Api, "ai", Effect.fn(function*(handlers) {
  const ai = yield* AiService
  const credentials = yield* AiCredentials
  const actingUser = yield* ActingUser
  const host = yield* Effect.serviceOption(AiHost)
  const plugins = yield* AiPlugins
  const registry = yield* ToolRegistry
  const actions = yield* AiActions
  const bridgeTokens = yield* BridgeTokens
  const turns = yield* AssistantTurns
  const events = yield* LiveEvents
  /** The scoped grant of the bearer on this request, or undefined for the application's own token. */
  const bridgeGrant = Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const bearer = /^Bearer\s+(.+)$/i.exec(request.headers["authorization"] ?? "")?.[1]
    return bearer === undefined ? undefined : yield* bridgeTokens.grantOf(bearer)
  })
  const { query } = yield* Database
  const kv = yield* KvStore
  const appConfig = yield* AppConfigService
  const projects = yield* ProjectRepo
  const drawings = yield* DrawingRepo
  actingUser.configureDirectory(join(appConfig.dataDir, "ai", "session-owners"))
  const checkProject = Effect.fn("AiHttp.checkProject")(function*(projectId?: string) {
    const actor = yield* CurrentUser
    if (projectId === undefined || projectId === "default") return
    if (projectId.trim() === "") return yield* new BadRequest({ message: "projectId is required" })
    const access = yield* projects.find(actor.id, projectId).pipe(Effect.mapError(() => new InternalError({ message: "Unable to verify project access" })))
    if (!access) return yield* new BadRequest({ message: "Project not found or inaccessible" })
  })
  /** A turn's drawing must belong to the turn's (accessible) project; checked before admission, so a turn never starts on another. */
  const checkDrawing = Effect.fn("AiHttp.checkDrawing")(function*(projectId: string | undefined, drawingId: string | undefined) {
    if (drawingId === undefined) return
    if (projectId === undefined || projectId === "default" || projectId.trim() === "") return yield* new BadRequest({ message: "A drawing is always named with its project" })
    const actor = yield* CurrentUser
    const drawing = yield* drawings.find(actor.id, drawingId).pipe(Effect.mapError(() => new InternalError({ message: "Unable to verify the drawing" })))
    if (!drawing || drawing.project.id !== projectId) return yield* new BadRequest({ message: "Drawing not found in this project" })
  })
  const controlProject = Effect.fn("AiHttp.controlProject")(function*(sessionId: string, projectId?: string) {
    const actor = yield* CurrentUser
    const owner = yield* Effect.tryPromise({ try: () => actingUser.owner(sessionId), catch: () => new BadRequest({ message: "Unable to verify session owner" }) })
    if (!owner || owner.userId !== actor.id || (projectId !== undefined && owner.projectId !== projectId)) {
      return yield* new BadRequest({ message: "Session not found or inaccessible" })
    }
    yield* checkProject(owner.projectId)
    return owner.projectId
  })
  /** One chat turn exactly as `chat/stream` runs it: checks, context, model, failures as an `error` event. */
  const turnOf = Effect.fn("AiHttp.turnOf")(function*(payload: typeof StreamChatBody.Type) {
    if (!payload.message || !payload.message.trim()) return yield* new BadRequest({ message: "Message is required" })
    // The tools of this turn act as the account that sent it (the signed-in user, or the local profile).
    const actor = yield* CurrentUser
    yield* checkProject(payload.projectId)
    yield* checkDrawing(payload.projectId, payload.drawingId)
    if (payload.sessionId) {
      const owner = yield* Effect.tryPromise({ try: () => actingUser.owner(payload.sessionId!), catch: () => new BadRequest({ message: "Unable to verify session owner" }) })
      if (owner && (owner.userId !== actor.id || owner.projectId !== (payload.projectId ?? "default"))) return yield* new BadRequest({ message: "Session not found or inaccessible" })
    }
    const context = yield* contextFor(payload)
    let announced = false
    return ai.chat({
      message: payload.message,
      admitSession: (projectId, sessionId) => actingUser.bind(projectId, sessionId, actor, payload.message, payload.drawingId),
      ...(payload.permissionMode ? { permissionMode: payload.permissionMode } : {}),
      ...(payload.agent ? { agent: payload.agent } : {}),
      ...(payload.mode ? { mode: payload.mode } : {}),
      ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
      ...(payload.projectId ? { projectId: payload.projectId } : {}),
      ...(context ? { context } : {}),
      ...(payload.model ? { model: payload.model } : {}),
      ...(payload.attachments && payload.attachments.length > 0 ? { attachments: payload.attachments } : {})
    }).pipe(Stream.catch((e) => Stream.succeed({
      type: "error" as const, sessionId: payload.sessionId ?? "", code: e._tag === "AiConfigError" ? "config" as const : e._tag === "AiAborted" ? "aborted" as const : "provider" as const,
      message: aiError(e)
    })), Stream.tap((event) => {
      if (!payload.projectId || !event.sessionId) return Effect.void
      const finished = event.type === "done" || event.type === "error"
      if (announced && !finished) return Effect.void
      announced = true
      return events.publish({ type: "ai.session", projectId: payload.projectId, sessionId: event.sessionId,
        phase: finished ? "finished" : "started", at: new Date().toISOString() })
    }))
  })
  const skillStore = createUserSkillStore(join(appConfig.dataDir, "ai", "skills"))
  const skillInfos = Effect.promise(async () => {
    const user = await skillStore.list()
    return [
      ...CADCAM_SKILLS.map((s) => ({ name: s.name, description: s.description, builtIn: true, category: s.category })),
      ...user.map((s) => ({ name: s.name, description: s.description, builtIn: false, category: "user" }))
    ]
  })
  /** Live hosts re-read the skills; false when there is no embedded host (the next start loads them). */
  const reloadSkills = Option.isSome(host)
    ? host.value.runtime.reloadSkills().pipe(Effect.as(true), Effect.catch(() => Effect.succeed(false)))
    : Effect.succeed(false)

  const extensionAccess = Effect.gen(function*() {
    if (yield* bridgeGrant) return yield* new BadRequest({ message: "Extension management requires the application connection" })
  })
  const extensionProject = Effect.fn("AiHttp.extensionProject")(function*(projectId: string) {
    yield* extensionAccess
    const actor = yield* CurrentUser
    const access = yield* projects.find(actor.id, projectId).pipe(Effect.mapError(() => new InternalError({ message: "Unable to verify project access" })))
    if (!access || access.project.ownerId !== actor.id) return yield* new BadRequest({ message: "Only the project owner can configure MCP connections" })
    if (Option.isNone(host)) return yield* new BadRequest({ message: "MCP connections require the nikcli host" })
    return host.value.runtime
  })
  const pluginList = plugins.installed.pipe(Effect.map((plugins) => ({ plugins })), Effect.mapError((error) => new InternalError({ message: error.message })))
  /** Live hosts re-read the mods; the store is on disk either way, so this failing only delays it to the next host start. */
  const refreshMods = Option.isSome(host)
    ? host.value.runtime.reloadMods().pipe(Effect.mapError((error) => new InternalError({ message: error.message })))
    : Effect.void
  const refreshPluginTools = Effect.gen(function*() {
    yield* registry.reload
    if (Option.isSome(host)) yield* host.value.runtime.reloadTools().pipe(Effect.mapError((error) => new InternalError({ message: error.message })))
    // A plugin toggle also changes which plugin mods the configuration declares.
    yield* refreshMods
  })
  /**
   * The mods the Extensions panel lists: the app-owned store's records plus the mods enabled plugins ship. A plugin's mod
   * is host-managed — it follows the plugin and is neither toggled nor removed here.
   */
  const modsList = Effect.sync(() => ({
    mods: [
      ...readModIndex(isolatedPaths(appConfig.dataDir)).map((record) => ({
        id: record.id, name: record.name, description: record.description, enabled: record.enabled, origin: record.origin
      })),
      ...plugins.modList().map((mod) => ({
        id: mod.id, name: mod.title, description: mod.description, enabled: true, origin: "plugin" as const, pluginId: mod.pluginId
      }))
    ]
  }))
  /** Runs one store mutation; its message becomes the request's 400, never an unhandled defect. */
  const applyMod = (work: () => void) => Effect.gen(function*() {
    const failure = yield* Effect.sync(() => {
      try { work(); return undefined } catch (cause) { return cause instanceof Error ? cause.message : "The mod store refused the change." }
    })
    if (failure !== undefined) return yield* new BadRequest({ message: failure })
  })
  const status = Effect.gen(function*() {
    const providers = yield* credentials.status
    return { providers, configured: Object.values(providers).includes("configured"), host: Option.isSome(host) ? "nikcli" as const : "direct" as const, ...(Option.isSome(host) ? { tools: host.value.runtime.toolCatalogue() } : {}) }
  })
  /**
   * The provider catalogue: it gates what may be saved as a key and feeds the settings
   * browser. The service caches it for a minute, so validating a key never re-reads the
   * whole models.dev database; only a host that cannot produce a catalogue fails here.
   */
  const catalogue = ai.providers.pipe(Effect.mapError((e) => new InternalError({ message: e.message })))
  /**
   * What the assistant knows before the first word: the caller's context, the project context the UI keeps in the
   * key-value store and notes belonging only to that project.
   */
  const aiContext = makeAiContext({ kv, projects, host })
  /** The turn's context through the one assembly (`ai-context.ts`): authorised sources, one budget, a manifest. */
  const contextFor = (payload: { context?: string | undefined; projectId?: string | undefined; drawingId?: string | undefined; includeContext?: boolean | undefined }) => Effect.gen(function*() {
    const actor = yield* CurrentUser
    const assembly = yield* aiContext.assemble({
      actorId: actor.id, includeContext: payload.includeContext !== false,
      ...(payload.projectId !== undefined ? { projectId: payload.projectId } : {}),
      ...(payload.drawingId !== undefined ? { drawingId: payload.drawingId } : {}),
      ...(payload.context !== undefined ? { explicit: payload.context } : {})
    }).pipe(Effect.mapError(() => new BadRequest({ message: "Project not found or inaccessible" })))
    if (assembly.manifest.omitted.some((entry) => entry.reason === "budget")) yield* Effect.logDebug("AI context left sources out", assembly.manifest)
    return assembly.text
  })
  /** Legacy single-shot call: the model selector is the vendor-neutral tier unless a model id is given. */
  const complete = (prompt: string, system?: string, model?: string) =>
    ai.complete({ prompt, ...(system ? { system } : {}), ...(model ? { model: { model } } : {}) })

  return handlers
    .handle("refreshModels", () => Effect.gen(function*() {
      yield* extensionAccess
      if (Option.isNone(host)) return yield* new BadRequest({ message: "Refreshing models requires the nikcli host." })
      yield* host.value.runtime.refreshCatalogue().pipe(Effect.mapError((error) => new InternalError({ message: error.message })))
      yield* ai.invalidateCatalogue
      const providers = yield* catalogue
      yield* events.publish({ type: "catalogue.updated", at: new Date().toISOString() })
      return [...providers]
    }))
    .handle("oauthAuthorize", ({ payload }) => Effect.gen(function*() {
      yield* extensionAccess
      if (Option.isNone(host)) return yield* new BadRequest({ message: "Subscription sign-in requires the nikcli host." })
      const providers = yield* catalogue
      if (!knownProvider(payload.provider, providers)) return yield* new BadRequest({ message: "Unknown provider" })
      return yield* host.value.runtime.oauth.authorize(payload.provider).pipe(Effect.mapError((error) => new BadRequest({ message: error.message })))
    }))
    .handle("oauthComplete", ({ payload }) => Effect.gen(function*() {
      yield* extensionAccess
      if (Option.isNone(host)) return yield* new BadRequest({ message: "Subscription sign-in requires the nikcli host." })
      yield* host.value.runtime.oauth.complete(payload.provider, payload.attemptId, payload.code, credentials.useOAuth(payload.provider)).pipe(Effect.mapError((error) => new BadRequest({ message: error.message })))
      yield* ai.invalidateCatalogue
      return yield* status
    }))
    .handle("agents", () => Effect.succeed(ai.agents))
    .handle("sessionControl", ({ payload }) => Effect.gen(function*() {
      const projectId = yield* controlProject(payload.sessionId, payload.projectId)
      return yield* ai.controlSession({ ...payload, projectId }).pipe(Effect.mapError((error) => new BadRequest({ message: error.message })))
    }))
    .handle("setCredentials", ({ payload }) => Effect.gen(function*() {
      yield* extensionAccess
      if (Option.isSome(host)) yield* host.value.runtime.oauth.idle
      const provider = payload.provider
      if (provider === undefined || provider.trim() === "") return yield* new BadRequest({ message: "Unknown provider" })
      if (!isBuiltinProviderId(provider)) {
        const known = yield* catalogue
        if (!knownProvider(provider, known)) return yield* new BadRequest({ message: "Unknown provider" })
      }
      if (!payload.key || !payload.key.trim()) return yield* new BadRequest({ message: "API key is required" })
      yield* credentials.set(provider, Redacted.make(payload.key), payload.baseUrl ? { baseUrl: payload.baseUrl } : undefined)
      yield* ai.invalidateCatalogue
      return yield* status
    }).pipe(Effect.catchTag("AiConfigError", (e) => Effect.fail(new BadRequest({ message: e.message })))))
    .handle("clearCredentials", ({ params }) => Effect.gen(function*() {
      yield* extensionAccess
      if (Option.isSome(host)) yield* host.value.runtime.oauth.idle.pipe(Effect.mapError((error) => new BadRequest({ message: error.message })))
      const provider = params.provider
      if (!isBuiltinProviderId(provider)) {
        const known = yield* catalogue
        if (!knownProvider(provider, known)) return yield* new BadRequest({ message: "Unknown provider" })
      }
      yield* credentials.clear(provider)
      yield* ai.invalidateCatalogue
      return yield* status
    }))
    .handle("status", () => status)
    .handle("models", ({ query }) => (query.configuredOnly === "true" ? ai.availableModels : ai.models).pipe(
      Effect.map((models) => [...models]),
      Effect.mapError((e) => new InternalError({ message: e.message }))
    ))
    .handle("providers", () => catalogue.pipe(Effect.map((list) => [...list])))
    .handle("prompts", ({ query }) => Effect.succeed({ prompts: ai.suggestedFor(query.mode ?? "general") }))
    .handle("title", ({ payload }) => Effect.gen(function*() {
      if (!payload.excerpt?.trim()) return yield* new BadRequest({ message: "Conversation excerpt is required" })
      const result = yield* ai.suggestTitle({ excerpt: payload.excerpt, ...(payload.model ? { model: payload.model } : {}) })
        .pipe(Effect.mapError(() => new InternalError({ message: "Unable to generate a title" })))
      return result
    }))
    .handle("designAnalysis", ({ payload }) => Effect.gen(function*() {
      if (!payload.description?.trim()) return yield* new BadRequest({ message: "Design description is required" })
      return yield* ai.analyzeDesign({
        description: payload.description,
        ...(payload.layer !== undefined ? { layer: payload.layer } : {}),
        ...(payload.machine !== undefined ? { machine: payload.machine } : {}),
        ...(payload.model ? { model: payload.model } : {})
      }).pipe(Effect.mapError(() => new InternalError({ message: "Unable to analyze the design" })))
    }))
    .handle("machiningParameters", ({ payload }) => Effect.gen(function*() {
      if (!payload.material?.trim() || !payload.tool?.trim() || !payload.operation?.trim()) {
        return yield* new BadRequest({ message: "Material, tool, and operation are required" })
      }
      return yield* ai.recommendMachiningParameters({
        material: payload.material, tool: payload.tool, operation: payload.operation,
        ...(payload.machine !== undefined ? { machine: payload.machine } : {}),
        ...(payload.model ? { model: payload.model } : {})
      }).pipe(Effect.mapError(() => new InternalError({ message: "Unable to recommend machining parameters" })))
    }))
    .handle("gcodeOptimization", ({ payload }) => Effect.gen(function*() {
      if (!payload.gcode?.trim()) return yield* new BadRequest({ message: "G-code is required" })
      return yield* ai.optimizeGcode({
        gcode: payload.gcode,
        ...(payload.material !== undefined ? { material: payload.material } : {}),
        ...(payload.machineType !== undefined ? { machineType: payload.machineType } : {}),
        ...(payload.constraints !== undefined ? { constraints: payload.constraints } : {}),
        ...(payload.model ? { model: payload.model } : {})
      }).pipe(Effect.mapError(() => new InternalError({ message: "Unable to optimize G-code" })))
    }))
    .handle("designSuggestions", ({ payload }) => Effect.gen(function*() {
      if (!payload.elements?.trim()) return yield* new BadRequest({ message: "Design elements are required" })
      return yield* ai.summarizeDesignSuggestions({
        elements: payload.elements,
        ...(payload.currentOperation !== undefined ? { currentOperation: payload.currentOperation } : {}),
        ...(payload.currentTool !== undefined ? { currentTool: payload.currentTool } : {}),
        ...(payload.model ? { model: payload.model } : {})
      }).pipe(Effect.mapError(() => new InternalError({ message: "Unable to generate design suggestions" })))
    }))
    .handle("chat", ({ payload }) => Effect.gen(function*() {
      if (!payload.messages || !Array.isArray(payload.messages)) return yield* new AiBadRequest({ error: "Messages are required and must be an array" })
      let mcpData: string | undefined
      if (payload.mcpServerId && payload.mcpReference) {
        const [row] = yield* query("ai.mcpServer", (db) => db.select().from(schema.mCPServerConfigTable).where(eq(schema.mCPServerConfigTable.id, payload.mcpServerId!)).limit(1))
          .pipe(Effect.mapError(() => new AiFailure({ error: "Failed to process request" })))
        if (!row) return yield* new AiNotFound({ error: "MCP server configuration not found" })
        if (!row.enabled) return yield* new AiBadRequest({ error: "MCP server is disabled" })
        // The MCP transport lives in the MCP routes; chat only forwards what was configured.
        mcpData = `MCP reference ${payload.mcpReference} on server ${row.name}`
      }
      const turns = (payload.messages as Array<{ role: string; content: unknown }>).map((m) => `${m.role}: ${text(m.content)}`).join("\n")
      const prompt = mcpData ? `${turns}\nsystem: The following data was retrieved from an MCP server: ${mcpData}` : turns
      const result = yield* complete(prompt)
      return { reply: result.text || "No response generated", hasMcpData: mcpData !== undefined }
    }).pipe(Effect.catchIf((e): e is Exclude<typeof e, AiBadRequest | AiNotFound | AiFailure> => !(e instanceof AiBadRequest || e instanceof AiNotFound || e instanceof AiFailure),
      (e) => Effect.fail(new AiFailure({ error: aiError(e as never) })))))
    // RM-11: the action catalogue for a standalone nikcli. The application's own token opens everything; a scoped bridge token (issued below,
    // one project, read-only or read-write, revocable) opens only these two routes and only inside its scope.
    .handle("actions", () => Effect.gen(function*() {
      const grant = yield* bridgeGrant
      return { tools: actions.list(grant?.scope.mode) }
    }))
    .handle("invokeAction", ({ payload }) => Effect.gen(function*() {
      const actor = yield* CurrentUser
      if (payload.projectId.trim() === "" || payload.projectId === "default") return yield* new BadRequest({ message: "projectId is required: a standalone client always names its project" })
      const grant = yield* bridgeGrant
      if (grant !== undefined && grant.scope.projectId !== payload.projectId) return yield* new BadRequest({ message: "This token is for another project." })
      yield* checkProject(payload.projectId)
      yield* checkDrawing(payload.projectId, payload.drawingId)
      return yield* actions.invoke({ projectId: payload.projectId, tool: payload.tool, input: payload.input, user: actor, ...(payload.drawingId !== undefined ? { drawingId: payload.drawingId } : {}), ...(grant ? { mode: grant.scope.mode } : {}) }).pipe(Effect.mapError((e) => new BadRequest({ message: e.message })))
    }))
    .handle("issueBridgeToken", ({ payload }) => Effect.gen(function*() {
      const actor = yield* CurrentUser
      if (payload.projectId.trim() === "" || payload.projectId === "default") return yield* new BadRequest({ message: "projectId is required: a bridge token is for one project" })
      yield* checkProject(payload.projectId)
      return yield* bridgeTokens.issue({ name: payload.name ?? "", projectId: payload.projectId, mode: payload.mode, userId: actor.id, email: actor.email, ...(payload.days !== undefined ? { days: payload.days } : {}) })
    }))
    .handle("bridgeTokens", () => bridgeTokens.list.pipe(Effect.map((tokens) => [...tokens])))
    .handle("revokeBridgeToken", ({ params }) => Effect.gen(function*() {
      const revoked = yield* bridgeTokens.revoke(params.id)
      if (!revoked) return yield* new BadRequest({ message: "No such bridge token" })
      return { message: "Revoked" }
    }))
    .handle("chatStream", ({ payload }) => Effect.map(turnOf(payload), (turn) => withHeartbeat(turn)))
    // nikcli mobile architecture (spec 13 §5): the prompt starts a detached turn, the phone follows the session stream.
    .handle("sessionPrompt", ({ payload }) => Effect.gen(function*() {
      const turn = yield* turnOf(payload)
      return yield* turns.start(turn, payload.sessionId)
    }))
    .handle("sessionStream", ({ params, query }) => Effect.gen(function*() {
      yield* controlProject(params.sessionId)
      return yield* turns.follow(params.sessionId, query.after)
    }))
    // nikcli mobile session list / detail (spec 13 §5): the conversations the caller owns in a project, and one's history.
    .handle("sessionList", ({ query }) => Effect.gen(function*() {
      const actor = yield* CurrentUser
      const projectId = query.projectId.trim()
      if (projectId === "") return yield* new BadRequest({ message: "projectId is required" })
      const limit = pageSize(query.limit, 50)
      if (limit === undefined) return yield* new BadRequest({ message: `limit must be an integer from 1 to ${MAX_SESSION_PAGE}` })
      yield* checkProject(projectId)
      const owned = yield* Effect.tryPromise({ try: () => actingUser.sessions(actor.id, projectId), catch: () => new InternalError({ message: "Unable to read the conversations" }) })
      if (owned.length === 0) return []
      const hosted = Option.isNone(host) ? undefined : yield* host.value.runtime.host(projectId).pipe(
        Effect.flatMap((projectHost) => Effect.tryPromise(() => projectHost.client.session.list({ limit: HISTORY_SCAN_LIMIT }))),
        // The SDK types only some fields; the host's records also carry `time`, which the mapper reads defensively.
        Effect.map((list) => list as unknown as ReadonlyArray<HostHistorySession>),
        Effect.mapError(() => new InternalError({ message: "The assistant host could not list the conversations" }))
      )
      const busy = new Set<string>()
      for (const entry of owned) if (yield* turns.busy(entry.sessionId)) busy.add(entry.sessionId)
      return sessionSummaries({ projectId, owned, hosted, busy: (id) => busy.has(id), limit })
    }))
    .handle("sessionMessages", ({ params, query }) => Effect.gen(function*() {
      const limit = pageSize(query.limit, 30)
      if (limit === undefined) return yield* new BadRequest({ message: `limit must be an integer from 1 to ${MAX_SESSION_PAGE}` })
      if (query.before !== undefined && !HOST_ID.test(query.before)) return yield* new BadRequest({ message: "before must be a message id from an earlier page" })
      const projectId = yield* controlProject(params.sessionId)
      const empty = { sessionId: params.sessionId, messages: [], before: null }
      if (Option.isNone(host)) return empty
      const projectHost = yield* host.value.runtime.host(projectId).pipe(Effect.mapError(() => new InternalError({ message: "The assistant host is not available" })))
      const read = (count: number) => Effect.tryPromise({
        try: () => projectHost.client.session.messages({ sessionID: params.sessionId, limit: count }) as unknown as Promise<ReadonlyArray<HostHistoryMessage>>,
        catch: () => new InternalError({ message: "The assistant host could not read this conversation" })
      })
      // Read the newest messages, widening the window until it holds the anchor (or the whole conversation).
      let window = Math.min(HISTORY_SCAN_LIMIT, query.before === undefined ? limit * 2 + 1 : limit * 4 + 1)
      for (;;) {
        const messages = yield* read(window)
        const complete = messages.length < window
        const page = historyPage(messages, complete, limit, query.before)
        if (page.ok && (complete || page.messages.length === limit || window >= HISTORY_SCAN_LIMIT)) return { sessionId: params.sessionId, messages: page.messages, before: page.before }
        if (!page.ok && (page.exhausted || window >= HISTORY_SCAN_LIMIT)) return yield* new BadRequest({ message: "before is not a message of this conversation (or is older than the history the desktop serves)" })
        window = Math.min(HISTORY_SCAN_LIMIT, window * 2)
      }
    }))
    .handle("sessionState", ({ payload }) => Effect.gen(function*() {
      if (!payload.sessionId) return yield* new BadRequest({ message: "sessionId is required" })
      const projectId = yield* controlProject(payload.sessionId, payload.projectId)
      const state = yield* ai.sessionState(payload.sessionId, projectId).pipe(
        Effect.mapError((e) => new InternalError({ message: e.message }))
      )
      return { busy: state.busy, text: state.text, ...(state.error !== undefined ? { error: state.error } : {}), ...(state.tasks !== undefined ? { tasks: state.tasks } : {}), ...(state.events !== undefined ? { events: state.events } : {}), ...(state.usage !== undefined ? { usage: state.usage } : {}) }
    }))
    .handle("removeSession", ({ payload }) => Effect.gen(function*() {
      if (!payload.sessionId) return yield* new BadRequest({ message: "sessionId is required" })
      const projectId = yield* controlProject(payload.sessionId, payload.projectId)
      const removed = yield* ai.removeSession(payload.sessionId, projectId)
      if (removed) yield* Effect.tryPromise({ try: () => actingUser.forget(payload.sessionId), catch: () => new InternalError({ message: "Unable to remove session owner" }) })
      return { removed }
    }))
    .handle("mcpServers", ({ query }) => Effect.gen(function*() {
      const runtime = yield* extensionProject(query.projectId)
      const servers = yield* runtime.mcpServers(query.projectId).pipe(Effect.mapError((error) => new InternalError({ message: error.message })))
      return { servers }
    }))
    .handle("saveMcpServer", ({ payload }) => Effect.gen(function*() {
      const runtime = yield* extensionProject(payload.projectId)
      yield* runtime.saveMcpServer(payload.projectId, payload.name, payload.config).pipe(Effect.mapError((error) => new BadRequest({ message: error.message })))
      return { servers: yield* runtime.mcpServers(payload.projectId).pipe(Effect.mapError((error) => new InternalError({ message: error.message }))) }
    }))
    .handle("deleteMcpServer", ({ params, query }) => Effect.gen(function*() {
      const runtime = yield* extensionProject(query.projectId)
      yield* runtime.saveMcpServer(query.projectId, params.name, undefined).pipe(Effect.mapError((error) => new BadRequest({ message: error.message })))
      return { servers: yield* runtime.mcpServers(query.projectId).pipe(Effect.mapError((error) => new InternalError({ message: error.message }))) }
    }))
    .handle("removeExtensionPlugin", ({ params }) => Effect.gen(function*() {
      yield* extensionAccess
      yield* plugins.remove(params.id).pipe(Effect.mapError((error) => new BadRequest({ message: error.message })))
      yield* refreshPluginTools
      return yield* pluginList
    }))
    .handle("extensionPlugins", () => Effect.gen(function*() { yield* extensionAccess; return yield* pluginList }))
    .handle("installExtensionPlugin", ({ payload }) => Effect.gen(function*() {
      yield* extensionAccess
      yield* plugins.install(payload.manifest, payload.source, payload.files).pipe(Effect.mapError((error) => new BadRequest({ message: error.message })))
      return yield* pluginList
    }))
    .handle("toggleExtensionPlugin", ({ params, payload }) => Effect.gen(function*() {
      yield* extensionAccess
      yield* plugins.toggle(params.id, payload.enabled).pipe(Effect.mapError((error) => new BadRequest({ message: error.message })))
      yield* refreshPluginTools
      return yield* pluginList
    }))
    .handle("extensionMods", () => Effect.gen(function*() {
      yield* extensionAccess
      return yield* modsList
    }))
    .handle("toggleExtensionMod", ({ params, payload }) => Effect.gen(function*() {
      yield* extensionAccess
      yield* applyMod(() => setModEnabled(isolatedPaths(appConfig.dataDir), params.id, payload.enabled))
      yield* refreshMods
      return yield* modsList
    }))
    .handle("removeExtensionMod", ({ params }) => Effect.gen(function*() {
      yield* extensionAccess
      const removed = yield* Effect.sync(() => removeMod(isolatedPaths(appConfig.dataDir), params.id))
      if (!removed) return yield* new BadRequest({ message: `There is no mod "${params.id}".` })
      yield* refreshMods
      return yield* modsList
    }))
    .handle("modes", () => Effect.sync(() => ({
      modes: plugins.modes().map((mode) => ({ id: mode.id, title: mode.title, description: mode.description, pluginId: mode.pluginId, pluginName: mode.pluginName }))
    })))
    .handle("skills", () => skillInfos.pipe(Effect.map((skills) => ({ skills, max: MAX_USER_SKILLS }))))
    .handle("saveSkill", ({ payload }) => Effect.gen(function*() {
      const parsed = payload.markdown !== undefined
        ? parseSkillMarkdown(payload.markdown)
        : (() => {
            const skill = { name: payload.name ?? "", description: payload.description ?? "", body: payload.body ?? "" }
            const problems = skillProblems(skill)
            return problems.length > 0 ? { ok: false as const, problems } : { ok: true as const, value: skill }
          })()
      if (!parsed.ok) return yield* new BadRequest({ message: `Skill not loaded: ${parsed.problems.join("; ")}` })
      const saved = yield* Effect.promise(() => skillStore.save(parsed.value))
      if (!saved.ok) return yield* new BadRequest({ message: `Skill not loaded: ${saved.problems.join("; ")}` })
      const live = yield* reloadSkills
      const skills = yield* skillInfos
      return { skill: { name: saved.value.name, description: saved.value.description, builtIn: false, category: "user" }, skills, live }
    }))
    .handle("deleteSkill", ({ params }) => Effect.gen(function*() {
      if (!SKILL_NAME_PATTERN.test(params.name)) return yield* new BadRequest({ message: "Invalid skill name" })
      if (CADCAM_SKILLS.some((s) => s.name === params.name)) return yield* new BadRequest({ message: "Built-in skills cannot be removed" })
      const removed = yield* Effect.promise(() => skillStore.remove(params.name))
      if (!removed) return yield* new BadRequest({ message: `No loaded skill called ${params.name}` })
      yield* reloadSkills
      const skills = yield* skillInfos
      return { skills, max: MAX_USER_SKILLS }
    }))
    .handle("chatQueue", ({ payload }) => Effect.gen(function*() {
      if (!payload.sessionId) return yield* new BadRequest({ message: "sessionId is required" })
      if (!payload.message || payload.message.trim() === "") return yield* new BadRequest({ message: "message is required" })
      const projectId = yield* controlProject(payload.sessionId, payload.projectId)
      yield* ai.queue({ sessionId: payload.sessionId, message: payload.message, projectId, ...(payload.delivery ? { delivery: payload.delivery } : {}) }).pipe(
        Effect.mapError((e) => new BadRequest({ message: e.message }))
      )
      return { message: "Queued" }
    }))
    .handle("chatAbort", ({ payload }) => Effect.gen(function*() {
      if (!payload.sessionId) return yield* new BadRequest({ message: "sessionId is required" })
      const projectId = yield* controlProject(payload.sessionId, payload.projectId)
      yield* ai.abort(payload.sessionId, projectId).pipe(Effect.mapError((error) => new BadRequest({ message: error.message })))
      // Explicit stop joins this conversation's workers; losing the stream does not.
      return { message: "Aborted" }
    }))
    .handle("permissionReply", ({ payload }) => Effect.gen(function*() {
      const projectId = yield* controlProject(payload.sessionId, payload.projectId)
      yield* ai.controlSession({ sessionId: payload.sessionId, projectId, action: "reply_permission", requestId: payload.requestId, decision: payload.decision }).pipe(Effect.mapError((error) => new BadRequest({ message: error.message })))
      return { message: "Permission reply sent" }
    }))
    .handle("completion", ({ payload }) => Effect.gen(function*() {
      if (!payload.prompt) return yield* new BadRequest({ message: "Prompt is required" })
      return yield* complete(payload.prompt, payload.systemPrompt, payload.model)
    }).pipe(Effect.catchIf((e): e is Exclude<typeof e, BadRequest> => !(e instanceof BadRequest),
      () => Effect.fail(new InternalError({ message: "Error generating completion" })))))
    .handle("analyzeGcode", ({ payload }) => Effect.gen(function*() {
      if (!payload.gcode) return yield* new BadRequest({ message: "G-code is required" })
      return yield* ai.analyzeGcode({ gcode: payload.gcode })
    }))
    .handle("gcode", ({ payload }) => Effect.gen(function*() {
      const action = payload.action ?? "analyze"
      const processedAt = () => new Date().toISOString()
      const bad = (error: string) => new GcodeActionError({ success: false, error })
      const machine = { maxFeedRate: undefined }
      void machine
      let data: unknown
      switch (action) {
        case "analyze": case "optimize": case "validate":
          if (!payload.gcode) return yield* bad(`G-code is required for ${action === "analyze" ? "analysis" : action === "optimize" ? "optimization" : "validation"}`)
          data = analyze(payload.gcode)
          break
        case "complete": {
          if (!payload.partialCode) return yield* bad("Partial code is required for completion")
          const r = yield* complete(`Complete this G-code for a ${payload.machineType ?? "generic"} machine cutting ${payload.material ?? "aluminum"}. Reply with up to 5 suggestions, one per line, and nothing else.\n\n${payload.partialCode}`)
          data = { suggestions: r.text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 5) }
          break
        }
        case "generate": {
          if (!payload.description) return yield* bad("Description is required for generation")
          const r = yield* complete(`Generate G-code for: ${payload.description}\nMachine: ${payload.machineType ?? "generic"}\nMaterial: ${payload.material ?? "aluminum"}\nReply with G-code only.`)
          data = { gcode: r.text }
          break
        }
        default:
          return yield* bad(`Unknown action: ${action}. Supported actions: analyze, optimize, complete, validate, generate`)
      }
      return { success: true as const, action, data, processedAt: processedAt() }
    }).pipe(Effect.catchIf((e): e is Exclude<typeof e, GcodeActionError> => !(e instanceof GcodeActionError),
      (e) => Effect.fail(new GcodeActionFailure({
        success: false, error: aiError(e as never), action: payload.action ?? "unknown", processedAt: new Date().toISOString()
      })))))
    .handle("toolpathAnalysis", ({ payload }) => Effect.gen(function*() {
      if (!payload.gcode) return yield* new BadRequest({ message: "G-code is required" })
      const gcode = payload.gcode
      const r = yield* complete(
        `You are a CNC machining expert. Analyze this G-code and provide a concise summary of what you observe.\n\n\`\`\`\n${gcode.substring(0, 2000)} ${gcode.length > 2000 ? "..." : ""}\n\`\`\`\n\nFocus on:\n- Type of operations (cutting, drilling, etc.)\n- Movement patterns\n- Tool control\n- Safety features\n- Potential issues or inefficiencies\n\nProvide your insights in 2-3 sentences. Be specific and technical but concise.`,
        undefined, payload.model)
      return { insights: r.text.trim() }
    }).pipe(Effect.catchIf((e): e is Exclude<typeof e, BadRequest> => !(e instanceof BadRequest),
      () => Effect.fail(new InternalError({ message: "Error analyzing toolpath" })))))
    .handle("feedback", ({ payload }) => Effect.gen(function*() {
      if (!payload.messageId || !payload.rating) return yield* new AiBadRequest({ error: "Missing required fields: messageId and rating" })
      yield* Effect.logInfo(`AI feedback ${payload.messageId}: ${payload.rating}`)
      return { success: true as const, message: "Feedback received" }
    }))
    .handle("proxy", ({ payload }) => Effect.gen(function*() {
      const messages = Array.isArray(payload.messages) ? payload.messages as Array<{ role: string; content: unknown }> : []
      const system = typeof payload.system === "string" ? payload.system : Array.isArray(payload.system) ? text(payload.system) : undefined
      const prompt = messages.map((m) => `${m.role}: ${text(m.content)}`).join("\n")
      const r = yield* complete(prompt, system, payload.model)
      return {
        id: `msg_${crypto.randomUUID()}`, type: "message" as const, role: "assistant" as const, model: r.model,
        content: [{ type: "text" as const, text: r.text }], stop_reason: "end_turn", usage: { input_tokens: 0, output_tokens: 0 }
      }
    }).pipe(Effect.mapError((e) => new InternalError({ message: aiError(e as never) }))))
}))
