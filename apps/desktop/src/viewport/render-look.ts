/**
 * The look of every 3D viewport and preview: one studio environment, one tone mapper, one light rig that follows the camera,
 * and the surface (colour, metalness, roughness) of the project's materials.
 *
 * Why: a PBR metal reflects its surroundings. With only an ambient and one directional light there is nothing to reflect, so
 * aluminium and steel render dark and flat. A studio environment (three's `RoomEnvironment`, filtered once per renderer with
 * `PMREMGenerator`) gives metals a world to mirror; the key / fill / rim lights give every part a lit side, a soft side and
 * a bright edge whichever way the user orbits.
 *
 * Tone mapping is Khronos PBR Neutral, not ACES or AgX. ACES desaturates and rotates hues (saturated blues drift to purple,
 * reds to orange) and AgX flattens contrast; both shift every colour on screen, including the toolpath colours that carry
 * meaning (rapid / feed / plunge) and the colours the user gave a part. Neutral is the tone mapper made for product
 * rendering: it leaves everything below ~0.8 untouched and only compresses highlights, so a colour picked in the CAD is the
 * colour on screen while specular highlights on metal no longer clip to white. Output stays sRGB.
 *
 * Quality tiers, one setting (see `render-look-setting.ts`):
 *  - `low`      the host's own lights, no environment, no tone mapping (what the viewport looked like before);
 *  - `standard` environment + tone mapping + key / fill / rim rig + project material surfaces;
 *  - `high`     like standard, with a sharper environment (mirror-like reflections on polished metal) and a stronger rim.
 */
import * as THREE from "three"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"

export type LookTier = "low" | "standard" | "high"

export const LOOK_TIERS: readonly LookTier[] = ["low", "standard", "high"]
export const DEFAULT_LOOK_TIER: LookTier = "standard"

/** A tier from a stored or typed value; anything unknown is the fallback (a stale or hand-edited setting never breaks a viewport). */
export const resolveLookTier = (value: unknown, fallback: LookTier = DEFAULT_LOOK_TIER): LookTier =>
  typeof value === "string" && (LOOK_TIERS as readonly string[]).includes(value) ? (value as LookTier) : fallback

export interface TierSettings {
  /** Image-based lighting from the studio environment. */
  readonly environment: boolean
  /** Blur (PMREM sigma, radians) of the environment: 0 mirrors, higher is satin. */
  readonly environmentBlur: number
  readonly environmentIntensity: number
  readonly toneMapping: THREE.ToneMapping
  readonly exposure: number
  /** Key / fill / rim / hemisphere / ambient intensities of the rig; `undefined` keeps the host's own lights. */
  readonly rig?: RigLevels
  /** Apply the project material table to surfaces. */
  readonly materials: boolean
}

export interface RigLevels {
  readonly key: number
  readonly fill: number
  readonly rim: number
  readonly hemisphere: number
  readonly ambient: number
}

export const TIERS: Readonly<Record<LookTier, TierSettings>> = {
  low: { environment: false, environmentBlur: 0, environmentIntensity: 0, toneMapping: THREE.NoToneMapping, exposure: 1, materials: false },
  standard: { environment: true, environmentBlur: 0.04, environmentIntensity: 0.95, toneMapping: THREE.NeutralToneMapping, exposure: 1, materials: true, rig: { key: 1.3, fill: 0.45, rim: 0.7, hemisphere: 0.2, ambient: 0.08 } },
  high: { environment: true, environmentBlur: 0, environmentIntensity: 1.1, toneMapping: THREE.NeutralToneMapping, exposure: 1, materials: true, rig: { key: 1.4, fill: 0.5, rim: 1.1, hemisphere: 0.2, ambient: 0.08 } }
}

/** The lights a host had before the look existed: they are the `low` tier and the scale of the user's lighting controls. */
export interface LegacyLights {
  readonly ambient: number
  readonly hemisphere: number
  readonly key: number
  /** World position of the fixed key light of the `low` tier. */
  readonly keyPosition: readonly [number, number, number]
}

