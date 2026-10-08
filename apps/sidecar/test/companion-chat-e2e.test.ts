import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { startFakeOpenAi, type FakeOpenAi } from "../../../packages/ai/test/helpers/fake-openai.ts"
import { CompanionClient } from "../../mobile/src/companion/client.ts"
import { parsePairingLink } from "../../mobile/src/companion/pairing.ts"

setDefaultTimeout(120_000)

const entry = new URL("../src/main.ts", import.meta.url).pathname
const migrations = new URL("../../../packages/db/drizzle", import.meta.url).pathname
const token = "companion-chat-e2e-main-token"

let fake: FakeOpenAi
let child: ReturnType<typeof Bun.spawn>
let dataDir: string
let port: number
let toolsCalled: string[] = []

const local = (path: string, init: RequestInit = {}) =>
  fetch(`http://127.0.0.1:${port}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers } })

beforeAll(async () => {
  // The "model": a scripted OpenAI-compatible server. It plays the part of an LLM that is asked, from the phone, to change the
  // drawing: it opens a branch, edits, commits and opens a pull request, then reports. Turns without tools are helper calls.
  fake = startFakeOpenAi((request) => {
    if ((request.tools ?? []).length === 0) return { text: "Widen the plate" }
    const results = request.messages.filter((m) => m.role === "tool").length
    switch (results) {
      case 0: return { toolCalls: [{ name: "vcs_start_change", args: { topic: "Widen the plate" } }] }
      case 1: return { toolCalls: [{ name: "cad_add_entities", args: { entities: [{ type: "rectangle", origin: { x: 0, y: 0 }, width: 140, height: 50 }] } }] }
      case 2: return { toolCalls: [{ name: "vcs_commit", args: { message: "Add the 140 x 50 plate outline" } }] }
      case 3: return { toolCalls: [{ name: "vcs_open_pull_request", args: { title: "Widen the plate", body: "Adds a 140 x 50 mm outline. Please check the width." } }] }
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
    await local(`/api/projects/${project.id}/drawings`, { method: "POST", body: JSON.stringify({ name: "Plate", data: { elements: [], version: "1.0" } }) })
    expect((await local(`/api/projects/${project.id}/vcs/commit`, { method: "POST", body: JSON.stringify({ message: "Initial import" }) })).status).toBe(201)

    const gatewayPort = 20_000 + Math.floor(Math.random() * 20_000)
    await local("/api/companion/enable", { method: "POST", body: JSON.stringify({ port: gatewayPort }) })
    const paired = await (await local("/api/companion/pair", { method: "POST", body: JSON.stringify({ name: "iPhone", host: "127.0.0.1" }) })).json()
    const pairing = parsePairingLink(paired.link)
    const pem = readFileSync(join(dataDir, "companion", "cert.pem"), "utf8")
    const pinned = ((url: string, init: RequestInit) => fetch(url, { ...init, tls: { ca: pem, checkServerIdentity: () => undefined } } as RequestInit)) as unknown as typeof fetch
    const phone = new CompanionClient(pairing, pinned)

    // Phone side: ask the assistant, exactly as the app's chat does, and read the streamed events.
    const events = []
    for await (const event of phone.chat(project.id, "Make the plate 140 mm wide and open a pull request for it")) events.push(event)
    toolsCalled = events.flatMap((e) => (e.type === "tool_call" ? [String((e as { tool: string }).tool)] : []))
    expect(toolsCalled).toEqual(["vcs_start_change", "cad_add_entities", "vcs_commit", "vcs_open_pull_request"])
    expect(events.at(-1)?.type).toBe("done")
    expect(events.some((e) => e.type === "error")).toBe(false)

    // The result, as the phone sees it: an AI pull request on its own branch, with the change in it.
    const pulls = await phone.pullRequests(project.id)
    expect(pulls).toHaveLength(1)
    expect(pulls[0]).toMatchObject({ state: "open", authorKind: "ai", base: "main", title: "Widen the plate" })
    expect(pulls[0]!.head).toMatch(/^ai\//)
    const detail = await phone.pullRequest(project.id, pulls[0]!.number)
    expect(detail.changes.map((c) => c.kind)).toContain("drawings")

    // main did not move: its only commit is the human's.
    const branches = await phone.branches(project.id)
    const main = await phone.log(project.id, 10)
    expect(Object.keys(branches.branches).sort()).toEqual(["main", pulls[0]!.head].sort())
    const mainLog = await (await local(`/api/projects/${project.id}/vcs/log?rev=main`)).json()
    expect(mainLog.map((c: { message: string }) => c.message.trim())).toEqual(["Initial import"])
    expect(main.length).toBeGreaterThanOrEqual(2) // the checked-out ai branch carries the AI's commit on top
  })

  test("the AI cannot merge: a merge needs a person, and the AI's own request to commit on main is refused", async () => {
    const projects = (await (await local("/api/projects")).json()) as Array<{ id: string }>
    const id = projects[0]!.id
    // A person (the desktop) merges; before that, main is still the human commit only.
    const checkout = await local(`/api/projects/${id}/vcs/checkout`, { method: "POST", body: JSON.stringify({ branch: "main" }) })
    expect(checkout.status).toBe(200)
    const merged = await local(`/api/projects/${id}/pulls/1/merge`, { method: "POST" })
    expect(merged.status).toBe(200)
    expect((await merged.json()).state).toBe("merged")
    const log = await (await local(`/api/projects/${id}/vcs/log?rev=main`)).json()
    expect(log.map((c: { message: string }) => c.message.trim())).toContain("Add the 140 x 50 plate outline")
  })
})
