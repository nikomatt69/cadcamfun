import { projectMemoryPrefix, projectContextKey, parseProjectContext, renderProjectContext, renderProjectMemory, renderUserHabits, readProjectMemoryFiles } from "@cadcamfun/ai"
import { withHeartbeat, renderNotes, renderWorkspaceContext, CADCAM_SKILLS, MAX_USER_SKILLS, SKILL_NAME_PATTERN, createUserSkillStore, parseSkillMarkdown, skillProblems, AiAborted, AiConfigError, AiCredentials, AiHost, AiService, analyzeGcode as analyze, isBuiltinProviderId, isProviderId, replyHostPermission, type ProviderEntry, type ProviderId } from "@cadcamfun/ai"
import {
  AiBadRequest, AiFailure, AiNotFound, Api, BadRequest, CurrentUser, GcodeActionError, GcodeActionFailure, InternalError
} from "@cadcamfun/api"
import { Effect, Option, Redacted, Stream } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Database, schema } from "@cadcamfun/db"
import { eq } from "drizzle-orm"
import { join } from "node:path"
import { AppConfigService } from "../config.ts"
import { KvStore } from "../services/kv.ts"
import { ActingUser } from "../services/acting-user.ts"

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
  const actingUser = yield* ActingUser
  const host = yield* Effect.serviceOption(AiHost)
  const { query } = yield* Database
  const kv = yield* KvStore
  const appConfig = yield* AppConfigService
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
   * key-value store (`ai.context.<projectId>`) and the notes it saved itself (`ai.memory.*`).
   */
  const contextFor = (payload: { context?: string | undefined; projectId?: string | undefined }) => Effect.gen(function*() {
    const parts: string[] = []
    if (payload.context?.trim()) parts.push(payload.context.trim())
    if (payload.projectId) {
      const stored = yield* kv.get(`ai.context.${payload.projectId}`).pipe(
        Effect.catchTag("KvError", (error) => Effect.logWarning("Unable to load saved AI context", error).pipe(Effect.as(undefined)))
      )
      if (stored) parts.push(typeof stored.value === "string" ? stored.value : renderWorkspaceContext(stored.value, { projectId: payload.projectId }))
      // The user's standing rules for this project: instructions, framed so they outrank the mode block.
      const document = yield* kv.get(projectContextKey(payload.projectId)).pipe(
        Effect.catchTag("KvError", (error) => Effect.logWarning("Unable to load the project AI context", error).pipe(Effect.as(undefined)))
      )
      const rules = renderProjectContext(document === undefined ? undefined : parseProjectContext(document.value).text)
      if (rules !== "") parts.push(rules)
      // What earlier sessions established and how this person works: data and a prior, never instructions.
      // A project with no embedded host has no Brain and no habits file, so both blocks are simply absent.
      if (Option.isSome(host)) {
        const projectHost = yield* host.value.runtime.host(payload.projectId).pipe(Effect.catch(() => Effect.succeed(undefined)))
        if (projectHost !== undefined) {
          const files = yield* Effect.promise(() => readProjectMemoryFiles(projectHost))
          const memoryBlock = renderProjectMemory(files.memory)
          if (memoryBlock !== "") parts.push(memoryBlock)
          const habitsBlock = renderUserHabits(files.habits)
          if (habitsBlock !== "") parts.push(habitsBlock)
        }
      }
    }
    const memoryPrefix = `ai.memory.${projectMemoryPrefix(payload.projectId ?? "default")}`
    const memory = yield* kv.list(memoryPrefix).pipe(
      Effect.catchTag("KvError", (error) => Effect.logWarning("Unable to load saved AI notes", error).pipe(Effect.as([])))
    )
    // Notes stored without a project namespace (`ai.memory.<key>`) are global and apply to every conversation.
    const globalMemory = payload.projectId === undefined
      ? []
      : yield* kv.list("ai.memory.").pipe(
        Effect.catchTag("KvError", (error) => Effect.logWarning("Unable to load global AI notes", error).pipe(Effect.as([])))
      )
    const notes = renderNotes([
      ...memory.map((m) => ({ key: m.key.slice(memoryPrefix.length), value: m.value })),
      ...globalMemory.map((m) => ({ key: m.key.slice("ai.memory.".length), value: m.value }))
    ].reverse())
    if (notes !== "") parts.push(notes)
    return parts.join("\n\n")
  })
  /** Legacy single-shot call: the model selector is the vendor-neutral tier unless a model id is given. */
  const complete = (prompt: string, system?: string, model?: string) =>
    ai.complete({ prompt, ...(system ? { system } : {}), ...(model ? { model: { model } } : {}) })

  return handlers
    .handle("agents", () => Effect.succeed(ai.agents))
    .handle("sessionControl", ({ payload }) => ai.controlSession(payload).pipe(Effect.mapError((error) => new BadRequest({ message: error.message }))))
    .handle("setCredentials", ({ payload }) => Effect.gen(function*() {
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
    .handle("chatStream", ({ payload }) => Effect.gen(function*() {
      if (!payload.message || !payload.message.trim()) return yield* new BadRequest({ message: "Message is required" })
      // The tools of this turn act as the account that sent it (the signed-in user, or the local profile).
      const actor = yield* CurrentUser
      const context = yield* contextFor(payload)
      return withHeartbeat(ai.chat({
        message: payload.message,
        admitSession: (projectId, sessionId) => actingUser.bind(projectId, sessionId, actor, payload.message),
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
      }))))
    }))
    .handle("sessionState", ({ payload }) => Effect.gen(function*() {
      if (!payload.sessionId) return yield* new BadRequest({ message: "sessionId is required" })
      const state = yield* ai.sessionState(payload.sessionId, payload.projectId).pipe(
        Effect.mapError((e) => new InternalError({ message: e.message }))
      )
      return { busy: state.busy, text: state.text, ...(state.error !== undefined ? { error: state.error } : {}), ...(state.tasks !== undefined ? { tasks: state.tasks } : {}), ...(state.events !== undefined ? { events: state.events } : {}), ...(state.usage !== undefined ? { usage: state.usage } : {}) }
    }))
    .handle("removeSession", ({ payload }) => Effect.gen(function*() {
      if (!payload.sessionId) return yield* new BadRequest({ message: "sessionId is required" })
      const removed = yield* ai.removeSession(payload.sessionId, payload.projectId)
      return { removed }
    }))
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
      yield* ai.queue({ sessionId: payload.sessionId, message: payload.message, ...(payload.projectId !== undefined ? { projectId: payload.projectId } : {}), ...(payload.delivery ? { delivery: payload.delivery } : {}) }).pipe(
        Effect.mapError((e) => new BadRequest({ message: e.message }))
      )
      return { message: "Queued" }
    }))
    .handle("chatAbort", ({ payload }) => Effect.gen(function*() {
      if (!payload.sessionId) return yield* new BadRequest({ message: "sessionId is required" })
      yield* ai.abort(payload.sessionId)
      // Abort the current chat turn but leave background workers running: the
      // user may just have wanted to stop a long streaming reply, not every
      // delegated investigation. They can cancel tasks individually with the
      // `agent_task_cancel` tool or wait for them to finish.
      return { message: "Aborted" }
    }))
    .handle("permissionReply", ({ payload }) => Effect.gen(function*() {
      yield* ai.controlSession({ sessionId: payload.sessionId, ...(payload.projectId ? { projectId: payload.projectId } : {}), action: "reply_permission", requestId: payload.requestId, decision: payload.decision }).pipe(Effect.mapError((error) => new BadRequest({ message: error.message })))
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
