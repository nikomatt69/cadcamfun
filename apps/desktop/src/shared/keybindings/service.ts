/**
 * The keybindings service (Effect): rebinding rules, persistence and cross-device sync.
 *
 * `Keybindings` owns the user's overrides and is the only thing that may change them; every change is validated
 * (known command, real chord, not reserved, no clash in a scope that can be live together), persisted through the
 * `KeybindingStore` port and answered with the new `Keymap`. The store has two backends that the app layers together:
 * `localStorage` (instant, works offline and before the sidecar is up) and the sidecar's key-value API under
 * `ui.keybindings`, so a keymap follows the user to another machine. The newest copy wins on reconcile.
 */
import { Context, Effect, Layer, Ref, Schema } from "effect"
import { commandById } from "./catalog.ts"
import { buildKeymap, canonicalList, checkBinding, isDefault, type Keymap, type Overrides } from "./keymap.ts"
import { formatChord } from "./chord.ts"

export const KEYBINDINGS_STORAGE_KEY = "cadcamfun.keybindings"
/** The sidecar key-value entry (UI preferences live under `ui.`). */
export const KEYBINDINGS_KV_KEY = "ui.keybindings"
export const KEYBINDINGS_FORMAT = "cadcamfun-keybindings"

// ---------------------------------------------------------------------------------------------------------- errors

export class UnknownCommand extends Schema.TaggedError<UnknownCommand>()("UnknownCommand", {
  id: Schema.String
}) {}

/** The text is not a chord, is owned by the system, or types a character while the command must fire in a field. */
export class InvalidChord extends Schema.TaggedError<InvalidChord>()("InvalidChord", {
  id: Schema.String,
  chord: Schema.String,
  reason: Schema.Literals(["invalidChord", "reserved", "needsModifier"])
}) {}

/** Another command that can be live at the same time already owns the chord. */
export class ChordConflict extends Schema.TaggedError<ChordConflict>()("ChordConflict", {
  id: Schema.String,
  chord: Schema.String,
  with: Schema.Array(Schema.String)
}) {}

/** An imported file that is not a keymap. */
export class InvalidDocument extends Schema.TaggedError<InvalidDocument>()("InvalidDocument", {
  message: Schema.String
}) {}

export type KeybindingError = UnknownCommand | InvalidChord | ChordConflict

// ---------------------------------------------------------------------------------------------------------- document

/** What is stored and exported. `updatedAt` decides which copy wins when two devices disagree. */
export const StoredKeymap = Schema.Struct({
  format: Schema.optional(Schema.Literal(KEYBINDINGS_FORMAT)),
  version: Schema.optional(Schema.Number),
  updatedAt: Schema.optional(Schema.String),
  overrides: Schema.Record(Schema.String, Schema.Array(Schema.String))
})
export type StoredKeymap = typeof StoredKeymap.Type

const EPOCH = "1970-01-01T00:00:00.000Z"
const stamp = (doc: StoredKeymap | undefined): string => doc?.updatedAt ?? EPOCH

/** The newest of two copies; a tie keeps `a`. */
export const newest = (a: StoredKeymap | undefined, b: StoredKeymap | undefined): StoredKeymap | undefined =>
  a === undefined ? b : b === undefined ? a : stamp(b) > stamp(a) ? b : a

/** Drops what the catalog does not know and normalises every chord, so a stored copy can be applied blindly. */
export const sanitiseOverrides = (overrides: Overrides): Overrides => {
  const clean: Record<string, ReadonlyArray<string>> = {}
  for (const [id, chords] of Object.entries(overrides)) {
    const command = commandById(id)
    if (command === undefined) continue
    const canonical = canonicalList(chords)
    // Unbinding (an empty list) is a deliberate override; a list that equals the defaults is not an override.
    if (!isDefault(command, canonical)) clean[id] = canonical
  }
  return clean
}

const decodeDocument = Schema.decodeUnknownEffect(StoredKeymap)

// ---------------------------------------------------------------------------------------------------------- store port

type StorageLike = Pick<Storage, "getItem" | "setItem">

