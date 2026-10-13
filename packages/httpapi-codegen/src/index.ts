import { isAbsolute, join } from "node:path"
import { Context, Effect, FileSystem, PlatformError, Schema, SchemaAST, SchemaRepresentation } from "effect"
import { HttpMethod, type HttpRouter } from "effect/unstable/http"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { format } from "prettier"

/** Runtime fields codegen reads. RC `Top` rejects unused `never` params; `Constraint` drops method/path. */
type HttpApiEndpointRuntime = {
  readonly identifier: string
  readonly path: string
  readonly method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS" | "TRACE"
  readonly params: Schema.Top | undefined
  readonly query: Schema.Top | undefined
  readonly headers: Schema.Top | undefined
  readonly payload: HttpApiEndpoint.PayloadMap
  readonly success: ReadonlySet<Schema.Top>
  readonly error: ReadonlySet<Schema.Top>
  readonly annotations: Context.Context<never>
}

export type InputField = {
  readonly name: string
  readonly source: "params" | "query" | "headers" | "payload"
}

export type OperationInputField = {
  readonly name: string
  readonly source: InputField["source"] | "wildcard"
}

export type Operation = {
  readonly group: string
  readonly name: string
  readonly input: ReadonlyArray<OperationInputField>
  readonly inputMode: "none" | "optional" | "required"
  readonly success: "value" | "void" | "stream"
  readonly errors: ReadonlyArray<string>
}

export type Output = {
  readonly operations: ReadonlyArray<Operation>
  readonly files: ReadonlyArray<{
    readonly path: string
    readonly content: string
  }>
}

export type Contract = {
  readonly groups: ReadonlyArray<Group>
}

/**
 * Static Effect client-error module. Lives outside generated group/client
 * construction so the SSE/transport predicate is never interpolated or
 * `.replace()`-renamed into caller source (CodeQL js/bad-code-sanitization).
 */
const EFFECT_CLIENT_ERROR = `import { Schema } from "effect"
import { Sse } from "effect/unstable/encoding"
import { HttpClientError } from "effect/unstable/http"

export class ClientError extends Schema.TaggedError<ClientError>()("ClientError", {
  cause: Schema.Defect(),
}) {}

export const mapTransportError = (error: unknown) =>
  HttpClientError.isHttpClientError(error) ||
  Schema.isSchemaError(error) ||
  Sse.Retry.is(error) ||
  error instanceof Sse.SseError
    ? new ClientError({ cause: error })
    : error

export const mapClientError = mapTransportError
`

export type PromiseCompatAdapter = "result" | "result0" | "resultAt" | "stream" | "stream0"

export type PromiseCompatMap = Readonly<Record<string, readonly [adapter: PromiseCompatAdapter, endpoint: string]>>

export class GenerationError extends Schema.TaggedError<GenerationError>()("GenerationError", {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason
  }
}

export type Endpoint = {
  readonly group: string
  readonly sourceGroup: string
  readonly topLevel: boolean
  readonly endpoint: HttpApiEndpointRuntime
  readonly params: Schema.Top | undefined
  readonly query: Schema.Top | undefined
  readonly headers: Schema.Top | undefined
  readonly payloads: ReadonlyArray<Schema.Top>
  readonly optionalPayload: boolean
  readonly operation: Operation
  readonly clientPath: readonly [string, ...Array<string>]
  readonly input: ReadonlyArray<InputField & { readonly optional: boolean; readonly whole: boolean }>
  readonly unwrapData: boolean
  readonly errors: ReadonlyArray<{
    readonly status: number
    readonly schema: Schema.Top
    readonly headers?: Schema.Top
  }>
  readonly successes: ReadonlyArray<Schema.Top>
  readonly successHeaders?: Schema.Top
  readonly effectPortable: boolean
}

export type Group = {
  readonly identifier: string
  readonly sourceIdentifier: string
  readonly module: string
  readonly endpoints: ReadonlyArray<Endpoint>
}

type Slot = {
  readonly name: string
  readonly schema: Schema.Top
}

type PromiseInputField =
  | (InputField & { readonly optional: boolean; readonly whole: boolean })
  | {
      readonly name: string
      readonly source: "wildcard"
      readonly optional: false
      readonly whole: false
    }

const resolveHttpApiStatus = SchemaAST.resolveAt<number>("httpApiStatus")
const resolveHttpApiEncoding = SchemaAST.resolveAt<HttpApiSchema.Encoding>("~httpApiEncoding")
const resolveContentSchema = SchemaAST.resolveAt<SchemaAST.AST>("contentSchema")
const Manifest = Schema.fromJsonString(Schema.Array(Schema.String))
const manifestName = ".httpapi-codegen.json"

export function compile<Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
  options?: {
    readonly groupNames?: Readonly<Record<string, string>>
    readonly omitEndpoints?: ReadonlySet<string>
    /**
     * Derive client method paths from `group.endpointName` instead of the
     * `OpenApi.Identifier` annotation. Use when identifiers are pinned to an
     * external OpenAPI contract whose dotted ids collide as client paths
     * (e.g. both `provider.auth` and `provider.auth.remove` exist).
     */
    readonly clientPathsFromEndpointNames?: boolean
    /**
     * Keys of `requiredForClient` middleware whose effect the consumer supplies itself: the
     * Promise client through `ClientOptions.headers` (e.g. a bearer token), the Effect clients
     * through `HttpApiMiddleware.layerClient`. Any other required middleware still fails.
     */
    readonly clientMiddleware?: ReadonlySet<string>
  },
): Contract {
  const endpoints: Array<Endpoint> = []
  const endpointIdentities = new Set<string>()
  const portable = new Map<SchemaAST.AST, boolean>()

  HttpApi.reflect(api, {
    onGroup() {},
    onEndpoint({ endpoint: reflected, errors, group, middleware }) {
      const endpoint = reflected as HttpApiEndpointRuntime
      if (options?.omitEndpoints?.has(`${group.identifier}.${endpoint.identifier}`)) return
      const endpointIdentity = `${group.identifier}.${endpoint.identifier}`
      if (endpointIdentities.has(endpointIdentity)) {
        throw new GenerationError({
          reason: `Duplicate endpoint identity: ${endpointIdentity}`,
        })
      }
      endpointIdentities.add(endpointIdentity)
      const groupName = options?.groupNames?.[group.identifier] ?? group.identifier
      const name = `${groupName}.${endpoint.identifier}`
      const required = Array.from(middleware).find(
        (item) => item.requiredForClient && !options?.clientMiddleware?.has(item.key),
      )
      if (required !== undefined) {
        throw new GenerationError({
          reason: `Client middleware requires adapter: ${required.key}`,
        })
      }

      const successSchemas = Array.from(endpoint.success)
      if (successSchemas.length === 0) successSchemas.push(HttpApiSchema.NoContent)
      if (successSchemas.length > 1)
        throw new GenerationError({
          reason: `Multiple success schemas: ${name}`,
        })

      const params = normalizeTransport(endpoint.params, "params", endpoint, name)
      const query = normalizeTransport(endpoint.query, "query", endpoint, name)
      const headers = normalizeTransport(endpoint.headers, "headers", endpoint, name)
      const payloadSchemas = Array.from(endpoint.payload.values()).flatMap(({ schemas }) => schemas)
      const optionalPayload = payloadSchemas.some((schema) => HttpApiSchema.isNoContent(schema.ast))
      const sourcePayloads = payloadSchemas.filter((schema) => !HttpApiSchema.isNoContent(schema.ast))
      if (sourcePayloads.length > 1) {
        throw new GenerationError({
          reason: `Multiple payload schemas: ${name}`,
        })
      }
      const payloads = sourcePayloads.map((schema) => normalizeTransport(schema, "payload", endpoint, name)!)
      const successHeaders = responseHeaderSchema(successSchemas[0])
      const success = normalizeTransport(successSchemas[0], "success", endpoint, name)!
      const errorSchemas = Array.from(errors).flatMap(([status, schemas]) =>
        schemas.map((schema) => ({
          status,
          headers: responseHeaderSchema(schema),
          ...normalizeTransport(schema, "error", endpoint, name)!,
        })),
      )
      const inputs = [
        ...inputFields(params?.schema, "params", name),
        ...inputFields(query?.schema, "query", name),
        ...inputFields(headers?.schema, "headers", name),
        ...payloads.flatMap((item) => inputFields(item.schema, "payload", name)),
      ]
      const names = new Set<string>()
      for (const field of inputs) {
        if (names.has(field.name))
          throw new GenerationError({
            reason: `Input field collision: ${field.name} (${name})`,
          })
        names.add(field.name)
      }

      const schemaPaths: Array<readonly [string, Schema.Top]> = [
        ...(params === undefined ? [] : [[`${name}.params`, params.schema] as const]),
        ...(query === undefined ? [] : [[`${name}.query`, query.schema] as const]),
        ...(headers === undefined ? [] : [[`${name}.headers`, headers.schema] as const]),
        ...payloads.map((item) => [`${name}.payload`, item.schema] as const),
        ...responseSchemas(success.schema, `${name}.success`),
        ...errorSchemas.map((item) => [`${name}.error.${item.status}`, item.schema] as const),
      ]
      const effectPortable =
        [params, query, headers, ...payloads, success, ...errorSchemas].every(
          (item) => item?.effectPortable !== false,
        ) && streamEffectPortable(success.schema)
      if (effectPortable) {
        for (const [path, schema] of schemaPaths) assertPortable(schema, path, portable)
      }

      const clientPath = clientEndpointPath(
        group.identifier,
        options?.clientPathsFromEndpointNames
          ? group.topLevel
            ? endpoint.identifier
            : `${group.identifier}.${endpoint.identifier}`
          : Context.getOrElse(endpoint.annotations, OpenApi.Identifier, () =>
              group.topLevel ? endpoint.identifier : `${group.identifier}.${endpoint.identifier}`,
            ),
      )
      endpoints.push({
        group: groupName,
        sourceGroup: group.identifier,
        topLevel: group.topLevel,
        endpoint,
        params: params?.schema,
        query: query?.schema,
        headers: headers?.schema,
        payloads: payloads.map((item) => item.schema),
        optionalPayload,
        input: inputs,
        clientPath,
        unwrapData: isDataEnvelope(success.schema) && successHeaders === undefined,
        successes: [success.schema],
        successHeaders,
        errors: errorSchemas.map((item) => ({
          status: item.status,
          schema: item.schema,
          headers: item.headers,
        })),
        effectPortable,
        operation: {
          group: groupName,
          name: clientPath.join("."),
          input: inputs.map(({ name, source }) => ({ name, source })),
          inputMode: inputs.length === 0 ? "none" : inputs.every((field) => field.optional) ? "optional" : "required",
          success: isStreamSchema(success.schema)
            ? "stream"
            : HttpApiSchema.isNoContent(success.schema.ast)
              ? "void"
              : "value",
          errors: [
            ...new Set([
              ...errorSchemas.flatMap((item) => {
                const identifier = SchemaAST.resolveIdentifier(item.schema.ast)
                return identifier === undefined ? [] : [identifier]
              }),
              "ClientError",
            ]),
          ],
        },
      })
    },
  })

  const modules = new Set(["client", "client-error", "index"])
  const groups = Array.from(
    Map.groupBy(endpoints, (endpoint) => endpoint.group),
    ([identifier, endpoints], index) => {
      if (new Set(endpoints.map((endpoint) => endpoint.sourceGroup)).size > 1) {
        throw new GenerationError({
          reason: `Client group name collision: ${identifier}`,
        })
      }
      const base = /^[A-Za-z0-9_-]+$/.test(identifier) ? identifier : `group-${index}`
      const module = uniqueModule(base, index, modules)
      modules.add(module.toLowerCase())
      return {
        identifier,
        sourceIdentifier: endpoints[0].sourceGroup,
        module,
        endpoints,
      }
    },
  )
  const publicNames = new Set<string>()
  const groupTypeNames = new Set<string>()
  const endpointTypeNames = new Set<string>()
  const operationKeys = new Set<string>()
  for (const group of groups) {
    if (group.identifier === "__proto__") {
      throw new GenerationError({
        reason: "Client group name cannot be __proto__",
      })
    }
    const groupTypeName = identifierPart(group.identifier)
    if (groupTypeNames.has(groupTypeName)) {
      throw new GenerationError({
        reason: `Client group type collision: ${groupTypeName}`,
      })
    }
    groupTypeNames.add(groupTypeName)
    assertUniqueClientPaths(
      group.endpoints.map((endpoint) => endpoint.clientPath),
      (path) => `Client endpoint name collision: ${group.identifier}.${path.join(".")}`,
    )
    const typeNames = new Set<string>()
    for (const endpoint of group.endpoints) {
      const operationKey = clientOperationKey(group, endpoint)
      if (operationKeys.has(operationKey)) {
        throw new GenerationError({
          reason: `Client operation key collision: ${operationKey}`,
        })
      }
      operationKeys.add(operationKey)
      const name = endpoint.clientPath.map(identifierPart).join("")
      const endpointTypeName = `${groupTypeName}${name}`
      if (endpointTypeNames.has(endpointTypeName)) {
        throw new GenerationError({
          reason: `Client endpoint type collision: ${endpointTypeName}`,
        })
      }
      endpointTypeNames.add(endpointTypeName)
      if (typeNames.has(name)) {
        throw new GenerationError({
          reason: `Client endpoint type collision: ${group.identifier}.${name}`,
        })
      }
      typeNames.add(name)
    }
    const paths = group.endpoints[0]?.topLevel
      ? [...new Set(group.endpoints.map((item) => item.clientPath[0]))].map((name) => [name])
      : [[group.identifier]]
    for (const path of paths) {
      const key = path.join("\0")
      for (const existing of publicNames) {
        if (existing === key || existing.startsWith(`${key}\0`) || key.startsWith(`${existing}\0`)) {
          throw new GenerationError({
            reason: `Client name collision: ${path.join(".")}`,
          })
        }
      }
      publicNames.add(key)
    }
  }
  return {
    groups,
  }
}

