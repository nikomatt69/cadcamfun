import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { Effect, Schema } from "effect"

/**
 * Read-only view of a local nikcli install: the same `auth.json` credentials and global
 * `nikcli.json` default model that nikcli itself uses, so CADCAMFUN needs no keys of its own.
 * Paths follow nikcli's own resolution (`NIKCLI_DATA_DIR`, XDG, then `~/.local/share`).
 */
const Credential = Schema.Union([
  Schema.Struct({ type: Schema.Literal("api"), key: Schema.String }),
  Schema.Struct({ type: Schema.Literal("oauth"), access: Schema.String, expires: Schema.Number }),
  Schema.Struct({ type: Schema.Literal("wellknown"), key: Schema.String, token: Schema.String }),
])
const AuthFile = Schema.Record(Schema.String, Schema.Unknown)
const ConfigFile = Schema.Struct({ model: Schema.optional(Schema.String) })

export interface NikcliEnv {
  readonly [name: string]: string | undefined
}

export const paths = (env: NikcliEnv = process.env) => {
  const home = env.NIKCLI_TEST_HOME ?? homedir()
  const data = env.NIKCLI_DATA_DIR?.trim()
    ? resolve(env.NIKCLI_DATA_DIR.trim())
    : join(env.XDG_DATA_HOME || join(home, ".local", "share"), "nikcli")
  const config = env.NIKCLI_CONFIG_DIR?.trim() || join(env.XDG_CONFIG_HOME || join(home, ".config"), "nikcli")
  return { auth: join(data, "auth.json"), config: [join(config, "nikcli.json"), join(config, "config.json")] }
}

const readJson = (path: string) =>
  Effect.tryPromise(() => readFile(path, "utf8")).pipe(
    Effect.flatMap((text) => Effect.try(() => JSON.parse(text) as unknown)),
    Effect.option,
  )

export interface Nikcli {
  /** API key nikcli holds for a provider (`api` entries, or an unexpired OAuth access token). */
  readonly key: (provider: string) => string | undefined
  /** Default model from nikcli's global config, split as `provider/model`. */
  readonly model?: { readonly provider: string; readonly id: string }
}

export const load = (env: NikcliEnv = process.env, now = Date.now()): Effect.Effect<Nikcli> =>
  Effect.gen(function* () {
    const p = paths(env)
    const auth = yield* readJson(p.auth).pipe(
      Effect.map((o) => o.pipe((x) => (x._tag === "Some" ? Schema.decodeUnknownOption(AuthFile)(x.value) : x))),
    )
    const entries = auth._tag === "Some" ? auth.value : {}
    let model: Nikcli["model"]
    for (const file of p.config) {
      const config = yield* readJson(file)
      const decoded = config._tag === "Some" ? Schema.decodeUnknownOption(ConfigFile)(config.value) : config
      const ref = decoded._tag === "Some" ? decoded.value.model : undefined
      const slash = ref?.indexOf("/") ?? -1
      if (ref && slash > 0) {
        model = { provider: ref.slice(0, slash), id: ref.slice(slash + 1) }
        break
      }
    }
    return {
      key: (provider) => {
        const c = Schema.decodeUnknownOption(Credential)(entries[provider])
        if (c._tag === "None") return undefined
        switch (c.value.type) {
          case "api":
            return c.value.key
          case "oauth":
            return c.value.expires > now + 30_000 ? c.value.access : undefined
          case "wellknown":
            return c.value.token
        }
      },
      ...(model ? { model } : {}),
    }
  })
