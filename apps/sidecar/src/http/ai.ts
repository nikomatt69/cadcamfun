import { AiAborted, AiConfigError, AiCredentials, AiHost, AiService, analyzeGcode as analyze, isProviderId, replyHostPermission, type ProviderEntry, type ProviderId } from "@cadcamfun/ai"
import {
  AiBadRequest, AiFailure, AiNotFound, Api, BadRequest, GcodeActionError, GcodeActionFailure, InternalError
} from "@cadcamfun/api"
import { Effect, Option, Redacted, Stream } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Database, schema } from "@cadcamfun/db"
import { eq } from "drizzle-orm"
import { KvStore } from "../services/kv.ts"

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
const aiError = (e: { _tag: string; message?: string }) =>
  e._tag === "AiAborted" ? "The request was cancelled." : (e.message ?? "AI request failed")

export const AiHandlers = HttpApiBuilder.group(Api, "ai", Effect.fn(function*(handlers) {
  const ai = yield* AiService
  const credentials = yield* AiCredentials
  const host = yield* Effect.serviceOption(AiHost)
  const { query } = yield* Database
  const kv = yield* KvStore

  const status = Effect.gen(function*() {
    const providers = yield* credentials.status
    return { providers, configured: Object.values(providers).includes("configured"), host: Option.isSome(host) ? "nikcli" as const : "direct" as const }
  })
  /**
   * The provider catalogue: it gates what may be saved as a key and feeds the settings
   * browser. The service caches it for a minute, so validating a key never re-reads the
   * whole models.dev database; only a host that cannot produce a catalogue fails here.
   */
  const catalogue = ai.providers.pipe(Effect.mapError((e) => new InternalError({ message: e.message })))
  /**
   * What the assistant knows before the first word: the caller's context, the project context the UI keeps in the
   * key-value store (`ai.context.<projectId>`) and the notes it saved itself (`ai.memory.*`).
   */
  const contextFor = (payload: { context?: string | undefined; projectId?: string | undefined }) => Effect.gen(function*() {
    const parts: string[] = []
    if (payload.context?.trim()) parts.push(payload.context.trim())
    if (payload.projectId) {
      const stored = yield* kv.get(`ai.context.${payload.projectId}`)
      if (stored) parts.push(typeof stored.value === "string" ? stored.value : JSON.stringify(stored.value))
    }
    const memory = yield* kv.list("ai.memory.")
    if (memory.length > 0) parts.push(`Saved notes:\n${memory.map((m) => `- ${m.key.slice("ai.memory.".length)}: ${String(m.value)}`).join("\n")}`)
    return parts.join("\n\n")
  })
  /** Legacy single-shot call: the model selector is the vendor-neutral tier unless a model id is given. */
  const complete = (prompt: string, system?: string, model?: string) =>
    ai.complete({ prompt, ...(system ? { system } : {}), ...(model ? { model: { model } } : {}) })

  return handlers
    .handle("setCredentials", ({ payload }) => Effect.gen(function*() {
      const known = yield* catalogue
      if (!knownProvider(payload.provider, known)) return yield* new BadRequest({ message: "Unknown provider" })
      if (!payload.key || !payload.key.trim()) return yield* new BadRequest({ message: "API key is required" })
      yield* credentials.set(payload.provider, Redacted.make(payload.key), payload.baseUrl ? { baseUrl: payload.baseUrl } : undefined)
      return yield* status
    }).pipe(Effect.catchTag("AiConfigError", (e) => Effect.fail(new BadRequest({ message: e.message })))))
    .handle("clearCredentials", ({ params }) => Effect.gen(function*() {
      const known = yield* catalogue
      if (!knownProvider(params.provider, known)) return yield* new BadRequest({ message: "Unknown provider" })
      yield* credentials.clear(params.provider)
      return yield* status
    }))
    .handle("status", () => status)
    .handle("models", () => ai.models.pipe(
      Effect.map((m) => [...m]),
      Effect.mapError((e) => new InternalError({ message: e.message }))
    ))
    .handle("providers", () => catalogue.pipe(Effect.map((list) => [...list])))
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
    .handle("chatStream", ({ payload }) => Effect.gen(function*() {
      if (!payload.message || !payload.message.trim()) return yield* new BadRequest({ message: "Message is required" })
      const context = yield* contextFor(payload)
      return ai.chat({
        message: payload.message,
        ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
        ...(payload.projectId ? { projectId: payload.projectId } : {}),
        ...(context ? { context } : {}),
        ...(payload.model ? { model: payload.model } : {})
      }).pipe(Stream.catch((e) => Stream.succeed({
        type: "error" as const, sessionId: payload.sessionId ?? "", code: e._tag === "AiConfigError" ? "config" as const : e._tag === "AiAborted" ? "aborted" as const : "provider" as const,
        message: aiError(e)
      })))
    }))
    .handle("chatAbort", ({ payload }) => Effect.gen(function*() {
      if (!payload.sessionId) return yield* new BadRequest({ message: "sessionId is required" })
      yield* ai.abort(payload.sessionId)
      return { message: "Aborted" }
    }))
    .handle("permissionReply", ({ payload }) => Effect.gen(function*() {
      if (!Option.isSome(host)) return yield* new BadRequest({ message: "Permission prompts are only available through nikcli" })
      const projectHost = yield* host.value.runtime.host("default").pipe(
        Effect.mapError((error) => new InternalError({ message: error instanceof Error ? error.message : "Unable to reach nikcli host" }))
      )
      yield* replyHostPermission(projectHost, payload.requestId, payload.decision).pipe(
        Effect.mapError((error) => new InternalError({ message: error.message }))
      )
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
