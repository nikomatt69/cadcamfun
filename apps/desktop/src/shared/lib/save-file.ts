import { isTauri } from "../../app/sidecar.ts"
import { t } from "../../i18n/index.ts"

export interface SaveFileOptions {
  readonly name: string
  readonly data: BlobPart | Blob
  readonly mime?: string
}

/** Raw bytes avoid copying a large program into a JSON string at the native IPC boundary. */
export type SaveInvoke = (command: string, bytes: Uint8Array, options: { headers: Record<string, string> }) => Promise<string | null>

export interface SaveFileHost {
  readonly invoke?: SaveInvoke
  readonly browserDownload?: (blob: Blob, name: string) => void
}

const browserDownload = (blob: Blob, name: string): void => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  try {
    anchor.href = url
    anchor.download = name
    document.body.appendChild(anchor)
    anchor.click()
  } finally {
    anchor.remove()
    // Webviews and browsers may consume the blob after the click handler returns.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/** True after saving/downloading; false on native dialog cancellation. Errors remain available to the caller. */
export const saveFile = async (options: SaveFileOptions, host: SaveFileHost = {}): Promise<boolean> => {
  const blob = options.data instanceof Blob ? options.data : new Blob([options.data], { type: options.mime })
  if (host.invoke === undefined && !isTauri()) {
    (host.browserDownload ?? browserDownload)(blob, options.name)
    return true
  }
  const invoke = host.invoke ?? (await import("@tauri-apps/api/core")).invoke<string | null>
  return await invoke("save_file", new Uint8Array(await blob.arrayBuffer()), { headers: { "x-file-name": encodeURIComponent(options.name) } }) !== null
}

/** For existing fire-and-forget export buttons: report native failures instead of losing a rejected promise. */
export const downloadFile = (options: SaveFileOptions): void => {
  void saveFile(options).catch(async (cause: unknown) => {
    const reason = cause instanceof Error ? cause.message :
      cause !== null && typeof cause === "object" && "message" in cause ? String(cause.message) : String(cause)
    const { toast } = await import("../ui/toast.tsx")
    toast.error(t("shell.export.failed", { name: options.name, reason }))
  })
}