/** `localStorage`, read lazily so the module imports in a non-DOM test. */
export const localStore = (storage: () => StorageLike | undefined = () => globalThis.localStorage): KeybindingStore["Service"] => ({
  load: Effect.sync(() => {
    try {
      const raw = storage()?.getItem(KEYBINDINGS_STORAGE_KEY)
      return raw === null || raw === undefined ? undefined : Schema.decodeUnknownSync(StoredKeymap)(JSON.parse(raw))
    } catch { return undefined }
  }),
  save: (doc) => Effect.sync(() => {
    try { storage()?.setItem(KEYBINDINGS_STORAGE_KEY, JSON.stringify(doc)) } catch { /* the keymap simply does not persist */ }
  })
})

export class KeybindingStore extends Context.Service<KeybindingStore, {
  /**
   * The local copy, or `undefined` when there is none or it cannot be read. Never fails (storage is best-effort) and
   * never waits: the app builds its state synchronously at boot, before the sidecar is reachable.
   */
  readonly load: Effect.Effect<StoredKeymap | undefined>
  /** The copy kept elsewhere (the sidecar), which may take a while or fail; only `reconcile` reads it. */
  readonly loadRemote?: Effect.Effect<StoredKeymap | undefined>
  /** Persists the copy; a full disk, a blocked storage or an offline sidecar must not break editing. */
  readonly save: (doc: StoredKeymap) => Effect.Effect<void>
}>()("cadcamfun/keybindings/KeybindingStore") {
  /** Not persisted at all (tests, previews). */
  static readonly memory = (initial?: StoredKeymap) => Layer.effect(KeybindingStore, Effect.gen(function*() {
    const cell = yield* Ref.make(initial)
    return KeybindingStore.of({ load: Ref.get(cell), save: (doc) => Ref.set(cell, doc) })
  }))

  static readonly local = (storage?: () => StorageLike | undefined) =>
    Layer.succeed(KeybindingStore, KeybindingStore.of(localStore(storage)))
}

/** The slice of the typed API client the sync uses. */
export interface KeybindingKvClient {
  readonly kv: {
    readonly get: (request: { readonly params: { readonly key: string } }) => Effect.Effect<{ readonly value: unknown }, unknown>
    readonly set: (request: { readonly params: { readonly key: string }; readonly payload: { readonly value: unknown } }) => Effect.Effect<unknown, unknown>
  }
}

/**
 * The sidecar copy. `load` reads `ui.keybindings`; `save` writes it without waiting, so a keystroke-time rebind never
 * blocks on the network. Both swallow every failure: the local copy is authoritative until the sidecar answers.
 */
export const remoteStore = (client: KeybindingKvClient): KeybindingStore["Service"] => ({
  load: client.kv.get({ params: { key: KEYBINDINGS_KV_KEY } }).pipe(
    Effect.flatMap((entry) => decodeDocument(entry.value)),
    Effect.catch(() => Effect.succeed(undefined))
  ),
  save: (doc) => Effect.forkDetach(
    client.kv.set({ params: { key: KEYBINDINGS_KV_KEY }, payload: { value: doc } }).pipe(
      Effect.catch((cause) => Effect.logWarning("keybindings: sidecar copy not saved", cause))
    )
  ).pipe(Effect.asVoid)
})

/** Layers a fast local copy over a remote one: boots from the local copy, reconciles with the remote, writes both. */
export const syncedStore = (local: KeybindingStore["Service"], remote: KeybindingStore["Service"]): KeybindingStore["Service"] => ({
  load: local.load,
  loadRemote: remote.load,
  // The remote write is detached whatever the remote store does: a rebind must never wait for a network.
  save: (doc) => Effect.flatMap(local.save(doc), () => Effect.asVoid(Effect.forkDetach(remote.save(doc))))
})

// ---------------------------------------------------------------------------------------------------------- service

