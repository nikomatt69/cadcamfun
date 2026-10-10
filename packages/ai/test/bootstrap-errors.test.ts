import { expect, test } from "bun:test"
import { bootstrapStep, describeBootstrapFailure } from "../src/nikcli/bootstrap-errors.ts"

test("bootstrap diagnostics retain HTTP status and exclude response bodies", async () => {
  const error = new Error("UnexpectedStatus", { cause: { status: 500, body: "secret-response" } })
  expect(describeBootstrapFailure(error)).toBe("UnexpectedStatus (HTTP 500)")
  await expect(bootstrapStep("credential replay for minimax-coding-plan", () => Promise.reject(error))).rejects.toThrow("credential replay for minimax-coding-plan: UnexpectedStatus (HTTP 500)")
  expect(describeBootstrapFailure(error)).not.toContain("secret-response")
})

test("malformed and cyclic errors cannot trap the diagnostic formatter", () => {
  const cycle: { cause?: unknown } = {}
  cycle.cause = cycle
  expect(describeBootstrapFailure(cycle)).toBe("Unknown host failure")
  expect(describeBootstrapFailure(new Error("closed"))).toBe("closed")
})
