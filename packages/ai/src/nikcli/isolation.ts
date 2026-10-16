import { mkdirSync, rmSync } from "node:fs"
import { createHash } from "node:crypto"
import { join } from "node:path"

/**
 * Isolated state for the embedded nikcli host (spec 08 section 1.1).
 *
 * The host computes its global paths and feature flags when its module is first
 * evaluated, so this MUST run before `@nikcli-ai/sdk-next` is imported. The
 * host then never looks at `~/.config/nikcli`, `~/.nikcli`, or other
 * agents' state (`~/.claude`).
 */
export interface IsolatedPaths {
  /** `<dataDir>/ai/nikcli`; also the value of `NIKCLI_TEST_HOME`. */
  readonly root: string
  readonly home: string
  readonly data: string
  readonly cache: string
  readonly config: string
  readonly state: string
  /** Parent of all per-project scratch directories. */
  readonly projects: string
}

export const isolatedPaths = (dataDir: string): IsolatedPaths => {
  const root = join(dataDir, "ai", "nikcli")
  return {
    root,
    home: join(root, "home"),
    data: join(root, "data"),
    cache: join(root, "cache"),
    config: join(root, "config"),
    state: join(root, "state"),
    projects: join(root, "projects")
  }
}

/** Fixed per-project scratch directory; never the user's project or home. */
export const projectScratchDir = (paths: IsolatedPaths, projectId: string): string => {
  const slug = projectId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 48)
  const hash = createHash("sha256").update(projectId).digest("hex").slice(0, 10)
  return join(paths.projects, `${slug}-${hash}`)
}

/**
 * Variables that would widen the host's trust boundary (auto-approve, remote
 * servers, extra config sources, secrets for connectors). Removed on setup.
 */
export const SCRUBBED_ENV = [
  "NIKCLI_PERMISSION_MODE",
  "NIKCLI_AUTO_APPROVE",
  "NIKCLI_DANGEROUSLY_SKIP_PERMISSIONS",
  "NIKCLI_PERMISSION",
  "NIKCLI_CONFIG",
  "NIKCLI_CONFIG_CONTENT",
  "NIKCLI_CONFIG_DIR",
  "NIKCLI_MANAGED_CONFIG_DIR",
  "NIKCLI_REMOTE_URL",
  "NIKCLI_REMOTE_TOKEN",
  "NIKCLI_DATA_DIR",
  "NIKCLI_MODELS_URL",
  "NIKCLI_GITHUB_TOKEN",
  "NIKCLI_SLACK_BOT_TOKEN",
  "NIKCLI_DISCORD_WEBHOOK_URL",
  "NIKCLI_FIGMA_TOKEN",
  "NIKCLI_LOG_REDACT",
  "NIKCLI_TEST_MODE",
  // Inherited authentication and storage: another database, injected credentials, a server identity or a sign-in.
  "NIKCLI_DB",
  "NIKCLI_AUTH_CONTENT",
  "NIKCLI_AUTH_ISSUER",
  "NIKCLI_AUTH_JWKS_URL",
  "NIKCLI_AUTH_JWT_SECRET",
  "NIKCLI_SERVER_PASSWORD",
  "NIKCLI_SERVER_USERNAME",
  "NIKCLI_PASSWORD",
  "NIKCLI_USERNAME",
  "NIKCLI_STORE_TOKEN",
  "NIKCLI_ACCOUNT_URL",
  "NIKCLI_REQUIRE_OAUTH",
  "NIKCLI_LEGACY_LOGIN",
  "NIKCLI_OPENROUTER_API_KEY",
  "NIKCLI_ELEVENLABS_API_KEY",
  "NIKCLI_LOVABLE_API_KEY",
  "NIKCLI_LOVABLE_TOKEN",
  // Code or configuration from outside the isolated folders.
  "NIKCLI_ALLOW_PLUGIN_AUTOLOAD",
  "NIKCLI_PLUGIN_META_FILE",
  "NIKCLI_TUI_CONFIG",
  "NIKCLI_MODEL",
  // The confined program runner (`code_mode`) is how the agent builds complex geometry and G-code in loops; see config.ts.
  "NIKCLI_DISABLE_CODE_MODE"
] as const

