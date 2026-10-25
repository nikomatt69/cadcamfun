import { isTauri } from "../../app/sidecar.ts"

export interface ClipboardOptions {
  readonly desktop?: boolean
  readonly nativeWrite?: (text: string) => Promise<void>
  readonly browserWrite?: (text: string) => Promise<void>
}

/** Copy through the native plugin in Tauri; browser development keeps the Clipboard API and its permission errors. */
export const copyText = async (text: string, options: ClipboardOptions = {}): Promise<void> => {
  if (options.desktop ?? isTauri()) {
    const write = options.nativeWrite ?? (await import("@tauri-apps/plugin-clipboard-manager")).writeText
    await write(text)
    return
  }
  const write = options.browserWrite ?? (typeof navigator !== "undefined" ? navigator.clipboard?.writeText.bind(navigator.clipboard) : undefined)
  if (write === undefined) throw new Error("Clipboard is unavailable in this browser")
  await write(text)
}
