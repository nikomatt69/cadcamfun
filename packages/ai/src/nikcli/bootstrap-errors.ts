/** SDK ClientError omits the response body but retains HTTP status in its cause. */
export const describeBootstrapFailure = (cause: unknown): string => {
  let current: unknown = cause
  let status: number | undefined
  for (let depth = 0; depth < 8; depth++) {
    if (typeof current !== "object" || current === null) break
    if ("status" in current && typeof current.status === "number" && Number.isInteger(current.status) && current.status >= 100 && current.status <= 599) {
      status = current.status
      break
    }
    current = "cause" in current ? current.cause : undefined
  }
  const message = cause instanceof Error ? cause.message : "Unknown host failure"
  return status === undefined ? message : `${message} (HTTP ${status})`
}

/** Retain diagnostic context without logging arguments or response bodies. */
export const bootstrapStep = async <A>(phase: string, run: () => Promise<A>): Promise<A> => {
  try {
    return await run()
  } catch (cause) {
    throw new Error(`${phase}: ${describeBootstrapFailure(cause)}`)
  }
}
