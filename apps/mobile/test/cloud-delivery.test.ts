import { expect, test } from "bun:test"
import { CompanionClient, CompanionError, type Transport } from "../lib/client"
import { cloudProjectStatus } from "../lib/cloud-delivery"

const status = { projectId: "project/1", localHead: "a".repeat(40), remoteHead: null, state: "pending", dirty: false }

test("send-to-PC creates a cloud delivery and reads authoritative progress", async () => {
  const seen: { path: string; method: string; body: unknown }[] = []
  const transport: Transport = {
    request: async (path, method, body) => { seen.push({ path, method, body }); return { status: 200, body: JSON.stringify(status) } },
    async *stream() {},
  }
  const client = new CompanionClient(transport)
  expect((await client.sendToDesktop("project/1")).state).toBe("pending")
  await client.sendToDesktop("project/1", "  Ready for desktop  ")
  await client.cloudStatus("project/1")
  expect(seen).toEqual([
    { path: "/api/projects/project%2F1/cloud/send", method: "POST", body: {} },
    { path: "/api/projects/project%2F1/cloud/send", method: "POST", body: { message: "Ready for desktop" } },
    { path: "/api/projects/project%2F1/cloud/status", method: "GET", body: undefined },
  ])
})

test("malformed and foreign delivery receipts never report successful application", () => {
  for (const value of [null, [], {}, { ...status, state: "done" }, { ...status, projectId: "another-project" }, { ...status, localHead: "invalid" }, { ...status, dirty: "false" }]) {
    expect(() => cloudProjectStatus(value, "project/1")).toThrow(CompanionError)
  }
  for (const state of ["local", "pending", "downloaded", "applied", "conflict"] as const) expect(cloudProjectStatus({ ...status, state }, "project/1").state).toBe(state)
})

test("a refused cloud delivery keeps the actual error and back-off", async () => {
  const client = new CompanionClient({ request: async () => ({ status: 409, body: JSON.stringify({ message: "Assistant is changing this project" }), headers: { "retry-after": "2" } }), async *stream() {} })
  try {
    await client.sendToDesktop("project/1")
    throw new Error("Expected a conflict")
  } catch (error) {
    expect(error).toBeInstanceOf(CompanionError)
    expect((error as CompanionError).status).toBe(409)
    expect((error as Error).message).toContain("Assistant")
    expect((error as CompanionError).retryAfterMs).toBe(2000)
  }
})
