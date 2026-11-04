/**
 * Axis triads as Three.js objects: three arrows with `X+ / Y+ / Z+` labels. The machine scene draws the machine's own axes with
 * it (plus the rotary arcs it adds), the probe overlay a work coordinate system before and after a probe moved it (spec 73 §4).
 * The arrows are named `axis:<name>` and the labels `label:<text>`, so a test reads the triad without WebGL.
 */
import * as THREE from "three"
import { cam, type Vec3 } from "@cadcamfun/core"

export interface TriadAxis {
  readonly name: string
  readonly direction: Vec3
  readonly color: number
  readonly label: string
}

/** A label that always faces the camera; without a DOM (tests) it is a plain coloured sprite. */
export const labelSprite = (text: string, color: number, size: number): THREE.Sprite => {
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : undefined
  const context = canvas?.getContext("2d") ?? null
  let map: THREE.Texture | null = null
  if (canvas && context) {
    canvas.width = 128; canvas.height = 64
    context.font = "bold 40px sans-serif"; context.textAlign = "center"; context.textBaseline = "middle"
    context.fillStyle = `#${color.toString(16).padStart(6, "0")}`; context.fillText(text, 64, 32)
    map = new THREE.CanvasTexture(canvas)
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ ...(map ? { map } : { color }), transparent: true, depthTest: false }))
  sprite.scale.set(size * 2, size, 1)
  sprite.renderOrder = 30
  sprite.name = `label:${text}`
  return sprite
}

/** Arrows of `length` along each axis, each with its `label+` past the tip. */
export const triad = (axes: ReadonlyArray<TriadAxis>, length: number, name: string, options: { readonly opacity?: number } = {}): THREE.Group => {
  const group = new THREE.Group()
  group.name = name
  for (const axis of axes) {
    const dir = new THREE.Vector3(axis.direction.x, axis.direction.y, axis.direction.z).normalize()
    const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(), length, axis.color, length * 0.18, length * 0.09)
    arrow.name = `axis:${axis.name}`
    if (options.opacity !== undefined && options.opacity < 1) {
      for (const child of [arrow.line, arrow.cone]) {
        const material = child.material as THREE.Material
        material.transparent = true
        material.opacity = options.opacity
      }
    }
    group.add(arrow)
    const label = labelSprite(`${axis.label}+`, axis.color, length * 0.22)
    label.position.copy(dir.clone().multiplyScalar(length * 1.18))
    group.add(label)
  }
  return group
}

/** The right-handed X/Y/Z of a frame whose X and Y axes are given (Z = X × Y), in the usual axis colours. */
export const frameAxes = (x: Vec3 = { x: 1, y: 0, z: 0 }, y: Vec3 = { x: 0, y: 1, z: 0 }): ReadonlyArray<TriadAxis> => {
  const z = { x: x.y * y.z - x.z * y.y, y: x.z * y.x - x.x * y.z, z: x.x * y.y - x.y * y.x }
  const colors = cam.viewer.AXIS_COLORS
  return [
    { name: "X", direction: x, color: colors.X, label: "X" },
    { name: "Y", direction: y, color: colors.Y, label: "Y" },
    { name: "Z", direction: z, color: colors.Z, label: "Z" }
  ]
}
