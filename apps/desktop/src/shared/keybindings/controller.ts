/**
 * The keybindings controller: the one keyboard listener of the app, and the registry the pages plug their commands into.
 *
 * `catalog.ts` says which commands exist, `service.ts` owns the user's chords; this file turns a `keydown` into a
 * command and runs the handler a screen registered for it. Handlers form a stack per command: the screen mounted last
 * answers first and may return `false` to say "not mine right now" (Escape with nothing to cancel, `X` outside a
 * transform), which hands the key to the next handler down - ultimately the shell's - instead of swallowing it.
 *
 * Guards live here once, not in every screen: typing in a field, an open dialog, a focused button taking Space/Enter,
 * auto-repeat, and the platform's `Mod`.
 */
import { createSignal, type Accessor } from "solid-js"
import { Effect, Exit, Layer } from "effect"
import { liveScopes, type CommandDef } from "./catalog.ts"
import { chordFromEvent, detectPlatform, hasCommandModifier, type Platform } from "./chord.ts"
import type { Keymap } from "./keymap.ts"
import {
  ChordConflict, InvalidChord, InvalidDocument, KeybindingStore, Keybindings, UnknownCommand, localStore, remoteStore, syncedStore,
  type KeybindingError, type KeybindingKvClient
} from "./service.ts"

export interface HandlerContext { readonly event: KeyboardEvent | undefined }

export interface Handler {
  /** Runs the command. Returning `false` means it did not apply and the next handler may try. */
  readonly run: (context: HandlerContext) => boolean | void
  /** Skipped while this is false (a viewer that only answers while the pointer is over it). */
  readonly enabled?: () => boolean
  /** Also answers while the user types in a field whose target matches (the G-code editor keeps one history). */
  readonly inText?: (target: EventTarget | null) => boolean
}

export type HandlerInput = Handler | ((context: HandlerContext) => boolean | void)

/** What the settings screen needs to say about a failed rebind. */
export type RebindResult =
  | { readonly ok: true; readonly keymap: Keymap }
  | { readonly ok: false; readonly error: KeybindingError }

export interface KeybindingsController {
  readonly keymap: Accessor<Keymap>
  readonly platform: Platform
  /** The help dialog, global so the CAD and CAM pages open the same one. */
  readonly helpOpen: Accessor<boolean>
  setHelpOpen(open: boolean): void
  /** Registers handlers for command ids; the returned function unregisters exactly these. */
  register(handlers: Readonly<Record<string, HandlerInput>>): () => void
  /** True when a handler is registered and enabled for the command right now. */
  available(id: string): boolean
  /** Runs a command by id (palette, buttons); returns whether a handler took it. */
  run(id: string): boolean
  /** Stops the dispatcher while a key is being recorded for a new binding; the returned function resumes it. */
  suspend(): () => void
  /** Turns a keyboard event into a command run; true when it was handled. */
  dispatch(event: KeyboardEvent, phase?: "capture" | "bubble"): boolean
  /** Starts listening on `target`; returns the stop function. */
  attach(target?: Pick<Window, "addEventListener" | "removeEventListener">): () => void
  rebind(id: string, chords: ReadonlyArray<string>, options?: { readonly reassign?: boolean }): RebindResult
  reset(id: string): Keymap
  resetAll(): Keymap
  exportJson(): string
  importJson(text: string): { readonly ok: true; readonly keymap: Keymap } | { readonly ok: false; readonly error: InvalidDocument }
  /** Reads the sidecar copy and adopts it when it is newer (or publishes ours when it is). */
  reconcile(): Promise<void>
  dispose(): void
}

export interface KeybindingsOptions {
  /** The active screen (`cad`, `cam`, ...); decides which scopes are live. */
  readonly activity: Accessor<string>
  /** The sidecar client for cross-device sync; omitted in tests and previews (local storage only). */
  readonly client?: KeybindingKvClient
  /** Overrides the persistence entirely (tests). */
  readonly store?: Layer.Layer<KeybindingStore>
  readonly platform?: Platform
  /** Whether a modal dialog is open; defaults to looking for `[role="dialog"]`. */
  readonly dialogOpen?: () => boolean
}

/** Whether the user is typing: a text-like input, a select, a textarea or a contenteditable. */
export const isTextEntry = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null
  if (element === null || element === undefined || typeof element.tagName !== "string") return false
  if (element.tagName === "INPUT") {
    const type = (element as HTMLInputElement).type
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"].includes(type)
  }
  return element.tagName === "TEXTAREA" || element.tagName === "SELECT" || element.isContentEditable === true
}

/** A control that already uses Space and Enter for itself. */
export const isActivatable = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null
  if (element === null || element === undefined || typeof element.tagName !== "string") return false
  if (["BUTTON", "A", "SUMMARY"].includes(element.tagName)) return true
  if (element.tagName === "INPUT") return !isTextEntry(element)
  const role = element.getAttribute?.("role")
  return role !== null && role !== undefined && ["button", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "tab", "switch", "checkbox", "link"].includes(role)
}

const dialogIsOpen = (): boolean => typeof document !== "undefined" && document.querySelector('[role="dialog"]') !== null

const normalise = (input: HandlerInput): Handler => (typeof input === "function" ? { run: input } : input)

