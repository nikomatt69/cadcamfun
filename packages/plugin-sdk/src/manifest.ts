/**
 * The plugin manifest (`plugin.json`) and its validation (spec 09-plugins.md §1).
 *
 * The Schema is the contract: the host refuses to install anything that does not
 * decode, and every field the host relies on (id, entry, apiVersion, capabilities)
 * is validated here rather than trusted from disk.
 *
 * Capabilities are *not* cross-checked here: `drawing:write` already implies
 * `drawing:read` (see `capability.ts`), so requiring both in the manifest would
 * only make authors repeat themselves.
 */
import { Effect, Schema } from "effect"
import { CapabilitySchema, type Capability } from "./capability.ts"

/** Reverse-DNS identifier, e.g. `com.example.gear-generator`. */
export const PluginIdSchema = Schema.String.check(
  Schema.isMinLength(3),
  Schema.isMaxLength(128),
  Schema.isPattern(/^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/)
)
export type PluginId = typeof PluginIdSchema.Type

/** `major.minor.patch` with an optional pre-release suffix. */
export const SemverSchema = Schema.String.check(
  Schema.isPattern(/^\d+\.\d+\.\d+(-[0-9A-Za-z-.]+)?$/)
)

/** Plugin API major version this SDK implements. */
export const SUPPORTED_API_VERSION = "1"

export const CommandContributionSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  title: Schema.String,
  /** Keyboard shortcut in the app's notation, e.g. `Mod+Shift+G`. */
  keybinding: Schema.optional(Schema.String)
})
export type CommandContribution = typeof CommandContributionSchema.Type

export const PanelContributionSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  title: Schema.String,
  /** Name of a function the plugin exposes for the panel's declarative tree. */
  entry: Schema.String
})
export type PanelContribution = typeof PanelContributionSchema.Type

export const PostProcessorContributionSchema = Schema.Struct({
  /** Post id the plugin registers into WP2's registry at runtime. */
  id: Schema.String.check(Schema.isMinLength(1)),
  title: Schema.String,
  /** Name of the exported `(program, options) => string` function. */
  entry: Schema.String
})
export type PostProcessorContribution = typeof PostProcessorContributionSchema.Type

export const OperationContributionSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  title: Schema.String,
  /** Name of the exported `{ schema, generate }` record. */
  entry: Schema.String
})
export type OperationContribution = typeof OperationContributionSchema.Type

/**
 * A tool the plugin offers the AI assistant (RM-11, spec 27 §4.2). `entry` names an exported function of the plugin module,
 * `aiTools[entry](args) => result`, run in the plugin's worker with only the capabilities the user granted. `parameters` is the
 * JSON Schema of `args`; the host validates the assistant's arguments against it before the worker sees them. A tool is `read`
 * (never changes anything) or `write` (the assistant's host asks the person before each call); there is no destructive kind.
 */
export const AiToolContributionSchema = Schema.Struct({
  /** Lower-case identifier; the assistant sees it as `plugin_<plugin>_<id>`. */
  id: Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9_]{0,39}$/)),
  /** What the tool does and when to use it: the model reads this. */
  description: Schema.String.check(Schema.isMinLength(10)).check(Schema.isMaxLength(2_000)),
  kind: Schema.Literals(["read", "write"]),
  parameters: Schema.Record(Schema.String, Schema.Unknown),
  /** Name of the exported function. */
  entry: Schema.String.check(Schema.isMinLength(1))
})
export type AiToolContribution = typeof AiToolContributionSchema.Type

/**
 * A nikcli mod the plugin ships (spec 09-plugins.md, assistant extensions): an ES module that exports `register(on, options)`
 * and hooks tool calls, the prompt and the session. It is separate code inside the plugin folder, not the plugin entry, and is
 * declared to the embedded host only while the plugin is enabled. Requires the `ai:mod` capability.
 */
