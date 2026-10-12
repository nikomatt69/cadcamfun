import { expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { ActionConflict, ActionInvocation, ActionMutationOutcome, ActionReceipt } from "../src/ai-actions.ts"

const receipt = {
  receiptId: "receipt", actionId: "cad_edit.add", actorId: "actor", projectId: "project", drawingId: "drawing",
  callId: "call", previousRevision: 2, revision: 3, committedAt: "2026-10-12T17:00:00.000Z", result: { ids: ["element"] }
}

test("shared action receipts and conflicts survive JSON encode/decode", async () => {
  const committed = { ok: true, _tag: "ActionCommitted", receipt } as const
  const conflict = { ok: false, _tag: "ActionConflict", actionId: "cad_edit.add", projectId: "project", drawingId: "drawing", expectedRevision: 2, actualRevision: 3, message: "Document changed" } as const
  for (const value of [committed, conflict]) {
    const decoded = await Effect.runPromise(Schema.decodeUnknownEffect(ActionMutationOutcome)(JSON.parse(JSON.stringify(value))))
    expect(await Effect.runPromise(Schema.encodeEffect(ActionMutationOutcome)(decoded))).toEqual(value)
  }
})

test("shared invocation and mutation contracts reject missing ownership and invalid revisions", async () => {
  const invocation = { actorId: "actor", projectId: "project", sessionId: "session", turnId: "turn", callId: "call" }
  expect(await Effect.runPromise(Schema.decodeUnknownEffect(ActionInvocation)(invocation))).toEqual(invocation)
  for (const value of [{ ...invocation, actorId: "" }, { ...invocation, callId: undefined }, { ...invocation, expectedRevision: -1 }, { ...invocation, expectedRevision: 1.5 }]) {
    expect(await Effect.runPromise(Schema.decodeUnknownEffect(ActionInvocation)(value).pipe(Effect.isSuccess))).toBe(false)
  }
  expect(await Effect.runPromise(Schema.decodeUnknownEffect(ActionReceipt)({ ...receipt, revision: -1 }).pipe(Effect.isSuccess))).toBe(false)
  expect(await Effect.runPromise(Schema.decodeUnknownEffect(ActionConflict)({ ok: true }).pipe(Effect.isSuccess))).toBe(false)
})
