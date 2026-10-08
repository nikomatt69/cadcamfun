/**
 * The user's GitHub token. In the desktop app it lives in the OS keychain (the shell's `secret_*` commands); in a plain
 * browser (development, tests) it is held in memory only. It is sent to the sidecar per request and never stored there.
 */
const KEY = "github.token"
let memory: string | undefined

const bridge = async () => {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return undefined
  return (await import("@tauri-apps/api/core")).invoke
}

export const readGithubToken = async (): Promise<string | undefined> => {
  const invoke = await bridge()
  if (!invoke) return memory
  return (await invoke<string | null>("secret_get", { key: KEY })) ?? undefined
}

export const saveGithubToken = async (token: string): Promise<void> => {
  const invoke = await bridge()
  if (!invoke) { memory = token; return }
  await invoke("secret_set", { key: KEY, value: token })
}
