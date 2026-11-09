import * as THREE from "three"

/**
 * Surface analysis overlays of the CAD canvas (Fusion 360 Inspect > Draft Analysis / Zebra Analysis; hyperMILL's draft and
 * undercut check before choosing a setup).
 *
 * - `draft`: every face is coloured by its draft angle against a pull direction: the angle between the surface and the pull
 *   direction (90° for a face that looks along the pull, 0° for a wall parallel to it, negative for an undercut). Faces at or
 *   above the minimum draft are green (they release / a tool along the pull reaches them), faces within ± the minimum are yellow
 *   (vertical: no draft), faces below minus the minimum are red (undercut: hidden from the pull direction). A summary gives the
 *   area in each class, measured on the drawn triangles in world space.
 * - `zebra`: reflected stripes of an infinite striped environment along the pull axis; a kink in the stripes shows a tangency
 *   break, a jump shows a gap, the way a continuity check reads them.
 *
 * Presentation only, and without touching the parts: the overlay is a separate mesh per drawn face that shares the face's
 * geometry, draws over it (polygon offset) with one shader, follows its world matrix at render time and collapses while the part
 * is hidden. Exports, picking and the visual styles never see it (`userData.isAnalysisOverlay`, no raycast).
 */

export const ANALYSIS_MODES = ["off", "draft", "zebra"] as const
export type AnalysisMode = (typeof ANALYSIS_MODES)[number]
export const PULL_DIRECTIONS = ["+z", "-z", "+x", "-x", "+y", "-y"] as const
export type PullDirection = (typeof PULL_DIRECTIONS)[number]

export interface AnalysisState {
  readonly mode: AnalysisMode
  /** The pull (draft) or stripe (zebra) axis, in world coordinates. */
  readonly pull: PullDirection
  /** Minimum draft angle in degrees (draft): faces within ± this are "vertical". */
  readonly angleDeg: number
  /** Stripes over a half turn (zebra). */
  readonly stripes: number
}

export const DEFAULT_ANALYSIS: AnalysisState = { mode: "off", pull: "+z", angleDeg: 1, stripes: 12 }

export const isAnalysisMode = (value: unknown): value is AnalysisMode => typeof value === "string" && (ANALYSIS_MODES as readonly string[]).includes(value)
export const isPullDirection = (value: unknown): value is PullDirection => typeof value === "string" && (PULL_DIRECTIONS as readonly string[]).includes(value)

/** The bounds a state is kept in: a minimum draft of 0..45°, 2..64 stripes. */
export const clampAnalysis = (state: AnalysisState): AnalysisState => ({
  mode: isAnalysisMode(state.mode) ? state.mode : "off",
  pull: isPullDirection(state.pull) ? state.pull : "+z",
  angleDeg: Number.isFinite(state.angleDeg) ? Math.max(0, Math.min(45, state.angleDeg)) : DEFAULT_ANALYSIS.angleDeg,
  stripes: Number.isFinite(state.stripes) ? Math.max(2, Math.min(64, Math.round(state.stripes))) : DEFAULT_ANALYSIS.stripes
})

export const pullVector = (pull: PullDirection): THREE.Vector3 => {
  const sign = pull[0] === "-" ? -1 : 1
  const axis = pull[1]
  return new THREE.Vector3(axis === "x" ? sign : 0, axis === "y" ? sign : 0, axis === "z" ? sign : 0)
}

/** Draft angle in degrees of a surface with outward unit normal `normal` against `pull`: 90 facing the pull, 0 parallel, < 0 undercut. */
export const draftAngleDeg = (normal: THREE.Vector3, pull: THREE.Vector3): number =>
  (Math.asin(Math.max(-1, Math.min(1, normal.dot(pull) / Math.max(normal.length() * pull.length(), 1e-300)))) * 180) / Math.PI

export type DraftClass = "positive" | "vertical" | "negative"

/** The class of a draft angle against the minimum draft (`threshold`, degrees). The boundaries count as having the draft. */
export const draftClass = (angleDeg: number, thresholdDeg: number): DraftClass =>
  angleDeg >= thresholdDeg ? "positive" : angleDeg <= -thresholdDeg ? "negative" : "vertical"

export const DRAFT_COLORS: Readonly<Record<DraftClass, number>> = { positive: 0x2e9d4f, vertical: 0xf2c230, negative: 0xd84343 }

export interface DraftSummary {
  /** Area (scene units², i.e. mm²) of the drawn faces in each class. */
  readonly positive: number
  readonly vertical: number
  readonly negative: number
  readonly total: number
}

const isFaceMesh = (object: THREE.Object3D): object is THREE.Mesh => {
  const flags = object as { isMesh?: boolean; isLine?: boolean; isLineSegments?: boolean; isLineSegments2?: boolean; isPoints?: boolean }
  if (flags.isMesh !== true || flags.isLineSegments2 === true || flags.isLine === true || flags.isLineSegments === true || flags.isPoints === true) return false
  const data = object.userData
  return data.isControlPoint !== true && data.isOutline !== true && data.isSectionCap !== true && data.isAnalysisOverlay !== true && data.isSubHighlight !== true
    && data.isInvalidMarker !== true && object.name !== "edges"
}

/** True when `object` and every ancestor are visible (an element hidden by its layer, the browser or the LOD is not analysed). */
const shown = (object: THREE.Object3D): boolean => {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) if (!current.visible) return false
  return true
}

