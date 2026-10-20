/**
 * Post-edit diagnostics, the CAD/CAM counterpart of what nikcli/opencode do with a TypeScript LSP:
 * after a tool edits a file, the language server's diagnostics for that file are attached to the tool
 * result, so the model sees the errors it just created in the same step and fixes them without
 * spending a separate check call. Here the "files" are the open drawing (after `cad_edit`/`parts`)
 * and an operation's stored program (after `cam_edit`), and the "language server" is the
 * deterministic machinery the app already has: `checkDesign` (`cad.checkModel` over the drawing)
 * for CAD and `analyzeGcode` (static G-code checks) for CAM. Never an LLM, never a new verdict.
 *
 * Rules, mirroring the LSP integration:
 * - Only after a successful mutation (`read` actions and refusals get nothing).
 * - Only for the touched artifact: a CAM edit with no stored program yet has nothing to diagnose.
 * - A result that already carries findings (`issues` from verify/check/manufacture) is not doubled.
 * - Fail-open: a diagnostics failure never fails the edit it follows; the edit's own result stands.
 * - Bounded: at most {@link MAX_POST_EDIT_DIAGNOSTICS} findings, counted in full in the summary.
 */
import { analyzeGcode } from "./gcode-analysis.ts"
import type { ActionContext, ActionSpec } from "./actions/action.ts"

export const MAX_POST_EDIT_DIAGNOSTICS = 8

/**
 * Hard cap on the time diagnostics may add to an edit. An LSP that answers late is ignored the same
 * way: the edit's result goes back without findings rather than late. The check itself is
 * deterministic and local (no model call), so in practice this fires only on very large drawings.
 */
export const POST_EDIT_DIAGNOSTICS_BUDGET_MS = 1_500

const withinBudget = async <A>(work: Promise<A>, budgetMs: number): Promise<A | undefined> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), budgetMs) })
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export interface PostEditDiagnostic {
  readonly severity: "error" | "warning" | "info"
  readonly code: string
  readonly message: string
  /** The drawing element the finding is about (CAD). */
  readonly elementId?: string
  /** The operation whose program the finding is about (CAM). */
  readonly operationId?: string
  /** 1-based line in the stored program (CAM). */
  readonly line?: number
}

export interface PostEditDiagnostics {
  readonly source: "cad" | "cam"
  /** What was checked, in words the model can act on. */
  readonly checked: string
  readonly errors: number
  readonly warnings: number
  readonly infos: number
  readonly issues: ReadonlyArray<PostEditDiagnostic>
  /** Present when more findings exist than are listed. */
  readonly omitted?: number
  readonly guidance: string
}

const GUIDANCE = "Diagnostics ran automatically on what this edit changed (like an LSP after an edit). Fix every error before continuing; do not repeat the same edit unchanged. Warnings may be reported to the user instead."

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined

const severityOf = (value: unknown): PostEditDiagnostic["severity"] =>
  value === "error" ? "error" : value === "warning" ? "warning" : "info"

const summarize = (source: "cad" | "cam", checked: string, all: ReadonlyArray<PostEditDiagnostic>): PostEditDiagnostics => ({
  source,
  checked,
  errors: all.filter((issue) => issue.severity === "error").length,
  warnings: all.filter((issue) => issue.severity === "warning").length,
  infos: all.filter((issue) => issue.severity === "info").length,
  issues: all.slice(0, MAX_POST_EDIT_DIAGNOSTICS),
  ...(all.length > MAX_POST_EDIT_DIAGNOSTICS ? { omitted: all.length - MAX_POST_EDIT_DIAGNOSTICS } : {}),
  guidance: GUIDANCE
})

const cadDiagnostics = async (result: Record<string, unknown>, context: ActionContext): Promise<PostEditDiagnostics | undefined> => {
  if (typeof context.handlers.checkDesign !== "function") return undefined
  const checked = await context.handlers.checkDesign(context.projectId) as { issues?: unknown }
  if (!Array.isArray(checked?.issues)) return undefined
  const all = checked.issues.flatMap((item): PostEditDiagnostic[] => {
    const issue = record(item)
    if (issue === undefined || typeof issue["message"] !== "string") return []
    return [{
      severity: severityOf(issue["severity"]),
      code: typeof issue["code"] === "string" ? issue["code"] : "CAD_CHECK",
      message: issue["message"].slice(0, 300),
      ...(typeof issue["elementId"] === "string" ? { elementId: issue["elementId"] } : {})
    }]
  })
  const drawingId = typeof result["drawingId"] === "string" ? result["drawingId"] : undefined
  return summarize("cad", drawingId === undefined ? "the open drawing after this edit" : `drawing ${drawingId} after this edit`, all)
}

const camDiagnostics = async (result: Record<string, unknown>, context: ActionContext): Promise<PostEditDiagnostics | undefined> => {
  const operationId = typeof result["operationId"] === "string" ? result["operationId"] : undefined
  if (operationId === undefined || typeof context.handlers.operationProgram !== "function") return undefined
  const program = await context.handlers.operationProgram(context.projectId, operationId)
  if (!program.ok || program.gcode.trim() === "") return undefined
  const machine = typeof context.handlers.machine === "function" ? await context.handlers.machine(context.projectId) : undefined
  const report = analyzeGcode(program.gcode, machine)
  const all = report.issues.map((issue): PostEditDiagnostic => ({
    severity: issue.severity,
    code: issue.code,
    message: issue.message.slice(0, 300),
    operationId,
    line: issue.line
  }))
  return summarize("cam", `the stored program of operation ${operationId} after this edit`, all)
}

/**
 * The diagnostics for one finished action, or `undefined` when this action has nothing to diagnose
 * (a read, a refusal, an untouched artifact, a result that already reports findings, or a check
 * that could not run). Never throws.
 */
export const postEditDiagnostics = async (
  action: Pick<ActionSpec, "id" | "kind">,
  result: unknown,
  context: ActionContext,
  budgetMs: number = POST_EDIT_DIAGNOSTICS_BUDGET_MS
): Promise<PostEditDiagnostics | undefined> => {
  try {
    if (action.kind === "read") return undefined
    const value = record(result)
    if (value === undefined || value["ok"] === false) return undefined
    if (Array.isArray(value["issues"]) && value["issues"].length > 0) return undefined
    const tool = action.id.slice(0, action.id.indexOf("."))
    if (tool === "cad_edit" || tool === "parts") return await withinBudget(cadDiagnostics(value, context), budgetMs)
    if (tool === "cam_edit") return await withinBudget(camDiagnostics(value, context), budgetMs)
    return undefined
  } catch {
    return undefined
  }
}

/** The result with its post-edit diagnostics attached (unchanged when there are none). */
export const withPostEditDiagnostics = async (
  action: Pick<ActionSpec, "id" | "kind">,
  result: unknown,
  context: ActionContext
): Promise<unknown> => {
  const diagnostics = await postEditDiagnostics(action, result, context)
  if (diagnostics === undefined) return result
  const value = record(result)
  return value === undefined ? result : { ...value, diagnostics }
}
