/**
 * Runs a custom element's user-authored geometry script.
 *
 * The script is a function body with `THREE` and `parameters` in scope that must return a
 * `THREE.BufferGeometry` (a material is then built from the definition) or a complete
 * `THREE.Object3D`. Trust model: the code is written by the person using this machine, the same
 * code the legacy editor ran, so the only scope handed to it is `THREE` and the parameters — no
 * `window`, `document`, `fetch` or `import` — and every failure is reported as an error message
 * rather than a crash.
 */
import * as THREE from "three"
import type { CustomElementDefinition } from "../../types/customElements.ts"

/** The script as compiled by `new Function`; returns whatever the body returns. */
type UserScript = (three: typeof THREE, parameters: Readonly<Record<string, unknown>>) => unknown

const PARAMETER_PREFIX = "parameters."

/** Compiles a geometry body without running it; throws when the code is not valid JavaScript. */
export const compileGeometryCode = (code: string): UserScript =>
  new Function("THREE", "parameters", code) as UserScript

/** Compiles a material body without running it; throws when the code is not valid JavaScript. */
export const compileMaterialCode = (code: string): UserScript =>
  new Function("THREE", "parameters", code) as UserScript

/** Resolves `parameters.<name>` references in material properties against the current values. */
export const interpolateMaterialProperties = (
  properties: Readonly<Record<string, unknown>>,
  parameters: Readonly<Record<string, unknown>>,
): Record<string, unknown> => {
  const resolved: Record<string, unknown> = { ...properties }
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === "string" && value.startsWith(PARAMETER_PREFIX)) {
      resolved[key] = parameters[value.slice(PARAMETER_PREFIX.length)]
    }
  }
  return resolved
}

/** The material the definition asks for: custom code when configured, otherwise a standard kind. */
const buildMaterial = (
  definition: CustomElementDefinition,
  parameters: Readonly<Record<string, unknown>>,
): THREE.Material => {
  const config = definition.materialConfig
  if (config?.type === "custom" && config.customCode !== undefined) {
    const material = compileMaterialCode(config.customCode)(THREE, parameters)
    if (material instanceof THREE.Material) return material
    throw new Error("The material function must return a THREE.Material")
  }
  const properties = interpolateMaterialProperties(config?.properties ?? {}, parameters)
  switch (config?.type) {
    case "basic": return new THREE.MeshBasicMaterial(properties)
    case "physical": return new THREE.MeshPhysicalMaterial(properties)
    default: return new THREE.MeshStandardMaterial(properties)
  }
}

/**
 * Builds the object a definition describes at the given parameter values, and marks it so the
 * canvas (and anyone reading `userData`) can tell it came from a custom element.
 *
 * @throws when the script fails, returns nothing, or returns something that is neither a
 * geometry nor an object — the message is shown to the user verbatim.
 */
export const evaluateCustomElement = (
  definition: CustomElementDefinition,
  parameters: Readonly<Record<string, unknown>>,
): THREE.Object3D => {
  const result = compileGeometryCode(definition.geometryCode)(THREE, parameters)
  if (result === null || result === undefined) throw new Error("Geometry function returned null or undefined")

  let object: THREE.Object3D
  if (result instanceof THREE.Object3D) object = result
  else if (result instanceof THREE.BufferGeometry) object = new THREE.Mesh(result, buildMaterial(definition, parameters))
  else throw new Error("Geometry function must return THREE.BufferGeometry or THREE.Object3D")

  object.userData["isCustomElement"] = true
  object.userData["customElementId"] = definition.id
  object.userData["customElementName"] = definition.name
  object.userData["customParameters"] = parameters
  return object
}

/** Number of triangles in an object, for the preview's info overlay. */
export const triangleCount = (object: THREE.Object3D): number | undefined => {
  let triangles = 0
  object.traverse((child) => {
    const geometry = (child as THREE.Mesh).geometry
    const position = geometry?.getAttribute("position")
    if (position === undefined) return
    const index = geometry.getIndex()
    triangles += index !== null ? index.count / 3 : position.count / 3
  })
  return triangles > 0 ? triangles : undefined
}