/** Area of the faces of `roots` in each draft class, from the triangles' geometric normals in world space (winding = outward). */
export const draftSummary = (roots: ReadonlyArray<THREE.Object3D>, pull: PullDirection, thresholdDeg: number): DraftSummary => {
  const out = { positive: 0, vertical: 0, negative: 0, total: 0 }
  const direction = pullVector(pull)
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3()
  for (const root of roots) {
    root.updateWorldMatrix(true, true)
    root.traverse((object) => {
      if (!isFaceMesh(object) || !shown(object)) return
      const geometry = object.geometry as THREE.BufferGeometry
      const position = geometry.getAttribute("position") as THREE.BufferAttribute | undefined
      if (position === undefined) return
      const index = geometry.getIndex()
      const count = index === null ? position.count : index.count
      const matrix = object.matrixWorld
      for (let k = 0; k + 2 < count; k += 3) {
        const ia = index === null ? k : index.getX(k), ib = index === null ? k + 1 : index.getX(k + 1), ic = index === null ? k + 2 : index.getX(k + 2)
        a.fromBufferAttribute(position, ia).applyMatrix4(matrix)
        b.fromBufferAttribute(position, ib).applyMatrix4(matrix)
        c.fromBufferAttribute(position, ic).applyMatrix4(matrix)
        n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a))
        const area = n.length() / 2
        if (!(area > 0)) continue
        out[draftClass(draftAngleDeg(n, direction), thresholdDeg)] += area
        out.total += area
      }
    })
  }
  return out
}

const VERTEX = /* glsl */ `
#include <common>
#include <clipping_planes_pars_vertex>
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}
`

const FRAGMENT = /* glsl */ `
#include <common>
#include <clipping_planes_pars_fragment>
uniform int uMode;
uniform vec3 uPull;
uniform float uThreshold;
uniform float uStripes;
uniform vec3 uPositive;
uniform vec3 uVertical;
uniform vec3 uNegative;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
void main() {
  #include <clipping_planes_fragment>
  vec3 n = normalize(vWorldNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 view = normalize(vWorldPosition - cameraPosition);
  float light = 0.55 + 0.45 * max(dot(n, -view), 0.0);
  vec3 color;
  if (uMode == 1) {
    float angle = degrees(asin(clamp(dot(n, uPull), -1.0, 1.0)));
    color = angle >= uThreshold ? uPositive : (angle <= -uThreshold ? uNegative : uVertical);
    color *= light;
  } else {
    vec3 r = reflect(view, n);
    float s = acos(clamp(dot(r, uPull), -1.0, 1.0)) / PI * uStripes;
    float w = max(fwidth(s), 1e-4);
    float band = smoothstep(0.5 - w, 0.5 + w, abs(fract(s) - 0.5) * 2.0);
    color = mix(vec3(0.06), vec3(0.97), band);
  }
  gl_FragColor = vec4(color, 1.0);
}
`

/** One material for every overlay of a state; its uniforms follow `updateAnalysisMaterial`. */
export const createAnalysisMaterial = (state: AnalysisState): THREE.ShaderMaterial => {
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uMode: { value: 1 }, uPull: { value: new THREE.Vector3(0, 0, 1) }, uThreshold: { value: 1 }, uStripes: { value: 12 },
      uPositive: { value: new THREE.Color(DRAFT_COLORS.positive) }, uVertical: { value: new THREE.Color(DRAFT_COLORS.vertical) }, uNegative: { value: new THREE.Color(DRAFT_COLORS.negative) }
    },
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    clipping: true
  })
  material.userData.isAnalysisMaterial = true
  updateAnalysisMaterial(material, state)
  return material
}

export const updateAnalysisMaterial = (material: THREE.ShaderMaterial, state: AnalysisState): void => {
  const s = clampAnalysis(state)
  material.uniforms.uMode!.value = s.mode === "zebra" ? 2 : 1
  ;(material.uniforms.uPull!.value as THREE.Vector3).copy(pullVector(s.pull))
  material.uniforms.uThreshold!.value = s.angleDeg
  material.uniforms.uStripes!.value = s.stripes
}

const COLLAPSED = new THREE.Matrix4().makeScale(0, 0, 0)

/**
 * The overlay of the drawn elements `roots`: one mesh per face mesh, sharing its geometry and `material`. Each overlay copies its
 * face's world matrix just before it is drawn (so a part being dragged keeps its overlay) and collapses while the face is hidden.
 */
export const buildAnalysisOverlay = (roots: ReadonlyArray<THREE.Object3D>, material: THREE.Material): THREE.Group => {
  const group = new THREE.Group()
  group.userData.isAnalysisOverlay = true
  for (const root of roots) {
    root.updateWorldMatrix(true, true)
    root.traverse((object) => {
      if (!isFaceMesh(object)) return
      const overlay = new THREE.Mesh(object.geometry, material)
      overlay.matrixAutoUpdate = false
      overlay.matrixWorldAutoUpdate = false
      overlay.matrixWorld.copy(object.matrixWorld)
      overlay.renderOrder = object.renderOrder + 1
      overlay.frustumCulled = false
      overlay.raycast = () => undefined
      overlay.userData.isAnalysisOverlay = true
      overlay.userData.source = object
      overlay.onBeforeRender = () => { overlay.matrixWorld.copy(shown(object) ? object.matrixWorld : COLLAPSED) }
      group.add(overlay)
    })
  }
  return group
}

/** Removes an overlay from the scene. The geometry belongs to the parts and the material to the caller, so nothing else is freed. */
export const removeAnalysisOverlay = (group: THREE.Object3D | undefined): void => {
  if (group === undefined) return
  group.removeFromParent()
  group.clear()
}
