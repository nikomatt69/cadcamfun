import { Schema } from "effect"
import { Multipart } from "effect/unstable/http"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { KeyedInternal } from "../errors.ts"

export class PluginBadRequest extends Schema.TaggedError<PluginBadRequest>()("PluginBadRequest", {
  error: Schema.String, details: Schema.optional(Schema.Array(Schema.String))
}, { httpApiStatus: 400 }) {}
export class PluginNotFound extends Schema.TaggedError<PluginNotFound>()("PluginNotFound", { error: Schema.String }, { httpApiStatus: 404 }) {}
export class PluginConflict extends Schema.TaggedError<PluginConflict>()("PluginConflict", { error: Schema.String }, { httpApiStatus: 409 }) {}

const optionalString = Schema.optional(Schema.String)
export const PluginConfig = Schema.Record(Schema.String, Schema.Unknown)
const menu = Schema.Struct({ command: Schema.String, group: optionalString, when: optionalString, priority: Schema.optional(Schema.Number) })
export const LegacyPluginManifest = Schema.Struct({
  id: Schema.String, name: Schema.String, version: Schema.String, description: Schema.String, author: Schema.String,
  repository: optionalString, license: optionalString, icon: optionalString, main: Schema.String,
  engines: Schema.Struct({ cadcam: Schema.String }),
  permissions: Schema.Array(Schema.Literals([
    "model:read", "model:write", "model:selection", "ui:sidebar", "ui:toolbar", "ui:contextMenu",
    "ui:propertyPanel", "ui:modal", "ui:overlay", "storage:local", "storage:sync", "file:read", "file:write",
    "file:downloads", "network:origin", "network:external", "system:clipboard", "system:notifications",
    "ui:fullscreen", "device:camera", "device:microphone"
  ])),
  dependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  contributes: Schema.optional(Schema.Struct({
    sidebar: Schema.optional(Schema.Struct({ title: Schema.String, icon: Schema.String, entry: Schema.String })),
    commands: Schema.optional(Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String, icon: optionalString, keybinding: optionalString }))),
    menus: Schema.optional(Schema.Struct({ toolbar: Schema.optional(Schema.Array(menu)), contextMenu: Schema.optional(Schema.Array(menu)) })),
    propertyPanel: Schema.optional(Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String, entry: Schema.String, appliesTo: optionalString }))),
    themes: Schema.optional(Schema.Array(Schema.Struct({ id: Schema.String, label: Schema.String, path: Schema.String })))
  })),
  configuration: Schema.optional(Schema.Struct({ properties: Schema.Record(Schema.String, Schema.Struct({
    type: Schema.String, default: Schema.optional(Schema.Unknown), description: optionalString,
    enum: Schema.optional(Schema.Array(Schema.Unknown)), minimum: Schema.optional(Schema.Number),
    maximum: Schema.optional(Schema.Number), pattern: optionalString
  })) }))
})
export const InstalledPlugin = Schema.Struct({
  id: Schema.String, manifest: LegacyPluginManifest,
  state: Schema.Literals(["none", "installed", "enabled", "disabled", "loaded", "activated", "deactivated", "error"]),
  enabled: Schema.Boolean, version: Schema.String, installedAt: Schema.String, updatedAt: Schema.String,
  config: Schema.optional(PluginConfig), configurationId: optionalString, errorCount: Schema.Number, lastError: optionalString
})
export const RegistryPluginManifest = Schema.Struct({
  id: Schema.String, name: Schema.String, version: Schema.String, description: Schema.String, author: Schema.String,
  entryPoint: Schema.String, homepage: optionalString, repository: optionalString,
  dependencies: Schema.Record(Schema.String, Schema.String), permissions: Schema.Array(Schema.String),
  extensionPoints: Schema.Array(Schema.String), minAppVersion: Schema.String, maxAppVersion: optionalString
})
export const PluginUpdate = Schema.Struct({ manifest: Schema.optional(LegacyPluginManifest), config: Schema.optional(PluginConfig) })
export const PluginInstallRequest = Schema.Struct({ file: Multipart.FilesSchema }).pipe(HttpApiSchema.asMultipart())
export const PluginInstallResponse = Schema.Struct({ message: Schema.String, plugin: InstalledPlugin })
export const PluginBootstrapScript = Schema.String.pipe(HttpApiSchema.asText({ contentType: "application/javascript" }))
const id = { id: Schema.String }
const message = Schema.Struct({ message: Schema.String })
const errors = [PluginBadRequest, PluginNotFound, KeyedInternal] as const

export class PluginsGroup extends HttpApiGroup.make("plugins")
  .add(
    HttpApiEndpoint.post("install", "/api/plugins/install", {
      payload: PluginInstallRequest,
      success: PluginInstallResponse.pipe(Schema.annotate({ httpApiStatus: 201 })),
      error: [PluginBadRequest, PluginConflict, KeyedInternal]
    }),
    HttpApiEndpoint.get("bootstrap", "/api/plugins/bootstrap.js", {
      query: { id: Schema.String }, success: PluginBootstrapScript,
      error: [
        PluginBootstrapScript.pipe(Schema.annotate({ httpApiStatus: 400 })),
        PluginBootstrapScript.pipe(Schema.annotate({ httpApiStatus: 404 })),
        PluginBootstrapScript.pipe(Schema.annotate({ httpApiStatus: 500 }))
      ]
    }),
    HttpApiEndpoint.get("serve", "/api/plugins/serve", {
      query: { id: Schema.String, file: Schema.String },
      success: HttpApiSchema.WithHeaders(HttpApiSchema.StreamUint8Array(), { "content-type": Schema.String, "cache-control": Schema.String }),
      error: errors
    }),
    HttpApiEndpoint.get("list", "/api/plugins", { success: Schema.Array(InstalledPlugin), error: KeyedInternal }),
    HttpApiEndpoint.get("get", "/api/plugins/:id", { params: id, success: InstalledPlugin, error: errors }),
    HttpApiEndpoint.delete("uninstall", "/api/plugins/:id", { params: id, success: message, error: errors }),
    HttpApiEndpoint.get("getConfig", "/api/plugins/:id/config", { params: id, success: PluginConfig, error: errors }),
    HttpApiEndpoint.post("setConfig", "/api/plugins/:id/config", { params: id, payload: PluginConfig, success: message, error: errors }),
    HttpApiEndpoint.put("updateConfig", "/api/plugins/:id/config", { params: id, payload: PluginConfig, success: message, error: errors }),
    HttpApiEndpoint.post("enable", "/api/plugins/:id/enable", { params: id, success: message, error: errors }),
    HttpApiEndpoint.post("disable", "/api/plugins/:id/disable", { params: id, success: message, error: errors }),
    HttpApiEndpoint.put("update", "/api/plugins/:id/update", { params: id, payload: PluginUpdate, success: InstalledPlugin, error: errors }),
    HttpApiEndpoint.patch("patch", "/api/plugins/:id/update", { params: id, payload: PluginUpdate, success: InstalledPlugin, error: errors }),
    HttpApiEndpoint.get("registry", "/api/plugins/registry", { success: Schema.Array(RegistryPluginManifest), error: KeyedInternal }),
    HttpApiEndpoint.get("registryGet", "/api/plugins/registry/:id", { params: id, success: RegistryPluginManifest, error: errors }),
    HttpApiEndpoint.get("registrySearch", "/api/plugins/registry/search", { query: { q: Schema.String }, success: Schema.Array(RegistryPluginManifest), error: [PluginBadRequest, KeyedInternal] })
  )
{}
