import type { SessionStreamFrame } from "@cadcamfun/api"
import type { ComponentPreview, EntityChange, LibraryCatalogue, LiveEvent, MeshPreview, NotificationRow, PullRequestRow, ReviewRow, SessionControlReply, SessionStateReply, ToolpathPreview, ToolpathReview, VcsBranches, VcsCommit, VcsStatus, WorkflowRunRow, WorkspaceEntry } from "@cadcamfun/api"
import type { Pairing } from "./pairing"
import type { AssistantPreferences, AssistantProvider } from "./assistant-preferences"
import type { ChatEvent } from "./sse"
import { sseParser } from "./sse"

/** `GET /api/ai/status` payload, declared locally — importing the schema const would drag Effect into the bundle. */
export interface AiStatusInfo {
  providers?: Readonly<Record<string, string>>
  configured: boolean
  tools?: ReadonlyArray<{ id: string; description: string }>
  host?: "nikcli" | "direct"
}

export interface AssistantAgentInfo {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly tools: readonly string[]
  readonly edits: boolean
}

/** A raw HTTP response: status and text body (JSON is parsed by the caller). */
export interface TransportResponse {
  readonly status: number
  readonly body: string
}

/**
 * The wire layer the client talks to. On iOS this is the `companion-net` native module (pinned
 * TLS); tests may explicitly inject a verified fetch adapter. The transport owns the pairing (base URL, bearer token,
 * certificate fingerprint) so the client never sees credentials.
 */
export interface Transport {
  request(path: string, method: string, body?: unknown, signal?: AbortSignal): Promise<TransportResponse>
  /** Raw text chunks (SSE frames split arbitrarily); the caller feeds them to `sseParser`. */
  stream(path: string, method: string, body?: unknown, signal?: AbortSignal): AsyncGenerator<string>
}

export class CompanionError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export interface ProjectSummary {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly updatedAt: string
}

export interface PullRequestDetail {
  readonly pullRequest: PullRequestRow
  readonly reviews: ReadonlyArray<ReviewRow>
  readonly changes: ReadonlyArray<EntityChange>
}

/**
 * The phone's whole view of a desktop: the same HTTP API the desktop UI uses (no Effect runtime
 * in the phone bundle — types only from `@cadcamfun/api`), through the pinned transport. Only the
 * companion-gateway allow-list routes are reachable; everything else answers 403.
 */
/** One assistant message as the desktop's chat endpoints take it. */
export interface ChatRequest {
  projectId: string
  message?: string
  sessionId?: string
  agent?: string
  mode?: "general" | "cad" | "cam" | "gcode" | "toolpath"
  model?: AssistantPreferences["model"]
  permissionMode?: AssistantPreferences["permissionMode"]
  includeContext?: boolean
}

export class CompanionClient {
  constructor(private readonly transport: Transport) {}

