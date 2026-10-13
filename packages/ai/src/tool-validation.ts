import type { z } from "zod"

/** Shared by the host's pre-execution guard and the direct tool bridge. */
export const toolValidationFailure = (tool: string, error: z.ZodError) => {
  const problems = error.issues.slice(0, 12).map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
  const hints = new Set<string>()
  for (const issue of error.issues) {
    if (issue.path.at(-1) === "cases" && issue.code === "invalid_type" && issue.expected === "array") {
      hints.add('Send cases as a JSON array of 1..12 objects, e.g. [{"name":"wider","parameters":{"width":80}}], never as a JSON-encoded string.')
    }
    if (issue.path.includes("history") && issue.code === "invalid_type" && issue.expected === "object") {
      hints.add('Send history as a JSON object {"parameters":{},"features":[...]}, never as a string containing JSON.')
    }
    if (issue.path.includes("entities") && issue.path.at(-1) === "kind") {
      hints.add('Sketch entities use kind: "point", "line", "circle" or "arc"; features and constraints use type. Lines reference point IDs through p1/p2; circles reference a point ID through center. See cad action parametric_validate for a complete validate example.')
    }
  }
  hints.add(`Correct the named fields and retry ${tool}; do not repeat unchanged arguments or switch tools to bypass validation.`)
  return {
    ok: false as const, _tag: "InvalidToolArguments" as const, error: `Invalid arguments for ${tool}.`,
    problems, omittedProblems: Math.max(0, error.issues.length - problems.length),
    recovery: [...hints].join(" "), mutationApplied: false as const
  }
}

export const formatToolValidationError = (tool: string, error: z.ZodError): string => {
  const failure = toolValidationFailure(tool, error)
  return `${failure.error}\n${failure.problems.map((problem) => `- ${problem}`).join("\n")}\n${failure.omittedProblems > 0 ? `${failure.omittedProblems} additional validation problems omitted.\n` : ""}${failure.recovery}\nNo mutation was applied by this call.`
}
