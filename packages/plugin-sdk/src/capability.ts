/**
 * Capabilities: the *only* thing a plugin may act through (spec 09-plugins.md
 * §1-§2).
 *
 * A plugin declares what it needs in its manifest, the user grants a subset, and
 * the host builds a context containing exactly the granted surfaces. Keeping the
 * list closed and the strings structured (`resource:action`) is what makes both
 * the manifest Schema and the host's enforcement check exhaustive.
 */
import { Schema } from "effect"

/** Every capability the host knows about. Anything else is a manifest error. */
export const CAPABILITIES = [
  /** Read drawing geometry through the command patches. */
  "drawing:read",
  /** Patch drawing geometry. */
  "drawing:write",
  /** Read toolpaths and programs. */
  "toolpath:read",
  /** Namespaced key-value storage, private to the plugin. */
  "storage",
  /** Register declarative UI contributions (commands, panels). */
  "ui:panel"
] as const

export const CapabilitySchema = Schema.Literals(CAPABILITIES)
export type Capability = typeof CapabilitySchema.Type

/** Every capability: what a maximally trusted plugin could ask for. */
export const ALL_CAPABILITIES: ReadonlyArray<Capability> = [...CAPABILITIES]

/** Capabilities implied by others, so a grant of one can enable its neighbours. */
const IMPLIES: Readonly<Record<Capability, ReadonlyArray<Capability>>> = {
  "drawing:read": [],
  "drawing:write": ["drawing:read"],
  "toolpath:read": [],
  storage: [],
  "ui:panel": []
}

/**
 * Capabilities actually in force: the granted ones plus everything they imply.
 * The host calls this once per activation, so a plugin that declares
 * `drawing:write` does not have to also declare `drawing:read`.
 */
export const effectiveCapabilities = (granted: ReadonlyArray<Capability>): ReadonlyArray<Capability> => {
  const out = new Set<Capability>()
  const queue = [...granted]
  while (queue.length > 0) {
    const capability = queue.pop()!
    if (out.has(capability)) continue
    out.add(capability)
    queue.push(...IMPLIES[capability])
  }
  return [...out].sort()
}

/** Whether `capability` is available given the granted set. */
export const hasCapability = (granted: ReadonlyArray<Capability>, capability: Capability): boolean =>
  effectiveCapabilities(granted).includes(capability)

/** What a manifest asks for that the user has not granted. */
export const missingCapabilities = (
  requested: ReadonlyArray<Capability>,
  granted: ReadonlyArray<Capability>
): ReadonlyArray<Capability> => {
  const effective = effectiveCapabilities(granted)
  return requested.filter((capability) => !effective.includes(capability))
}

/** The storage namespace of a plugin; the host refuses any other prefix. */
export const storageNamespace = (pluginId: string): string => `plugin:${pluginId}:`

/** Builds the storage key a plugin may use, throwing when it escapes its namespace. */
export const storageKey = (pluginId: string, key: string): string => {
  if (key.startsWith("/") || key.includes("..")) {
    throw new RangeError(`storage key "${key}" may not escape the plugin namespace`)
  }
  return `${storageNamespace(pluginId)}${key}`
}
