/**
 * The inputs of the catalogue's library, parts, memory, research, version-control and delegation actions, declared once in
 * Effect. The AI package derives the model-visible nikcli schema from these (`nikcliWireSchema`) and decodes every call with
 * them before an implementation runs; nothing restates them in zod. CAM inputs live in `ai-cam.ts`, inspection inputs in
 * `ai-inspection.ts`.
 *
 * The derived schema is the encoded side: a field that trims, defaults or reads `"true"` as a flag shows the model what it
 * may send, and the decode applies the rest.
 */
import { Effect, Schema, SchemaTransformation } from "effect"
import { EmptyActionInput as empty } from "./ai-cam.ts"

const id = Schema.String.check(Schema.isMinLength(1))

/** Text the model writes: trimmed before it is checked, so whitespace alone never passes as a value. */
const trimmed = (max: number) =>
  Schema.String.check(Schema.isMaxLength(max)).pipe(
    Schema.decodeTo(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(max)), SchemaTransformation.trim())
  )

/** A field the model may omit; `value` is used then. A present value, `0` and `""` included, is never replaced. */
const withDefault = <S extends Schema.Top>(schema: S, value: S["Encoded"]) =>
  Schema.withDecodingDefaultKey<S>(Effect.succeed(value))(schema)

/** A flag some models send as text: `"true"` and `"false"` are read as the booleans they name, nothing else is. */
const flag = Schema.Union([
  Schema.Boolean,
  Schema.Literals(["true", "false"]).pipe(
    Schema.decodeTo(Schema.Boolean, SchemaTransformation.transform({ decode: (text) => text === "true", encode: (value) => value ? "true" : "false" }))
  )
])

/** A destructive action's admission of intent; the host still asks the user (`confirm` alone is never approval). */
const confirm = Schema.Literal(true)

const positive = Schema.Finite.check(Schema.isGreaterThan(0))
const positiveInt = Schema.Int.check(Schema.isGreaterThan(0))
const point3 = Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite })
const property = Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Finite, Schema.Boolean]))

// ---------------------------------------------------------------- `library`, `parts`, `library_edit`

const query = Schema.Struct({ query: Schema.String })
const optionalQuery = Schema.Struct({ query: withDefault(Schema.String, "") })

export const PartsTransform = Schema.Struct({
  move: Schema.optionalKey(point3),
  rotate: Schema.optionalKey(Schema.Struct({ axis: Schema.Literals(["x", "y", "z"]), degrees: Schema.Finite, about: Schema.optionalKey(point3) })),
  scale: Schema.optionalKey(Schema.Struct({ factor: Schema.Finite, about: Schema.optionalKey(point3) }))
})

export const LibraryMaterialInput = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  name: id,
  description: Schema.optionalKey(Schema.String),
  properties: withDefault(property, {}),
  isPublic: withDefault(Schema.Boolean, false)
})

export const LibraryToolInput = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  name: id,
  type: Schema.String,
  diameter: positive,
  material: Schema.String,
  numberOfFlutes: Schema.optionalKey(positiveInt),
  maxRPM: Schema.optionalKey(positiveInt),
  coolantType: Schema.optionalKey(Schema.String),
  cuttingLength: Schema.optionalKey(positive),
  totalLength: Schema.optionalKey(positive),
  shankDiameter: Schema.optionalKey(positive),
  notes: Schema.optionalKey(Schema.String),
  isPublic: withDefault(Schema.Boolean, false)
})

export const LibraryMachineConfigInput = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  name: id,
  kind: Schema.Literals(["mill", "lathe", "3Dprinter"]),
  kinematics: withDefault(Schema.Record(Schema.String, Schema.Struct({ min: Schema.Finite, max: Schema.Finite })), {}),
  postProcessor: Schema.String,
  workOffsets: withDefault(Schema.Array(Schema.String), ["G54", "G55", "G56", "G57", "G58", "G59"]),
  probing: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
  maxRPM: Schema.optionalKey(positiveInt),
  maxFeed: Schema.optionalKey(positive),
  isPublic: withDefault(Schema.Boolean, false)
})