type Vec3 = readonly [number, number, number]

const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / length, v[1] / length, v[2] / length]
}

const combine = (basis: CameraBasis, right: number, up: number, toward: number): Vec3 =>
  normalize([
    basis.right[0] * right + basis.up[0] * up - basis.forward[0] * toward,
    basis.right[1] * right + basis.up[1] * up - basis.forward[1] * toward,
    basis.right[2] * right + basis.up[2] * up - basis.forward[2] * toward
  ])

/** The camera's orthonormal axes in world space; `forward` is the viewing direction. */
export interface CameraBasis { readonly right: Vec3; readonly up: Vec3; readonly forward: Vec3 }

/** The basis of a camera from its world matrix (column 0 right, column 1 up, column 2 backwards). */
export const cameraBasis = (matrixWorld: ArrayLike<number>): CameraBasis => ({
  right: normalize([matrixWorld[0]!, matrixWorld[1]!, matrixWorld[2]!]),
  up: normalize([matrixWorld[4]!, matrixWorld[5]!, matrixWorld[6]!]),
  forward: normalize([-matrixWorld[8]!, -matrixWorld[9]!, -matrixWorld[10]!])
})

export interface RigDirections { readonly key: Vec3; readonly fill: Vec3; readonly rim: Vec3 }

/**
 * Unit vectors from the part towards each light, from the camera's axes: the key shines from above-left and in front, the fill
 * from the right at a low angle (it lifts the shadow side), the rim from behind and above (it outlines the silhouette). The
 * rig is fixed to the camera, so a part keeps its shading while the user orbits, like a studio with a moving photographer.
 */
export const rigDirections = (basis: CameraBasis): RigDirections => ({
  key: combine(basis, -0.55, 0.7, 0.55),
  fill: combine(basis, 0.85, 0.15, 0.5),
  rim: combine(basis, 0.25, 0.55, -0.8)
})

/** Light intensities of a tier, scaled by how far the host's own lighting controls moved from their defaults. */
export const rigLevels = (tier: LookTier, legacy: LegacyLights, base: LegacyLights): RigLevels | undefined => {
  const rig = TIERS[tier].rig
  if (rig === undefined) return undefined
  const scale = (value: number, reference: number): number => (reference > 0 ? value / reference : 1)
  return {
    key: rig.key * scale(legacy.key, base.key),
    fill: rig.fill * scale(legacy.key, base.key),
    rim: rig.rim * scale(legacy.key, base.key),
    hemisphere: rig.hemisphere * scale(legacy.hemisphere, base.hemisphere),
    ambient: rig.ambient * scale(legacy.ambient, base.ambient)
  }
}

// -- Materials ---------------------------------------------------------------------------------------------------------

export interface SurfaceLook { readonly color: number; readonly metalness: number; readonly roughness: number }

/** Surfaces by material family (the families of `cam.kernel` workpiece materials; metals are machined, not mirror-polished). */
export const SURFACES: Readonly<Record<string, SurfaceLook>> = {
  aluminium: { color: 0xc9ccd0, metalness: 0.92, roughness: 0.36 },
  steel: { color: 0x8f959c, metalness: 0.95, roughness: 0.4 },
  "steel-tool": { color: 0x727880, metalness: 0.95, roughness: 0.34 },
  stainless: { color: 0xb7bbbf, metalness: 1, roughness: 0.28 },
  "cast-iron": { color: 0x6c7075, metalness: 0.85, roughness: 0.6 },
  brass: { color: 0xcba44c, metalness: 1, roughness: 0.3 },
  copper: { color: 0xc0714a, metalness: 1, roughness: 0.28 },
  bronze: { color: 0xa87a3f, metalness: 0.95, roughness: 0.38 },
  titanium: { color: 0x8c8f97, metalness: 0.9, roughness: 0.42 },
  nickel: { color: 0x7f8389, metalness: 0.9, roughness: 0.45 },
  plastic: { color: 0xc8cac6, metalness: 0, roughness: 0.45 },
  acrylic: { color: 0xe6edf2, metalness: 0, roughness: 0.12 },
  wood: { color: 0xb88a58, metalness: 0, roughness: 0.75 },
  board: { color: 0xb8976b, metalness: 0, roughness: 0.85 },
  carbon: { color: 0x25282d, metalness: 0.25, roughness: 0.32 },
  glassfibre: { color: 0xcfd5c6, metalness: 0, roughness: 0.5 },
  foam: { color: 0xdac98c, metalness: 0, roughness: 0.92 }
}

