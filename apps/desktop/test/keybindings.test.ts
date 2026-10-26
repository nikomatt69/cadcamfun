/**
 * Keybindings: the chord model, the catalog's invariants, the keymap rules, the Effect service (rebind, conflicts,
 * import/export, sync) and the dispatcher (scopes, guards, handler stack).
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { Effect, Exit, Layer, ManagedRuntime } from "effect"
import { createRoot, createSignal } from "solid-js"
import { COMMANDS, GROUPS, NATIVE_MENU, menuCommand, SNAP_TYPES, commandById, groupKeyOf, labelKeyOf, liveScopes, scopesOverlap } from "../src/shared/keybindings/catalog.ts"
import {
  canonicalChord, chordFromEvent, displayChord, formatChord, hasCommandModifier, matchesChord, parseChord, type KeyEventLike
} from "../src/shared/keybindings/chord.ts"
import { RESERVED_CHORDS, buildKeymap, checkBinding, isDefault } from "../src/shared/keybindings/keymap.ts"
import {
  ChordConflict, InvalidChord, InvalidDocument, KeybindingStore, Keybindings, UnknownCommand, newest, sanitiseOverrides, syncedStore,
  type StoredKeymap
} from "../src/shared/keybindings/service.ts"
import { createKeybindings, isActivatable, isTextEntry } from "../src/shared/keybindings/controller.ts"
import { en } from "../src/i18n/index.ts"

const key = (k: string, mods: Partial<KeyEventLike> = {}): KeyEventLike =>
  ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods })

describe("chords", () => {
  test("parse and format round-trip every spelling to one canonical form", () => {
    expect(canonicalChord("cmd/ctrl+shift+z")).toBe("Mod+Shift+Z")
    expect(canonicalChord("Control + Option + a")).toBe("Ctrl+Alt+A")
    expect(canonicalChord("Mod+Escape")).toBe("Mod+Escape")
    expect(canonicalChord("esc")).toBe("Escape")
    expect(canonicalChord("Mod++")).toBe("Mod++")
    expect(canonicalChord("+")).toBe("+")
    expect(canonicalChord("Mod+,")).toBe("Mod+,")
    expect(canonicalChord("f11")).toBe("F11")
    for (const command of COMMANDS) for (const text of command.defaults) {
      const chord = parseChord(text)
      expect(chord, `${command.id}: ${text}`).toBeDefined()
      expect(formatChord(chord!), `${command.id}: ${text}`).toBe(text)
    }
  })

  test("text that is not a chord is refused", () => {
    for (const bad of ["", "   ", "Mod", "Shift+", "Mod+Mod+A", "Hyper+A", "Mod+Nope", "Mod+Shift", "ab"]) {
      expect(parseChord(bad), JSON.stringify(bad)).toBeUndefined()
    }
  })

  test("Mod is Cmd on macOS and Ctrl elsewhere, and the other key is distinct", () => {
    const undo = parseChord("Mod+Z")!
    expect(matchesChord(key("z", { metaKey: true }), undo, "mac")).toBe(true)
    expect(matchesChord(key("z", { ctrlKey: true }), undo, "mac")).toBe(false)
    expect(matchesChord(key("z", { ctrlKey: true }), undo, "other")).toBe(true)
    expect(matchesChord(key("z", { metaKey: true }), undo, "other")).toBe(false)
    expect(matchesChord(key("Z", { ctrlKey: true, shiftKey: true }), undo, "other")).toBe(false)
    expect(matchesChord(key("z", { ctrlKey: true, altKey: true }), undo, "other")).toBe(false)
    expect(matchesChord(key("z"), undo, "other")).toBe(false)
  })

  test("a shifted symbol is the symbol, whatever layout types it", () => {
    // `?` is Shift+/ on a US keyboard and Shift+' on an Italian one; both send key "?".
    const help = parseChord("?")!
    expect(matchesChord(key("?", { shiftKey: true }), help, "other")).toBe(true)
    expect(matchesChord(key("?"), help, "other")).toBe(true)
    // `+` is Shift+= on US and a plain key on Italian.
    const plus = parseChord("+")!
    expect(matchesChord(key("+", { shiftKey: true }), plus, "other")).toBe(true)
    expect(matchesChord(key("+"), plus, "other")).toBe(true)
  })

  test("macOS Option turns letters into symbols: the physical key names the chord", () => {
    const event = key("ƒ", { altKey: true, code: "KeyF" })
    expect(formatChord(chordFromEvent(event, "mac")!)).toBe("Alt+F")
    expect(formatChord(chordFromEvent(key("!", { metaKey: true, shiftKey: true, code: "Digit1" }), "mac")!)).toBe("Mod+Shift+1")
    // Without a command modifier the typed character stays the key (AZERTY digits are shifted).
    expect(formatChord(chordFromEvent(key("&", { code: "Digit1" }), "other")!)).toBe("&")
  })

  test("a lone modifier press is not a chord", () => {
    for (const k of ["Shift", "Control", "Alt", "Meta", "Dead", "Unidentified"]) expect(chordFromEvent(key(k), "other")).toBeUndefined()
  })

  test("what the user sees", () => {
    expect(displayChord(parseChord("Mod+Shift+Z")!, "mac")).toBe("⇧⌘Z")
    expect(displayChord(parseChord("Mod+Shift+Z")!, "other")).toBe("Ctrl+Shift+Z")
    expect(displayChord(parseChord("Alt+1")!, "mac")).toBe("⌥1")
    expect(displayChord(parseChord("Escape")!, "other")).toBe("Esc")
    expect(displayChord(parseChord("Home")!, "other")).toBe("Home")
    expect(displayChord(parseChord("F11")!, "other")).toBe("F11")
    expect(displayChord(parseChord("PageDown")!, "mac")).toBe("Page Down")
    expect(hasCommandModifier(parseChord("Shift+A")!)).toBe(false)
    expect(hasCommandModifier(parseChord("Alt+A")!)).toBe(true)
  })
})

describe("the catalog", () => {
  test("ids are unique and every command has its labels", () => {
    expect(new Set(COMMANDS.map((command) => command.id)).size).toBe(COMMANDS.length)
    for (const command of COMMANDS) expect(en[labelKeyOf(command.id)], command.id).toBeString()
    for (const group of GROUPS) expect(en[groupKeyOf(group)], group).toBeString()
    for (const scope of ["global", "cad", "cam"]) expect(en[`keys.scope.${scope}`], scope).toBeString()
  })

  test("no two defaults collide in scopes that can be live together", () => {
    const seen = new Map<string, string>()
    for (const command of COMMANDS) {
      for (const text of command.defaults) {
        const chord = canonicalChord(text)!
        for (const other of COMMANDS) {
          if (other.id === command.id || !scopesOverlap(other.scope, command.scope)) continue
          expect(other.defaults.map((candidate) => canonicalChord(candidate)), `${command.id} ${chord} vs ${other.id}`).not.toContain(chord)
        }
        seen.set(`${command.scope}:${chord}`, command.id)
      }
    }
    expect(seen.size).toBeGreaterThan(40)
  })

  test("defaults are never reserved and a command that fires while typing always has a modifier", () => {
    const reserved = RESERVED_CHORDS.map((text) => canonicalChord(text))
    for (const command of COMMANDS) {
      for (const text of command.defaults) {
        expect(reserved, `${command.id}: ${text}`).not.toContain(canonicalChord(text))
        if (command.inText === true) expect(hasCommandModifier(parseChord(text)!), `${command.id}: ${text}`).toBe(true)
      }
    }
  })

  test("no default takes a chord the native menu bar already owns, unless the menu runs that very command", () => {
    // On macOS the menu bar takes its accelerators before the webview sees the key.
    for (const item of NATIVE_MENU) {
      if (item.chord === undefined) continue
      for (const command of COMMANDS) {
        if (command.defaults.map((text) => canonicalChord(text)).includes(canonicalChord(item.chord))) {
          expect(item.command, `${command.id} reuses ${item.chord} of the menu item ${item.id}`).toBe(command.id)
        }
      }
    }
    for (const item of NATIVE_MENU) if (item.command !== undefined) expect(commandById(item.command), item.id).toBeDefined()
    expect(menuCommand("view.zoom_fit")).toBe("view.zoomFit")
    expect(menuCommand("file.open")).toBeUndefined()
  })

  test("the native menu table matches menu.rs, accelerator for accelerator", () => {
    const rust = readFileSync(new URL("../src-tauri/src/menu.rs", import.meta.url), "utf8")
    const declared = [...rust.matchAll(/\(\s*"([a-z_]+\.[a-z_]+)",\s*"[^"]*",\s*Some\("([^"]+)"\)\s*,?\s*\)/g)]
      .map((match) => [match[1]!, canonicalChord(match[2]!.replace("CmdOrCtrl", "Mod"))] as const)
    expect(declared.length).toBeGreaterThan(10)
    for (const [id, chord] of declared) {
      const item = NATIVE_MENU.find((candidate) => candidate.id === id)
      expect(item, `${id} is in menu.rs but not in NATIVE_MENU`).toBeDefined()
      expect(canonicalChord(item!.chord ?? ""), id).toBe(chord)
    }
    for (const item of NATIVE_MENU) if (item.chord !== undefined) expect(declared.map(([id]) => id), item.id).toContain(item.id)
  })

  test("the same action has the same id and chord on both pages", () => {
    for (const id of ["file.save", "edit.undo", "edit.redo", "edit.cancel", "view.zoomFit", "view.zoomIn", "view.zoomOut"]) {
      expect(commandById(id)?.scope, id).toBe("global")
    }
    expect(commandById("cad.view.mode3d")!.defaults).toEqual(["Alt+1"])
    expect(commandById("cam.tab.editor")!.defaults).toEqual(["Alt+1"])
    expect(SNAP_TYPES.map(([type]) => commandById(`cad.snap.type.${type}`)?.id)).not.toContain(undefined)
  })

  test("only CAD commands are live on the CAD page, and only CAM ones on CAM", () => {
    expect(liveScopes("cad")).toEqual(["global", "cad"])
    expect(liveScopes("cam")).toEqual(["global", "cam"])
    expect(liveScopes("projects")).toEqual(["global"])
    const keymap = buildKeymap()
    expect(keymap.resolve(parseChord("Alt+1")!, liveScopes("cad")).map((command) => command.id)).toEqual(["cad.view.mode3d"])
    expect(keymap.resolve(parseChord("Alt+1")!, liveScopes("cam")).map((command) => command.id)).toEqual(["cam.tab.editor"])
    expect(keymap.resolve(parseChord("Alt+1")!, liveScopes("projects"))).toEqual([])
    expect(keymap.resolve(parseChord("Mod+S")!, liveScopes("projects")).map((command) => command.id)).toEqual(["file.save"])
  })
})

describe("the keymap", () => {
  test("the defaults build without issues", () => {
    const keymap = buildKeymap()
    expect(keymap.issues).toEqual([])
    expect(keymap.entry("edit.redo")!.chords.map(formatChord)).toEqual(["Mod+Shift+Z", "Mod+Y"])
    expect(keymap.entry("cad.snap.type.parallel")!.chords).toEqual([])
  })

  test("an override replaces the defaults; an empty one unbinds", () => {
    const keymap = buildKeymap({ "cad.delete": ["Mod+Backspace"], "cad.copy": [] })
    expect(keymap.entry("cad.delete")!.chords.map(formatChord)).toEqual(["Mod+Backspace"])
    expect(keymap.entry("cad.delete")!.customised).toBe(true)
    expect(keymap.entry("cad.copy")!.chords).toEqual([])
    expect(keymap.resolve(parseChord("Delete")!, liveScopes("cad"))).toEqual([])
  })

  test("a stored chord that is wrong is dropped and reported, never thrown", () => {
    const keymap = buildKeymap({ "nope.command": ["Mod+Q"], "cad.copy": ["Mod+Nope", "Mod+Q", "Mod+Shift+C"], "app.palette": ["K"] })
    expect(keymap.entry("cad.copy")!.chords.map(formatChord)).toEqual(["Mod+Shift+C"])
    expect(keymap.entry("app.palette")!.chords.map(formatChord)).toEqual(["Mod+K"])
    expect(keymap.issues.map((issue) => issue.kind).sort()).toEqual(["invalidChord", "needsModifier", "reserved", "unknownCommand"])
  })

  test("the user's chord beats a default; between two user chords the catalog order wins", () => {
    const stolen = buildKeymap({ "cad.copy": ["Mod+Z"] })
    expect(stolen.entry("cad.copy")!.chords.map(formatChord)).toEqual(["Mod+Z"])
    expect(stolen.entry("edit.undo")!.chords).toEqual([])
    const clash = buildKeymap({ "cad.copy": ["Mod+Shift+C"], "cad.paste": ["Mod+Shift+C"] })
    expect(clash.entry("cad.copy")!.chords.map(formatChord)).toEqual(["Mod+Shift+C"])
    expect(clash.entry("cad.paste")!.chords).toEqual([])
    expect(clash.issues).toEqual([{ kind: "conflict", id: "cad.paste", chord: "Mod+Shift+C", other: "cad.copy" }])
  })

  test("CAD and CAM may share a chord, a page and the shell may not", () => {
    const keymap = buildKeymap()
    expect(checkBinding(keymap, "cad.view.mode3d", "Alt+3")).toMatchObject({ ok: true })
    expect(checkBinding(keymap, "cam.tab.post", "Alt+1")).toMatchObject({ ok: false, reason: "conflict" })
    const global = checkBinding(keymap, "cam.tab.post", "Mod+S")
    expect(global).toMatchObject({ ok: false, reason: "conflict" })
    expect(global.ok === false && global.reason === "conflict" ? global.with.map((c) => c.id) : []).toEqual(["file.save"])
    expect(checkBinding(keymap, "cad.copy", "Mod+Q")).toMatchObject({ ok: false, reason: "reserved" })
    expect(checkBinding(keymap, "file.save", "S")).toMatchObject({ ok: false, reason: "needsModifier" })
    expect(checkBinding(keymap, "cad.copy", "banana")).toMatchObject({ ok: false, reason: "invalidChord" })
    // Re-binding a command to the chord it already has is not a conflict with itself.
    expect(checkBinding(keymap, "file.save", "Mod+S")).toMatchObject({ ok: true })
  })

  test("a list equal to the defaults is not an override", () => {
    expect(isDefault(commandById("edit.redo")!, ["Mod+Y", "cmd/ctrl+shift+z"])).toBe(true)
    expect(isDefault(commandById("edit.redo")!, ["Mod+Y"])).toBe(false)
    expect(sanitiseOverrides({ "edit.redo": ["Mod+Shift+Z", "Mod+Y"], "cad.copy": ["mod+shift+c", "bogus", "Mod+Shift+C"], "x.y": ["A"] }))
      .toEqual({ "cad.copy": ["Mod+Shift+C"] })
  })
})

const withService = async <A,>(f: (service: Keybindings["Service"]) => Effect.Effect<A, unknown, never>, initial?: StoredKeymap, saved?: StoredKeymap[]) => {
  const layer = Layer.succeed(KeybindingStore, KeybindingStore.of({
    load: Effect.succeed(initial),
    save: (doc) => Effect.sync(() => { saved?.push(doc) })
  }))
  const runtime = ManagedRuntime.make(Keybindings.layer.pipe(Layer.provide(layer)))
  try { return await runtime.runPromiseExit(Effect.flatMap(Effect.service(Keybindings), f)) } finally { await runtime.dispose() }
}
const failure = (exit: Exit.Exit<unknown, unknown>): unknown => {
  if (Exit.isSuccess(exit)) throw new Error("expected a failure")
  const fail = exit.cause.reasons.find((reason) => reason._tag === "Fail")
  return fail?.error
}

describe("the keybindings service", () => {
  test("rebind validates, stores and answers with the new keymap", async () => {
    const saved: StoredKeymap[] = []
    const exit = await withService((service) => service.rebind("cad.copy", ["cmd/ctrl+shift+c"]), undefined, saved)
    expect(Exit.isSuccess(exit) && exit.value.entry("cad.copy")!.chords.map(formatChord)).toEqual(["Mod+Shift+C"])
    expect(saved).toHaveLength(1)
    expect(saved[0]!.overrides).toEqual({ "cad.copy": ["Mod+Shift+C"] })
    expect(saved[0]!.format).toBe("cadcamfun-keybindings")
  })

  test("a refused chord says why and changes nothing", async () => {
    const saved: StoredKeymap[] = []
    expect(failure(await withService((service) => service.rebind("nope", ["Mod+K"]), undefined, saved))).toBeInstanceOf(UnknownCommand)
    const reserved = failure(await withService((service) => service.rebind("cad.copy", ["Mod+Q"]), undefined, saved))
    expect(reserved).toBeInstanceOf(InvalidChord)
    expect((reserved as InvalidChord).reason).toBe("reserved")
    const conflict = failure(await withService((service) => service.rebind("cad.copy", ["Mod+Z"]), undefined, saved))
    expect(conflict).toBeInstanceOf(ChordConflict)
    expect((conflict as ChordConflict).with).toEqual(["edit.undo"])
    expect(saved).toEqual([])
  })

  test("reassign takes the chord from its owner and keeps the owner's other chords", async () => {
    const exit = await withService((service) => service.rebind("cad.copy", ["Mod+Shift+Z"], { reassign: true }))
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.entry("edit.redo")!.chords.map(formatChord)).toEqual(["Mod+Y"])
    expect(exit.value.entry("cad.copy")!.chords.map(formatChord)).toEqual(["Mod+Shift+Z"])
    expect(exit.value.issues).toEqual([])
  })

  test("reset and resetAll restore the defaults and drop the override", async () => {
    const exit = await withService((service) => Effect.gen(function*() {
      yield* service.rebind("cad.copy", ["Mod+Shift+C"])
      yield* service.rebind("cad.paste", ["Mod+Shift+V"])
      const one = yield* service.reset("cad.copy")
      const all = yield* service.resetAll
      return { one, all }
    }))
    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return
    expect(exit.value.one.overrides).toEqual({ "cad.paste": ["Mod+Shift+V"] })
    expect(exit.value.all.overrides).toEqual({})
  })

  test("export and import carry the overrides; a foreign file is refused", async () => {
    const exit = await withService((service) => Effect.gen(function*() {
      yield* service.rebind("cad.copy", ["Mod+Shift+C"])
      const text = yield* service.exportJson
      yield* service.resetAll
      const imported = yield* service.importJson(text)
      return { text, imported }
    }))
    expect(Exit.isSuccess(exit)).toBe(true)
    if (Exit.isSuccess(exit)) {
      expect(JSON.parse(exit.value.text).overrides).toEqual({ "cad.copy": ["Mod+Shift+C"] })
      expect(exit.value.imported.entry("cad.copy")!.chords.map(formatChord)).toEqual(["Mod+Shift+C"])
    }
    for (const text of ["not json", "[1,2]", '{"overrides": 3}']) {
      expect(failure(await withService((service) => service.importJson(text))), text).toBeInstanceOf(InvalidDocument)
    }
  })

  test("a stored keymap is applied on start, junk in it is ignored", async () => {
    const exit = await withService((service) => service.keymap, { overrides: { "cad.copy": ["Mod+Shift+C"], "bogus": ["A"], "app.palette": ["K"] } })
    expect(Exit.isSuccess(exit) && exit.value.entry("cad.copy")!.chords.map(formatChord)).toEqual(["Mod+Shift+C"])
    expect(Exit.isSuccess(exit) && exit.value.entry("app.palette")!.chords.map(formatChord)).toEqual(["Mod+K"])
  })

  test("the newest copy wins when the sidecar and this machine disagree", async () => {
    const older: StoredKeymap = { updatedAt: "2026-01-01T00:00:00.000Z", overrides: { "cad.copy": ["Mod+Shift+C"] } }
    const newer: StoredKeymap = { updatedAt: "2026-02-01T00:00:00.000Z", overrides: { "cad.paste": ["Mod+Shift+V"] } }
    expect(newest(older, newer)).toBe(newer)
    expect(newest(newer, older)).toBe(newer)
    expect(newest(undefined, older)).toBe(older)
    expect(newest(older, undefined)).toBe(older)
    const wrote: StoredKeymap[] = []
    const store = syncedStore(
      { load: Effect.succeed(older), save: (doc) => Effect.sync(() => { wrote.push(doc) }) },
      { load: Effect.succeed(newer), save: (doc) => Effect.sync(() => { wrote.push(doc) }) }
    )
    // Boot reads the local copy only; reconcile compares it with the remote one.
    expect(await Effect.runPromise(store.load)).toBe(older)
    expect(newest(await Effect.runPromise(store.load), await Effect.runPromise(store.loadRemote!))).toBe(newer)
    await Effect.runPromise(store.save(older))
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(wrote).toHaveLength(2)
  })

  test("reconcile adopts a newer sidecar copy and publishes ours when it is newer", async () => {
    let remote: StoredKeymap | undefined = { updatedAt: "2999-01-01T00:00:00.000Z", overrides: { "cad.paste": ["Mod+Shift+V"] } }
    const layer = Layer.succeed(KeybindingStore, KeybindingStore.of({ load: Effect.sync(() => remote), save: (doc) => Effect.sync(() => { remote = doc }) }))
    const runtime = ManagedRuntime.make(Keybindings.layer.pipe(Layer.provide(layer)))
    const service = await runtime.runPromise(Effect.service(Keybindings))
    // Started with the remote copy already there: nothing to adopt, nothing to publish.
    expect((await runtime.runPromise(service.reconcile)).entry("cad.paste")!.chords.map(formatChord)).toEqual(["Mod+Shift+V"])
    await runtime.runPromise(service.rebind("cad.copy", ["Mod+Shift+C"]))
    // Our rebind is older than the far-future remote stamp, so reconcile keeps the remote's keymap.
    const adopted = await runtime.runPromise(service.reconcile)
    expect(adopted.entry("cad.paste")!.chords.map(formatChord)).toEqual(["Mod+Shift+V"])
    remote = undefined
    const published = await runtime.runPromise(service.reconcile)
    expect(published).toBeDefined()
    expect(remote).toBeDefined()
    await runtime.dispose()
  })
})

const press = (target: EventTarget | null, k: string, mods: Partial<KeyEventLike> & { repeat?: boolean } = {}): KeyboardEvent => {
  let prevented = false
  const event = {
    ...key(k, mods), target, repeat: mods.repeat === true, defaultPrevented: false, isComposing: false,
    preventDefault: () => { prevented = true }, stopPropagation: () => {}
  } as unknown as KeyboardEvent
  Object.defineProperty(event, "defaultPrevented", { get: () => prevented })
  return event
}
const element = (tagName: string, extra: Record<string, unknown> = {}): HTMLElement =>
  ({ tagName, isContentEditable: false, getAttribute: () => null, ...extra }) as unknown as HTMLElement

const controller = (activity: string = "cad", extra: { dialog?: boolean } = {}) => {
  const [current, setActivity] = createSignal(activity)
  const [dialog, setDialog] = createSignal(extra.dialog === true)
  const keys = createRoot(() => createKeybindings({ activity: current, store: KeybindingStore.memory(), platform: "other", dialogOpen: dialog }))
  return { keys, setActivity, setDialog }
}

describe("booting without the sidecar", () => {
  test("the keymap is built synchronously even when the sidecar never answers", () => {
    // Regression: the first build once waited for the sidecar's copy, `runSync` threw AsyncFiberError, the app state
    // could not be created and the splash retried forever.
    const never = Effect.never as Effect.Effect<StoredKeymap | undefined>
    const local: StoredKeymap = { updatedAt: "2026-01-01T00:00:00.000Z", overrides: { "cad.copy": ["Mod+Shift+C"] } }
    const store = syncedStore(
      { load: Effect.succeed(local), save: () => Effect.void },
      { load: never, save: () => Effect.void }
    )
    const [activity] = createSignal("cad")
    const keys = createRoot(() => createKeybindings({ activity, store: Layer.succeed(KeybindingStore, KeybindingStore.of(store)), platform: "other" }))
    expect(keys.keymap().entry("cad.copy")!.chords.map(formatChord)).toEqual(["Mod+Shift+C"])
  })

  test("a rebind never waits for the sidecar either", () => {
    const store = syncedStore(
      { load: Effect.succeed(undefined), save: () => Effect.void },
      { load: Effect.never, save: () => Effect.never }
    )
    const [activity] = createSignal("cad")
    const keys = createRoot(() => createKeybindings({ activity, store: Layer.succeed(KeybindingStore, KeybindingStore.of(store)), platform: "other" }))
    expect(keys.rebind("cad.copy", ["Mod+Shift+C"]).ok).toBe(true)
  })
})

describe("the dispatcher", () => {
  test("a chord runs the handler of the command and is consumed", () => {
    const { keys } = controller("cad")
    const calls: string[] = []
    keys.register({ "cad.copy": () => { calls.push("copy") } })
    const event = press(element("DIV"), "c", { ctrlKey: true })
    expect(keys.dispatch(event, "capture")).toBe(true)
    expect(calls).toEqual(["copy"])
    expect(event.defaultPrevented).toBe(true)
  })

  test("the same event is never run twice by the capture and the bubble listener", () => {
    const { keys } = controller("cad")
    let count = 0
    keys.register({ "cad.copy": () => { count++ }, "cad.delete": () => { count++ } })
    const modified = press(element("DIV"), "c", { ctrlKey: true })
    keys.dispatch(modified, "capture"); keys.dispatch(modified, "bubble")
    const plain = press(element("DIV"), "Delete")
    keys.dispatch(plain, "capture"); keys.dispatch(plain, "bubble"); keys.dispatch(plain, "bubble")
    expect(count).toBe(2)
  })

  test("a command is live only on its page", () => {
    const { keys, setActivity } = controller("cam")
    let copied = false
    keys.register({ "cad.copy": () => { copied = true } })
    expect(keys.dispatch(press(element("DIV"), "c", { ctrlKey: true }), "capture")).toBe(false)
    setActivity("cad")
    expect(keys.dispatch(press(element("DIV"), "c", { ctrlKey: true }), "capture")).toBe(true)
    expect(copied).toBe(true)
  })

  test("the page mounted last answers first, and `false` hands the key down", () => {
    const { keys } = controller("cad")
    const calls: string[] = []
    const offShell = keys.register({ "edit.cancel": () => { calls.push("shell") } })
    const offPage = keys.register({ "edit.cancel": () => { calls.push("page"); return false } })
    expect(keys.dispatch(press(element("DIV"), "Escape"))).toBe(true)
    expect(calls).toEqual(["page", "shell"])
    offPage()
    calls.length = 0
    keys.dispatch(press(element("DIV"), "Escape"))
    expect(calls).toEqual(["shell"])
    offShell()
    expect(keys.dispatch(press(element("DIV"), "Escape"))).toBe(false)
  })

  test("unregistering removes exactly the handlers that were registered", () => {
    const { keys } = controller("cad")
    const a = keys.register({ "cad.copy": () => undefined })
    const b = keys.register({ "cad.copy": () => undefined })
    expect(keys.available("cad.copy")).toBe(true)
    a(); expect(keys.available("cad.copy")).toBe(true)
    b(); expect(keys.available("cad.copy")).toBe(false)
    expect(keys.run("cad.copy")).toBe(false)
  })

  test("typing in a field keeps plain keys and Cmd+C; Cmd+S still saves", () => {
    const { keys } = controller("cad")
    const calls: string[] = []
    keys.register({ "cad.transform.rotate": () => { calls.push("rotate") }, "cad.copy": () => { calls.push("copy") }, "file.save": () => { calls.push("save") } })
    const input = element("INPUT", { type: "text" })
    expect(keys.dispatch(press(input, "r"))).toBe(false)
    expect(keys.dispatch(press(input, "c", { ctrlKey: true }), "capture")).toBe(false)
    expect(keys.dispatch(press(input, "s", { ctrlKey: true }), "capture")).toBe(true)
    expect(calls).toEqual(["save"])
    expect(isTextEntry(element("TEXTAREA"))).toBe(true)
    expect(isTextEntry(element("INPUT", { type: "checkbox" }))).toBe(false)
    expect(isTextEntry(element("DIV", { isContentEditable: true }))).toBe(true)
  })

  test("a handler may claim a field (the G-code editor keeps one undo history)", () => {
    const { keys } = controller("cam")
    let undone = 0
    keys.register({ "edit.undo": { run: () => { undone++ }, inText: (target) => (target as HTMLElement).tagName === "TEXTAREA" } })
    expect(keys.dispatch(press(element("TEXTAREA"), "z", { ctrlKey: true }), "capture")).toBe(true)
    expect(keys.dispatch(press(element("INPUT", { type: "text" }), "z", { ctrlKey: true }), "capture")).toBe(false)
    expect(undone).toBe(1)
  })

  test("an open dialog blocks commands, except the ones that toggle it", () => {
    const { keys } = controller("cad", { dialog: true })
    const calls: string[] = []
    keys.register({ "cad.copy": () => { calls.push("copy") }, "app.palette": () => { calls.push("palette") } })
    expect(keys.dispatch(press(element("DIV"), "c", { ctrlKey: true }), "capture")).toBe(false)
    expect(keys.dispatch(press(element("DIV"), "k", { ctrlKey: true }), "capture")).toBe(true)
    expect(calls).toEqual(["palette"])
  })

  test("Space and Enter belong to a focused button; auto-repeat only where a command repeats", () => {
    const { keys } = controller("cam")
    let toggled = 0, zoomed = 0
    keys.register({ "cam.simulation.toggle": () => { toggled++ }, "view.zoomIn": () => { zoomed++ } })
    expect(keys.dispatch(press(element("BUTTON"), " "))).toBe(false)
    expect(keys.dispatch(press(element("DIV"), " "))).toBe(true)
    expect(keys.dispatch(press(element("DIV"), " ", { repeat: true }))).toBe(false)
    expect(keys.dispatch(press(element("DIV"), "=", { repeat: true }))).toBe(true)
    expect(keys.dispatch(press(element("DIV"), "+", { repeat: true }))).toBe(true)
    expect([toggled, zoomed]).toEqual([1, 2])
    expect(isActivatable(element("DIV", { getAttribute: () => "menuitem" }))).toBe(true)
  })

  test("plain keys wait for the bubble phase so a menu that took the key keeps it", () => {
    const { keys } = controller("cad")
    let cancelled = 0
    keys.register({ "edit.cancel": () => { cancelled++ } })
    expect(keys.dispatch(press(element("DIV"), "Escape"), "capture")).toBe(false)
    const taken = press(element("DIV"), "Escape")
    taken.preventDefault()
    expect(keys.dispatch(taken, "bubble")).toBe(false)
    expect(keys.dispatch(press(element("DIV"), "Escape"), "bubble")).toBe(true)
    expect(cancelled).toBe(1)
  })

  test("a rebound chord takes effect at once, and the old one stops", () => {
    const { keys } = controller("cad")
    let copied = 0
    keys.register({ "cad.copy": () => { copied++ } })
    const result = keys.rebind("cad.copy", ["Mod+Shift+C"])
    expect(result.ok).toBe(true)
    expect(keys.dispatch(press(element("DIV"), "c", { ctrlKey: true }), "capture")).toBe(false)
    expect(keys.dispatch(press(element("DIV"), "C", { ctrlKey: true, shiftKey: true }), "capture")).toBe(true)
    expect(copied).toBe(1)
    const clash = keys.rebind("cad.paste", ["Mod+Shift+C"])
    expect(clash.ok).toBe(false)
    if (!clash.ok) expect(clash.error).toBeInstanceOf(ChordConflict)
    expect(keys.reset("cad.copy").entry("cad.copy")!.customised).toBe(false)
    expect(keys.importJson("nope").ok).toBe(false)
    expect(JSON.parse(keys.exportJson()).format).toBe("cadcamfun-keybindings")
  })

  test("the palette and the shortcuts dialog run commands by id", () => {
    const { keys } = controller("cad")
    let opened = 0
    keys.register({ "app.shortcuts": () => { opened++ } })
    expect(keys.run("app.shortcuts")).toBe(true)
    expect(opened).toBe(1)
    expect(keys.run("app.go.cam")).toBe(false)
  })
})
