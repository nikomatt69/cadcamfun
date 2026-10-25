/**
 * The one look of every read-only 3D preview on the resource detail pages (component, tool, material, toolpath): the same
 * background, light rig and framing, so the same part reads the same wherever it is opened.
 */
import * as THREE from "three"
import { attachRenderLook } from "../../../viewport/render-look-setting.ts"
import type { RenderLook } from "../../../viewport/render-look.ts"

export const PREVIEW_BACKGROUND = 0x1b232c

/** Ambient + sky/ground + key light: neutral enough for any part colour, strong enough to show form on the dark stage. */
export const addPreviewLights = (scene: THREE.Scene, key: THREE.Vector3Like = { x: 5, y: 10, z: 7.5 }): void => {
  scene.add(new THREE.AmbientLight(0xffffff, 0.45), new THREE.HemisphereLight(0xffffff, 0x334155, 0.7))
  const light = new THREE.DirectionalLight(0xffffff, 1.1)
  light.position.set(key.x, key.y, key.z)
  scene.add(light)
}

/**
 * The same lights on the shared viewport look (studio environment, tone mapping, camera-following rig, one quality setting).
 * The `low` tier is exactly `addPreviewLights`. Call `dispose()` before `renderer.dispose()`; `onChange` asks for a new frame.
 */
export const addPreviewLook = (renderer: THREE.WebGLRenderer, scene: THREE.Scene, key: THREE.Vector3Like = { x: 5, y: 10, z: 7.5 }, onChange?: () => void): RenderLook =>
  attachRenderLook(renderer, scene, { ambient: 0.45, hemisphere: 0.7, key: 1.1, keyPosition: [key.x, key.y, key.z] }, onChange)

/** A valid `#rgb` / `#rrggbb` colour, else the fallback. */
export const hexColor = (value: unknown, fallback = "#cccccc"): string =>
  typeof value === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim()) ? value.trim() : fallback
