/** The embedded adapter's versioned contract, checked before any host is used. */
export const HOST_CAPABILITIES = {
  sdkVersion: "1.428.0",
  required: [
    "session.create", "session.list", "session.get", "session.remove", "session.abort", "session.summarize", "session.messages",
    "session.goal", "session.command", "session.contextBreakdown", "session-prompt.prompt", "session-prompt.promptAsync",
    "events.subscribe", "provider.list", "provider.auth", "provider.api", "provider.removeAuth",
    "permission.list", "permission.reply", "question.list", "question.reply", "question.reject",
    "brain.status", "brain.trigger", "experimental.toolIDs", "experimental.tools", "config.get", "config-management.reload",
    "top-level.agent", "top-level.dispose", "top-level.skill", "tools.register", "mod.list"
  ],
  hooks: ["experimental.session.compacting"],
  restartContinuation: "application-owned",
  conversationForkIsWorkspaceIsolation: false
} as const

export class HostCompatibilityError extends Error {
  readonly _tag = "HostCompatibilityError"
  constructor(readonly missing: ReadonlyArray<string>) {
    super(`Embedded nikcli ${HOST_CAPABILITIES.sdkVersion} is incompatible: missing ${missing.join(", ")}`)
    this.name = "HostCompatibilityError"
  }
}

export const inspectHostCapabilities = (client: unknown) => {
  const missing = HOST_CAPABILITIES.required.filter((path) => {
    let value: unknown = client
    for (const key of path.split(".")) {
      if (typeof value !== "object" || value === null) return true
      value = (value as Readonly<Record<string, unknown>>)[key]
    }
    return typeof value !== "function"
  })
  return { ...HOST_CAPABILITIES, compatible: missing.length === 0, missing }
}

export const assertHostCapabilities = (client: unknown): void => {
  const report = inspectHostCapabilities(client)
  if (!report.compatible) throw new HostCompatibilityError(report.missing)
}