export class Keybindings extends Context.Service<Keybindings, {
  readonly keymap: Effect.Effect<Keymap>
  /**
   * Replaces the chords of `id` (an empty list unbinds it). A clash fails with `ChordConflict` unless `reassign` is
   * set, in which case the chord is taken away from the commands that owned it.
   */
  readonly rebind: (id: string, chords: ReadonlyArray<string>, options?: { readonly reassign?: boolean }) => Effect.Effect<Keymap, KeybindingError>
  /** Back to the defaults for one command. */
  readonly reset: (id: string) => Effect.Effect<Keymap>
  readonly resetAll: Effect.Effect<Keymap>
  /** The portable JSON of the user's overrides. */
  readonly exportJson: Effect.Effect<string>
  readonly importJson: (text: string) => Effect.Effect<Keymap, InvalidDocument>
  /** Reads the store again and adopts or publishes the newest copy; call it once the sidecar is reachable. */
  readonly reconcile: Effect.Effect<Keymap>
}>()("cadcamfun/keybindings/Keybindings") {
  static readonly layer = Layer.effect(Keybindings, Effect.gen(function*() {
    const store = yield* KeybindingStore
    const loaded = yield* store.load
    const state = yield* Ref.make<{ readonly keymap: Keymap; readonly updatedAt: string }>({
      keymap: buildKeymap(sanitiseOverrides(loaded?.overrides ?? {})),
      updatedAt: stamp(loaded)
    })

    const commit = Effect.fn("Keybindings.commit")(function*(overrides: Overrides) {
      const clean = sanitiseOverrides(overrides)
      const updatedAt = new Date().toISOString()
      const keymap = buildKeymap(clean)
      yield* Ref.set(state, { keymap, updatedAt })
      yield* store.save({ format: KEYBINDINGS_FORMAT, version: 1, updatedAt, overrides: clean })
      return keymap
    })

    const adopt = Effect.fn("Keybindings.adopt")(function*(doc: StoredKeymap) {
      const keymap = buildKeymap(sanitiseOverrides(doc.overrides))
      yield* Ref.set(state, { keymap, updatedAt: stamp(doc) })
      return keymap
    })

    const rebind = Effect.fn("Keybindings.rebind")(function*(id: string, chords: ReadonlyArray<string>, options?: { readonly reassign?: boolean }) {
      const command = commandById(id)
      if (command === undefined) return yield* new UnknownCommand({ id })
      const { keymap } = yield* Ref.get(state)
      const wanted = new Set<string>()
      const taken = new Map<string, ReadonlyArray<string>>()
      for (const text of chords) {
        const checked = checkBinding(keymap, id, text)
        if (checked.ok) { wanted.add(checked.chord); continue }
        if (checked.reason !== "conflict") return yield* new InvalidChord({ id, chord: checked.chord, reason: checked.reason })
        if (options?.reassign !== true) return yield* new ChordConflict({ id, chord: checked.chord, with: checked.with.map((other) => other.id) })
        wanted.add(checked.chord)
        taken.set(checked.chord, checked.with.map((other) => other.id))
      }
      const next: Record<string, ReadonlyArray<string>> = { ...keymap.overrides, [id]: [...wanted] }
      // Reassign: the previous owners lose exactly that chord, the rest of their bindings stay.
      for (const [chord, owners] of taken) {
        for (const owner of owners) {
          const current = (next[owner] ?? keymap.entry(owner)?.chords.map(formatChord) ?? [])
          next[owner] = current.filter((candidate) => candidate !== chord)
        }
      }
      return yield* commit(next)
    })

    return Keybindings.of({
      keymap: Ref.get(state).pipe(Effect.map((current) => current.keymap)),
      rebind,
      reset: Effect.fn("Keybindings.reset")(function*(id: string) {
        const { keymap } = yield* Ref.get(state)
        const { [id]: _dropped, ...rest } = keymap.overrides
        return yield* commit(rest)
      }),
      resetAll: commit({}),
      exportJson: Ref.get(state).pipe(Effect.map((current) =>
        JSON.stringify({ format: KEYBINDINGS_FORMAT, version: 1, updatedAt: current.updatedAt, overrides: current.keymap.overrides }, null, 2))),
      importJson: Effect.fn("Keybindings.import")(function*(text: string) {
        const parsed = yield* Effect.try({
          try: () => JSON.parse(text) as unknown,
          catch: () => new InvalidDocument({ message: "not JSON" })
        })
        const doc = yield* decodeDocument(parsed).pipe(Effect.mapError(() => new InvalidDocument({ message: "not a keymap" })))
        return yield* commit(doc.overrides)
      }),
      reconcile: Effect.gen(function*() {
        const [here, there, current] = yield* Effect.all([store.load, store.loadRemote ?? Effect.succeed(undefined), Ref.get(state)])
        const stored = newest(here, there)
        if (stored !== undefined && stamp(stored) > current.updatedAt) return yield* adopt(stored)
        // Ours is the newest (a rebind made while the sidecar was down, or a reset): publish it so the other copy catches up.
        if (current.updatedAt !== EPOCH) {
          yield* store.save({ format: KEYBINDINGS_FORMAT, version: 1, updatedAt: current.updatedAt, overrides: current.keymap.overrides })
        }
        return current.keymap
      })
    })
  }))
}