/** Material families of `cam.kernel` (`MaterialFamily`) to the surface names above. */
const FAMILY_SURFACE: Readonly<Record<string, string>> = {
  "aluminium-wrought": "aluminium", "aluminium-cast": "aluminium", copper: "copper", brass: "brass", bronze: "bronze",
  "steel-low-carbon": "steel", "steel-medium-carbon": "steel", "steel-alloy": "steel", "steel-tool": "steel-tool", "steel-hardened": "steel-tool",
  "stainless-austenitic": "stainless", "stainless-martensitic": "stainless", "stainless-duplex": "stainless",
  "cast-iron-grey": "cast-iron", "cast-iron-ductile": "cast-iron", titanium: "titanium", "nickel-superalloy": "nickel",
  thermoplastic: "plastic", thermoset: "plastic", "wood-soft": "wood", "wood-hard": "wood", "wood-board": "board",
  "composite-carbon": "carbon", "composite-glass": "glassfibre", foam: "foam"
}

/** Names and trade names a user or the assistant writes in the element's `material` field, in match order. */
const NAME_SURFACE: ReadonlyArray<readonly [RegExp, string]> = [
  [/stainless|inox|\b(?:304|316l?|17-?4)\b/i, "stainless"],
  [/tool\s*steel|hardened|\b(?:d2|h13|p20)\b/i, "steel-tool"],
  [/cast\s*iron|ghisa|\bgg[g]?\d+\b/i, "cast-iron"],
  [/steel|acciaio|\bc45\b|\bs235/i, "steel"],
  [/alumin|alluminio|\b(?:6061|7075|5083)\b|ergal|anticorodal/i, "aluminium"],
  [/brass|ottone/i, "brass"],
  [/copper|rame/i, "copper"],
  [/bronze|bronzo/i, "bronze"],
  [/titan/i, "titanium"],
  [/inconel|nickel/i, "nickel"],
  [/acrylic|pmma|plexi/i, "acrylic"],
  [/carbon|cfrp/i, "carbon"],
  [/glass\s*fi|gfrp|fiberglass/i, "glassfibre"],
  [/mdf|plywood|chipboard/i, "board"],
  [/wood|legno|oak|beech|walnut|pine|spruce/i, "wood"],
  [/plastic|plastica|nylon|\bpa\d|pom|delrin|peek|pvc|hdpe|polyeth|abs\b|pla\b|petg|resin|composite/i, "plastic"],
  [/foam|tooling\s*board/i, "foam"]
]

/** The surface of a material by catalogue family (preferred, exact) or by name; `undefined` for "default" and anything unknown. */
export const surfaceFor = (name: unknown, family?: string): SurfaceLook | undefined => {
  if (family !== undefined) {
    const named = FAMILY_SURFACE[family]
    if (named !== undefined) return SURFACES[named]
  }
  if (typeof name !== "string") return undefined
  const text = name.trim()
  if (text === "" || /^(default|other|unknown|none)$/i.test(text)) return undefined
  for (const [pattern, surface] of NAME_SURFACE) if (pattern.test(text)) return SURFACES[surface]
  return undefined
}

/** The material name of an element: `metadata.material` (set by the automation) or the plain `material` field. */
export const elementMaterialName = (element: unknown): string | undefined => {
  if (element === null || typeof element !== "object") return undefined
  const record = element as Record<string, unknown>
  const meta = record["metadata"]
  const fromMeta = meta !== null && typeof meta === "object" ? (meta as Record<string, unknown>)["material"] : undefined
  const value = typeof fromMeta === "string" && fromMeta !== "" ? fromMeta : record["material"]
  return typeof value === "string" && value !== "" ? value : undefined
}