export function emitEffect(contract: Contract): Output {
  const endpoint = contract.groups.flatMap((group) => group.endpoints).find((endpoint) => !endpoint.effectPortable)
  if (endpoint !== undefined) {
    throw new GenerationError({
      reason: `Effect schema requires authoritative import: ${endpoint.group}.${endpoint.endpoint.identifier}`,
    })
  }
  return {
    operations: operations(contract.groups),
    files: renderEffectFiles(contract.groups),
  }
}

export function emitEffectImported(
  contract: Contract,
  options:
    | { readonly module: string; readonly api: string }
    | { readonly module: string; readonly group: string }
    | {
        readonly module: string
        readonly endpoints: Readonly<Record<string, string>>
      },
): Output {
  return {
    operations: operations(contract.groups),
    files: renderImportedEffectFiles(contract.groups, options),
  }
}

export function emitEffectShape(
  contract: Contract,
  options: { readonly module: string; readonly api: string },
): Output {
  return {
    operations: operations(contract.groups),
    files: [{ path: "api.ts", content: renderEffectShape(contract.groups, options) }],
  }
}

export function emitPromise(
  contract: Contract,
  options?: {
    readonly outputTypes?: Readonly<Record<string, { readonly name: string; readonly import: string }>>
    readonly mutableOutputs?: boolean
    readonly relativeImportExtension?: ".js"
  },
): Output {
  const groups = contract.groups
  for (const group of groups) {
    for (const endpoint of group.endpoints) assertPromiseEndpoint(endpoint)
  }
  return {
    operations: promiseOperations(groups),
    files: [
      {
        path: "types.ts",
        content: renderPromiseTypes(groups, options?.outputTypes, options?.mutableOutputs ?? false),
      },
      {
        path: "client-error.ts",
        content: `export type ClientErrorReason = \"Transport\" | \"UnexpectedStatus\" | \"UnsupportedContentType\" | \"MalformedResponse\" | \"SseEventTooLarge\"\n\nexport class ClientError extends Error {\n  override readonly name = \"ClientError\"\n  constructor(readonly reason: ClientErrorReason, options?: ErrorOptions) {\n    // The reason alone is not a diagnosis: a caller that only prints error.message\n    // (core.setFailed in the GitHub action, and most log sinks) reported a bare\n    // \"Transport\" for connection refused, connection reset, DNS failure and abort\n    // alike. Fold the cause in so the message names what actually went wrong.\n    const cause = options?.cause\n    const detail = cause instanceof Error ? cause.message : typeof cause === \"string\" ? cause : undefined\n    super(detail ? reason + \": \" + detail : reason, options)\n  }\n}\n`,
      },
      {
        path: "client.ts",
        content: normalizePromiseClientContent(renderPromiseClient(groups), groups)
          .replace('from "./types"', `from "./types${options?.relativeImportExtension ?? ""}"`)
          .replace('from "./client-error"', `from "./client-error${options?.relativeImportExtension ?? ""}"`),
      },
      {
        path: "index.ts",
        content: `export { ClientError, type ClientErrorReason } from "./client-error${options?.relativeImportExtension ?? ""}"\nexport * as CadCam from "./client${options?.relativeImportExtension ?? ""}"\nexport * from "./types${options?.relativeImportExtension ?? ""}"\n`,
      },
    ],
  }
}

export function emitPromiseCompat(
  contract: Contract,
  mapping: PromiseCompatMap,
  options: {
    readonly typesModule: string
    readonly relativeImportExtension?: ".js"
    readonly fileName?: string
  },
): Output {
  const available = new Map<string, { readonly group: Group; readonly endpoint: Endpoint }>()
  for (const group of contract.groups) {
    for (const endpoint of group.endpoints) {
      assertPromiseEndpoint(endpoint)
      const name = `${group.identifier}.${endpoint.endpoint.identifier}`
      if (available.has(name)) {
        throw new GenerationError({
          reason: `Duplicate Promise compatibility source endpoint: ${name}`,
        })
      }
      available.set(name, {
        group,
        endpoint,
      })
    }
  }

  const used = new Set<string>()
  const entries = Object.entries(mapping).map(([consumerPath, [adapter, endpointName]]) => {
    const path = consumerPath.split(".")
    if (path.some((part) => part.length === 0 || part === "__proto__")) {
      throw new GenerationError({
        reason: `Invalid Promise compatibility path: ${consumerPath}`,
      })
    }
    const source = available.get(endpointName)
    if (source === undefined) {
      throw new GenerationError({
        reason: `Unknown Promise compatibility endpoint: ${endpointName}`,
      })
    }
    if (used.has(endpointName)) {
      throw new GenerationError({
        reason: `Duplicate Promise compatibility endpoint: ${endpointName}`,
      })
    }
    assertPromiseCompatAdapter(adapter, source.endpoint, endpointName)
    used.add(endpointName)
    return { path, adapter, ...source }
  })

  assertUniqueClientPaths(
    entries.map((entry) => entry.path),
    (path) => `Promise compatibility path collision: ${path.join(".")}`,
  )
  const missing = [...available.keys()].filter((name) => !used.has(name))
  if (missing.length > 0) {
    throw new GenerationError({
      reason: `Missing Promise compatibility endpoint: ${missing.join(", ")}`,
    })
  }

  const adapters = [...new Set(entries.map((entry) => entry.adapter))].sort()
  const body = renderPromiseCompatTree(entries)
  const extension = options.relativeImportExtension ?? ""
  return {
    operations: promiseOperations(contract.groups),
    files: [
      {
        path: options.fileName ?? "compat.ts",
        content: `// Generated by @cadcamfun/httpapi-codegen. Do not edit.
import type { CompatHelpers, Raw } from ${JSON.stringify(`${options.typesModule}${extension}`)}

export const makeCompat = (raw: Raw, helpers: CompatHelpers) => {
  const { ${adapters.join(", ")} } = helpers
  return { ${body} }
}
`,
      },
    ],
  }
}

function assertPromiseCompatAdapter(adapter: PromiseCompatAdapter, endpoint: Endpoint, name: string) {
  const input = promiseInputMode(endpoint)
  const stream = endpoint.operation.success === "stream"
  const ownsSelector = promiseInput(endpoint).some((field) => field.name === "directory" || field.name === "workspace")
  const expected: PromiseCompatAdapter | undefined = stream
    ? input === "none"
      ? "stream0"
      : ownsSelector
        ? undefined
        : "stream"
    : input === "none"
      ? "result0"
      : ownsSelector
        ? "resultAt"
        : "result"
  if (adapter !== expected) {
    throw new GenerationError({
      reason: `Invalid Promise compatibility adapter ${adapter}: ${name}`,
    })
  }
}

function renderPromiseCompatTree(
  entries: ReadonlyArray<{
    readonly path: ReadonlyArray<string>
    readonly adapter: PromiseCompatAdapter
    readonly group: Group
    readonly endpoint: Endpoint
  }>,
) {
  type Node = {
    entry?: (typeof entries)[number]
    readonly children: Map<string, Node>
  }
  const root: Node = { children: new Map() }
  for (const entry of entries) {
    const node = entry.path.reduce((parent, name) => {
      const child: Node = parent.children.get(name) ?? { children: new Map() }
      parent.children.set(name, child)
      return child
    }, root)
    node.entry = entry
  }
  const raw = (entry: (typeof entries)[number]) => {
    const prefix = entry.endpoint.topLevel ? "raw" : `raw[${JSON.stringify(entry.group.identifier)}]`
    return `${prefix}${entry.endpoint.clientPath.map((part) => `[${JSON.stringify(part)}]`).join("")}`
  }
  const render = (node: Node): string =>
    Array.from(node.children, ([name, child]) => {
      const value = child.entry === undefined ? `{ ${render(child)} }` : `${child.entry.adapter}(${raw(child.entry)})`
      return `${JSON.stringify(name)}: ${value}`
    }).join(", ")
  return render(root)
}

function renderEffectShape(groups: ReadonlyArray<Group>, options: { readonly module: string; readonly api: string }) {
  const endpointTypes = groups.map((group, groupIndex) => {
    const rawGroup = group.endpoints[0]?.topLevel ? "RawClient" : `RawClient[${JSON.stringify(group.sourceIdentifier)}]`
    const endpoints = group.endpoints.map((endpoint, endpointIndex) => {
      const prefix = `Endpoint${groupIndex}_${endpointIndex}`
      const request =
        endpoint.operation.inputMode === "none"
          ? ""
          : `type ${prefix}Request = Parameters<${rawGroup}[${JSON.stringify(endpoint.endpoint.identifier)}]>[0]`
      const input = endpoint.input
        .map(
          (field) =>
            `readonly ${JSON.stringify(field.name)}${field.optional ? "?" : ""}: ${effectInputSource(prefix, field, endpoint.optionalPayload)}${field.whole ? "" : `[${JSON.stringify(field.name)}]`}`,
        )
        .join("; ")
      const inputType = endpoint.operation.inputMode === "none" ? "" : `export type ${prefix}Input = { ${input} }`
      const rawOutput = `EffectValue<ReturnType<${rawGroup}[${JSON.stringify(endpoint.endpoint.identifier)}]>>`
      const outputType = isStreamSchema(endpoint.successes[0])
        ? `export type ${prefix}Output = StreamValue<${rawOutput}>`
        : `export type ${prefix}Output = ${endpoint.unwrapData ? `(${rawOutput})["data"]` : rawOutput}`
      return [
        request,
        endpoint.operation.inputMode === "none" ? "" : inputType,
        outputType,
        `export type ${groupShapeTypeName(group, endpoint)}<E = never> = (${endpoint.operation.inputMode === "none" ? "" : `input${endpoint.operation.inputMode === "optional" ? "?" : ""}: ${prefix}Input`}) => ${endpoint.operation.success === "stream" ? `Stream.Stream<${prefix}Output, E>` : `Effect.Effect<${prefix}Output, E>`}`,
      ]
        .filter(Boolean)
        .join("\n")
    })
    const methods = renderClientTree(
      group.endpoints,
      (endpoint) => `${groupShapeTypeName(group, endpoint)}<E>`,
      (name, value) => `readonly ${JSON.stringify(name)}: ${value}`,
      "\n",
    )
    return `${endpoints.join("\n\n")}\n\nexport interface ${groupShapeName(group)}<E = never> {\n${methods}\n}`
  })
  const clientFields = groups.flatMap((group) =>
    group.endpoints[0]?.topLevel
      ? [
          renderClientTree(
            group.endpoints,
            (endpoint) => `${groupShapeTypeName(group, endpoint)}<E>`,
            (name, value) => `readonly ${JSON.stringify(name)}: ${value}`,
            "\n",
          ),
        ]
      : [`readonly ${JSON.stringify(group.identifier)}: ${groupShapeName(group)}<E>`],
  )
  return `// Generated by @cadcamfun/httpapi-codegen. Do not edit.
import type { Effect, Stream } from "effect"
import type { HttpApiClient } from "effect/unstable/httpapi"
import type { ${options.api} } from ${JSON.stringify(options.module)}

type RawClient = HttpApiClient.ForApi<typeof ${options.api}>
type EffectValue<A> = A extends Effect.Effect<infer Success, any, any> ? Success : never
type StreamValue<A> = A extends Stream.Stream<infer Success, any, any> ? Success : never

${endpointTypes.join("\n\n")}

export interface AppApi<E = never> {
${clientFields.join("\n")}
}
`
}

