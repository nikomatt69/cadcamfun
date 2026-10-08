import { parsePairingLink, type Pairing } from "./pairing.ts"

/**
 * Where the pairing lives. On iOS this must be the Keychain (a Tauri command added with `tauri ios init`, see spec 13 §6);
 * `localStorage` is the development fallback in a plain browser and is never used when a native store is registered.
 */
export interface SecretStore {
  load(): Promise<Pairing | undefined>
  save(pairing: Pairing): Promise<void>
  clear(): Promise<void>
}

const KEY = "cadcamfun.pairing"

export const browserStore: SecretStore = {
  load: async () => {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? parsePairingLink(`cadcamfun://pair?${new URLSearchParams({ host: JSON.parse(raw).baseUrl, token: JSON.parse(raw).token, fp: JSON.parse(raw).fingerprint, name: JSON.parse(raw).name })}`) : undefined
    } catch {
      return undefined
    }
  },
  save: async (pairing) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(pairing))
    } catch {
      // Private mode: the pairing simply is not remembered.
    }
  },
  clear: async () => {
    try {
      localStorage.removeItem(KEY)
    } catch {
      // Nothing to clear.
    }
  },
}