interface LookState {
  readonly original: { readonly metalness: number; readonly roughness: number; readonly color: number }
  readonly surface: SurfaceLook
  /** The element had no colour of its own: the material's colour is used. */
  readonly tint: boolean
}

const STATE = "renderLook"

/** Set (or restore) the material's surface for a tier: `low` keeps exactly what the material was created with. */
const syncMaterial = (material: THREE.MeshStandardMaterial, tier: LookTier): void => {
  const state = material.userData[STATE] as LookState | undefined
  if (state === undefined) return
  const surface = TIERS[tier].materials ? state.surface : undefined
  material.metalness = surface?.metalness ?? state.original.metalness
  material.roughness = surface?.roughness ?? state.original.roughness
  if (state.tint) material.color.setHex(surface?.color ?? state.original.color)
}

const eachStandard = (object: THREE.Object3D, visit: (material: THREE.MeshStandardMaterial) => void): void => {
  const seen = new Set<THREE.Material>()
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      if (material instanceof THREE.MeshStandardMaterial && !seen.has(material)) { seen.add(material); visit(material) }
    }
  })
}

/**
 * Gives the standard materials of a freshly built element object the surface of the element's `material`. Unknown or missing
 * materials keep the values they were created with. The original values are kept on the material, so a change of tier
 * (`syncObjectLook`) restores or re-applies them without rebuilding the scene. `family` is the catalogue family of the
 * material (`cam.kernel.findMaterial(name)?.family`) when the caller knows it; the name is matched otherwise.
 */
export const applyMaterialLook = (object: THREE.Object3D, element: unknown, tier: LookTier, family?: string): void => {
  const name = elementMaterialName(element)
  if (name === undefined) return
  const surface = surfaceFor(name, family)
  if (surface === undefined) return
  const hasColor = Boolean((element as { color?: unknown }).color)
  eachStandard(object, (material) => {
    if (material.userData[STATE] === undefined) {
      material.userData[STATE] = { original: { metalness: material.metalness, roughness: material.roughness, color: material.color.getHex() }, surface, tint: !hasColor } satisfies LookState
    }
    syncMaterial(material, tier)
  })
}

/** Re-applies a tier to every material that `applyMaterialLook` touched below `root`. */
export const syncObjectLook = (root: THREE.Object3D, tier: LookTier): void => eachStandard(root, (material) => syncMaterial(material, tier))

// -- The look of one renderer ------------------------------------------------------------------------------------------

export interface RenderLookOptions {
  readonly legacy: LegacyLights
  /** Called whenever the look changed what the next frame shows (tier switched, lights changed). */
  readonly onChange?: () => void
  readonly tier?: LookTier
}

export interface RenderLook {
  readonly tier: () => LookTier
  readonly setTier: (tier: LookTier) => void
  /** The host's own lighting controls moved: the `low` tier uses them as they are, the others scale the rig by them. */
  readonly setLegacy: (legacy: Partial<Pick<LegacyLights, "ambient" | "hemisphere" | "key">>) => void
  /** Releases the lights and this look's hold on the environment; call before `renderer.dispose()`. */
  readonly dispose: () => void
}

interface EnvironmentEntry { texture: THREE.Texture; blur: number; users: number }
const environments = new WeakMap<THREE.WebGLRenderer, EnvironmentEntry>()

const acquireEnvironment = (renderer: THREE.WebGLRenderer, blur: number): THREE.Texture => {
  const existing = environments.get(renderer)
  if (existing !== undefined && existing.blur === blur) { existing.users += 1; return existing.texture }
  // A different blur (tier change): the filtered texture is rebuilt, the previous one is released with its last user.
  if (existing !== undefined) existing.texture.dispose()
  const generator = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  try {
    const texture = generator.fromScene(room, blur).texture
    environments.set(renderer, { texture, blur, users: 1 })
    return texture
  } finally {
    room.dispose()
    generator.dispose()
  }
}