export interface IsolationOptions {
  /**
   * Also point `HOME`/`USERPROFILE` at the isolated home. Defence in depth on
   * top of the documented variables; on by default. Process-wide side effect.
   */
  readonly overrideHome?: boolean
  /**
   * Load the mods the app itself declares in its isolated `nikcli.json` (spec 27 §4.3). Off by default, because the
   * pinned host bundle must first prove — `packages/ai/test/pinned-mod-compatibility.test.ts` — that with the flag off
   * it loads exactly those and nothing from the user's home or the project. While off, `NIKCLI_DISABLE_MODS` keeps the
   * host from loading any mod from anywhere; while on, an inherited flag is cleared too, because the bundle reads it
   * when it loads. Process-wide side effect, applied on the first `applyIsolation` call of the process.
   */
  readonly mods?: boolean
}

export const isolationEnv = (paths: IsolatedPaths, options?: IsolationOptions): Record<string, string> => ({
  NIKCLI_TEST_HOME: paths.root,
  NIKCLI_DISABLE_PROJECT_CONFIG: "1",
  XDG_DATA_HOME: paths.data,
  XDG_CACHE_HOME: paths.cache,
  XDG_CONFIG_HOME: paths.config,
  XDG_STATE_HOME: paths.state,
  // No network side channels: model catalogue refresh, updates, telemetry, plugin installs.
  NIKCLI_DISABLE_MODELS_FETCH: "1",
  NIKCLI_DISABLE_AUTOUPDATE: "1",
  NIKCLI_DISABLE_ANALYTICS: "1",
  DO_NOT_TRACK: "1",
  NIKCLI_SKIP_PLUGIN_INSTALL: "1",
  NIKCLI_DISABLE_LSP_DOWNLOAD: "1",
  NIKCLI_DISABLE_DEFAULT_PLUGINS: "1",
  // Mods are the app's own extension modules (`<root>/mods/*.js`, declared as `file://` entries in the isolated
  // `nikcli.json`). The pinned bundle refuses every non-builtin mod while this flag is set, and the gate test proves
  // the loader accepts the app's own and only those once it is cleared (spec 27 §4.3).
  ...(options?.mods === true ? {} : { NIKCLI_DISABLE_MODS: "1" }),
  NIKCLI_DISABLE_HOT_RELOAD: "1",
  NIKCLI_DISABLE_PLUGIN_RELOAD: "1",
  NIKCLI_EXPERIMENTAL_DISABLE_FILEWATCHER: "1",
  // Never import skills/prompts from other coding agents' folders.
  NIKCLI_DISABLE_CLAUDE_CODE: "1",
  NIKCLI_DISABLE_EXTERNAL_SKILLS: "1",
  NIKCLI_DISABLE_BROWSER_CONTROL_TOOL: "1",
  NIKCLI_DISABLE_COMPUTER_TOOL: "1",
  // Native interactive tools (question) are only registered for app/cli/desktop clients.
  NIKCLI_CLIENT: "desktop",
  ...(options?.overrideHome === false ? {} : { HOME: paths.home, USERPROFILE: paths.home })
})

/**
 * Creates the folders, removes credentials a crashed previous run may have
 * left behind, and applies the environment. Idempotent.
 */
export const applyIsolation = (paths: IsolatedPaths, options?: IsolationOptions): void => {
  for (const dir of [paths.root, paths.home, paths.data, paths.cache, paths.config, paths.state, paths.projects]) {
    mkdirSync(dir, { recursive: true })
  }
  // nikcli persists API keys here in plaintext; this app keeps keys in memory only.
  rmSync(join(paths.data, "auth.json"), { force: true })
  for (const key of SCRUBBED_ENV) delete process.env[key]
  // `mods: true` must also *clear* an inherited flag: the ledger is read by the bundle when it loads, so a value left in
  // this process by an earlier host (or by the shell that started it, which test children inherit) would keep every mod
  // out even though the app asked for them. `isolationEnv` cannot express a delete, so it happens here.
  if (options?.mods === true) delete process.env["NIKCLI_DISABLE_MODS"]
  Object.assign(process.env, isolationEnv(paths, options))
}
