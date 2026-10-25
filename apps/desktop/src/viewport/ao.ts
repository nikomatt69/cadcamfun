import * as THREE from "three"
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js"
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js"
import { GTAOBlendShader } from "three/examples/jsm/shaders/GTAOShader.js"
import type { LineQuality } from "./lines.ts"

/**
 * Ambient occlusion for a scene that has stopped moving.
 *
 * The viewport is demand-driven (`FrameScheduler`): a frame is drawn when something changed and the loop ends when it settles. This
 * keeps that. Nothing runs while the camera moves or the scene changes; `arm()` is called after every normal frame and, once the
 * scene has been quiet for `delayMs`, ONE extra frame is drawn: the scene again through the normal path, then a GTAO pass
 * (depth + normals of the solids, AO, denoise) multiplied onto the canvas. The next normal frame simply replaces it.
 *
 * Multiplying onto the canvas, rather than moving the whole viewport onto an `EffectComposer`, leaves the renderer's own tone
 * mapping, colour space and MSAA exactly as the look settings define them, and keeps every normal frame as cheap as it was.
 * Off on `low`; at `standard` it runs at half resolution (the result is blurred by the denoise anyway), at `high` at full resolution.
 */

export interface AmbientOcclusionOptions {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  /** Draws the scene the normal way onto the canvas (the AO is multiplied on top of it in the same task). */
  readonly render: () => void
  readonly quality: () => LineQuality
  /** True while a normal frame is pending or the scene changed; the idle frame is then skipped. */
  readonly busy?: () => boolean
  /** Objects that must not occlude (gizmos, helpers). Lines, points, sprites, outlines and ghost-transparent meshes never do. */
  readonly exclude?: (object: THREE.Object3D) => boolean
  /** The radius of the occlusion in world units, read at each idle frame (a fraction of the scene's size). */
  readonly radius?: () => number
  readonly delayMs?: number
  /** Replaceable for tests. */
  readonly setTimer?: (callback: () => void, ms: number) => unknown
  readonly clearTimer?: (handle: unknown) => void
}

/** Fires `fire` once, `delayMs` after the last `arm`. */
export class IdleTrigger {
  private handle: unknown
  private armed = false
  constructor(
    private readonly fire: () => void,
    private readonly delayMs: number,
    private readonly setTimer: (callback: () => void, ms: number) => unknown = (callback, ms) => setTimeout(callback, ms),
    private readonly clearTimer: (handle: unknown) => void = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
  ) {}
  get pending(): boolean { return this.armed }
  arm(): void {
    this.cancel()
    this.armed = true
    this.handle = this.setTimer(() => { this.armed = false; this.handle = undefined; this.fire() }, this.delayMs)
  }
  cancel(): void {
    if (this.handle !== undefined) this.clearTimer(this.handle)
    this.handle = undefined
    this.armed = false
  }
}

/** What the tier gets: `scale` of the canvas resolution, GTAO `samples`, blend `intensity`. `low` has no AO. */
export const AO_TIERS: Readonly<Record<LineQuality, { readonly scale: number; readonly samples: number; readonly intensity: number } | undefined>> = {
  low: undefined,
  standard: { scale: 0.5, samples: 12, intensity: 0.85 },
  high: { scale: 1, samples: 16, intensity: 0.9 }
}

/** The default occlusion radius for a scene of this size: a few percent of its diagonal, never degenerate. */
export const aoRadiusFor = (box: THREE.Box3): number => {
  if (box.isEmpty()) return 1
  return Math.max(box.getSize(new THREE.Vector3()).length() * 0.04, 1e-3)
}

