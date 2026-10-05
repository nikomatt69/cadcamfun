import { Api, WaitlistBadRequest, WaitlistConflict, WaitlistInternal } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { AppConfigService } from "../config.ts"

interface Entry { readonly email: string; readonly createdAt: string; readonly status: string }

const internal = new WaitlistInternal({ success: false, message: "Si è verificato un errore durante la registrazione" })

/** The legacy route kept the list in `data/waitlist.json`; v6 keeps it in the sidecar data dir. */
export const WaitlistHandlers = HttpApiBuilder.group(Api, "waitlist", Effect.fn(function*(handlers) {
  const config = yield* AppConfigService
  const file = join(config.dataDir, "waitlist.json")
  const load = (): Array<Entry> => existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) as Array<Entry> : []
  const save = (entries: ReadonlyArray<Entry>) => {
    mkdirSync(config.dataDir, { recursive: true })
    writeFileSync(file, JSON.stringify(entries, null, 2))
  }
  return handlers.handle("join", ({ payload }) => Effect.gen(function*() {
    const email = payload.email
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return yield* new WaitlistBadRequest({ success: false, message: "Email non valida" })
    }
    const entries = yield* Effect.try({ try: load, catch: (e) => e })
    if (entries.some((e) => e.email === email)) {
      return yield* new WaitlistConflict({ success: false, message: "Email già registrata" })
    }
    yield* Effect.try({
      try: () => save([...entries, { email, createdAt: new Date().toISOString(), status: "pending" }]),
      catch: (e) => e
    })
    return { success: true as const, message: "Iscrizione completata con successo" }
  }).pipe(Effect.catchIf(
    (e): e is unknown => !(e instanceof WaitlistBadRequest || e instanceof WaitlistConflict),
    (e) => Effect.logError("Errore waitlist", e).pipe(Effect.andThen(Effect.fail(internal))))))
}))
