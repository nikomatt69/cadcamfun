/**
 * `.reference/src/components/settings/SessionManagement.tsx` — the sessions block of
 * the Account tab: current session, authentication sessions, MCP connections, API
 * tokens and the security tips.
 *
 * The legacy screen loaded `/api/auth/sessions` and `/api/mcp/sessions`, which the v6
 * contract does not expose; those two lists render empty exactly like the legacy code
 * does when the endpoint answers nothing. API tokens come from `GET /api/user/tokens`.
 * `revoke*`/`disconnect*` were already no-ops in legacy (confirm + message + reload),
 * and stay that way here.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import {
  AlertTriangle, CheckCircle, Clock, Database, Key, Laptop, MapPin, Monitor, RefreshCw,
  Shield, Smartphone, Tablet, Trash, Wifi, XCircle
} from "lucide-solid"
import { t } from "../../i18n/index.ts"
import { useRead } from "../../app/queries.ts"

interface DeviceInfo {
  readonly browser: string
  readonly os: string
  readonly isMobile: boolean
}

interface AuthSessionRow {
  readonly id: string
  readonly deviceInfo: DeviceInfo
  readonly location?: { readonly ip: string; readonly city?: string; readonly country?: string }
  readonly lastActivity: string
  readonly isCurrent: boolean
}

interface McpSessionRow {
  readonly id: string
  readonly serverName: string
  readonly status: "connected" | "disconnected" | "error"
  readonly connectedAt: string
  readonly messageCount: number
  readonly capabilities: string[]
}

interface ApiTokenRow {
  readonly id: string
  readonly name: string
  readonly prefix: string
  readonly permissions: readonly string[]
  readonly createdAt: string
  readonly lastUsed?: string
  readonly expiresAt?: string
  readonly isActive: boolean
}

/** `.reference/src/store/authStore.ts` `detectDeviceInfo`, verbatim. */
const detectDeviceInfo = (): DeviceInfo => {
  if (typeof window === "undefined") return { browser: "unknown", os: "unknown", isMobile: false }
  const userAgent = navigator.userAgent
  const isMobile = /Mobile|Android|iPhone|iPad/.test(userAgent)
  let browser = "unknown"
  if (userAgent.includes("Chrome")) browser = "Chrome"
  else if (userAgent.includes("Firefox")) browser = "Firefox"
  else if (userAgent.includes("Safari")) browser = "Safari"
  else if (userAgent.includes("Edge")) browser = "Edge"
  let os = "unknown"
  if (userAgent.includes("Windows")) os = "Windows"
  else if (userAgent.includes("Mac")) os = "macOS"
  else if (userAgent.includes("Linux")) os = "Linux"
  else if (userAgent.includes("Android")) os = "Android"
  else if (userAgent.includes("iOS")) os = "iOS"
  return { browser, os, isMobile }
}

const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString)
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

const getStatusColor = (status: string): string => {
  switch (status) {
    case "connected": return "text-green-500"
    case "disconnected": return "text-gray-500"
    case "error": return "text-red-500"
    default: return "text-gray-500"
  }
}

const DeviceIcon = (props: { readonly deviceInfo: DeviceInfo }): JSX.Element => {
  if (props.deviceInfo.isMobile) return <Smartphone class="h-5 w-5 text-green-500" />
  if (props.deviceInfo.os.includes("iPad")) return <Tablet class="h-5 w-5 text-blue-500" />
  return <Laptop class="h-5 w-5 text-gray-500" />
}