export const LIBRARY_ACTION_INPUTS = {
  "library.component_list": empty,
  "library.lookup_component": optionalQuery,
  "library.lookup_material": query,
  "library.lookup_tool": query,
  "library.lookup_machine_config": optionalQuery,
  "parts.save": Schema.Struct({ ids: Schema.Array(id).check(Schema.isMinLength(1)), name: id }),
  "parts.insert": Schema.Struct({ componentId: id, transform: Schema.optionalKey(PartsTransform) }),
  "parts.delete": Schema.Struct({ componentId: id, confirm }),
  "library_edit.upsert_material": LibraryMaterialInput,
  "library_edit.upsert_tool": LibraryToolInput,
  "library_edit.upsert_machine_config": LibraryMachineConfigInput,
  "library_edit.set_default": Schema.Struct({
    materialId: Schema.optionalKey(Schema.String), toolId: Schema.optionalKey(Schema.String), machineConfigId: Schema.optionalKey(Schema.String)
  }),
  "library_edit.delete": Schema.Struct({ kind: Schema.Literals(["material", "tool", "machine_config"]), id, confirm })
} as const

// ---------------------------------------------------------------- `memory`, `memory_edit`, `research`

export const ResearchSearchInput = Schema.Struct({
  query: trimmed(500),
  numResults: withDefault(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8 })), 5)
})
export type ResearchSearchInput = typeof ResearchSearchInput.Type

export const MEMORY_ACTION_INPUTS = {
  "memory.recall": Schema.Struct({ prefix: Schema.optionalKey(Schema.String) }),
  "memory.context_read": empty,
  "memory_edit.remember": Schema.Struct({
    key: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_.-]{1,80}$/)),
    value: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2000))
  }),
  "memory_edit.context_update": Schema.Struct({ heading: trimmed(80), content: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2_000)) }),
  "research.search": ResearchSearchInput,
  "research.read_attachment": Schema.Struct({
    attachment: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
    offset: withDefault(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)), 0),
    maxChars: withDefault(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20_000 })), 10_000)
  })
} as const

// ---------------------------------------------------------------- `vcs`, `vcs_edit`, `agent`

const taskId = Schema.Struct({ taskId: Schema.String.check(Schema.isUUID()) })

export const VCS_ACTION_INPUTS = {
  "vcs.status": empty,
  "vcs.diff": Schema.Struct({ from: Schema.optionalKey(Schema.String), to: withDefault(Schema.String, "HEAD") }),
  "vcs.list_pull_requests": Schema.Struct({ state: withDefault(Schema.Literals(["open", "merged", "closed"]), "open") }),
  "vcs_edit.start_change": Schema.Struct({ topic: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)) }),
  "vcs_edit.commit": Schema.Struct({ message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)) }),
  "vcs_edit.restore": Schema.Struct({ paths: Schema.Array(id).check(Schema.isMinLength(1), Schema.isMaxLength(200)), from: id, confirm }),
  "vcs_edit.open_pull_request": Schema.Struct({ title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120)), body: withDefault(Schema.String.check(Schema.isMaxLength(4000)), "") }),
  "vcs_edit.run_workflows": Schema.Struct({ trigger: withDefault(Schema.Literals(["manual", "pull-request", "push"]), "manual") }),
  "agent.start": Schema.Struct({
    description: trimmed(200),
    prompt: trimmed(20_000),
    agent: Schema.optionalKey(Schema.String.pipe(Schema.decodeTo(Schema.String, SchemaTransformation.trim()))),
    subagent_type: Schema.optionalKey(Schema.String.pipe(Schema.decodeTo(Schema.String, SchemaTransformation.trim()))),
    background: Schema.optionalKey(flag)
  }),
  "agent.list": empty,
  "agent.read": taskId,
  "agent.cancel": taskId
} as const