function groupShapeName(group: Group) {
  return `${identifierPart(group.identifier)}Api`
}

function groupShapeTypeName(group: Group, endpoint: Endpoint) {
  return `${identifierPart(group.identifier)}${endpoint.clientPath.map(identifierPart).join("")}Operation`
}

function effectInputSource(prefix: string, field: InputField, optionalPayload: boolean) {
  const source = `${prefix}Request[${JSON.stringify(field.source)}]`
  return optionalPayload && field.source === "payload" ? `Extract<${source}, object>` : source
}

function assertPromiseEndpoint(endpoint: Endpoint) {
  const name = `${endpoint.group}.${endpoint.endpoint.identifier}`
  const payload = endpoint.payloads[0]
  const payloadEncoding = payload === undefined ? undefined : resolveHttpApiEncoding(payload.ast)
  if (
    payload !== undefined &&
    (payloadEncoding?._tag ?? (HttpMethod.hasBody(endpoint.endpoint.method) ? "Json" : "FormUrlEncoded")) !== "Json"
  ) {
    throw new GenerationError({
      reason: `Unsupported Promise payload encoding: ${name}`,
    })
  }
  const success = endpoint.successes[0]
  if (isStreamSchema(success)) {
    if (
      success._tag !== "StreamSse" ||
      success.sseMode !== "data" ||
      !SchemaAST.isNever(Schema.toType(success.error).ast)
    ) {
      throw new GenerationError({
        reason: `Unsupported Promise stream: ${name}`,
      })
    }
  } else if (!HttpApiSchema.isNoContent(success.ast)) {
    const encoding = resolveHttpApiEncoding(success.ast)?._tag ?? "Json"
    if (encoding !== "Json" && encoding !== "Uint8Array" && encoding !== "Text") {
      throw new GenerationError({
        reason: `Unsupported Promise success encoding: ${name}`,
      })
    }
  }
  for (const error of endpoint.errors) {
    if (HttpApiSchema.isNoContent(error.schema.ast)) continue
    if ((resolveHttpApiEncoding(error.schema.ast)?._tag ?? "Json") !== "Json") {
      throw new GenerationError({
        reason: `Unsupported Promise error encoding: ${name}`,
      })
    }
  }
}

function operations(groups: ReadonlyArray<Group>) {
  return groups.flatMap((group) => group.endpoints.map((endpoint) => endpoint.operation))
}

function promiseOperations(groups: ReadonlyArray<Group>) {
  return groups.flatMap((group) =>
    group.endpoints.map((endpoint) => ({
      ...endpoint.operation,
      input: promiseInput(endpoint).map(({ name, source }) => ({
        name,
        source,
      })),
      inputMode: promiseInputMode(endpoint),
    })),
  )
}

function renderEffectFiles(groups: ReadonlyArray<Group>): Output["files"] {
  return [
    ...groups.map((group, index) => ({
      path: `${group.module}.ts`,
      content: renderGroup(group, index),
    })),
    { path: "client-error.ts", content: EFFECT_CLIENT_ERROR },
    { path: "client.ts", content: renderClient(groups) },
    {
      path: "index.ts",
      content: 'export { ClientError } from "./client-error"\nexport * as CadCam from "./client"\n',
    },
  ]
}

function renderImportedEffectFiles(
  groups: ReadonlyArray<Group>,
  options:
    | { readonly module: string; readonly api: string }
    | { readonly module: string; readonly group: string }
    | {
        readonly module: string
        readonly endpoints: Readonly<Record<string, string>>
      },
): Output["files"] {
  const adapters = groups.map((group, groupIndex) => {
    const rawGroup = group.endpoints[0]?.topLevel ? "RawClient" : `RawClient[${JSON.stringify(group.sourceIdentifier)}]`
    const methods = group.endpoints.map((item, endpointIndex) => {
      const prefix = `Endpoint${groupIndex}_${endpointIndex}`
      const request = (["params", "query", "headers", "payload"] as const)
        .flatMap((source) => {
          const fields = item.input.filter((field) => field.source === source)
          if (fields.length === 0) return []
          if (fields[0]?.whole) {
            return [
              `${source}: input${item.operation.inputMode === "optional" ? "?." : ""}[${JSON.stringify(fields[0].name)}]`,
            ]
          }
          return [
            `${source}: { ${fields.map((field) => `${JSON.stringify(field.name)}: input${item.operation.inputMode === "optional" ? "?." : ""}[${JSON.stringify(field.name)}]`).join(", ")} }`,
          ]
        })
        .join(", ")
      const input = item.input
        .map(
          (field) =>
            `readonly ${JSON.stringify(field.name)}${field.optional ? "?" : ""}: ${effectInputSource(prefix, field, item.optionalPayload)}${field.whole ? "" : `[${JSON.stringify(field.name)}]`}`,
        )
        .join("; ")
      const argument =
        item.operation.inputMode === "none"
          ? ""
          : `input${item.operation.inputMode === "optional" ? "?" : ""}: ${prefix}Input`
      const rawCall = `raw[${JSON.stringify(item.endpoint.identifier)}]({ ${request} })`
      const mapped = `${rawCall}.pipe(Effect.mapError(mapClientError)${item.unwrapData ? ", Effect.map((value) => value.data)" : ""})`
      return `${item.operation.inputMode === "none" ? "" : `type ${prefix}Request = Parameters<${rawGroup}[${JSON.stringify(item.endpoint.identifier)}]>[0]\ntype ${prefix}Input = { ${input} }\n`}const ${prefix} = (raw: ${rawGroup}) => (${argument}) => ${item.operation.success === "stream" ? `Stream.unwrap(${rawCall}.pipe(Effect.mapError(mapClientError), Effect.map((stream) => stream.pipe(Stream.mapError(mapClientError)))))` : mapped}`
    })
    const fields = renderClientTree(
      group.endpoints,
      (_item, endpointIndex) => `Endpoint${groupIndex}_${endpointIndex}(raw)`,
      (name, value) => `${JSON.stringify(name)}: ${value}`,
      ", ",
    )
    return `${methods.join("\n\n")}\n\nconst adaptGroup${groupIndex} = (raw: ${rawGroup}) => ({ ${fields} })`
  })
  const fields = groups.flatMap((group, index) =>
    group.endpoints[0]?.topLevel
      ? [`...adaptGroup${index}(raw)`]
      : [`${JSON.stringify(group.identifier)}: adaptGroup${index}(raw[${JSON.stringify(group.sourceIdentifier)}])`],
  )
  const usesStream = groups.some((group) => group.endpoints.some((item) => item.operation.success === "stream"))
  const imported = "api" in options
  const projection = imported
    ? undefined
    : "group" in options
      ? renderImportedGroup(options.group)
      : renderImportedProjection(groups, options.endpoints)
  const api = imported ? options.api : "Api"
  const imports =
    projection === undefined
      ? `import { ${api} } from ${JSON.stringify(options.module)}`
      : `import { HttpApi, HttpApiClient${"endpoints" in options ? ", HttpApiGroup" : ""} } from "effect/unstable/httpapi"\nimport { ${projection.imports.join(", ")} } from ${JSON.stringify(options.module)}`
  const httpApiImport = projection === undefined ? 'import { HttpApiClient } from "effect/unstable/httpapi"\n' : ""
  const client = `// Generated by @cadcamfun/httpapi-codegen. Do not edit.\nimport { Effect${usesStream ? ", Stream" : ""} } from "effect"\n${httpApiImport}${imports}\nimport { mapClientError } from "./client-error"\n\n${projection?.source ?? ""}type RawClient = HttpApiClient.ForApi<typeof ${api}>\n\n${adapters.join("\n\n")}\n\nconst adaptClient = (raw: RawClient) => ({ ${fields.join(", ")} })\n\nexport const make = (options?: { readonly baseUrl?: URL | string }) => HttpApiClient.make(${api}, options).pipe(Effect.map(adaptClient))\n`
  return [
    {
      path: "client-error.ts",
      content: EFFECT_CLIENT_ERROR,
    },
    { path: "client.ts", content: client },
    {
      path: "index.ts",
      content: 'export { ClientError } from "./client-error"\nexport * as CadCam from "./client"\n',
    },
  ]
}

function renderImportedGroup(group: string) {
  return {
    imports: [group],
    source: `const Api = HttpApi.make("generated").add(${group})\n\n`,
  }
}

function renderImportedProjection(groups: ReadonlyArray<Group>, endpoints: Readonly<Record<string, string>>) {
  const imports = groups.flatMap((group) =>
    group.endpoints.map((endpoint) => {
      const name = endpoints[`${group.identifier}.${endpoint.endpoint.identifier}`]
      if (name === undefined) {
        throw new GenerationError({
          reason: `Missing imported endpoint: ${group.identifier}.${endpoint.endpoint.identifier}`,
        })
      }
      return name
    }),
  )
  const source = `const Api = HttpApi.make("generated").${groups
    .map((group) => {
      const options = group.endpoints[0]?.topLevel ? ", { topLevel: true }" : ""
      return `add(HttpApiGroup.make(${JSON.stringify(group.identifier)}${options})${group.endpoints.map((endpoint) => `.add(${endpoints[`${group.identifier}.${endpoint.endpoint.identifier}`]})`).join("")})`
    })
    .join(".")}\n\n`
  return { imports: [...new Set(imports)], source }
}

