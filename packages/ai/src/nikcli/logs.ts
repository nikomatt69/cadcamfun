/**
 * The embedded host writes its own log lines to `process.stderr` (format
 * `LEVEL yyyy-mm-ddThh:mm:ss +Nms key=value ... message`). It has no public
 * switch to silence them, so we intercept exactly those lines and hand them to
 * a sink; every other write passes through untouched.
 */
const HOST_LINE = /^(DEBUG|INFO |WARN |ERROR) \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2} /

export type HostLogLevel = "debug" | "info" | "warn" | "error"
export type HostLogSink = (level: HostLogLevel, line: string) => void

const levelOf = (line: string): HostLogLevel => {
  const tag = line.slice(0, 5).trim()
  return tag === "DEBUG" ? "debug" : tag === "INFO" ? "info" : tag === "WARN" ? "warn" : "error"
}

/** Returns an uninstall function; safe to call more than once. */
export const installHostLogFilter = (sink: HostLogSink): (() => void) => {
  const stream = process.stderr
  const original = stream.write.bind(stream) as typeof stream.write
  const patched = ((chunk: unknown, ...rest: unknown[]): boolean => {
    const text = typeof chunk === "string" ? chunk : chunk instanceof Uint8Array ? Buffer.from(chunk).toString("utf8") : undefined
    if (text !== undefined && HOST_LINE.test(text)) {
      for (const line of text.split("\n")) {
        if (line.length > 0) sink(levelOf(line), line)
      }
      return true
    }
    return (original as (...args: unknown[]) => boolean)(chunk, ...rest)
  }) as typeof stream.write
  stream.write = patched
  let installed = true
  return () => {
    if (!installed) return
    installed = false
    if (stream.write === patched) stream.write = original
  }
}