const isGhost = (object: THREE.Object3D): boolean => {
  const material = (object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
  const list = Array.isArray(material) ? material : material ? [material] : []
  return list.length > 0 && list.every((entry) => entry.transparent && entry.opacity < 0.95)
}

/** Whether an object is left out of the AO's depth/normal pass. */
export const leavesOutAo = (object: THREE.Object3D, exclude?: (object: THREE.Object3D) => boolean): boolean => {
  const flags = object as { isLine?: boolean; isLineSegments2?: boolean; isPoints?: boolean; isSprite?: boolean }
  return flags.isLine === true || flags.isLineSegments2 === true || flags.isPoints === true || flags.isSprite === true ||
    object.userData.isOutline === true || object.userData.noAO === true || isGhost(object) || exclude?.(object) === true
}

export class IdleAmbientOcclusion {
  private readonly trigger: IdleTrigger
  private pass: GTAOPass | undefined
  private quad: FullScreenQuad | undefined
  private blend: THREE.ShaderMaterial | undefined
  private failed = false
  private disposed = false
  private lastSamples = 0
  /** How many idle AO frames were drawn (tests, diagnostics). */
  frames = 0

  constructor(private readonly options: AmbientOcclusionOptions) {
    this.trigger = new IdleTrigger(() => this.idle(), options.delayMs ?? 250, options.setTimer, options.clearTimer)
  }

  /** Whether this tier and this machine take part at all. */
  get enabled(): boolean { return !this.failed && !this.disposed && AO_TIERS[this.options.quality()] !== undefined }

  /** Called after every normal frame: restarts the quiet period. */
  arm(): void {
    if (!this.enabled) { this.trigger.cancel(); return }
    this.trigger.arm()
  }

  cancel(): void { this.trigger.cancel() }

  private idle(): void {
    if (!this.enabled || this.options.busy?.() === true) return
    try { this.draw() } catch (error) {
      // A GPU without float targets, a lost context: AO is a refinement, the picture without it is complete.
      this.failed = true
      console.warn("Ambient occlusion disabled", error)
      try { this.options.render() } catch { /* the normal path reports its own failures */ }
    }
  }

  /** Draws the idle frame now (the scene, then the occlusion over it). Exposed for the harness and tests. */
  draw(): boolean {
    const tier = AO_TIERS[this.options.quality()]
    if (!tier || this.disposed) return false
    const { renderer, scene, camera } = this.options
    const size = renderer.getDrawingBufferSize(new THREE.Vector2())
    const width = Math.max(1, Math.round(size.x * tier.scale)), height = Math.max(1, Math.round(size.y * tier.scale))
    if (!this.pass) {
      this.pass = new GTAOPass(scene, camera, width, height)
      this.pass.output = GTAOPass.OUTPUT.Off
      this.blend = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(GTAOBlendShader.uniforms),
        vertexShader: GTAOBlendShader.vertexShader,
        fragmentShader: GTAOBlendShader.fragmentShader,
        transparent: true, depthTest: false, depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor, blendEquation: THREE.AddEquation,
        blendSrcAlpha: THREE.DstAlphaFactor, blendDstAlpha: THREE.ZeroFactor, blendEquationAlpha: THREE.AddEquation
      })
      this.quad = new FullScreenQuad(this.blend)
    }
    const pass = this.pass
    if (pass.width !== width || pass.height !== height) pass.setSize(width, height)
    // The shader's defaults are for a scene of about one unit: radius, assumed occluder thickness and fall-off follow the scene size.
    const radius = Math.max(this.options.radius?.() ?? 1, 1e-6)
    pass.updateGtaoMaterial({ radius, thickness: radius * 3, ...(tier.samples !== this.lastSamples ? { samples: tier.samples } : {}) })
    this.lastSamples = tier.samples

    // 1. the picture itself, so the occlusion lands on the same pixels (the canvas does not keep the frame drawn before).
    this.options.render()

    // 2. depth and normals of what occludes: lines, outlines, ghosts and helpers are hidden for this pass only.
    const hidden: THREE.Object3D[] = []
    scene.traverse((object) => { if (object.visible && leavesOutAo(object, this.options.exclude)) { object.visible = false; hidden.push(object) } })
    const background = scene.background
    scene.background = null
    const clearing = renderer.autoClear
    try { pass.render(renderer, null as never, null as never, 0, false) } finally {
      for (const object of hidden) object.visible = true
      scene.background = background
      renderer.autoClear = clearing
    }

    // 3. multiply the denoised occlusion onto the canvas.
    const blend = this.blend!
    blend.uniforms.tDiffuse!.value = pass.gtaoMap
    blend.uniforms.intensity!.value = tier.intensity
    renderer.setRenderTarget(null)
    renderer.autoClear = false
    try { this.quad!.render(renderer) } finally { renderer.autoClear = clearing }
    this.frames++
    return true
  }

  dispose(): void {
    this.disposed = true
    this.trigger.cancel()
    this.pass?.dispose()
    this.blend?.dispose()
    this.quad?.dispose()
    this.pass = undefined; this.blend = undefined; this.quad = undefined
  }
}