  private async request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const res = await this.transport.request(path, method, body, signal)
    let json: unknown
    try {
      json = res.body ? (JSON.parse(res.body) as unknown) : undefined
    } catch {
      json = undefined
    }
    if (res.status < 200 || res.status >= 300) {
      const message = (json as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`
      throw new CompanionError(res.status, message)
    }
    if (res.status !== 204 && (json === undefined || json === null || typeof json !== "object")) throw new CompanionError(res.status, "The desktop returned an invalid JSON response")
    return json as T
  }

  private projectPath = (id: string) => `/api/projects/${encodeURIComponent(id)}`

  private workspacePath = (id: string) => `${this.projectPath(id)}/workspace`

  health = (signal?: AbortSignal) => this.request<{ status?: string }>("GET", "/api/health", undefined, signal)
  projects = (signal?: AbortSignal) => this.request<ProjectSummary[]>("GET", "/api/projects", undefined, signal)
  project = (id: string, signal?: AbortSignal) => this.request<ProjectSummary>("GET", this.projectPath(id), undefined, signal)

  // ── Workspace preview (read-only meshes, G-code and library) ────────────

  workspaceDrawings = (id: string, signal?: AbortSignal) => this.request<WorkspaceEntry[]>("GET", `${this.workspacePath(id)}/drawings`, undefined, signal)
  drawingPreview = (id: string, drawingId: string, signal?: AbortSignal) =>
    this.request<MeshPreview>("GET", `${this.workspacePath(id)}/drawings/${encodeURIComponent(drawingId)}/preview`, undefined, signal)
  workspaceComponents = (id: string, signal?: AbortSignal) => this.request<WorkspaceEntry[]>("GET", `${this.workspacePath(id)}/components`, undefined, signal)
  componentPreview = (id: string, componentId: string, signal?: AbortSignal) =>
    this.request<ComponentPreview>("GET", `${this.workspacePath(id)}/components/${encodeURIComponent(componentId)}/preview`, undefined, signal)
  workspaceToolpaths = (id: string, signal?: AbortSignal) => this.request<WorkspaceEntry[]>("GET", `${this.workspacePath(id)}/toolpaths`, undefined, signal)
  toolpathReview = (id: string, toolpathId: string, signal?: AbortSignal) =>
    this.request<ToolpathReview>("GET", `${this.workspacePath(id)}/toolpaths/${encodeURIComponent(toolpathId)}`, undefined, signal)
  toolpathPreview = (id: string, toolpathId: string, signal?: AbortSignal) =>
    this.request<ToolpathPreview>("GET", `${this.workspacePath(id)}/toolpaths/${encodeURIComponent(toolpathId)}/preview`, undefined, signal)
  workspaceLibrary = (id: string, signal?: AbortSignal) => this.request<LibraryCatalogue>("GET", `${this.workspacePath(id)}/library`, undefined, signal)

  // ── Version control ─────────────────────────────────────────────────────

  status = (id: string, signal?: AbortSignal) => this.request<VcsStatus>("GET", `${this.projectPath(id)}/vcs/status`, undefined, signal)
  log = (id: string, limit = 50, signal?: AbortSignal) => this.request<VcsCommit[]>("GET", `${this.projectPath(id)}/vcs/log?limit=${limit}`, undefined, signal)
  branches = (id: string, signal?: AbortSignal) => this.request<VcsBranches>("GET", `${this.projectPath(id)}/vcs/branches`, undefined, signal)
  diff = (id: string, to: string, from?: string, signal?: AbortSignal) =>
    this.request<EntityChange[]>("GET", `${this.projectPath(id)}/vcs/diff?to=${encodeURIComponent(to)}${from ? `&from=${encodeURIComponent(from)}` : ""}`, undefined, signal)
  commit = (id: string, message: string) => this.request<VcsCommit>("POST", `${this.projectPath(id)}/vcs/commit`, { message })
  createBranch = (id: string, name: string) => this.request<VcsBranches>("POST", `${this.projectPath(id)}/vcs/branches`, { name })
  checkout = (id: string, branch: string) => this.request<VcsBranches>("POST", `${this.projectPath(id)}/vcs/checkout`, { branch })
  restore = (id: string, rev: string) => this.request<VcsCommit>("POST", `${this.projectPath(id)}/vcs/restore`, { rev })

  // ── Pull requests ───────────────────────────────────────────────────────

  pullRequests = (id: string, state?: PullRequestRow["state"], signal?: AbortSignal) =>
    this.request<PullRequestRow[]>("GET", `${this.projectPath(id)}/pulls${state ? `?state=${state}` : ""}`, undefined, signal)
  pullRequest = (id: string, number: number, signal?: AbortSignal) => this.request<PullRequestDetail>("GET", `${this.projectPath(id)}/pulls/${number}`, undefined, signal)
  review = (id: string, number: number, verdict: ReviewRow["verdict"], body = "") =>
    this.request<ReviewRow>("POST", `${this.projectPath(id)}/pulls/${number}/reviews`, { verdict, body })
  merge = (id: string, number: number) => this.request<PullRequestRow>("POST", `${this.projectPath(id)}/pulls/${number}/merge`)
  close = (id: string, number: number) => this.request<PullRequestRow>("POST", `${this.projectPath(id)}/pulls/${number}/close`)

  // ── Actions (workflows) ─────────────────────────────────────────────────

  runs = (id: string, signal?: AbortSignal) => this.request<WorkflowRunRow[]>("GET", `${this.projectPath(id)}/actions/runs`, undefined, signal)
  dispatch = (id: string, ref?: string) => this.request<WorkflowRunRow[]>("POST", `${this.projectPath(id)}/actions/dispatch`, ref ? { ref } : {})

  // ── Assistant ───────────────────────────────────────────────────────────

  /** Whether the paired desktop has a model key; checked before the user types. */
  aiStatus = (signal?: AbortSignal) => this.request<AiStatusInfo>("GET", "/api/ai/status", undefined, signal)
  agents = (signal?: AbortSignal) => this.request<AssistantAgentInfo[]>("GET", "/api/ai/agents", undefined, signal)
  sessionState = async (sessionId: string, signal?: AbortSignal) => {
    const state = await this.request<typeof SessionStateReply.Type>("POST", "/api/ai/sessions/state", { sessionId }, signal)
    if (typeof state.busy !== "boolean" || typeof state.text !== "string") throw new CompanionError(502, "The desktop returned an invalid assistant state")
    return state
  }
  sessionControls = (sessionId: string, signal?: AbortSignal) => this.request<typeof SessionControlReply.Type>("POST", "/api/ai/sessions/control", { sessionId, action: "status" }, signal)
  compactSession = (sessionId: string) => this.request<typeof SessionControlReply.Type>("POST", "/api/ai/sessions/control", { sessionId, action: "compact" })
  cancelTask = (sessionId: string, taskId: string) => this.request<typeof SessionControlReply.Type>("POST", "/api/ai/sessions/control", { sessionId, action: "cancel_task", taskId })
  questionReply = (sessionId: string, requestId: string, answers: string[][]) => this.request<typeof SessionControlReply.Type>("POST", "/api/ai/sessions/control", { sessionId, action: "answer_question", requestId, answers })
  questionReject = (sessionId: string, requestId: string) => this.request<typeof SessionControlReply.Type>("POST", "/api/ai/sessions/control", { sessionId, action: "reject_question", requestId })

  aiProviders = (signal?: AbortSignal) => this.request<AssistantProvider[]>("GET", "/api/ai/providers", undefined, signal)

  aiModels = (signal?: AbortSignal) => this.request<Array<{ id: string; provider: string; configured: boolean }>>("GET", "/api/ai/models", undefined, signal)

  /** Stops the turn the given session is running; `sessionId` may be omitted to stop whatever is running. */
  abortChat = (sessionId?: string) => this.request<{ message: string }>("POST", "/api/ai/chat/abort", sessionId ? { sessionId } : {})

  /** Answers a `permission_request` frame. Unanswered, the assistant's tool call stalls. */
  permissionReply = (sessionId: string, requestId: string, decision: "once" | "always" | "reject") =>
    this.request<{ message: string }>("POST", "/api/ai/permission/reply", { sessionId, requestId, decision })

  /**
   * Streams the assistant's reply; the assistant works on `ai/*` branches and opens pull requests,
   * never touching `main`. Passing a `sessionId` continues the same conversation as the desktop.
   */
  async *chat(
    body: ChatRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatEvent> {
    const parse = sseParser<ChatEvent>()
    let sessionId = body.sessionId
    try {
      for await (const chunk of this.transport.stream("/api/ai/chat/stream", "POST", body, signal)) {
        if (signal?.aborted) return
        for (const event of parse(chunk)) {
          if (!event || typeof event !== "object" || typeof event.type !== "string") continue
          if (typeof event.sessionId === "string" && event.sessionId) sessionId = event.sessionId
          yield event
          // Do not wait for URLSession's EOF after the server has finished the turn.
          if (event.type === "done" || event.type === "error") return
        }
      }
      if (!signal?.aborted) throw new CompanionError(0, "The assistant connection ended before the turn finished")
    } catch (error) {
      if (signal?.aborted) return
      if (error instanceof CompanionError && error.status !== 0) throw error
      if (!sessionId) throw error
      // Read the desktop's existing turn. Replaying the POST could repeat CAD/CAM changes.
      yield* this.resumeChat(sessionId, signal)
    }
  }

  /**
   * nikcli mobile architecture (spec 13 §5): start the turn on the desktop and return at once. The desktop runs it
   * whatever happens to this connection; follow it with `sessionStream`. Never retried: an uncertain delivery is
   * recovered by reading the session, not by sending the message again.
   */
  promptSession = (body: ChatRequest) => this.request<{ sessionId: string; seq: number }>("POST", "/api/ai/sessions/prompt", body)

  /** The long-lived per-session SSE stream: `server.connected`, the events after `after`, then live events and heartbeats. */
  async *sessionStream(sessionId: string, after: number | undefined, signal?: AbortSignal): AsyncGenerator<SessionStreamFrame> {
    const parse = sseParser<SessionStreamFrame>()
    const query = after === undefined ? "" : `?after=${encodeURIComponent(String(after))}`
    for await (const chunk of this.transport.stream(`/api/ai/sessions/${encodeURIComponent(sessionId)}/stream${query}`, "GET", undefined, signal)) {
      if (signal?.aborted) return
      for (const frame of parse(chunk)) {
        if (frame && typeof frame === "object" && typeof frame.type === "string") yield frame
      }
    }
  }

  /** Reattach after a network drop, project switch or app suspension, without starting another turn. */
  async *resumeChat(sessionId: string, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
    for (let attempt = 0; attempt < 60 && !signal?.aborted; attempt += 1) {
      const state = await this.sessionState(sessionId, signal)
      if (signal?.aborted) return
      for (const event of state.events ?? []) yield event
      if (!state.busy) {
        yield state.error
          ? { type: "error", sessionId, code: "provider", message: state.error }
          : { type: "done", sessionId, text: state.text, recovered: true, ...(state.usage ? { usage: state.usage } : {}) }
        return
      }
      const controls = await this.sessionControls(sessionId, signal)
      if (signal?.aborted) return
      for (const permission of controls.permissions ?? []) yield { type: "permission_request", ...permission }
      for (const question of controls.questions) yield { type: "question_request", sessionId, ...question }
      await new Promise<void>((resolve) => {
        const finish = () => { clearTimeout(timer); signal?.removeEventListener("abort", finish); resolve() }
        const timer = setTimeout(finish, 2_000)
        signal?.addEventListener("abort", finish, { once: true })
        if (signal?.aborted) finish()
      })
    }
    if (!signal?.aborted) throw new CompanionError(0, "The desktop is still working. Reconnect to recover its answer; your message has not been sent again.")
  }

  /** Adds a steer/queued message to a running session without opening a new stream. */
  queueChat = (sessionId: string, message: string, projectId?: string, delivery: "queue" | "steer" = "steer") =>
    this.request<{ message: string }>("POST", "/api/ai/chat/queue", { sessionId, message, projectId, delivery })

  // ── Notifications: the user's activity feed, shared with the desktop ────

  notifications = (options: { readonly limit?: number; readonly onlyUnread?: boolean } = {}, signal?: AbortSignal) => {
    const query = new URLSearchParams()
    if (options.limit !== undefined) query.set("limit", String(options.limit))
    if (options.onlyUnread) query.set("onlyUnread", "true")
    const suffix = query.size > 0 ? `?${query.toString()}` : ""
    return this.request<{ notifications: ReadonlyArray<NotificationRow>; unreadCount: number }>("GET", `/api/notifications${suffix}`, undefined, signal)
  }
  markNotificationRead = (id: string, isRead = true) => this.request<NotificationRow>("PUT", `/api/notifications/${encodeURIComponent(id)}`, { isRead })
  markAllNotificationsRead = () => this.request<{ message: string; count: number }>("POST", "/api/notifications/mark-all-read")
  removeNotification = (id: string) => this.request<{ message: string }>("DELETE", `/api/notifications/${encodeURIComponent(id)}`)

  // ── Live activity (SSE) ─────────────────────────────────────────────────

  /** Tails the project's live activity stream; aborting the iteration closes the connection. */
  async *events(projectId: string, signal?: AbortSignal): AsyncGenerator<LiveEvent> {
    const parse = sseParser<LiveEvent>()
    for await (const chunk of this.transport.stream(`${this.projectPath(projectId)}/events`, "GET", undefined, signal)) {
      if (signal?.aborted) break
      yield* parse(chunk)
    }
  }
}
