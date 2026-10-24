import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { startFakeOpenAi, type FakeOpenAi } from "../../../packages/ai/test/helpers/fake-openai.ts"
import { createFetchTransport } from "../../mobile/modules/companion-net/transport.ts"
import { CompanionClient } from "../../mobile/lib/client.ts"
import { redeemPairingLink } from "../../mobile/lib/pairing.ts"
import type { ChatEvent } from "../../mobile/lib/sse.ts"

setDefaultTimeout(120_000)

const entry = new URL("../src/main.ts", import.meta.url).pathname
const migrations = new URL("../../../packages/db/drizzle", import.meta.url).pathname
const token = "companion-chat-e2e-main-token"

let fake: FakeOpenAi
let child: ReturnType<typeof Bun.spawn>
let dataDir: string
let port: number
let toolsCalled: string[] = []
let phone: CompanionClient
let raw: ReturnType<typeof createFetchTransport>
let plateProjectId: string
let plateSessionId = ""

const local = (path: string, init: RequestInit = {}) =>
  fetch(`http://127.0.0.1:${port}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers } })

beforeAll(async () => {
  // The "model": a scripted OpenAI-compatible server. It plays the part of an LLM that is asked, from the phone, to change the
  // drawing: it opens a branch, edits, commits and opens a pull request, then reports. Turns without tools are helper calls.
  fake = startFakeOpenAi((request) => {
    if (JSON.stringify(request.messages.findLast((message) => message.role === "user")?.content).includes("Mobile greeting regression")) return { text: "Hello from the desktop assistant." }
    if (JSON.stringify(request.messages).includes("Mobile stream regression")) return request.messages.some((message) => message.role === "tool")
      ? { text: "Stock confirmed after the phone reconnected." }
      : { toolCalls: [{ name: "question", args: { questions: [{ header: "Stock", question: "Choose stock", options: [{ label: "Aluminium", description: "Use aluminium stock" }] }] } }] }
    if (JSON.stringify(request.messages).includes("Mobile question regression")) return request.messages.some((message) => message.role === "tool")
      ? { text: "Stock confirmed from the phone." }
      : { toolCalls: [{ name: "question", args: { questions: [{ header: "Stock", question: "Choose stock", options: [{ label: "Aluminium", description: "Use aluminium stock" }] }] } }] }
    if ((request.tools ?? []).length === 0) return { text: "Widen the plate" }
    const results = request.messages.filter((m) => m.role === "tool").length
    switch (results) {
      case 0: return { toolCalls: [{ name: "vcs_edit", args: { action: "start_change", topic: "Widen the plate" } }] }
      case 1: return { toolCalls: [{ name: "cad_edit", args: { action: "add_entities", entities: [{ type: "rectangle", origin: { x: 0, y: 0 }, width: 140, height: 50 }] } }] }
      case 2: return { toolCalls: [{ name: "vcs_edit", args: { action: "commit", message: "Add the 140 x 50 plate outline" } }] }
      case 3: return { toolCalls: [{ name: "vcs_edit", args: { action: "open_pull_request", title: "Widen the plate", body: "Adds a 140 x 50 mm outline. Please check the width." } }] }
      default: return { text: "I opened a pull request with the wider plate for you to review." }
    }
  })
  dataDir = mkdtempSync(join(tmpdir(), "cadcamfun-chat-e2e-"))
  child = Bun.spawn([process.execPath, entry], {
    env: {
      ...process.env, CADCAMFUN_TOKEN: token, CADCAMFUN_DATA_DIR: dataDir, CADCAMFUN_MIGRATIONS_DIR: migrations,
      CADCAMFUN_AI_OFFLINE: "1", CADCAMFUN_AI_MINIMAX_BASE_URL: fake.baseUrl,
    },
    stdin: "pipe", stdout: "pipe", stderr: "ignore",
  })
  const reader = (child.stdout as ReadableStream<Uint8Array>).getReader()
  let out = ""
  const deadline = Date.now() + 30_000
  while (!out.includes("\n")) {
    if (Date.now() > deadline) throw new Error("ready timeout")
    const { done, value } = await reader.read()
    if (done) throw new Error("sidecar exited early")
    out += new TextDecoder().decode(value)
  }
  port = JSON.parse(out.split("\n")[0]!).port as number
})

afterAll(async () => {
  child?.kill("SIGTERM")
  await child?.exited
  fake?.stop()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true })
})

describe("the assistant from the phone", () => {
  test("a chat message sent over the paired connection ends in a reviewable pull request, with main untouched", async () => {
    // Desktop side: a key for the (fake) provider, a project with one committed drawing, the gateway on, a paired phone.
    expect((await local("/api/ai/credentials", { method: "PUT", body: JSON.stringify({ provider: "minimax", key: "sk-fake-test-key" }) })).status).toBe(200)
    const project = await (await local("/api/projects", { method: "POST", body: JSON.stringify({ name: "Bracket" }) })).json()
    plateProjectId = project.id
    await local(`/api/projects/${project.id}/drawings`, { method: "POST", body: JSON.stringify({ name: "Plate", data: { elements: [], version: "1.0" } }) })
    expect((await local(`/api/projects/${project.id}/vcs/commit`, { method: "POST", body: JSON.stringify({ message: "Initial import" }) })).status).toBe(201)

    const gatewayPort = 20_000 + Math.floor(Math.random() * 20_000)
    await local("/api/companion/enable", { method: "POST", body: JSON.stringify({ port: gatewayPort }) })
    const paired = await (await local("/api/companion/pair", { method: "POST", body: JSON.stringify({ name: "iPhone", host: "127.0.0.1" }) })).json()
    const pem = readFileSync(join(dataDir, "companion", "cert.pem"), "utf8")
    const pinned = ((url: string, init: RequestInit) => fetch(url, { ...init, tls: { ca: pem, checkServerIdentity: () => undefined } } as RequestInit)) as unknown as typeof fetch
    const pairing = await redeemPairingLink(paired.link, pinned)
    raw = createFetchTransport(pairing, pinned)
    phone = new CompanionClient(raw)

    // Phone side: ask the assistant, exactly as the app's chat does, and read the streamed events.
    const events: ChatEvent[] = []
    // `vcs_edit` and `cad_edit` hold a destructive action (restore, delete), so the host asks before any call of them: the person
    // holding the phone approves each one, exactly as the app's chat does. Unanswered, the turn would stall.
    const approved: string[] = []
    for await (const event of phone.chat({ projectId: project.id, message: "Make the plate 140 mm wide and open a pull request for it" })) {
      events.push(event)
      if (event.type === "permission_request") {
        const request = event as unknown as { requestId: string; sessionId: string; permission: string }
        approved.push(request.permission)
        await phone.permissionReply(request.sessionId, request.requestId, "once")
      }
    }
    expect(approved).toEqual(["vcs_edit", "cad_edit", "vcs_edit", "vcs_edit"])
    toolsCalled = events.flatMap((e) => (e.type === "tool_call" ? [String((e as { tool: string }).tool)] : []))
    expect(toolsCalled).toEqual(["vcs_edit", "cad_edit", "vcs_edit", "vcs_edit"])
    expect(events.at(-1)?.type).toBe("done")
    expect(events.some((e) => e.type === "error")).toBe(false)

    // A reconnecting phone reads stored evidence through the gateway; recovery never executes tools again.
    const done = events.findLast((event): event is Extract<(typeof events)[number], { type: "done" }> => event.type === "done")
    if (!done) throw new Error("Missing completed host turn")
    expect(typeof done?.sessionId).toBe("string")
    plateSessionId = String(done.sessionId)
    const recovered = await phone.sessionState(String(done?.sessionId))
    expect(recovered.busy).toBe(false)
    expect(recovered.text).toBe(done?.text)
    const storedCalls = recovered.events?.filter((event) => event.type === "tool_call") ?? []
    const streamedCalls = events.filter((event): event is Extract<(typeof events)[number], { type: "tool_call" }> => event.type === "tool_call")
    expect(storedCalls.map((event) => ({ tool: event.tool, callId: event.callId }))).toEqual(
      streamedCalls.map((event) => ({ tool: event.tool, callId: event.callId })),
    )
    const storedResults = recovered.events?.filter((event) => event.type === "tool_result") ?? []
    expect(storedResults).toHaveLength(4)
    expect(storedResults.every((event) => event.ok)).toBe(true)
    expect(recovered.usage).toBeDefined()
    expect(recovered.usage?.inputTokens).toBeGreaterThan(0)
    expect(recovered.usage?.outputTokens).toBeGreaterThan(0)

    // The result, as the phone sees it: an AI pull request on its own branch, with the change in it.
    const pulls = await phone.pullRequests(project.id)
    expect(pulls).toHaveLength(1)
    expect(pulls[0]).toMatchObject({ state: "open", authorKind: "ai", base: "main", title: "Widen the plate" })
    expect(pulls[0]!.head).toMatch(/^ai\//)
    const detail = await phone.pullRequest(project.id, pulls[0]!.number)
    expect(detail.changes.map((c) => c.kind)).toContain("drawings")

    // main did not move: the project's initial commit and the human's, none of the AI's.
    const branches = await phone.branches(project.id)
    const main = await phone.log(project.id, 10)
    expect(Object.keys(branches.branches).sort()).toEqual(["main", pulls[0]!.head].sort())
    const mainLog = await (await local(`/api/projects/${project.id}/vcs/log?rev=main`)).json()
    expect(mainLog.map((c: { message: string }) => c.message.trim())).toEqual(["Initial import", "Initial commit"])
    expect(main.length).toBeGreaterThanOrEqual(2) // the checked-out ai branch carries the AI's commit on top
  })

  test("the exact mobile greeting payload answers and continues the same native session", async () => {
    const project = await (await local("/api/projects", { method: "POST", body: JSON.stringify({ name: "Mobile greeting" }) })).json()
    const providers = await phone.aiProviders()
    const provider = providers.find((provider) => provider.id === "minimax" && provider.configured)
    // The fixture speaks Chat Completions; other catalogue models can use a different protocol.
    const model = provider?.models.find((model) => model.id === "MiniMax-M2" && model.tools)
    if (!provider || !model) throw new Error("The phone cannot discover its connected desktop model")
    let sessionId = "s-mobile-greeting-regression"
    for (const message of ["Mobile greeting regression: Hi", "Mobile greeting regression: continue"]) {
      const events: ChatEvent[] = []
      for await (const event of phone.chat({ projectId: project.id, sessionId, agent: "general", mode: "general", message, model: { provider: provider.id, model: model.id }, permissionMode: "ask", includeContext: false })) events.push(event)
      expect(events.filter((event) => event.type === "error")).toEqual([])
      const done = events.at(-1)
      expect(done).toMatchObject({ type: "done", text: "Hello from the desktop assistant." })
      expect(String(done?.sessionId)).toMatch(/^ses_/)
      if (sessionId.startsWith("ses_")) expect(done?.sessionId).toBe(sessionId)
      sessionId = String(done?.sessionId)
      const recovered = []
      for await (const event of phone.resumeChat(sessionId)) recovered.push(event)
      expect(recovered.at(-1)).toMatchObject({ type: "done", text: "Hello from the desktop assistant.", recovered: true })
    }
  })

  test("the AI cannot merge: a merge needs a person, and the AI's own request to commit on main is refused", async () => {
    const id = plateProjectId
    // A person (the desktop) merges; before that, main is still the human commit only.
    const checkout = await local(`/api/projects/${id}/vcs/checkout`, { method: "POST", body: JSON.stringify({ branch: "main" }) })
    expect(checkout.status).toBe(200)
    const merged = await local(`/api/projects/${id}/pulls/1/merge`, { method: "POST" })
    expect(merged.status).toBe(200)
    expect((await merged.json()).state).toBe("merged")
    const log = await (await local(`/api/projects/${id}/vcs/log?rev=main`)).json()
    expect(log.map((c: { message: string }) => c.message.trim())).toContain("Add the 140 x 50 plate outline")
  })

  test("a detached phone restores a native question and answers without replaying the prompt", async () => {
    const project = await (await local("/api/projects", { method: "POST", body: JSON.stringify({ name: "Question recovery" }) })).json()
    const controller = new AbortController()
    let sessionId = ""
    for await (const event of phone.chat({ projectId: project.id, message: "Mobile question regression: choose stock", agent: "general" }, controller.signal)) {
      if (typeof event.sessionId === "string") sessionId = event.sessionId
      if (event.type === "question_request") { controller.abort(); break }
    }
    expect(sessionId).toMatch(/^ses_/)
    const events: ChatEvent[] = []
    for await (const event of phone.resumeChat(sessionId)) {
      events.push(event)
      if (event.type === "question_request" && typeof event.requestId === "string") await phone.questionReply(sessionId, event.requestId, [["Aluminium"]])
    }
    expect(events.filter((event) => event.type === "question_request")).toHaveLength(1)
    expect(events.at(-1)).toMatchObject({ type: "done", text: "Stock confirmed from the phone.", recovered: true })
  })

  test("nikcli mobile architecture: the prompt returns at once, the turn outlives the phone's stream, and a reconnect replays exactly what was missed", async () => {
    const project = await (await local("/api/projects", { method: "POST", body: JSON.stringify({ name: "Session stream" }) })).json()
    const started = await phone.promptSession({ projectId: project.id, message: "Mobile stream regression: choose stock", agent: "general" })
    expect(started.sessionId).toMatch(/^ses_/)

    // First connection: follow until the agent asks a question, then the phone goes away mid-turn.
    const first = new AbortController()
    let cursor = started.seq
    let requestId = ""
    const seen: string[] = []
    for await (const frame of phone.sessionStream(started.sessionId, started.seq, first.signal)) {
      if (frame.type === "server.connected") { expect(frame.busy).toBe(true); continue }
      if (frame.type !== "event") continue
      expect(frame.seq).toBeGreaterThan(cursor)
      cursor = frame.seq
      seen.push(frame.event.type)
      if (frame.event.type === "question_request") { requestId = String((frame.event as { requestId: string }).requestId); first.abort(); break }
    }
    expect(seen[0]).toBe("turn")
    expect(requestId).not.toBe("")

    // With no stream open, the phone answers; the desktop finishes the turn on its own.
    await phone.questionReply(started.sessionId, requestId, [["Aluminium"]])
    for (let attempt = 0; attempt < 100 && (await phone.sessionState(started.sessionId)).busy; attempt += 1) await Bun.sleep(100)

    // Reconnect from the cursor: only the missed frames, in order, ending with the answer; nothing replayed twice.
    const second = new AbortController()
    const replay: Array<{ seq: number; type: string; text?: string }> = []
    let greeting: { busy: boolean; reset?: boolean } | undefined
    for await (const frame of phone.sessionStream(started.sessionId, cursor, second.signal)) {
      if (frame.type === "server.connected") { greeting = frame; continue }
      if (frame.type !== "event") continue
      replay.push({ seq: frame.seq, type: frame.event.type, ...("text" in frame.event ? { text: String(frame.event.text) } : {}) })
      if (frame.event.type === "done" || frame.event.type === "error") { second.abort(); break }
    }
    // The journal still owns the turn (the host may look idle between the answer and the next step); the end arrives live.
    expect(greeting).toBeDefined()
    expect(greeting?.reset).toBeUndefined()
    expect(replay.every((frame) => frame.seq > cursor)).toBe(true)
    expect(replay.some((frame) => frame.type === "question_request")).toBe(false)
    expect(replay.at(-1)).toMatchObject({ type: "done", text: "Stock confirmed after the phone reconnected." })
  })

  test("the phone lists its conversations and pages one's history through the gateway", async () => {
    const get = async (path: string) => {
      const res = await raw.request(path, "GET")
      return { status: res.status, body: res.body ? JSON.parse(res.body) : undefined }
    }
    const list = await get(`/api/ai/sessions?projectId=${encodeURIComponent(plateProjectId)}`)
    expect(list.status).toBe(200)
    const row = (list.body as Array<{ id: string; projectId: string; title: string; updatedAt: string | null; busy: boolean }>).find((entry) => entry.id === plateSessionId)
    expect(row).toMatchObject({ projectId: plateProjectId, busy: false })
    expect(typeof row?.title).toBe("string")
    expect(row?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const all = await get(`/api/ai/sessions/${plateSessionId}/messages?limit=100`)
    expect(all.status).toBe(200)
    const messages = all.body.messages as Array<{ id: string; role: string; text: string; tools: Array<{ tool: string; status: string }> }>
    expect(messages[0]).toMatchObject({ role: "user", text: "Make the plate 140 mm wide and open a pull request for it" })
    expect(messages.at(-1)).toMatchObject({ role: "assistant", text: "I opened a pull request with the wider plate for you to review." })
    expect(messages.flatMap((message) => message.tools.map((tool) => tool.tool))).toEqual(["vcs_edit", "cad_edit", "vcs_edit", "vcs_edit"])
    expect(messages.flatMap((message) => message.tools).every((tool) => tool.status === "completed")).toBe(true)
    expect(all.body.before).toBeNull()

    // Paging backwards one message at a time walks the same conversation.
    const walked: string[] = []
    let before: string | null = null
    for (let page = 0; page < 50; page++) {
      const next = await get(`/api/ai/sessions/${plateSessionId}/messages?limit=1${before ? `&before=${before}` : ""}`)
      expect(next.status).toBe(200)
      walked.unshift(...(next.body.messages as Array<{ id: string }>).map((message) => message.id))
      before = next.body.before
      if (before === null) break
    }
    expect(walked).toEqual(messages.map((message) => message.id))

    // Another project's list does not show it; a malformed request is a 400, an unknown session too (never 403/404).
    const other = await (await local("/api/projects", { method: "POST", body: JSON.stringify({ name: "Other" }) })).json()
    expect((await get(`/api/ai/sessions?projectId=${other.id}`)).body).toEqual([])
    expect((await get(`/api/ai/sessions?projectId=${plateProjectId}&limit=0`)).status).toBe(400)
    expect((await get(`/api/ai/sessions/${plateSessionId}/messages?before=bad%20id`)).status).toBe(400)
    expect((await get(`/api/ai/sessions/${plateSessionId}/messages?before=msg_unknown`)).status).toBe(400)
    expect((await get("/api/ai/sessions/ses_unknown/messages")).status).toBe(400)
  })
})