function renderPromiseTypes(
  groups: ReadonlyArray<Group>,
  outputTypes?: Readonly<Record<string, { readonly name: string; readonly import: string }>>,
  mutableOutputs = false,
) {
  const types = new Map<SchemaAST.AST, string>()
  const typeOf = (schema: Schema.Top, decoded = false) => {
    const projected = decoded ? Schema.toType(schema) : Schema.toEncoded(schema)
    const cached = types.get(projected.ast)
    if (cached !== undefined) return cached
    const type = structuralType(projected)
    types.set(projected.ast, type)
    return type
  }
  const outputMarkers = new Map<SchemaAST.AST, string>()
  const outputSchemas: Array<Schema.Top> = []
  const outputTypeOf = (schema: Schema.Top) => {
    const projected = Schema.toEncoded(schema)
    const cached = outputMarkers.get(projected.ast)
    if (cached !== undefined) return cached
    const marker = `__PROMISE_TYPE_${outputSchemas.length}__`
    outputSchemas.push(projected)
    outputMarkers.set(projected.ast, marker)
    return marker
  }
  const errors = new Map<
    string,
    {
      readonly schema: Schema.Top
      readonly tagged: ReturnType<typeof declaredErrorFields>
      readonly headers?: Schema.Top
    }
  >()
  for (const group of groups) {
    for (const endpoint of group.endpoints) {
      for (const error of endpoint.errors) {
        const tagged = declaredErrorFields(error.schema)
        const identifier = tagged?.identifier ?? SchemaAST.resolveIdentifier(error.schema.ast)
        if (identifier !== undefined && !errors.has(identifier))
          errors.set(identifier, { schema: error.schema, tagged, headers: error.headers })
      }
    }
  }
  const errorTypes = Array.from(errors, ([identifier, error]) => {
    const headerType = error.headers === undefined ? undefined : typeOf(error.headers)
    if (error.tagged === undefined) {
      const body = HttpApiSchema.isNoContent(error.schema.ast) ? "void" : typeOf(error.schema)
      if (headerType === undefined) return `export type ${identifier} = ${body}`
      if (body === "void") return `export type ${identifier} = { readonly headers: ${headerType} }`
      return `export type ${identifier} = { readonly body: ${body}; readonly headers: ${headerType} }`
    }
    const fields = [
      ...error.tagged.fields.map(
        ([name, schema, optional]) => `readonly ${JSON.stringify(name)}${optional ? "?" : ""}: ${typeOf(schema)}`,
      ),
      ...(headerType === undefined ? [] : [`readonly headers: ${headerType}`]),
    ].join("; ")
    return `export type ${identifier} = { readonly ${JSON.stringify(error.tagged.key)}: ${JSON.stringify(error.tagged.tag)}; ${fields} }\nexport const is${identifier} = (value: unknown): value is ${identifier} => typeof value === "object" && value !== null && ${JSON.stringify(error.tagged.key)} in value && value[${JSON.stringify(error.tagged.key)}] === ${JSON.stringify(error.tagged.tag)}`
  })
  const payloadAliases: Array<string> = []
  const operations = groups
    .flatMap((group) =>
      group.endpoints.flatMap((endpoint) => {
        const prefix = promiseTypePrefix(group.identifier, endpoint.clientPath)
        const schemas = {
          params: endpoint.params,
          query: endpoint.query,
          headers: endpoint.headers,
          payload: endpoint.payloads[0],
        }
        const payloadSchema = endpoint.payloads[0]
        const payloadName =
          payloadSchema !== undefined && endpoint.input.some((field) => field.source === "payload" && !field.whole)
            ? `${prefix}Payload`
            : undefined
        if (payloadName !== undefined && payloadSchema !== undefined) {
          payloadAliases.push(`export type ${payloadName} = ${typeOf(payloadSchema)}`)
        }
        const input = promiseInput(endpoint)
          .map((field) => {
            if (field.source === "wildcard") return `readonly ${JSON.stringify(field.name)}: string`
            const schema = schemas[field.source]
            if (schema === undefined)
              throw new GenerationError({
                reason: `Missing input schema: ${prefix}.${field.name}`,
              })
            if (field.source === "payload" && payloadName !== undefined && !field.whole) {
              return `readonly ${JSON.stringify(field.name)}${field.optional ? "?" : ""}: ${payloadName}[${JSON.stringify(field.name)}]`
            }
            return `readonly ${JSON.stringify(field.name)}${field.optional ? "?" : ""}: ${field.whole ? typeOf(schema, field.source === "query") : `(${typeOf(schema, field.source === "query")})[${JSON.stringify(field.name)}]`}`
          })
          .join("; ")
        const successSchema = endpoint.successes[0]
        const successBody =
          outputTypes?.[clientOperationKey(group, endpoint)]?.name ??
          outputTypeOf(
            isStreamSchema(successSchema) && successSchema._tag === "StreamSse"
              ? successSchema.sseMode === "data"
                ? streamEncodedDataSchema(successSchema)
                : (successSchema.events as Schema.Top)
              : successSchema,
          )
        const successHeaders = endpoint.successHeaders === undefined ? undefined : typeOf(endpoint.successHeaders)
        const success =
          successHeaders === undefined
            ? successBody
            : `{ readonly body: ${endpoint.operation.success === "void" ? "void" : successBody}; readonly headers: ${successHeaders} }`
        return [
          ...(promiseInputMode(endpoint) === "none" ? [] : [`export type ${prefix}Input = { ${input} }`]),
          `export type ${prefix}Output = ${endpoint.unwrapData ? `(${success})["data"]` : success}`,
        ]
      }),
    )
    .join("\n\n")
  const reservedNames = new Set([
    "ClientError",
    "JsonValue",
    ...errors.keys(),
    ...groups.flatMap((group) =>
      group.endpoints.flatMap((endpoint) => {
        const prefix = promiseTypePrefix(group.identifier, endpoint.clientPath)
        return [`${prefix}Input`, `${prefix}Output`, `${prefix}Payload`]
      }),
    ),
    ...Object.values(outputTypes ?? {}).map((output) => output.name),
  ])
  const rendered = structuralTypes(outputSchemas, mutableOutputs, reservedNames)
  const resolve = (source: string) =>
    rendered.types.reduce((result, type, index) => result.replaceAll(`__PROMISE_TYPE_${index}__`, type), source)
  const resolvedErrors = errorTypes.map(resolve)
  const resolvedPayloads = payloadAliases.map(resolve)
  const resolvedOperations = resolve(operations)
  const json = [...rendered.definitions, ...resolvedErrors, ...resolvedPayloads, resolvedOperations].some((type) =>
    type.includes("JsonValue"),
  )
    ? `export type JsonValue = null | boolean | number | string | ${mutableOutputs ? "Array<JsonValue> | { [key: string]: JsonValue }" : "ReadonlyArray<JsonValue> | { readonly [key: string]: JsonValue }"}`
    : ""
  const imports = [...new Set(Object.values(outputTypes ?? {}).map((override) => override.import))]
  return [...imports, json, ...rendered.definitions, ...resolvedErrors, ...resolvedPayloads, resolvedOperations]
    .filter(Boolean)
    .join("\n\n")
}

function mutableType(type: string) {
  return type.replaceAll("ReadonlyArray<", "Array<").replaceAll(/\breadonly\s+/g, "")
}

