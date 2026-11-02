/** History acquisition stays on the authorized action adapter; exact naming runs in the scoped kernel worker. */
import type { CadKernelInput } from "@cadcamfun/api"
import type { History } from "@cadcamfun/core"
import { decodeHistory } from "../parametric.ts"
import { runKernelJob } from "../kernel-job.ts"
import type { ActionContext } from "./action.ts"

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

const historyOf = async (input: { elementId?: string; history?: unknown }, context: ActionContext): Promise<{ readonly history: History } | { readonly error: unknown }> => {
  if ((input.elementId === undefined) === (input.history === undefined)) return { error: { ok: false, op: "health", error: "Send exactly one of elementId (an existing parametric part) or history." } }
  if (input.history !== undefined) return { history: input.history as History }
  if (context.handlers.parametric === undefined) return { error: { ok: false, op: "health", error: "Parametric project tools are unavailable in this host." } }
  const inspected = asRecord(await context.handlers.parametric(context.projectId, { action: "inspect", elementId: input.elementId! }))
  if (inspected === undefined || inspected["ok"] === false) return { error: inspected ?? { ok: false, op: "health", error: "The part could not be read." } }
  const decoded = decodeHistory(inspected["history"])
  if (!decoded.success) return { error: { ok: false, op: "health", error: "The part has no readable parametric history." } }
  return { history: decoded.data }
}

export const runCadKernel = async (input: CadKernelInput, context: ActionContext) => {
  const got = await historyOf(input, context)
  if ("error" in got) return got.error
  const { history: _history, elementId: _elementId, ...request } = input
  return runKernelJob("cad-naming", { input: request, history: got.history }, { signal: context.signal })
}
