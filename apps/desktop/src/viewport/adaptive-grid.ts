/**
 * The ground grid both 3D views share: one large quad whose fragment shader draws three decades of lines (`grid-lod.ts`) at a
 * constant one-pixel width, fades them out with the distance from what the camera looks at, and marks the two axes of its
 * plane in the usual colours (X red, Y green, Z blue). Nothing here is geometry per line, so it is as cheap at 10 000 lines
 * as at ten, and unlike a fixed `GridHelper` it never turns into a grey wash when zoomed out or into empty space when zoomed in.
 *
 * It sets its own uniforms in `onBeforeRender`, so the host only has to add it to the scene and redraw when the camera moves.
 */
import * as THREE from "three"
import { gridLevels, gridReach, orthographicSpan, perspectiveSpan } from "./grid-lod.ts"

export type GridPlane = "xy" | "xz"

export interface AdaptiveGridOptions {
  /** The point the grid is centred on and fades away from, in world space; the camera's target. */
  readonly focus: () => THREE.Vector3
  readonly plane?: GridPlane
  /** Half the side of the quad. Beyond the camera's far plane it is never seen. */
  readonly half?: number
  /** Draw before and never write depth, so toolpaths below the plane stay visible (the CAM view). */
  readonly underlay?: boolean
  /** Told the spacing of the lines the eye reads (the `mid` decade, the one drawn at full strength) whenever it changes. */
  readonly onSpacing?: (step: number) => void
}

export interface AdaptiveGrid {
  readonly object: THREE.Mesh
  readonly setPlane: (plane: GridPlane) => void
  readonly setOpacity: (opacity: number) => void
  readonly dispose: () => void
}

export const GRID_COLORS = { line: 0xaab4c3, axisX: 0xe5484d, axisY: 0x30a46c, axisZ: 0x3b82f6 } as const

const VERTEX = /* glsl */ `
varying vec2 vPlane;
varying vec3 vWorld;
void main() {
  vPlane = position.xy;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const FRAGMENT = /* glsl */ `
uniform vec3 uLine;
uniform vec3 uAxisA;
uniform vec3 uAxisB;
uniform vec3 uSteps;
uniform float uMinorAlpha;
uniform vec2 uFocus;
uniform float uReach;
uniform float uOpacity;
uniform float uFar;
varying vec2 vPlane;
varying vec3 vWorld;

float lines(vec2 p, float step) {
  vec2 q = p / step;
  vec2 w = max(fwidth(q), vec2(1e-6));
  vec2 g = abs(fract(q - 0.5) - 0.5) / w;
  float line = 1.0 - min(min(g.x, g.y), 1.0);
  // Lines closer than a few pixels merge into a tint: drop them instead.
  return line * (1.0 - smoothstep(0.2, 0.5, max(w.x, w.y)));
}

float axis(float coordinate) {
  return 1.0 - min(abs(coordinate) / max(fwidth(coordinate), 1e-6) * 0.5, 1.0);
}

void main() {
  // Fades out before the camera's far plane cuts it: a grid that ends in a hard line is worse than one that dissolves.
  float fade = (1.0 - smoothstep(uReach * 0.5, uReach, length(vPlane - uFocus))) * (1.0 - smoothstep(uFar * 0.55, uFar * 0.92, distance(vWorld, cameraPosition)));
  float grid = max(max(lines(vPlane, uSteps.x) * 0.14 * uMinorAlpha, lines(vPlane, uSteps.y) * 0.3), lines(vPlane, uSteps.z) * 0.5);
  float alongA = axis(vPlane.y), alongB = axis(vPlane.x);
  float alpha = max(grid, max(alongA, alongB) * 0.95) * fade * uOpacity;
  if (alpha < 0.004) discard;
  vec3 color = alongA > 0.01 && alongA >= alongB ? uAxisA : alongB > 0.01 ? uAxisB : uLine;
  gl_FragColor = vec4(color, alpha);
}`

const AXES: Record<GridPlane, readonly [number, number]> = {
  xy: [GRID_COLORS.axisX, GRID_COLORS.axisY],
  xz: [GRID_COLORS.axisX, GRID_COLORS.axisZ]
}

export const createAdaptiveGrid = (options: AdaptiveGridOptions): AdaptiveGrid => {
  const half = options.half ?? 50000
  const uniforms = {
    uLine: { value: new THREE.Color(GRID_COLORS.line) },
    uAxisA: { value: new THREE.Color() },
    uAxisB: { value: new THREE.Color() },
    uSteps: { value: new THREE.Vector3(1, 10, 100) },
    uMinorAlpha: { value: 1 },
    uFocus: { value: new THREE.Vector2() },
    uReach: { value: 100 },
    uFar: { value: 1e9 },
    uOpacity: { value: 1 }
  }
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    // Pushed back a little so a face lying in the plane (a stock top at Z0) is drawn over the grid, not through it.
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  })
  const object = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), material)
  object.frustumCulled = false
  object.renderOrder = options.underlay === true ? -1 : 0
  object.userData.isGrid = true
  // A flat quad in the ground plane would be read by the ambient occlusion as a floor and darken every part standing in it.
  object.userData.noAO = true
  object.raycast = () => undefined
  const focus = new THREE.Vector3(), local = new THREE.Vector3()
  let reported = 0

  const setPlane = (plane: GridPlane): void => {
    object.rotation.x = plane === "xz" ? Math.PI / 2 : 0
    uniforms.uAxisA.value.set(AXES[plane][0])
    uniforms.uAxisB.value.set(AXES[plane][1])
    object.updateMatrixWorld(true)
  }
  setPlane(options.plane ?? "xy")

  object.onBeforeRender = (_renderer, _scene, camera) => {
    focus.copy(options.focus())
    const span = camera instanceof THREE.OrthographicCamera
      ? orthographicSpan(camera.right - camera.left, camera.top - camera.bottom, camera.zoom)
      : perspectiveSpan(camera.position.distanceTo(focus), (camera as THREE.PerspectiveCamera).fov, (camera as THREE.PerspectiveCamera).aspect)
    const levels = gridLevels(span)
    uniforms.uSteps.value.set(levels.minor, levels.mid, levels.major)
    uniforms.uMinorAlpha.value = levels.minorAlpha
    if (levels.mid !== reported) { reported = levels.mid; options.onSpacing?.(levels.mid) }
    uniforms.uReach.value = gridReach(span)
    uniforms.uFar.value = camera instanceof THREE.OrthographicCamera ? 1e9 : (camera as THREE.PerspectiveCamera).far
    local.copy(focus)
    object.worldToLocal(local)
    uniforms.uFocus.value.set(local.x, local.y)
  }

  return {
    object,
    setPlane,
    setOpacity: (opacity) => { uniforms.uOpacity.value = opacity },
    dispose: () => { object.geometry.dispose(); material.dispose() }
  }
}