function renderPromiseClient(groups: ReadonlyArray<Group>) {
  const imports = groups.flatMap((group) =>
    group.endpoints.flatMap((endpoint) => {
      const prefix = promiseTypePrefix(group.identifier, endpoint.clientPath)
      return [...(promiseInputMode(endpoint) === "none" ? [] : [`${prefix}Input`]), `${prefix}Output`]
    }),
  )
  const fields = groups.map((group) => {
    const methods = group.endpoints.map((endpoint) => {
      const prefix = promiseTypePrefix(group.identifier, endpoint.clientPath)
      const inputMode = promiseInputMode(endpoint)
      const argument =
        inputMode === "none"
          ? "requestOptions?: RequestOptions"
          : `input${inputMode === "optional" ? "?" : ""}: ${prefix}Input, requestOptions?: RequestOptions`
      const path = promisePath(endpoint.endpoint.path, endpoint.input, promiseWildcardInput(endpoint))
      const access = (name: string) => `input${inputMode === "optional" ? "?." : ""}[${JSON.stringify(name)}]`
      const part = (source: InputField["source"]) => {
        const inputs = endpoint.input.filter((field) => field.source === source)
        return inputs.length === 0
          ? undefined
          : inputs[0]?.whole
            ? access(inputs[0].name)
            : `{ ${inputs.map((field) => `${JSON.stringify(field.name)}: ${access(field.name)}`).join(", ")} }`
      }
      const parts = [
        endpoint.query === undefined ? undefined : `query: ${part("query")}`,
        endpoint.headers === undefined ? undefined : `headers: ${part("headers")}`,
        endpoint.payloads.length === 0 ? undefined : `body: ${part("payload")}`,
      ].filter((value): value is string => value !== undefined)
      const declaredStatuses = [...new Set(endpoint.errors.map((error) => error.status))]
      const successHeaderNames = responseHeaderNames(endpoint.successHeaders)
      const errorHeaderEntries = endpoint.errors.flatMap((error) => {
        const names = responseHeaderNames(error.headers)
        return names === undefined ? [] : [[String(error.status), names] as const]
      })
      const emptyErrors = [
        ...new Set(
          endpoint.errors.filter((error) => HttpApiSchema.isNoContent(error.schema.ast)).map((error) => error.status),
        ),
      ]
      const descriptor = `{ method: ${JSON.stringify(endpoint.endpoint.method)}, path: ${path}${parts.length === 0 ? "" : `, ${parts.join(", ")}`}, successStatus: ${resolveHttpApiStatus(endpoint.successes[0].ast) ?? 200}, declaredStatuses: [${declaredStatuses.join(", ")}]${successHeaderNames === undefined ? "" : `, responseHeaders: ${JSON.stringify(successHeaderNames)}`}${errorHeaderEntries.length === 0 ? "" : `, errorHeaders: ${JSON.stringify(Object.fromEntries(errorHeaderEntries))}`}${emptyErrors.length === 0 ? "" : `, emptyErrors: ${JSON.stringify(emptyErrors)}`}, empty: ${endpoint.operation.success === "void"}${isBinarySchema(endpoint.successes[0]) ? ", binary: true" : ""}${isTextSchema(endpoint.successes[0]) ? ", text: true" : ""} }`
      if (endpoint.operation.success === "stream") {
        const success = endpoint.successes[0]
        if (!isStreamSchema(success) || success._tag !== "StreamSse" || success.sseMode !== "data") {
          throw new GenerationError({
            reason: `Promise stream emission is not implemented: ${group.identifier}.${endpoint.endpoint.identifier}`,
          })
        }
        return `(${argument}): AsyncIterable<${prefix}Output> => sse<${prefix}Output>(${descriptor}, requestOptions)`
      }
      const unwrap = endpoint.unwrapData ? ".then((value) => value.data)" : ""
      return `(${argument}) => request<${endpoint.unwrapData ? `{ readonly data: ${prefix}Output }` : `${prefix}Output`}>(${descriptor}, requestOptions)${unwrap}`
    })
    const fields = renderClientTree(
      group.endpoints,
      (_endpoint, endpointIndex) => methods[endpointIndex],
      (name, value) => `${JSON.stringify(name)}: ${value}`,
      ", ",
    )
    if (group.endpoints[0]?.topLevel) return fields
    return `${JSON.stringify(group.identifier)}: { ${fields} }`
  })
  return `import type { ${imports.join(", ")} } from "./types"\nimport { ClientError } from "./client-error"\n\nexport interface ClientOptions {\n  readonly baseUrl: string\n  readonly fetch?: typeof globalThis.fetch\n  readonly headers?: RequestInit["headers"]\n}\n\nexport interface RequestOptions {\n  readonly signal?: AbortSignal\n  readonly headers?: RequestInit["headers"]\n}\n\ninterface RequestDescriptor {\n  readonly method: string\n  readonly path: string\n  readonly query?: Record<string, unknown>\n  readonly headers?: Record<string, unknown>\n  readonly body?: unknown\n  readonly successStatus: number\n  readonly declaredStatuses: ReadonlyArray<number>\n  readonly responseHeaders?: ReadonlyArray<string>\n  readonly errorHeaders?: { readonly [status: string]: ReadonlyArray<string> }\n  readonly emptyErrors?: ReadonlyArray<number>\n  readonly empty: boolean\n}\n\nconst maxSseEventBytes = 16 * 1024 * 1024\n\nexport function make(options: ClientOptions) {\n  const fetch = options.fetch ?? globalThis.fetch\n\n  const prepare = (descriptor: RequestDescriptor, requestOptions?: RequestOptions) => {\n    const url = new URL(descriptor.path, options.baseUrl)\n    for (const [key, value] of Object.entries(descriptor.query ?? {})) appendQuery(url.searchParams, key, value)\n    const headers = new Headers(options.headers)\n    for (const [key, value] of Object.entries(descriptor.headers ?? {})) {\n      if (value !== undefined && value !== null) headers.set(key, String(value))\n    }\n    for (const [key, value] of new Headers(requestOptions?.headers)) headers.set(key, value)\n    if (descriptor.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json")\n    return {\n      url,\n      init: {\n        method: descriptor.method,\n        signal: requestOptions?.signal,\n        headers,\n        body: descriptor.body === undefined ? undefined : JSON.stringify(descriptor.body),\n      } satisfies RequestInit,\n    }\n  }\n\n  const execute = async (descriptor: RequestDescriptor, requestOptions?: RequestOptions) => {\n    try {\n      const prepared = prepare(descriptor, requestOptions)\n      return await fetch(prepared.url, prepared.init)\n    } catch (cause) {\n      throw new ClientError("Transport", { cause })\n    }\n  }\n\n  const responseError = async (response: Response, descriptor: RequestDescriptor): Promise<never> => {\n    if (descriptor.declaredStatuses.includes(response.status)) {\n      const names = descriptor.errorHeaders?.[String(response.status)]\n      if (descriptor.emptyErrors?.includes(response.status)) {\n        try {\n          await response.body?.cancel()\n        } catch {}\n        throw { headers: readDeclaredHeaders(response, names) ?? {} }\n      }\n      throw await json(response)\n    }\n    try {\n      await response.body?.cancel()\n    } catch {}\n    throw new ClientError("UnexpectedStatus", { cause: { status: response.status } })\n  }\n\n  const request = async <A>(descriptor: RequestDescriptor, requestOptions?: RequestOptions): Promise<A> => {\n    const response = await execute(descriptor, requestOptions)\n    if (response.status !== descriptor.successStatus) return responseError(response, descriptor)\n    if (descriptor.empty) {\n      try {\n        await response.body?.cancel()\n      } catch {}\n      return attachDeclaredHeaders(undefined, response, descriptor.responseHeaders) as A\n    }\n    return attachDeclaredHeaders(await json(response), response, descriptor.responseHeaders) as A\n  }\n\n  const sse = <A>(descriptor: RequestDescriptor, requestOptions?: RequestOptions): AsyncIterable<A> => ({\n    async *[Symbol.asyncIterator]() {\n      const response = await execute(descriptor, requestOptions)\n      if (response.status !== descriptor.successStatus) await responseError(response, descriptor)\n      if (!isContentType(response, "text/event-stream")) {\n        try {\n          await response.body?.cancel()\n        } catch {}\n        throw new ClientError("UnsupportedContentType")\n      }\n      if (response.body === null) throw new ClientError("MalformedResponse")\n      const reader = response.body.getReader()\n      const decoder = new TextDecoder()\n      let buffer = ""\n      try {\n        while (true) {\n          let next: ReadableStreamReadResult<Uint8Array>\n          try {\n            next = await reader.read()\n          } catch (cause) {\n            throw new ClientError("Transport", { cause })\n          }\n          buffer += decoder.decode(next.value, { stream: !next.done })\n          if (buffer.length > maxSseEventBytes) throw new ClientError("SseEventTooLarge")\n          const trailingCarriageReturn = !next.done && buffer.endsWith("\\r")\n          if (trailingCarriageReturn) buffer = buffer.slice(0, -1)\n          buffer = buffer.replaceAll("\\r\\n", "\\n").replaceAll("\\r", "\\n")\n          if (trailingCarriageReturn) buffer += "\\r"\n          if (next.done && buffer !== "") buffer += "\\n\\n"\n          let boundary = buffer.indexOf("\\n\\n")\n          while (boundary >= 0) {\n            const block = buffer.slice(0, boundary)\n            buffer = buffer.slice(boundary + 2)\n            const data = block.split("\\n").flatMap((line) => line.startsWith("data:") ? [line.slice(5).trimStart()] : []).join("\\n")\n            if (data !== "") {\n              try {\n                yield JSON.parse(data) as A\n              } catch (cause) {\n                throw new ClientError("MalformedResponse", { cause })\n              }\n            }\n            boundary = buffer.indexOf("\\n\\n")\n          }\n          if (next.done) return\n        }\n      } finally {\n        try {\n          await reader.cancel()\n        } catch {}\n        reader.releaseLock()\n      }\n    },\n  })\n\n  return { ${fields.join(", ")} }\n}\n\nfunction appendQuery(params: URLSearchParams, key: string, value: unknown): void {\n  if (value === undefined) return\n  if (value === null) {\n    params.append(key, "null")\n    return\n  }\n  if (Array.isArray(value)) {\n    for (const item of value) appendQuery(params, key, item)\n    return\n  }\n  if (typeof value === "object") {\n    for (const [child, item] of Object.entries(value)) appendQuery(params, \`\${key}[\${child}]\`, item)\n    return\n  }\n  params.append(key, String(value))\n}\n\nasync function json(response: Response): Promise<unknown> {\n  if (!isContentType(response, "application/json") && !response.headers.get("content-type")?.includes("+json")) {\n    try {\n      await response.body?.cancel()\n    } catch {}\n    throw new ClientError("UnsupportedContentType")\n  }\n  let text: string\n  try {\n    text = await response.text()\n  } catch (cause) {\n    throw new ClientError("Transport", { cause })\n  }\n  if (text === "") throw new ClientError("MalformedResponse")\n  try {\n    return JSON.parse(text)\n  } catch (cause) {\n    throw new ClientError("MalformedResponse", { cause })\n  }\n}\n\nfunction isContentType(response: Response, expected: string) {\n  return response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() === expected\n}\n\nfunction readDeclaredHeaders(response: Response, names: ReadonlyArray<string> | undefined) {\n  if (names === undefined) return undefined\n  const headers: { [key: string]: string } = {}\n  for (const name of names) {\n    const value = response.headers.get(name)\n    if (value !== null) headers[name] = value\n  }\n  return headers\n}\n\nfunction attachDeclaredHeaders<A>(body: A, response: Response, names: ReadonlyArray<string> | undefined): A {\n  const headers = readDeclaredHeaders(response, names)\n  return headers === undefined ? body : { body, headers } as A\n}\n`
}

function promiseTypePrefix(group: string, path: ReadonlyArray<string>) {
  return `${identifierPart(group)}${path.map(identifierPart).join("")}`
}

function clientOperationKey(group: Group, endpoint: Endpoint) {
  return [group.identifier, ...endpoint.clientPath].join(".")
}

function clientEndpointPath(group: string, name: string) {
  const parts = name.split(".")
  if (parts[0] === "v2") parts.shift()
  const index = parts.lastIndexOf(group.slice(group.lastIndexOf(".") + 1))
  const result = index < 0 ? parts : parts.slice(index + 1)
  if (result.length === 0 || result.some((part) => part.length === 0)) {
    throw new GenerationError({
      reason: "Client endpoint path must contain non-empty names",
    })
  }
  if (result.some((part) => part === "__proto__")) {
    throw new GenerationError({
      reason: "Client endpoint path cannot contain __proto__",
    })
  }
  return result as [string, ...Array<string>]
}

function assertUniqueClientPaths(
  paths: ReadonlyArray<ReadonlyArray<string>>,
  reason: (path: ReadonlyArray<string>) => string,
) {
  const seen = new Set<string>()
  for (const path of paths) {
    const key = path.join("\0")
    for (const existing of seen) {
      if (existing === key || existing.startsWith(`${key}\0`) || key.startsWith(`${existing}\0`)) {
        throw new GenerationError({ reason: reason(path) })
      }
    }
    seen.add(key)
  }
}

function renderClientTree(
  endpoints: ReadonlyArray<Endpoint>,
  leaf: (endpoint: Endpoint, index: number) => string,
  field: (name: string, value: string) => string,
  separator: string,
) {
  type Node = {
    endpoint?: { readonly value: Endpoint; readonly index: number }
    readonly children: Map<string, Node>
  }
  const root: Node = { children: new Map() }
  endpoints.forEach((endpoint, index) => {
    const node = endpoint.clientPath.reduce((parent, name) => {
      const child: Node = parent.children.get(name) ?? { children: new Map() }
      parent.children.set(name, child)
      return child
    }, root)
    node.endpoint = { value: endpoint, index }
  })
  const render = (node: Node): string =>
    Array.from(node.children, ([name, child]) =>
      field(
        name,
        child.endpoint === undefined ? `{ ${render(child)} }` : leaf(child.endpoint.value, child.endpoint.index),
      ),
    ).join(separator)
  return render(root)
}

function identifierPart(value: string) {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("")
}

function structuralTypes(schemas: ReadonlyArray<Schema.Top>, mutable: boolean, reservedNames: ReadonlySet<string>) {
  if (schemas.length === 0) return { types: [], definitions: [] }
  const document = SchemaRepresentation.toCodeDocument(
    SchemaRepresentation.toRepresentations(
      schemas.map((schema) => schema.ast) as [SchemaAST.AST, ...Array<SchemaAST.AST>],
    ),
  )
  if (
    document.artifacts.some(
      (artifact) =>
        artifact._tag !== "Import" || artifact.importDeclaration !== 'import type * as Brand from "effect/Brand"',
    ) ||
    Object.keys(document.references.recursives).length > 0
  ) {
    throw new GenerationError({
      reason: "Referenced Promise types are not implemented",
    })
  }
  const names = new Map<string, string>()
  const usedNames = new Set(reservedNames)
  for (const reference of document.references.nonRecursives) {
    const seed = identifierPart(reference.$ref)
    const name = uniqueTypeName(seed, usedNames)
    names.set(reference.$ref, name)
    usedNames.add(name)
  }
  const render = (type: string) => {
    for (const [reference, name] of names) {
      const pattern = `(?<![A-Za-z0-9_$.'"])${reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_$.'"])`
      type = type.replace(new RegExp(pattern, "g"), name)
    }
    const output = rewritePromiseType(type)
    return mutable ? mutableType(output) : output
  }
  return {
    types: document.codes.map((code) => render(code.Type)),
    definitions: document.references.nonRecursives.map(
      (reference) => `export type ${names.get(reference.$ref)} = ${render(reference.code.Type)}`,
    ),
  }
}

function uniqueTypeName(seed: string, used: ReadonlySet<string>, suffix = 1): string {
  const name = suffix === 1 ? seed : `${seed}${suffix}`
  return used.has(name) ? uniqueTypeName(seed, used, suffix + 1) : name
}

function structuralType(schema: Schema.Top) {
  const document = SchemaRepresentation.toCodeDocument(SchemaRepresentation.toRepresentations([schema.ast]))
  if (
    document.artifacts.some(
      (artifact) =>
        artifact._tag !== "Import" || artifact.importDeclaration !== 'import type * as Brand from "effect/Brand"',
    ) ||
    Object.keys(document.references.recursives).length > 0
  ) {
    throw new GenerationError({
      reason: "Referenced Promise types are not implemented",
    })
  }
  const references = new Map(
    document.references.nonRecursives.map((reference) => [reference.$ref, reference.code.Type]),
  )
  const expand = (type: string, seen = new Set<string>()): string => {
    for (const [reference, value] of references) {
      const pattern = `(?<![A-Za-z0-9_$.'"])${reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_$.'"])`
      if (!new RegExp(pattern).test(type)) continue
      if (seen.has(reference)) {
        throw new GenerationError({
          reason: `Recursive Promise types are not implemented: ${reference}`,
        })
      }
      type = type.replace(new RegExp(pattern, "g"), `(${expand(value, new Set([...seen, reference]))})`)
    }
    return type
  }
  return rewritePromiseType(expand(document.codes[0].Type))
}

/** Brand/Json cleanup. Headline `unknown` stays `unknown`; catchalls stay `any`. */
function rewritePromiseType(type: string) {
  return type
    .replaceAll(/ & Brand\.Brand<"[^"]+">/g, "")
    .replaceAll("Schema.Json", "JsonValue")
    .replaceAll(/(\[x: string\]: )unknown\b/g, "$1any")
}

