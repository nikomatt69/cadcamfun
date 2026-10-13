/**
 * `/goal`, as nikcli has it (`session/goal.ts`, `session/prompt-commands.ts`): the user states a condition the agent works
 * toward on its own, and can pause, resume, clear or read it. The host owns the goal (its table, its continuation loop, the
 * `create_goal` / `get_goal` / `update_goal` tools the agent calls itself); this module is the application's side of the
 * command: parsing what the user typed, running it through the host's own `goal` command, and formatting the answer.
 */
export const GOAL_MAX_ITERATIONS = 50

export type GoalStatus = "active" | "paused" | "blocked" | "usage_limited" | "budget_limited" | "complete"

/** The host's goal record (`SessionGoalState`) as the application reads it. */
export interface HostGoalState {
  readonly sessionID: string
  readonly objective: string
  readonly status: GoalStatus
  readonly tokenBudget?: number
  readonly tokensUsed: number
  readonly timeUsedSeconds: number
  readonly iterationCount: number
}

export type GoalSubcommand = "pause" | "resume" | "clear" | "status"

export type GoalCommand =
  | { readonly type: "subcommand"; readonly command: GoalSubcommand }
  | { readonly type: "objective"; readonly objective: string; readonly tokenBudget?: number }

/** nikcli's `SessionGoal.parseArguments`: a subcommand, or an objective with an optional `--token-budget N`. */
export const parseGoalArguments = (input: string): GoalCommand => {
  const trimmed = input.trim()
  if (trimmed === "pause" || trimmed === "resume" || trimmed === "clear" || trimmed === "status") return { type: "subcommand", command: trimmed }
  let objective = trimmed
  let tokenBudget: number | undefined
  const budget = /(?:^|\s)--token-budget(?:\s+(\S+))?(?=\s|$)/.exec(objective)
  if (budget) {
    const raw = budget[1]
    tokenBudget = raw === undefined ? Number.NaN : Number(raw)
    if (!/^\d+$/.test(raw ?? "") || !Number.isSafeInteger(tokenBudget) || tokenBudget <= 0) throw new Error("--token-budget must be a positive integer")
    objective = objective.replace(budget[0], " ").trim()
  }
  return { type: "objective", objective, ...(tokenBudget !== undefined ? { tokenBudget } : {}) }
}

/** The arguments of a `/goal` line, or undefined when the message is not one. A bare `/goal` reads the status. */
export const goalArgumentsOf = (message: string): string | undefined => {
  const match = /^\/goal(?:\s+([\s\S]*))?$/i.exec(message.trim())
  return match === null ? undefined : (match[1] ?? "").trim() || "status"
}

export const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

/** What `/goal status` answers; the same lines nikcli prints. */
export const formatGoalStatus = (goal: HostGoalState | null | undefined): string =>
  goal === null || goal === undefined
    ? "No active goal is set for this session."
    : [
        `Objective: ${goal.objective}`,
        `Status: ${goal.status}`,
        goal.tokenBudget === undefined ? `Tokens: ${goal.tokensUsed}` : `Tokens: ${goal.tokensUsed} / ${goal.tokenBudget}`,
        `Iterations: ${goal.iterationCount} / ${GOAL_MAX_ITERATIONS}`,
        `Time used: ${formatDuration(goal.timeUsedSeconds)}`
      ].join("\n")

/**
 * The text the host writes for `pause`, `resume` and `clear` (`prompt-commands.ts`), by what the goal was. The host records it as
 * a message of the session, so the stream registers these texts as its own and does not report them as something the user said.
 */
export const goalSubcommandTexts = (command: Exclude<GoalSubcommand, "status">, before: HostGoalState | null | undefined): ReadonlyArray<string> => {
  const objective = before?.objective
  switch (command) {
    case "pause": return [objective === undefined ? "No active goal to pause." : `Goal paused: ${objective}`]
    case "resume": return [objective === undefined ? "No paused goal to resume." : `Goal resumed: ${objective}`]
    case "clear": return [objective === undefined ? "No active goal to clear." : `Goal cleared: ${objective}`]
  }
}

/** The goal as the stream's `goal` event carries it. */
export const goalSummary = (goal: HostGoalState) => ({
  objective: goal.objective, status: goal.status, iteration: goal.iterationCount, tokensUsed: goal.tokensUsed,
  ...(goal.tokenBudget !== undefined ? { tokenBudget: goal.tokenBudget } : {})
})