export const ModContributionSchema = Schema.Struct({
  /** Lower-case identifier, unique within the plugin; the host knows the mod as `<plugin id>.<id>`. */
  id: Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9_-]{0,39}$/)),
  /** Display name in the Mods panel; the id is the fallback. */
  title: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(120)),
  /** What the mod hooks, read by the person (and the assistant) before enabling anything. */
  description: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)),
  /** ES module inside the plugin folder that exports `register`; a plain `.js` file name, no path. */
  entry: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._-]*\.js$/))
})
export type ModContribution = typeof ModContributionSchema.Type

/**
 * An assistant mode the plugin contributes (spec 09-plugins.md, assistant extensions): a named system-prompt block that appears
 * in the mode picker of the assistant. Declarative and bounded — the block is prepended to every turn of a conversation that
 * picks it. Requires the `ai:mode` capability.
 */
export const ModeContributionSchema = Schema.Struct({
  /** Lower-case identifier, unique within the plugin; conversations address the mode as `<plugin id>:<id>`. */
  id: Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9_-]{0,39}$/)),
  /** Display name in the mode picker. */
  title: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(120)),
  /** One line the picker shows under the name. */
  description: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(500)),
  /** The prompt block itself; kept short because it is re-sent with the system prompt on every turn. */
  instructions: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(4_000))
})
export type ModeContribution = typeof ModeContributionSchema.Type

export const ContributionsSchema = Schema.Struct({
  commands: Schema.optional(Schema.Array(CommandContributionSchema)),
  panels: Schema.optional(Schema.Array(PanelContributionSchema)),
  postProcessors: Schema.optional(Schema.Array(PostProcessorContributionSchema)),
  operations: Schema.optional(Schema.Array(OperationContributionSchema)),
  aiTools: Schema.optional(Schema.Array(AiToolContributionSchema)),
  mods: Schema.optional(Schema.Array(ModContributionSchema)),
  modes: Schema.optional(Schema.Array(ModeContributionSchema))
})
export type Contributions = typeof ContributionsSchema.Type

export const PluginManifestSchema = Schema.Struct({
  id: PluginIdSchema,
  name: Schema.String.check(Schema.isMinLength(1)),
  version: SemverSchema,
  /** Plugin API major the plugin targets; only `1` exists today. */
  apiVersion: Schema.Literal(SUPPORTED_API_VERSION),
  /** ES module entry, relative to the plugin folder. */
  entry: Schema.String.check(Schema.isMinLength(1)),
  capabilities: Schema.Array(CapabilitySchema),
  contributes: Schema.optional(ContributionsSchema),
  /** Ed25519 signature over the archive hash; required for packaged installs. */
  signature: Schema.optional(Schema.String),
  /** Local development plugin: skips signature checks, shows a badge in the UI. */
  dev: Schema.optional(Schema.Boolean)
})
export type PluginManifest = typeof PluginManifestSchema.Type

export const decodeManifest = Schema.decodeUnknownEffect(PluginManifestSchema)
export const encodeManifest = Schema.encodeEffect(PluginManifestSchema)
export const isManifest = Schema.is(PluginManifestSchema)

/**
 * Parses and validates a `plugin.json` payload. Returns the typed manifest or a
 * `SchemaError` with the readable issues, which is what the install endpoint
 * shows the user. A JSON syntax error is turned into the same error channel, so
 * callers only have to handle one failure type.
 */
export const parseManifest = (json: string) =>
  Effect.flatMap(
    Effect.try({
      try: () => JSON.parse(json) as unknown,
      catch: (cause) => cause
    }),
    (value) => Schema.decodeUnknownEffect(PluginManifestSchema)(value)
  )

/** Capabilities a manifest asks for, as a sorted array (for display and diffing). */
export const requestedCapabilities = (manifest: PluginManifest): ReadonlyArray<Capability> =>
  [...manifest.capabilities].sort()

/** A manifest with a stable fingerprint: `{id}@{version}`. */
export const manifestKey = (manifest: PluginManifest): string => `${manifest.id}@${manifest.version}`

/** Whether a manifest may be installed without a signature (spec 09 §4). */
export const isDevPlugin = (manifest: PluginManifest): boolean => manifest.dev === true

/** Whether the manifest carries the signature a packaged install requires. */
export const isSigned = (manifest: PluginManifest): boolean =>
  typeof manifest.signature === "string" && manifest.signature.length > 0