function normalizePromiseClientContent(content: string, groups: ReadonlyArray<Group>) {
  const endpoints = groups.flatMap((group) => group.endpoints)
  const usesBinary = endpoints.some((endpoint) => isBinarySchema(endpoint.successes[0]))
  const usesText = endpoints.some((endpoint) => isTextSchema(endpoint.successes[0]))
  const usesWildcard = endpoints.some((endpoint) => promiseWildcardInput(endpoint) !== undefined)

  const sseReady = replaceOne(content, "let next: ReadableStreamReadResult<Uint8Array>", "let next")
  const binaryReady = usesBinary
    ? replaceOne(
        replaceOne(sseReady, "readonly empty: boolean\n}", "readonly empty: boolean\n  readonly binary?: true\n}"),
        "if (descriptor.empty) {",
        "if (descriptor.binary) return new Uint8Array(await response.arrayBuffer()) as A\n    if (descriptor.empty) {",
      )
    : sseReady
  const textReady = usesText
    ? replaceOne(
        replaceOne(binaryReady, "readonly empty: boolean\n", "readonly empty: boolean\n  readonly text?: true\n"),
        "if (descriptor.empty) {",
        "if (descriptor.text) return await response.text() as A\n    if (descriptor.empty) {",
      )
    : binaryReady
  return usesWildcard
    ? replaceOne(
        textReady,
        "function appendQuery(params: URLSearchParams, key: string, value: unknown): void {",
        'function encodePath(value: string): string {\n  return value.split("/").map(encodeURIComponent).join("/")\n}\n\nfunction appendQuery(params: URLSearchParams, key: string, value: unknown): void {',
      )
    : textReady
}

function replaceOne(input: string, search: string, replacement: string) {
  if (!input.includes(search))
    throw new GenerationError({
      reason: `Missing Promise client template marker: ${search}`,
    })
  return input.replace(search, replacement)
}

function promiseInput(endpoint: Endpoint): ReadonlyArray<PromiseInputField> {
  const wildcard = promiseWildcardInput(endpoint)
  if (wildcard === undefined) return endpoint.input
  return [...endpoint.input, wildcard]
}

function promiseInputMode(endpoint: Endpoint): Operation["inputMode"] {
  const input = promiseInput(endpoint)
  if (input.length === 0) return "none"
  return input.every((field) => field.optional) ? "optional" : "required"
}

function promiseWildcardInput(endpoint: Endpoint): PromiseInputField | undefined {
  if (!endpoint.endpoint.path.includes("*")) return undefined
  if (endpoint.endpoint.path.indexOf("*") !== endpoint.endpoint.path.lastIndexOf("*")) {
    throw new GenerationError({
      reason: `Unsupported Promise path wildcard: ${endpoint.endpoint.path}`,
    })
  }
  if (!endpoint.endpoint.path.endsWith("*")) {
    throw new GenerationError({
      reason: `Unsupported Promise path wildcard: ${endpoint.endpoint.path}`,
    })
  }
  const name = endpoint.input.some((field) => field.name === "path") ? "wildcard" : "path"
  return { name, source: "wildcard", optional: false, whole: false }
}

function isBinarySchema(schema: Schema.Top) {
  return (resolveHttpApiEncoding(schema.ast)?._tag ?? "Json") === "Uint8Array"
}

function isTextSchema(schema: Schema.Top) {
  return resolveHttpApiEncoding(schema.ast)?._tag === "Text"
}

function promisePath(path: string, input: ReadonlyArray<InputField>, wildcard?: PromiseInputField) {
  const fields = new Set(input.filter((field) => field.source === "params").map((field) => field.name))
  const segments = (wildcard === undefined ? path : path.slice(0, -1))
    .split(/(:[A-Za-z_][A-Za-z0-9_]*)/g)
    .filter(Boolean)
  const template = segments
    .map((segment) => {
      if (!segment.startsWith(":")) return segment.replaceAll("`", "\\`")
      const name = segment.slice(1)
      if (!fields.has(name))
        throw new GenerationError({
          reason: `Missing path parameter: ${name}`,
        })
      return `\${encodeURIComponent(input.${name})}`
    })
    .join("")
  return `\`${template}${wildcard === undefined ? "" : `\${encodePath(input.${wildcard.name})}`}\``
}

function uniqueModule(base: string, index: number, modules: ReadonlySet<string>) {
  if (!modules.has(base.toLowerCase())) return base
  const seed = `${base}-${index}`
  let suffix = 0
  while (modules.has(`${seed}${suffix === 0 ? "" : `-${suffix}`}`.toLowerCase())) suffix++
  return `${seed}${suffix === 0 ? "" : `-${suffix}`}`
}

function unwrapResponseSchema(schema: Schema.Top): Schema.Top {
  return HttpApiSchema.isWithHeaders(schema) ? schema.schema : schema
}

function responseHeaderSchema(schema: Schema.Top | undefined): Schema.Top | undefined {
  return schema !== undefined && HttpApiSchema.isWithHeaders(schema) ? schema.headers : undefined
}

function responseHeaderNames(schema: Schema.Top | undefined): ReadonlyArray<string> | undefined {
  if (schema === undefined) return undefined
  const ast = Schema.toEncoded(schema).ast
  if (!SchemaAST.isObjects(ast)) return undefined
  const names = ast.propertySignatures.map((field) => String(field.name))
  return names.length === 0 ? undefined : names
}

function normalizeTransport(
  schema: Schema.Top | undefined,
  source: InputField["source"] | "success" | "error",
  endpoint: HttpApiEndpointRuntime,
  operation: string,
) {
  if (schema === undefined) return undefined
  if (source === "success" || source === "error") schema = unwrapResponseSchema(schema)
  if (isStreamSchema(schema)) return { schema, effectPortable: true } as const
  if (!metadataPortable(schema.ast, new Set())) {
    throw new GenerationError({
      reason: `Unportable schema: ${operation}.${source}`,
    })
  }
  const decoded = Schema.toType(schema) as Schema.Top
  if (!isPathInput(endpoint.path)) {
    throw new GenerationError({
      reason: `Invalid endpoint path: ${operation}`,
    })
  }
  const rebuilt = HttpApiEndpoint.make(endpoint.method)(endpoint.identifier, endpoint.path, {
    ...(source === "params" ? { params: decoded } : undefined),
    ...(source === "query" ? { query: decoded } : undefined),
    ...(source === "headers" ? { headers: decoded } : undefined),
    ...(source === "payload" ? { payload: decoded } : undefined),
    ...(source === "success" ? { success: decoded } : { success: Schema.String }),
    ...(source === "error" ? { error: decoded } : undefined),
  })
  const normalized =
    source === "params"
      ? rebuilt.params
      : source === "query"
        ? rebuilt.query
        : source === "headers"
          ? rebuilt.headers
          : source === "payload"
            ? Array.from(rebuilt.payload.values())[0]?.schemas[0]
            : source === "success"
              ? Array.from(rebuilt.success)[0]
              : Array.from(rebuilt.error)[0]
  if (normalized === undefined)
    throw new GenerationError({
      reason: `Unportable schema: ${operation}.${source}`,
    })
  if (!sameEncoding(schema.ast, normalized.ast)) return { schema, effectPortable: false } as const
  return { schema: decoded, effectPortable: true } as const
}

function isPathInput(path: string): path is HttpRouter.PathInput {
  return path === "*" || path.startsWith("/")
}

function sameEncoding(left: SchemaAST.AST, right: SchemaAST.AST): boolean {
  if (left._tag !== right._tag || left.encoding?.length !== right.encoding?.length) return false
  if (
    left.encoding?.some((link, index) => {
      const other = right.encoding?.[index]
      // `fromJsonString` allocates a new Transformation each call, so reference
      // equality is gone. Compare `_tag` plus the encoded `to` AST. Literal
      // values on that AST are what still catch a custom yes/no boolean codec
      // whose reconstructed query encoding is Union(true|false).
      return (
        other === undefined ||
        link.transformation._tag !== other.transformation._tag ||
        !sameEncoding(link.to, other.to)
      )
    })
  )
    return false
  if (!sameChecks(left.checks, right.checks) || !sameContext(left.context, right.context)) return false
  if (SchemaAST.isLiteral(left) && SchemaAST.isLiteral(right)) return left.literal === right.literal
  if (SchemaAST.isUniqueSymbol(left) && SchemaAST.isUniqueSymbol(right)) return left.symbol === right.symbol
  if (SchemaAST.isSuspend(left) && SchemaAST.isSuspend(right)) return sameEncoding(left.thunk(), right.thunk())
  if (SchemaAST.isUnion(left) && SchemaAST.isUnion(right)) {
    return (
      left.types.length === right.types.length &&
      left.types.every((ast, index) => sameEncoding(ast, right.types[index]))
    )
  }
  if (SchemaAST.isArrays(left) && SchemaAST.isArrays(right)) {
    return (
      left.elements.length === right.elements.length &&
      left.rest.length === right.rest.length &&
      left.elements.every((ast, index) => sameEncoding(ast, right.elements[index])) &&
      left.rest.every((ast, index) => sameEncoding(ast, right.rest[index]))
    )
  }
  if (SchemaAST.isObjects(left) && SchemaAST.isObjects(right)) {
    return (
      left.propertySignatures.length === right.propertySignatures.length &&
      left.indexSignatures.length === right.indexSignatures.length &&
      left.propertySignatures.every((field, index) => sameEncoding(field.type, right.propertySignatures[index].type)) &&
      left.indexSignatures.every(
        (field, index) =>
          sameEncoding(field.parameter, right.indexSignatures[index].parameter) &&
          sameEncoding(field.type, right.indexSignatures[index].type),
      )
    )
  }
  return true
}

function sameChecks(left: SchemaAST.Checks | undefined, right: SchemaAST.Checks | undefined): boolean {
  if (left?.length !== right?.length) return false
  if (left === undefined || right === undefined) return true
  return left.every((check, index) => {
    const other = right[index]
    if (other === undefined || check._tag !== other._tag) return false
    if (check._tag === "Filter" && other._tag === "Filter") {
      return check.run === other.run && check.aborted === other.aborted
    }
    return check._tag === "FilterGroup" && other._tag === "FilterGroup" && sameChecks(check.checks, other.checks)
  })
}

function sameContext(left: SchemaAST.Context | undefined, right: SchemaAST.Context | undefined) {
  return left?.isOptional === right?.isOptional && left?.isMutable === right?.isMutable
}

export function write(
  output: Output,
  directory: string,
): Effect.Effect<void, GenerationError | PlatformError.PlatformError, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const paths = new Set<string>()
    const normalizedPaths = new Set<string>()
    for (const file of output.files) {
      if (!isSafeOutputPath(file.path))
        yield* new GenerationError({
          reason: `Unsafe output path: ${file.path}`,
        })
      const path = file.path.toLowerCase()
      if (normalizedPaths.has(path))
        yield* new GenerationError({
          reason: `Duplicate output path: ${file.path}`,
        })
      normalizedPaths.add(path)
      paths.add(file.path)
    }
    const fs = yield* FileSystem.FileSystem
    yield* fs.makeDirectory(directory, { recursive: true })
    const manifest = join(directory, manifestName)
    const previous = (yield* fs.exists(manifest))
      ? yield* fs.readFileString(manifest).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(Manifest)),
          Effect.mapError(
            () =>
              new GenerationError({
                reason: `Invalid generated file manifest: ${manifest}`,
              }),
          ),
        )
      : []
    if (previous.some((path) => !isSafeOutputPath(path))) {
      yield* new GenerationError({
        reason: `Invalid generated file manifest: ${manifest}`,
      })
    }
    yield* Effect.forEach(
      previous.filter((path) => !paths.has(path)),
      (path) => fs.remove(join(directory, path), { force: true }),
      { concurrency: 8, discard: true },
    )
    yield* Effect.forEach(
      output.files,
      (file) =>
        fs.exists(join(directory, file.path)).pipe(
          Effect.flatMap((exists) => (exists ? fs.stat(join(directory, file.path)) : Effect.succeed(undefined))),
          Effect.flatMap((info) =>
            info?.type === "SymbolicLink"
              ? new GenerationError({
                  reason: `Unsafe output path: ${file.path}`,
                })
              : Effect.void,
          ),
        ),
      { concurrency: 8, discard: true },
    )
    yield* Effect.forEach(
      output.files,
      (file) =>
        Effect.tryPromise({
          try: () =>
            format(file.content, {
              filepath: file.path,
              parser: "typescript",
              semi: false,
              printWidth: 120,
            }),
          catch: (error) =>
            new GenerationError({
              reason: `Failed to format ${file.path}: ${String(error)}`,
            }),
        }).pipe(Effect.flatMap((content) => fs.writeFileString(join(directory, file.path), content))),
      { concurrency: 8, discard: true },
    )
    yield* fs.writeFileString(manifest, JSON.stringify(output.files.map((file) => file.path).sort(), null, 2) + "\n")
  })
}