const releaseEnvironment = (renderer: THREE.WebGLRenderer): void => {
  const entry = environments.get(renderer)
  if (entry === undefined) return
  entry.users -= 1
  if (entry.users <= 0) { entry.texture.dispose(); environments.delete(renderer) }
}

/**
 * Lights, environment and tone mapping of one renderer + scene. The rig follows whichever camera renders the scene: it is
 * re-aimed in `scene.onBeforeRender`, so every frame (live, four-view panes, the assistant's synchronous capture) is lit
 * consistently without the host touching its render calls.
 */
export const createRenderLook = (renderer: THREE.WebGLRenderer, scene: THREE.Scene, options: RenderLookOptions): RenderLook => {
  const base = options.legacy
  let legacy: LegacyLights = options.legacy
  let tier: LookTier = options.tier ?? DEFAULT_LOOK_TIER
  let holdsEnvironment = false
  let environmentBlur = -1

  const ambient = new THREE.AmbientLight(0xffffff, 0)
  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x334155, 0)
  const key = new THREE.DirectionalLight(0xffffff, 0)
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0)
  const rim = new THREE.DirectionalLight(0xfff4e6, 0)
  const rig = new THREE.Group()
  rig.name = "render-look"
  rig.add(ambient, hemisphere, key, fill, rim)
  scene.add(rig)

  const apply = (): void => {
    const settings = TIERS[tier]
    const levels = rigLevels(tier, legacy, base)
    ambient.intensity = levels?.ambient ?? legacy.ambient
    hemisphere.intensity = levels?.hemisphere ?? legacy.hemisphere
    key.intensity = levels?.key ?? legacy.key
    fill.intensity = levels?.fill ?? 0
    rim.intensity = levels?.rim ?? 0
    fill.visible = rim.visible = levels !== undefined
    hemisphere.visible = hemisphere.intensity > 0
    if (levels === undefined) key.position.set(...legacy.keyPosition)
    renderer.toneMapping = settings.toneMapping
    renderer.toneMappingExposure = settings.exposure
    renderer.outputColorSpace = THREE.SRGBColorSpace
    if (settings.environment) {
      if (!holdsEnvironment || environmentBlur !== settings.environmentBlur) {
        if (holdsEnvironment) releaseEnvironment(renderer)
        scene.environment = acquireEnvironment(renderer, settings.environmentBlur)
        holdsEnvironment = true
        environmentBlur = settings.environmentBlur
      }
      // The room is built Y-up; the scene is Z-up.
      scene.environmentRotation.set(Math.PI / 2, 0, 0)
      scene.environmentIntensity = settings.environmentIntensity
    } else {
      if (holdsEnvironment) { releaseEnvironment(renderer); holdsEnvironment = false; environmentBlur = -1 }
      scene.environment = null
    }
    syncObjectLook(scene, tier)
    options.onChange?.()
  }

  const previous = scene.onBeforeRender
  scene.onBeforeRender = (r, s, camera, target) => {
    previous.call(scene, r, s, camera, target)
    if (TIERS[tier].rig === undefined) { rig.updateMatrixWorld(true); return }
    camera.updateMatrixWorld()
    const directions = rigDirections(cameraBasis(camera.matrixWorld.elements))
    key.position.set(...directions.key)
    fill.position.set(...directions.fill)
    rim.position.set(...directions.rim)
    rig.updateMatrixWorld(true)
  }

  apply()
  return {
    tier: () => tier,
    setTier: (next) => { if (next !== tier) { tier = next; apply() } },
    setLegacy: (levels) => { legacy = { ...legacy, ...levels }; apply() },
    dispose: () => {
      scene.onBeforeRender = previous
      scene.remove(rig)
      for (const light of [ambient, hemisphere, key, fill, rim]) light.dispose()
      if (holdsEnvironment) { releaseEnvironment(renderer); holdsEnvironment = false }
      scene.environment = null
    }
  }
}
