import type { EntityChange, PullRequestRow, ReviewRow, VcsBranches, VcsCommit, VcsStatus, WorkflowRunRow } from "@cadcamfun/api"
import type { Pairing } from "./pairing.ts"
import { sseParser, type ChatEvent } from "./sse.ts"

type Fetch = typeof fetch

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
 * The phone's whole view of a desktop: plain `fetch` against the same HTTP API the desktop UI uses (no Effect runtime
 * in the webview, types only from `@cadcamfun/api`). On iOS the native layer supplies the `fetch` that pins the
 * pairing certificate; tests pass a fake.
 */
export class CompanionClient {
  constructor(private readonly pairing: Pick<Pairing, "baseUrl" | "token">, private readonly fetcher: Fetch = fetch) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetcher(`${this.pairing.baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.pairing.token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    const json = text ? (JSON.parse(text) as unknown) : undefined
    if (!res.ok) throw new CompanionError(res.status, (json as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`)
    return json as T
  }

  private project = (id: string) => `/api/projects/${encodeURIComponent(id)}`

  health = () => this.request<{ status?: string }>("GET", "/api/health")
  projects = () => this.request<ProjectSummary[]>("GET", "/api/projects")

  status = (id: string) => this.request<VcsStatus>("GET", `${this.project(id)}/vcs/status`)
  log = (id: string, limit = 50) => this.request<Array<VcsCommit>>("GET", `${this.project(id)}/vcs/log?limit=${limit}`)
  branches = (id: string) => this.request<VcsBranches>("GET", `${this.project(id)}/vcs/branches`)
  diff = (id: string, to: string, from?: string) =>
    this.request<EntityChange[]>("GET", `${this.project(id)}/vcs/diff?to=${encodeURIComponent(to)}${from ? `&from=${encodeURIComponent(from)}` : ""}`)
  commit = (id: string, message: string) => this.request<VcsCommit>("POST", `${this.project(id)}/vcs/commit`, { message })
  restore = (id: string, rev: string) => this.request<VcsCommit>("POST", `${this.project(id)}/vcs/restore`, { rev })

  pullRequests = (id: string, state?: PullRequestRow["state"]) =>
    this.request<PullRequestRow[]>("GET", `${this.project(id)}/pulls${state ? `?state=${state}` : ""}`)
  pullRequest = (id: string, number: number) => this.request<PullRequestDetail>("GET", `${this.project(id)}/pulls/${number}`)
  review = (id: string, number: number, verdict: ReviewRow["verdict"], body = "") =>
    this.request<ReviewRow>("POST", `${this.project(id)}/pulls/${number}/reviews`, { verdict, body })
  merge = (id: string, number: number) => this.request<PullRequestRow>("POST", `${this.project(id)}/pulls/${number}/merge`)
  close = (id: string, number: number) => this.request<PullRequestRow>("POST", `${this.project(id)}/pulls/${number}/close`)

  runs = (id: string) => this.request<WorkflowRunRow[]>("GET", `${this.project(id)}/actions/runs`)
  dispatch = (id: string, ref?: string) => this.request<WorkflowRunRow[]>("POST", `${this.project(id)}/actions/dispatch`, ref ? { ref } : {})

  /** Streams the assistant's reply; the assistant works on `ai/*` branches and opens pull requests, never touching `main`. */
  async *chat(projectId: string, message: string, sessionId?: string, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
    const res = await this.fetcher(`${this.pairing.baseUrl}/api/ai/chat/stream`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.pairing.token}`, "content-type": "application/json" },
      body: JSON.stringify({ message, projectId, ...(sessionId ? { sessionId } : {}) }),
      signal,
    })
    if (!res.ok || !res.body) throw new CompanionError(res.status, `Assistant unavailable (HTTP ${res.status})`)
    const parse = sseParser()
    const decoder = new TextDecoder()
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      yield* parse(decoder.decode(value, { stream: true }))
    }
  }
}