export const createKeybindings = (options: KeybindingsOptions): KeybindingsController => {
  const platform = options.platform ?? detectPlatform()
  const dialogOpen = options.dialogOpen ?? dialogIsOpen
  const storeLayer = options.store ?? Layer.succeed(
    KeybindingStore,
    KeybindingStore.of(options.client === undefined ? localStore() : syncedStore(localStore(), remoteStore(options.client)))
  )
  // The service is built once, synchronously: its layer only reads the local copy (the sidecar is reconciled later), so a
  // slow or absent sidecar can never hold up the boot. After that every operation is a plain synchronous effect.
  const service = Effect.runSync(Effect.provide(Effect.service(Keybindings), Keybindings.layer.pipe(Layer.provide(storeLayer))))
  const [keymap, setKeymap] = createSignal<Keymap>(Effect.runSync(service.keymap))
  const [helpOpen, setHelpOpen] = createSignal(false)
  const stacks = new Map<string, Handler[]>()
  const seen = new WeakSet<Event>()
  let suspended = 0

  const call = <A, E>(f: (service: Keybindings["Service"]) => Effect.Effect<A, E>): Exit.Exit<A, E> => Effect.runSyncExit(f(service))

  const apply = (exit: Exit.Exit<Keymap, unknown>): Keymap => {
    if (Exit.isSuccess(exit)) { setKeymap(exit.value); return exit.value }
    return keymap()
  }

  const enabledHandlers = (id: string): ReadonlyArray<Handler> =>
    (stacks.get(id) ?? []).filter((handler) => handler.enabled === undefined || handler.enabled())

  const runHandlers = (id: string, event: KeyboardEvent | undefined): boolean => {
    const handlers = enabledHandlers(id)
    for (let index = handlers.length - 1; index >= 0; index--) {
      if (handlers[index]!.run({ event }) !== false) return true
    }
    return false
  }

  const permitted = (command: CommandDef, event: KeyboardEvent, modified: boolean): boolean => {
    if (event.repeat && command.repeat !== true) return false
    if (dialogOpen() && command.overDialog !== true) return false
    if (isTextEntry(event.target)) {
      const handlers = enabledHandlers(command.id)
      const allowed = (command.inText === true && modified) || handlers.some((handler) => handler.inText?.(event.target) === true)
      if (!allowed) return false
    }
    // Space and Enter on a focused button press the button: they are only commands when nothing owns them.
    if (!modified && isActivatable(event.target) && ["space", "enter"].includes(chordFromEvent(event, platform)?.key ?? "")) return false
    return true
  }

  const dispatch = (event: KeyboardEvent, phase: "capture" | "bubble" = "bubble"): boolean => {
    if (suspended > 0 || seen.has(event) || event.isComposing === true) return false
    const chord = chordFromEvent(event, platform)
    if (chord === undefined) return false
    const modified = hasCommandModifier(chord)
    // Chords with a command modifier are shortcuts nobody else wants, so they preempt a focused editor (Monaco's own
    // Cmd+S); plain keys wait for the bubble phase so a menu or a list that handled them keeps them.
    if ((phase === "capture") !== modified) return false
    if (phase === "bubble" && event.defaultPrevented) return false
    for (const command of keymap().resolve(chord, liveScopes(options.activity()))) {
      if (!permitted(command, event, modified)) continue
      if (runHandlers(command.id, event)) {
        seen.add(event)
        event.preventDefault()
        if (phase === "capture") event.stopPropagation()
        return true
      }
    }
    return false
  }

  const attach: KeybindingsController["attach"] = (target = window) => {
    const capture = (event: Event): void => { dispatch(event as KeyboardEvent, "capture") }
    const bubble = (event: Event): void => { dispatch(event as KeyboardEvent, "bubble") }
    target.addEventListener("keydown", capture, true)
    target.addEventListener("keydown", bubble)
    return () => { target.removeEventListener("keydown", capture, true); target.removeEventListener("keydown", bubble) }
  }

  return {
    keymap,
    platform,
    helpOpen,
    setHelpOpen,
    register: (handlers) => {
      const added: Array<readonly [string, Handler]> = []
      for (const [id, input] of Object.entries(handlers)) {
        const handler = normalise(input)
        const stack = stacks.get(id) ?? []
        stack.push(handler)
        stacks.set(id, stack)
        added.push([id, handler])
      }
      return () => {
        for (const [id, handler] of added) {
          const stack = stacks.get(id)
          if (stack === undefined) continue
          const at = stack.lastIndexOf(handler)
          if (at >= 0) stack.splice(at, 1)
        }
      }
    },
    available: (id) => enabledHandlers(id).length > 0,
    run: (id) => runHandlers(id, undefined),
    suspend: () => {
      suspended++
      let resumed = false
      return () => { if (!resumed) { resumed = true; suspended-- } }
    },
    dispatch,
    attach,
    rebind: (id, chords, rebindOptions) => {
      const exit = call((service) => service.rebind(id, chords, rebindOptions))
      if (Exit.isSuccess(exit)) { setKeymap(exit.value); return { ok: true, keymap: exit.value } }
      const failure = exit.cause.reasons.find((reason) => reason._tag === "Fail")
      const error = failure === undefined ? new InvalidChord({ id, chord: chords.join(","), reason: "invalidChord" }) : (failure.error as KeybindingError)
      return { ok: false, error: error instanceof UnknownCommand || error instanceof InvalidChord || error instanceof ChordConflict ? error : new UnknownCommand({ id }) }
    },
    reset: (id) => apply(call((service) => service.reset(id))),
    resetAll: () => apply(call((service) => service.resetAll)),
    exportJson: () => Effect.runSync(service.exportJson),
    importJson: (text) => {
      const exit = call((service) => service.importJson(text))
      if (Exit.isSuccess(exit)) { setKeymap(exit.value); return { ok: true, keymap: exit.value } }
      return { ok: false, error: new InvalidDocument({ message: "not a keymap" }) }
    },
    reconcile: async () => {
      const exit = await Effect.runPromiseExit(service.reconcile)
      if (Exit.isSuccess(exit)) setKeymap(exit.value)
    },
    dispose: () => { stacks.clear() }
  }
}
