import AsyncStorage from "@react-native-async-storage/async-storage"

/**
 * The last state the phone saw of something it reads from the desktop.
 *
 * A companion that shows an empty screen and an error when the Mac is asleep is useless on a train. The
 * phone keeps a copy of the lists it reads (projects, activity) and falls back to it when the desktop cannot
 * be reached, saying plainly that what is on screen is the saved copy.
 */

const PREFIX = "cadcamfun.cache.v1:"

/** The saved copy of a list, or undefined when there is none (or it cannot be read). */
export const readCache = async <T>(key: string): Promise<T | undefined> => {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key)
    if (!raw) return undefined
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

/** Saves a list. A failure to write is not worth reporting: the next load tries again. */
export const writeCache = (key: string, value: unknown): void => {
  void AsyncStorage.setItem(PREFIX + key, JSON.stringify(value)).catch(() => undefined)
}

/** Forgets a saved list (used when the phone is unpaired from that desktop). */
export const clearCache = (key: string): void => {
  void AsyncStorage.removeItem(PREFIX + key).catch(() => undefined)
}