function isSafeOutputPath(path: string) {
  return path !== manifestName && !isAbsolute(path) && path !== "." && path !== ".." && !/[\\/]/.test(path)
}

export function generate<Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
  options: { readonly directory: string },
): Effect.Effect<void, GenerationError | PlatformError.PlatformError, FileSystem.FileSystem> {
  return Effect.try({
    try: () => emitEffect(compile(api)),
    catch: (error) => (error instanceof GenerationError ? error : new GenerationError({ reason: String(error) })),
  }).pipe(Effect.flatMap((output) => write(output, options.directory)))
}

function inputFields(schema: Schema.Top | undefined, source: InputField["source"], operation: string) {
  if (schema === undefined) return []
  const ast = Schema.toType(schema).ast
  if (!SchemaAST.isObjects(ast) || ast.indexSignatures.length > 0) {
    if (source === "payload") return [{ name: "payload", source, optional: false, whole: true }] as const
    throw new GenerationError({
      reason: `Input schema must be a struct: ${operation}.${source}`,
    })
  }
  return ast.propertySignatures.map((field) => {
    if (typeof field.name !== "string") {
      throw new GenerationError({
        reason: `Input field must have a string name: ${operation}.${source}`,
      })
    }
    return {
      name: field.name,
      source,
      optional: SchemaAST.isOptional(field.type),
      whole: false,
    }
  })
}

function responseSchemas(schema: Schema.Top, path: string): Array<readonly [string, Schema.Top]> {
  if (HttpApiSchema.isNoContent(schema.ast)) return []
  if (!isStreamSchema(schema)) return [[path, schema]]
  if (schema._tag === "StreamUint8Array") return []
  const value = schema.sseMode === "data" ? streamDataSchema(schema) : (schema.events as Schema.Top)
  return [
    [`${path}.${schema.sseMode}`, value],
    [`${path}.error`, schema.error as Schema.Top],
  ]
}

function assertPortable(schema: Schema.Top, path: string, portable: Map<SchemaAST.AST, boolean>) {
  const visiting = new Set<SchemaAST.AST>()
  const taggedError = taggedErrorFields(schema)
  const visit = (ast: SchemaAST.AST): boolean => {
    const cached = portable.get(ast)
    if (cached !== undefined) return cached
    if (visiting.has(ast)) return true
    visiting.add(ast)
    const result = visitCurrent(ast)
    visiting.delete(ast)
    portable.set(ast, result)
    return result
  }
  const visitCurrent = (ast: SchemaAST.AST): boolean => {
    if (!annotationsPortable(ast.annotations)) return false
    if (!checksPortable(ast.checks) || ("encodingChecks" in ast && !checksPortable(ast.encodingChecks))) return false
    if (SchemaAST.isDeclaration(ast)) {
      return declarationPortable(ast) && ast.typeParameters.every(visit)
    }
    if (ast.encoding !== undefined && ast.annotations?.generation === undefined) return false
    if (SchemaAST.isSuspend(ast)) return visit(ast.thunk())
    if (SchemaAST.isUnion(ast)) return ast.types.every(visit)
    if (SchemaAST.isArrays(ast)) {
      return ast.elements.every(visit) && ast.rest.every(visit)
    }
    if (SchemaAST.isObjects(ast)) {
      return (
        ast.propertySignatures.every((field) => visit(field.type)) &&
        ast.indexSignatures.every((index) => visit(index.parameter) && visit(index.type))
      )
    }
    if (SchemaAST.isTemplateLiteral(ast)) return ast.parts.every(visit)
    return true
  }
  if (taggedError !== undefined && SchemaAST.isDeclaration(schema.ast)) {
    if (
      schema.ast.checks !== undefined ||
      ("encodingChecks" in schema.ast && !checksPortable(schema.ast.encodingChecks)) ||
      schema.ast.typeParameters.some((ast) => ast.checks !== undefined) ||
      !schema.ast.typeParameters.every(visit)
    ) {
      throw new GenerationError({ reason: `Unportable schema: ${path}` })
    }
    return
  }
  if (!visit(schema.ast)) throw new GenerationError({ reason: `Unportable schema: ${path}` })
}

function checksPortable(checks: SchemaAST.Checks | undefined): boolean {
  if (checks === undefined) return true
  return checks.every((check) =>
    check._tag === "Filter"
      ? !check.aborted &&
        (check.annotations?.meta !== undefined || check.annotations?.representation !== undefined) &&
        typeof check.annotations.arbitrary === "object" &&
        check.annotations.arbitrary !== null &&
        "constraint" in check.annotations.arbitrary
      : checksPortable(check.checks),
  )
}

function metadataPortable(ast: SchemaAST.AST, seen: Set<SchemaAST.AST>): boolean {
  if (seen.has(ast)) return true
  seen.add(ast)
  if (!annotationsPortable(ast.annotations) || !checksPortable(ast.checks)) return false
  if ("encodingChecks" in ast && !checksPortable(ast.encodingChecks)) return false
  if (ast.encoding?.some((link) => !metadataPortable(link.to, seen))) return false
  if (SchemaAST.isDeclaration(ast)) return ast.typeParameters.every((item) => metadataPortable(item, seen))
  if (SchemaAST.isSuspend(ast)) return metadataPortable(ast.thunk(), seen)
  if (SchemaAST.isUnion(ast)) return ast.types.every((item) => metadataPortable(item, seen))
  if (SchemaAST.isArrays(ast)) {
    return (
      ast.elements.every((item) => metadataPortable(item, seen)) &&
      ast.rest.every((item) => metadataPortable(item, seen))
    )
  }
  if (SchemaAST.isObjects(ast)) {
    return (
      ast.propertySignatures.every((field) => metadataPortable(field.type, seen)) &&
      ast.indexSignatures.every(
        (field) => metadataPortable(field.parameter, seen) && metadataPortable(field.type, seen),
      )
    )
  }
  return true
}

function declarationPortable(ast: SchemaAST.Declaration): boolean {
  if (generationPortable(ast.annotations?.generation)) return true
  const toCode = ast.annotations?.toCode
  if (typeof toCode !== "function") return false
  const representation = ast.annotations?.representation
  if (typeof representation !== "object" || representation === null) return false
  const id = (representation as { readonly id?: unknown }).id
  // RC built-ins (`Schema.Json`, `Schema.Uint8Array`) ship `toCode` plus an
  // `effect/…` representation id and no `generation` annotation. Do not treat
  // a user `toCode` as portable without that id.
  if (typeof id !== "string" || !id.startsWith("effect/")) return false
  return generationPortable(toCode())
}

function generationPortable(generation: unknown): boolean {
  if (typeof generation !== "object" || generation === null) return false
  const value = generation as {
    readonly runtime?: unknown
    readonly Type?: unknown
    readonly importDeclaration?: unknown
  }
  if (typeof value.runtime !== "string" || typeof value.Type !== "string") return false
  if (value.importDeclaration !== undefined) {
    if (
      typeof value.importDeclaration !== "string" ||
      !/from ["']effect(?:\/[^"']+)?["']$/.test(value.importDeclaration)
    ) {
      return false
    }
  }
  const namespace =
    typeof value.importDeclaration === "string"
      ? /import(?: type)? \* as ([A-Za-z_$][\w$]*)/.exec(value.importDeclaration)?.[1]
      : undefined
  return value.runtime.startsWith("Schema.") || (namespace !== undefined && value.runtime.startsWith(`${namespace}.`))
}

function annotationsPortable(annotations: Schema.Annotations.Annotations | undefined) {
  if (annotations === undefined) return true
  return Object.entries(annotations).every(([key, value]) => {
    if (
      [
        "toCodec",
        "toCodecJson",
        "toCodecStringTree",
        "toArbitrary",
        "toFormatter",
        "toEquivalence",
        "toCode",
        "~effect/Schema/Class",
        "~constructor",
        "~sentinels",
      ].includes(key)
    ) {
      return true
    }
    if (key === "generation") return generationPortable(value)
    return serializable(value)
  })
}

function serializable(value: unknown): boolean {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return true
  if (Array.isArray(value)) return value.every(serializable)
  if (typeof value !== "object") return false
  return Object.values(value).every(serializable)
}

function taggedErrorFields(schema: Schema.Top) {
  const fields = declaredErrorFields(schema)
  return fields?.key === "_tag" ? fields : undefined
}

function declaredErrorFields(schema: Schema.Top) {
  if (
    !SchemaAST.isDeclaration(schema.ast) ||
    (schema.ast.annotations?.["~effect/Schema/Class"] === undefined &&
      schema.ast.annotations?.["~constructor"] === undefined)
  ) {
    return undefined
  }
  const fields = schema.ast.typeParameters[0]
  if (!SchemaAST.isObjects(fields) || fields.indexSignatures.length > 0) return undefined
  const key = fields.propertySignatures.find((field) => field.name === "_tag" || field.name === "name")?.name
  if (key !== "_tag" && key !== "name") return undefined
  const tag = fields.propertySignatures.find((field) => field.name === key)?.type
  if (tag === undefined || !SchemaAST.isLiteral(tag) || typeof tag.literal !== "string") return undefined
  return {
    key,
    tag: tag.literal,
    identifier: SchemaAST.resolveIdentifier(schema.ast) ?? tag.literal,
    fields: fields.propertySignatures.flatMap((field) =>
      field.name === key || typeof field.name !== "string"
        ? []
        : [[field.name, Schema.make(field.type) as Schema.Top, SchemaAST.isOptional(field.type)] as const],
    ),
  }
}

function isDataEnvelope(schema: Schema.Top) {
  if (isStreamSchema(schema) || HttpApiSchema.isNoContent(schema.ast)) return false
  const ast = Schema.toType(schema).ast
  return (
    SchemaAST.isObjects(ast) &&
    ast.indexSignatures.length === 0 &&
    ast.propertySignatures.length === 1 &&
    ast.propertySignatures[0]?.name === "data"
  )
}

function isStreamSchema(schema: Schema.Top): schema is HttpApiSchema.StreamSchema {
  return "_tag" in schema && (schema._tag === "StreamSse" || schema._tag === "StreamUint8Array")
}

function streamDataSchema(schema: Extract<HttpApiSchema.StreamSchema, { readonly _tag: "StreamSse" }>) {
  return Schema.make(streamDataAst(Schema.toType(schema.events).ast)) as Schema.Top
}

function streamEncodedDataSchema(schema: Extract<HttpApiSchema.StreamSchema, { readonly _tag: "StreamSse" }>) {
  const data = streamDataAst(schema.events.ast)
  const encodedAst = data.encoding?.at(-1)?.to
  const content = encodedAst === undefined ? undefined : resolveContentSchema(encodedAst)
  if (SchemaAST.isAST(content)) return Schema.make(content) as Schema.Top
  // `fromJsonString` now encodes as string without a `contentSchema` annotation;
  // the decoded data field is the JSON payload the Promise client types.
  return Schema.make(SchemaAST.toType(data)) as Schema.Top
}

