/**
 * Files the operating system opens with the app (double-click, "Open With", a second launch with a path; `src-tauri/src/opened_files.rs`).
 * The shell keeps every delivered path in a queue and only says "something arrived" with an `open-file` event, so a file that
 * started the app (delivered before this code was listening) is not lost: the queue is drained once after the listener exists and
 * again on every event, and each path is handed over exactly once. This file is the pure half; the shell wires the stores and the router.
 */
import { inDesktopShell, type Invoke } from "./updates.ts"

export type OpenedKind = "drawing" | "program" | "unsupported"

/** What the file is, from its extension (the ones `tauri.conf.json` registers). */
export const classifyOpened = (path: string): OpenedKind => {
  const extension = /\.([^./\\]+)$/.exec(path)?.[1]?.toLowerCase()
  if (extension === "cadcam") return "drawing"
  if (extension === "nc" || extension === "gcode") return "program"
  return "unsupported"
}

/** The last component of a path, for messages. */
export const fileNameOf = (path: string): string => path.split(/[\\/]/).pop() || path

export interface OpenedDeps {
  /** The raw contents of a delivered file. */
  readonly read: (path: string) => Promise<Uint8Array>
  /** Adds drawing elements to the open drawing (the same call the import dialog makes). */
  readonly addElements: (elements: ReadonlyArray<Record<string, unknown>>, selectedId?: string) => void
  /** Puts G-code into the CAM editor. */
  readonly setProgram: (gcode: string) => void
  readonly go: (route: string) => void
}

export type OpenedFailure = "unsupported" | "unreadable" | "invalid-json" | "no-elements" | "empty"

export type OpenedOutcome =
  | { readonly kind: "drawing"; readonly name: string; readonly count: number }
  | { readonly kind: "program"; readonly name: string; readonly lines: number }
  | { readonly kind: "failed"; readonly name: string; readonly reason: OpenedFailure; readonly detail?: string }

const decode = (bytes: Uint8Array): string => new TextDecoder("utf-8").decode(bytes)

/**
 * Opens one delivered file. A drawing is **added** to the open one (like the import dialog; nothing is replaced, so unsaved work
 * stays); a program replaces the text of the CAM editor it is opened into. Never throws: a failure is an outcome to show.
 */
export const openDelivered = async (path: string, deps: OpenedDeps): Promise<OpenedOutcome> => {
  const name = fileNameOf(path)
  const kind = classifyOpened(path)
  if (kind === "unsupported") return { kind: "failed", name, reason: "unsupported" }
  let text: string
  try {
    text = decode(await deps.read(path))
  } catch (cause) {
    return { kind: "failed", name, reason: "unreadable", detail: cause instanceof Error ? cause.message : String(cause) }
  }
  if (kind === "program") {
    if (text.trim() === "") return { kind: "failed", name, reason: "empty" }
    deps.setProgram(text)
    deps.go("/cam")
    return { kind: "program", name, lines: text.split("\n").length }
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { kind: "failed", name, reason: "invalid-json" }
  }
  const envelope = json !== null && typeof json === "object" ? json as { elements?: unknown; selectedElementId?: unknown } : {}
  if (!Array.isArray(envelope.elements) || envelope.elements.length === 0) return { kind: "failed", name, reason: "no-elements" }
  const elements = envelope.elements.filter((e): e is Record<string, unknown> => e !== null && typeof e === "object")
  if (elements.length === 0) return { kind: "failed", name, reason: "no-elements" }
  deps.go("/cad")
  deps.addElements(elements, typeof envelope.selectedElementId === "string" ? envelope.selectedElementId : undefined)
  return { kind: "drawing", name, count: elements.length }
}

export interface OpenFileListener {
  readonly invoke?: Invoke
  readonly listen?: (event: string, handler: () => void) => Promise<() => void>
}

/**
 * Calls `onPaths` with every path the OS delivers, including those delivered before this call. The listener is registered before
 * the first drain so nothing falls between the two; returns the unsubscribe function. Outside the desktop shell there is nothing to hear.
 */
export const listenForOpenedFiles = async (onPaths: (paths: ReadonlyArray<string>) => void, options: OpenFileListener = {}): Promise<() => void> => {
  if (options.invoke === undefined && options.listen === undefined && !inDesktopShell()) return () => {}
  const call = options.invoke ?? (await import("@tauri-apps/api/core")).invoke as Invoke
  const listen = options.listen ?? (async (event: string, handler: () => void) => (await import("@tauri-apps/api/event")).listen(event, handler))
  const drain = async (): Promise<void> => {
    const taken = await call("take_opened_files")
    const paths = Array.isArray(taken) ? taken.filter((p): p is string => typeof p === "string") : []
    if (paths.length > 0) onPaths(paths)
  }
  const off = await listen("open-file", () => { void drain().catch(() => undefined) })
  await drain().catch(() => undefined)
  return off
}

/** The raw bytes of a delivered file, through the shell (`read_opened_file` serves only paths the OS delivered). */
export const readDelivered = async (path: string, invoke?: Invoke): Promise<Uint8Array> => {
  const call = invoke ?? (await import("@tauri-apps/api/core")).invoke as Invoke
  const raw = await call("read_opened_file", { path })
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw)
  if (raw instanceof Uint8Array) return raw
  if (Array.isArray(raw)) return Uint8Array.from(raw as ReadonlyArray<number>)
  throw new Error("the shell returned no file contents")
}
