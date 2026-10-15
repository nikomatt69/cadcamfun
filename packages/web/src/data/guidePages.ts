/** Practical guides backed by implementation reads and isolated examples. */
export const guidePages = [
  {
    slug: "project-lifecycle", title: "Projects from creation to saved work", category: "Design and manufacture",
    summary: "Create projects, drawings and components, use resource libraries, save and reopen work, understand ownership, and distinguish resource versions from project commits.",
    keywords: ["project lifecycle", "create project", "save drawing", "components", "reopen", "versions", "libraries"],
  },
  {
    slug: "native-manufacturing", title: "Native manufacturing workflow", category: "Design and manufacture",
    summary: "Capture geometry, stock, materials, tools and operations; submit a native manufacturing job, interpret claims and release levels, and persist a matching portable CAM document.",
    keywords: ["manufacture", "native kernel", "CamKernelRequest", "stock", "tools", "claims", "verified-program", "portable document"],
  },
  {
    slug: "api-clients", title: "API clients and SDKs", category: "Clients and extensions",
    summary: "Use CadCam.make or ApiClient.layer with their real input shapes, plain results, declared and transport errors, cancellation, headers, streams, and generation limits.",
    keywords: ["sdk", "Promise", "Effect", "CadCam.make", "ApiClient.layer", "ClientError", "fetch", "AbortSignal", "api client"],
  },
  {
    slug: "ai-streaming", title: "AI streaming and recovery", category: "Clients and extensions",
    summary: "Start and continue project-scoped AI sessions, consume typed events, respond to permissions and questions, queue or abort work, and recover after connection loss.",
    keywords: ["streaming", "sse", "chat", "session", "permission", "question", "queue", "abort", "recovery", "AI"],
  },
  {
    slug: "plugin-authoring", title: "Author an application plugin", category: "Clients and extensions",
    summary: "Build a supported ai:tool plugin from its manifest and module exports, grant capabilities, validate arguments, handle host limits, and distinguish registry installation from activation.",
    keywords: ["plugin authoring", "ai:tool", "manifest", "capabilities", "aiTools", "worker", "validation", "activation"],
  },
  {
    slug: "project-history", title: "Branches, reviews, and workflows", category: "Operations and recovery",
    summary: "Commit a project, create proposal branches, inspect structural diffs, review and merge pull requests, version workflow YAML, dispatch checks, and handle remote synchronization safely.",
    keywords: ["branches", "reviews", "commit", "pull request", "merge", "restore", "workflow", "GitHub", "history"],
  },
  {
    slug: "companion-pairing", title: "Pair and manage a companion", category: "Operations and recovery",
    summary: "Enable the desktop HTTPS gateway, issue a device pairing, connect a native iOS build with certificate pinning, diagnose connectivity, and revoke device access.",
    keywords: ["pairing", "companion", "QR", "iOS", "TLS", "pinning", "device token", "gateway", "revoke"],
  },
  {
    slug: "desktop-troubleshooting", title: "Diagnose desktop failures", category: "Operations and recovery",
    summary: "Trace native startup and readiness, distinguish fake and real sidecars, locate the selected database and logs, diagnose API errors, and recover without confusing stored and unsaved state.",
    keywords: ["troubleshooting", "startup", "ready", "logs", "database", "port", "retry", "fake API", "recovery"],
  },
] as const