function streamDataAst(ast: SchemaAST.AST) {
  if (!SchemaAST.isObjects(ast)) throw new GenerationError({ reason: "Invalid SSE data schema" })
  const data = ast.propertySignatures.find((field) => field.name === "data")?.type
  if (data === undefined) throw new GenerationError({ reason: "Invalid SSE data schema" })
  return data
}

function streamEffectPortable(schema: Schema.Top) {
  if (!isStreamSchema(schema) || schema._tag === "StreamUint8Array" || schema.sseMode === "events") return true
  const rebuilt = HttpApiSchema.StreamSse({
    data: streamDataSchema(schema),
    error: schema.error,
    contentType: schema.contentType,
  })
  return sameEncoding(schema.events.ast, rebuilt.events.ast)
}

function renderGroup(group: Group, groupIndex: number) {
  const slots: Array<Slot> = []
  const adapters: Array<string> = []
  const endpointSources = group.endpoints.map((operation, endpointIndex) => {
    const {
      endpoint,
      errors,
      headers: endpointHeaders,
      params: endpointParams,
      payloads: endpointPayloads,
      query: endpointQuery,
      successes,
    } = operation
    const prefix = `Endpoint${endpointIndex}`
    const params = addSlot(endpointParams, `${prefix}Params`)
    const query = addSlot(endpointQuery, `${prefix}Query`)
    const headers = addSlot(endpointHeaders, `${prefix}Headers`)
    const payloads = endpointPayloads.map((schema, index) => addSlot(schema, `${prefix}Payload${index}`)!)
    const success = renderSuccess(successes[0], `${prefix}Success`)
    const errorSlots = errors.map((error, index) => addSlot(error.schema, `${prefix}Error${index}`)!)
    const options = [
      params === undefined ? undefined : `params: ${params.name}`,
      query === undefined ? undefined : `query: ${query.name}`,
      headers === undefined ? undefined : `headers: ${headers.name}`,
      payloads.length === 0
        ? undefined
        : `payload: ${payloads.length === 1 ? payloads[0].name : `[${payloads.map((slot) => slot.name).join(", ")}]`}`,
      `success: ${success.source}`,
      errorSlots.length === 0
        ? undefined
        : `error: ${errorSlots.length === 1 ? errorSlots[0].name : `[${errorSlots.map((slot) => slot.name).join(", ")}]`}`,
    ].filter((option): option is string => option !== undefined)
    const schemaBySource = { params, query, headers, payload: payloads[0] }
    const inputType = operation.input
      .map((field) => {
        const slot = schemaBySource[field.source]
        if (slot === undefined) {
          throw new GenerationError({
            reason: `Missing input schema: ${group.identifier}.${endpoint.identifier}`,
          })
        }
        return `readonly ${JSON.stringify(field.name)}${field.optional ? "?" : ""}: ${field.whole ? `typeof ${slot.name}.Type` : `(typeof ${slot.name}.Type)[${JSON.stringify(field.name)}]`}`
      })
      .join("; ")
    const argument =
      operation.operation.inputMode === "none"
        ? ""
        : `input${operation.operation.inputMode === "optional" ? "?" : ""}: ${prefix}Input`
    const request = (["params", "query", "headers", "payload"] as const)
      .flatMap((source) => {
        const slot = schemaBySource[source]
        if (slot === undefined) return []
        const fields = operation.input.filter((field) => field.source === source)
        if (fields[0]?.whole) {
          return [
            `${source}: input${operation.operation.inputMode === "optional" ? "?." : ""}[${JSON.stringify(fields[0].name)}]`,
          ]
        }
        const entries = fields.map(
          (field) =>
            `${JSON.stringify(field.name)}: input${operation.operation.inputMode === "optional" ? "?." : ""}[${JSON.stringify(field.name)}]`,
        )
        return [`${source}: { ${entries.join(", ")} }`]
      })
      .join(", ")
    const declared = [...errorSlots, ...(success.streamError === undefined ? [] : [success.streamError])]
    const declaredSchema =
      declared.length === 0 ? "Schema.Never" : `Schema.Union([${declared.map((slot) => slot.name).join(", ")}])`
    const rawCall = `raw[${JSON.stringify(endpoint.identifier)}]({ ${request} })`
    const mapped = `${rawCall}.pipe(Effect.mapError(map${prefix}Error)${operation.unwrapData ? ", Effect.map((value) => value.data)" : ""})`
    const inputDeclaration = operation.operation.inputMode === "none" ? "" : `type ${prefix}Input = { ${inputType} }\n`
    adapters.push(
      `${inputDeclaration}const ${prefix}DeclaredError = ${declaredSchema}\nconst map${prefix}Error = (error: unknown) => {\n  const transported = mapTransportError(error)\n  return transported instanceof ClientError ? transported : Schema.is(${prefix}DeclaredError)(error) ? error : new ClientError({ cause: error })\n}\nconst ${prefix} = (raw: RawGroup) => (${argument}) => ${operation.operation.success === "stream" ? `Stream.unwrap(${rawCall}.pipe(Effect.mapError(map${prefix}Error), Effect.map((stream) => stream.pipe(Stream.mapError(map${prefix}Error)))))` : mapped}`,
    )
    return `HttpApiEndpoint.make(${JSON.stringify(endpoint.method)})(${JSON.stringify(endpoint.identifier)}, ${JSON.stringify(endpoint.path)}, { ${options.join(", ")} })`
  })

  function addSlot(schema: Schema.Top | undefined, name: string) {
    if (schema === undefined) return undefined
    const slot = { name, schema }
    slots.push(slot)
    return slot
  }

  function renderSuccess(schema: Schema.Top, name: string) {
    if (!isStreamSchema(schema)) return { source: addSlot(schema, name)!.name }
    const status = resolveHttpApiStatus(schema.ast) ?? 200
    const annotate = status === 200 ? "" : `.pipe(HttpApiSchema.status(${status}))`
    if (schema._tag === "StreamUint8Array") {
      return {
        source: `HttpApiSchema.StreamUint8Array({ contentType: ${JSON.stringify(schema.contentType)} })${annotate}`,
      }
    }
    const value = addSlot(
      schema.sseMode === "data" ? streamDataSchema(schema) : (schema.events as Schema.Top),
      `${name}${schema.sseMode === "data" ? "Data" : "Events"}`,
    )!
    const error = addSlot(schema.error as Schema.Top, `${name}Error`)!
    return {
      source: `HttpApiSchema.StreamSse({ ${schema.sseMode}: ${value.name}, error: ${error.name}, contentType: ${JSON.stringify(schema.contentType)} })${annotate}`,
      streamError: error,
    }
  }

  const declarations = renderSchemas(slots)
  const groupSource = `HttpApiGroup.make(${JSON.stringify(group.identifier)}, { topLevel: ${group.endpoints[0]?.topLevel ?? false} })${endpointSources.map((endpoint) => `.add(${endpoint})`).join("")}`
  const usesHttpApiSchema = endpointSources.some((source) => source.includes("HttpApiSchema."))
  const methods = renderClientTree(
    group.endpoints,
    (_item, index) => `Endpoint${index}(raw)`,
    (name, value) => `${JSON.stringify(name)}: ${value}`,
    ", ",
  )
  const rawGroup = group.endpoints[0]?.topLevel
    ? `HttpApiClient.Client<typeof Group${groupIndex}>`
    : `HttpApiClient.Client.Group<typeof Group${groupIndex}, never, never>`
  const usesStream = group.endpoints.some((item) => item.operation.success === "stream")
  return `// Generated by @cadcamfun/httpapi-codegen. Do not edit.\nimport { Effect, Schema${usesStream ? ", Stream" : ""} } from "effect"\nimport { HttpApiClient, HttpApiEndpoint, HttpApiGroup${usesHttpApiSchema ? ", HttpApiSchema" : ""} } from "effect/unstable/httpapi"\nimport { ClientError, mapTransportError } from "./client-error"\n\n${declarations}\n\nexport const Group${groupIndex} = ${groupSource}\n\ntype RawGroup = ${rawGroup}\n\n${adapters.join("\n\n")}\n\nexport const adaptGroup${groupIndex} = (raw: RawGroup) => ({ ${methods} })\n`
}

function renderSchemas(slots: ReadonlyArray<Slot>) {
  if (slots.length === 0) return ""
  const classes = new Map(
    slots.flatMap((slot, index) => {
      const tagged = taggedErrorFields(slot.schema)
      return tagged === undefined ? [] : [[index, tagged] as const]
    }),
  )
  const expanded = [
    ...slots.map((slot, index) => (classes.has(index) ? { name: slot.name, schema: Schema.Never } : slot)),
    ...Array.from(classes.values()).flatMap((tagged, classIndex) =>
      tagged.fields.map(([name, schema]) => ({
        name: `Class${classIndex}${name}`,
        schema,
      })),
    ),
  ]
  const [first, ...rest] = expanded
  const document = SchemaRepresentation.toCodeDocument(
    SchemaRepresentation.toRepresentations([first.schema.ast, ...rest.map((slot) => slot.schema.ast)]),
  )
  const artifacts = document.artifacts.flatMap((artifact) => {
    if (artifact._tag === "Import") return [artifact.importDeclaration]
    if (artifact._tag === "Enum") return [artifact.code.runtime]
    return [`const ${artifact.identifier} = ${artifact.code.runtime}`]
  })
  const references = [
    ...document.references.nonRecursives.map(({ $ref, code }) => `const ${$ref} = ${code.runtime}`),
    ...Object.entries(document.references.recursives).map(
      ([$ref, code]) => `type ${$ref} = ${code.Type}\nconst ${$ref}: Schema.Codec<${$ref}> = ${code.runtime}`,
    ),
  ]
  let fieldIndex = slots.length
  const declarations = slots.map((slot, index) => {
    const tagged = classes.get(index)
    if (tagged === undefined) return `const ${slot.name} = ${document.codes[index].runtime}`
    const fields = tagged.fields
      .map(([name]) => `${JSON.stringify(name)}: ${document.codes[fieldIndex++].runtime}`)
      .join(", ")
    const annotations = Object.entries({
      httpApiStatus: resolveHttpApiStatus(slot.schema.ast),
      "~httpApiEncoding": resolveHttpApiEncoding(slot.schema.ast),
    }).filter((entry) => entry[1] !== undefined)
    const annotate =
      annotations.length === 0
        ? ""
        : `.annotate({ ${annotations.map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(", ")} })`
    return `class ${slot.name}Class extends Schema.TaggedError<${slot.name}Class>(${JSON.stringify(tagged.identifier)})(${JSON.stringify(tagged.tag)}, { ${fields} }) {}\nconst ${slot.name} = ${slot.name}Class${annotate}`
  })
  return [...artifacts, ...references, ...declarations].join("\n\n")
}

function renderClient(groups: ReadonlyArray<Group>) {
  const imports = groups
    .map((group, index) => `import { adaptGroup${index}, Group${index} } from ${JSON.stringify(`./${group.module}`)}`)
    .join("\n")
  const api = `HttpApi.make("generated")${groups.map((_, index) => `.add(Group${index})`).join("")}`
  const fields = groups.flatMap((group, index) => {
    if (!group.endpoints[0]?.topLevel) {
      return [`${JSON.stringify(group.identifier)}: adaptGroup${index}(raw[${JSON.stringify(group.identifier)}])`]
    }
    const raw = `{ ${group.endpoints.map((item) => `${JSON.stringify(item.endpoint.identifier)}: raw[${JSON.stringify(item.endpoint.identifier)}]`).join(", ")} }`
    return [`...adaptGroup${index}(${raw})`]
  })
  return `// Generated by @cadcamfun/httpapi-codegen. Do not edit.\nimport { Effect } from "effect"\nimport { HttpApi, HttpApiClient } from "effect/unstable/httpapi"\n${imports}\n\nconst Api = ${api}\nconst adaptClient = (raw: HttpApiClient.ForApi<typeof Api>) => ({ ${fields.join(", ")} })\n\nexport const make = (options?: { readonly baseUrl?: URL | string }) =>\n  HttpApiClient.make(Api, options).pipe(Effect.map(adaptClient))\n`
}