export function SessionManagement(): JSX.Element {
  const tokens = useRead((client) => client.user.tokens())
  const [error, setError] = createSignal<string | undefined>(undefined)
  const [success, setSuccess] = createSignal<string | undefined>(undefined)

  const authSessions: readonly AuthSessionRow[] = []
  const mcpSessions: readonly McpSessionRow[] = []
  const apiTokens = (): readonly ApiTokenRow[] => tokens.data()?.tokens ?? []
  const deviceInfo = detectDeviceInfo()
  const lastLoginMethod: string | undefined = undefined

  const reload = (): void => {
    setError(undefined)
    void tokens.refetch()
  }

  const revokeAuthSession = (sessionId: string): void => {
    if (!window.confirm(t("settings.sessions.revokeConfirm"))) return
    void sessionId
    setSuccess(t("settings.sessions.revoked"))
    reload()
  }

  const disconnectMcpSession = (sessionId: string): void => {
    if (!window.confirm(t("settings.sessions.disconnectConfirm"))) return
    void sessionId
    setSuccess(t("settings.sessions.disconnected"))
    reload()
  }

  const revokeApiToken = (tokenId: string): void => {
    if (!window.confirm(t("settings.sessions.tokenConfirm"))) return
    void tokenId
    setSuccess(t("settings.sessions.tokenRevoked"))
    reload()
  }

  return (
    <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} class="space-y-6">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
            <Monitor class="h-7 w-7 mr-3 text-blue-500" />
            {t("settings.sessions.title")}
          </h2>
          <p class="text-gray-600 dark:text-gray-400 mt-1">{t("settings.sessions.subtitle")}</p>
        </div>

        <Motion.button
          onClick={reload}
          disabled={tokens.loading()}
          hover={{ scale: 1.02 }}
          press={{ scale: 0.98 }}
          transition={{ duration: 0.2 }}
          class="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw class="h-4 w-4 mr-2" />
          {t("settings.sessions.refresh")}
        </Motion.button>
      </div>

      {/* Messages */}
      <Show when={error() !== undefined}>
        <Motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg"
        >
          {error()}
        </Motion.div>
      </Show>

      <Show when={success() !== undefined}>
        <Motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg"
        >
          {success()}
        </Motion.div>
      </Show>

      <Show when={tokens.error() !== undefined}>
        <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
          <p>{t("settings.sessions.loadFailed")}</p>
          <p class="mt-1 text-xs font-mono break-all">{tokens.error()}</p>
        </div>
      </Show>

      {/* Current Session Info */}
      <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
        <h3 class="font-semibold text-blue-900 dark:text-blue-200 mb-4 flex items-center">
          <CheckCircle class="h-5 w-5 mr-2" />
          {t("settings.sessions.current")}
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span class="text-blue-700 dark:text-blue-300 font-medium">{t("settings.sessions.device")}</span>
            <p class="text-blue-600 dark:text-blue-400">{deviceInfo.browser} on {deviceInfo.os}</p>
          </div>
          <div>
            <span class="text-blue-700 dark:text-blue-300 font-medium">{t("settings.sessions.loginMethod")}</span>
            <p class="text-blue-600 dark:text-blue-400 capitalize">{lastLoginMethod || t("settings.sessions.unknown")}</p>
          </div>
          <div>
            <span class="text-blue-700 dark:text-blue-300 font-medium">{t("settings.sessions.expires")}</span>
            <p class="font-medium text-blue-600 dark:text-blue-400">{t("settings.sessions.never")}</p>
          </div>
        </div>
      </div>

      {/* Auth Sessions */}
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
            <Shield class="h-5 w-5 mr-2 text-green-500" />
            {t("settings.sessions.authTitle", { count: authSessions.length })}
          </h3>
        </div>

        <div class="divide-y divide-gray-200 dark:divide-gray-700">
          <For each={authSessions}>
            {(session, index) => (
              <Motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index() * 0.1 }}
                class="p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div class="flex items-center space-x-4">
                  <DeviceIcon deviceInfo={session.deviceInfo} />
                  <div>
                    <h4 class="font-medium text-gray-900 dark:text-white flex items-center">
                      {session.deviceInfo.browser} on {session.deviceInfo.os}
                      <Show when={session.isCurrent}>
                        <span class="ml-2 px-2 py-1 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs rounded-full">
                          {t("settings.sessions.currentBadge")}
                        </span>
                      </Show>
                    </h4>
                    <div class="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                      <p class="flex items-center">
                        <Clock class="h-3 w-3 mr-1" />
                        {t("settings.sessions.lastActive", { when: formatTimeAgo(session.lastActivity) })}
                      </p>
                      <Show when={session.location !== undefined}>
                        <p class="flex items-center">
                          <MapPin class="h-3 w-3 mr-1" />
                          {session.location?.city}, {session.location?.country} ({session.location?.ip})
                        </p>
                      </Show>
                      <p class="text-xs font-mono text-gray-400">
                        {t("settings.sessions.sessionId", { id: session.id.slice(0, 8) })}
                      </p>
                    </div>
                  </div>
                </div>

                <Show when={!session.isCurrent}>
                  <Motion.button
                    onClick={() => revokeAuthSession(session.id)}
                    hover={{ scale: 1.05 }}
                    press={{ scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title={t("settings.sessions.revokeTitle")}
                  >
                    <Trash class="h-4 w-4" />
                  </Motion.button>
                </Show>
              </Motion.div>
            )}
          </For>
        </div>
      </div>

      {/* MCP Sessions */}
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
            <Database class="h-5 w-5 mr-2 text-purple-500" />
            {t("settings.sessions.mcpTitle", { count: mcpSessions.length })}
          </h3>
        </div>

        <div class="divide-y divide-gray-200 dark:divide-gray-700">
          <For each={mcpSessions}>
            {(session, index) => (
              <Motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index() * 0.1 }}
                class="p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div class="flex items-center space-x-4">
                  <Wifi class={`h-5 w-5 ${getStatusColor(session.status)}`} />
                  <div>
                    <h4 class="font-medium text-gray-900 dark:text-white">{session.serverName}</h4>
                    <div class="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                      <p class="flex items-center">
                        {t("settings.sessions.status")}
                        <span class={`ml-1 font-medium ${getStatusColor(session.status)}`}>{session.status}</span>
                      </p>
                      <p>{t("settings.sessions.connected", { when: formatTimeAgo(session.connectedAt) })}</p>
                      <p>{t("settings.sessions.messages", { count: session.messageCount })}</p>
                      <p class="text-xs">{t("settings.sessions.capabilities", { list: session.capabilities.join(", ") })}</p>
                    </div>
                  </div>
                </div>

                <Motion.button
                  onClick={() => disconnectMcpSession(session.id)}
                  hover={{ scale: 1.05 }}
                  press={{ scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title={t("settings.sessions.disconnectTitle")}
                >
                  <XCircle class="h-4 w-4" />
                </Motion.button>
              </Motion.div>
            )}
          </For>
        </div>
      </div>

      {/* API Tokens */}
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
            <Key class="h-5 w-5 mr-2 text-yellow-500" />
            {t("settings.sessions.tokensTitle", { count: apiTokens().length })}
          </h3>
        </div>

        <Show when={tokens.loading()}>
          <div class="p-8 text-center">
            <div class="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4 animate-spin" />
            <p class="text-gray-500 dark:text-gray-400">{t("settings.sessions.loading")}</p>
          </div>
        </Show>

        <div class="divide-y divide-gray-200 dark:divide-gray-700">
          <For each={apiTokens()}>
            {(token, index) => (
              <Motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index() * 0.1 }}
                class="p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div class="flex items-center space-x-4">
                  <Key class={`h-5 w-5 ${token.isActive ? "text-green-500" : "text-gray-400"}`} />
                  <div>
                    <h4 class="font-medium text-gray-900 dark:text-white flex items-center">
                      {token.name}
                      <Show when={!token.isActive}>
                        <span class="ml-2 px-2 py-1 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs rounded-full">
                          {t("settings.sessions.inactive")}
                        </span>
                      </Show>
                    </h4>
                    <div class="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                      <p class="font-mono">{token.prefix}...</p>
                      <p>{t("settings.sessions.created", { when: formatTimeAgo(token.createdAt) })}</p>
                      <Show when={token.lastUsed !== undefined}>
                        <p>{t("settings.sessions.lastUsed", { when: formatTimeAgo(token.lastUsed ?? "") })}</p>
                      </Show>
                      <Show when={token.expiresAt !== undefined}>
                        <p>{t("settings.sessions.expiresAt", { when: formatTimeAgo(token.expiresAt ?? "") })}</p>
                      </Show>
                      <p class="text-xs">{t("settings.sessions.permissions", { list: token.permissions.join(", ") })}</p>
                    </div>
                  </div>
                </div>

                <Motion.button
                  onClick={() => revokeApiToken(token.id)}
                  hover={{ scale: 1.05 }}
                  press={{ scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title={t("settings.sessions.revokeTokenTitle")}
                >
                  <Trash class="h-4 w-4" />
                </Motion.button>
              </Motion.div>
            )}
          </For>
        </div>
      </div>

      {/* Security Tips */}
      <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6">
        <h3 class="font-semibold text-amber-900 dark:text-amber-200 mb-3 flex items-center">
          <AlertTriangle class="h-5 w-5 mr-2" />
          {t("settings.sessions.tips")}
        </h3>
        <ul class="text-amber-800 dark:text-amber-300 text-sm space-y-2">
          <li>• Regularly review and revoke unused sessions and tokens</li>
          <li>• Sign out of sessions on shared or public devices</li>
          <li>• Use API tokens with minimal required permissions</li>
          <li>• Monitor for suspicious activity from unknown locations</li>
          <li>• Set appropriate expiration dates for API tokens</li>
        </ul>
      </div>
    </Motion.div>
  )
}
