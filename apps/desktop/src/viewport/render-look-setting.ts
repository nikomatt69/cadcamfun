/**
 * The one viewport-quality setting every 3D view follows (`low` / `standard` / `high`, see `render-look.ts`). It is a signal,
 * so a change reaches every open viewport and preview at once, and it is kept in `localStorage` like the other viewport
 * choices (a blocked storage only means the choice lasts until the window closes).
 */
import { createEffect, createSignal } from "solid-js"
import type * as THREE from "three"
import { DEFAULT_LOOK_TIER, createRenderLook, resolveLookTier, type LegacyLights, type LookTier, type RenderLook } from "./render-look.ts"

export const LOOK_TIER_KEY = "viewport.lookTier"

const read = (): LookTier => {
  try { return resolveLookTier(globalThis.localStorage?.getItem(LOOK_TIER_KEY)) } catch { return DEFAULT_LOOK_TIER }
}

const [tier, setTier] = createSignal<LookTier>(read())

/** The tier every viewport renders with. */
export const lookTier = tier

/** Sets and stores the tier; an unknown value is ignored. */
export const setLookTier = (value: unknown): void => {
  const next = resolveLookTier(value, tier())
  setTier(next)
  try { globalThis.localStorage?.setItem(LOOK_TIER_KEY, next) } catch { /* storage blocked: the choice lasts for the session */ }
}

/**
 * The look of a viewport on the shared tier: create it in the viewport's mount, call `dispose()` before `renderer.dispose()`.
 * `onChange` asks the host for a new frame when the tier or the lights changed.
 */
export const attachRenderLook = (renderer: THREE.WebGLRenderer, scene: THREE.Scene, legacy: LegacyLights, onChange?: () => void): RenderLook => {
  const look = createRenderLook(renderer, scene, { legacy, tier: tier(), ...(onChange ? { onChange } : {}) })
  createEffect(() => look.setTier(tier()))
  return look
}
