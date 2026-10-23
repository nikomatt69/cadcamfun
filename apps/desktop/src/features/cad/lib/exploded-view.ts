import * as THREE from "three"

export type ExplodeAxis = "auto" | "x" | "y" | "z"
export interface ExplodedViewState {
  readonly enabled: boolean
  readonly amount: number
  readonly axis: ExplodeAxis
}
export const DEFAULT_EXPLODED_VIEW: ExplodedViewState = { enabled: false, amount: 1, axis: "auto" }
export const isExplodeAxis = (value: string): value is ExplodeAxis => ["auto", "x", "y", "z"].includes(value)

interface Part {
  readonly object: THREE.Object3D
  readonly position: THREE.Vector3
  readonly offset: THREE.Vector3
}

/** Presentation only: no element/store mutation and no geometry or material ownership. */
export class ExplodedView {
  private parts: Part[] = []
  private current = 0
  private target = 0
  private lastTime: number | undefined

  get count(): number { return this.parts.length }
  get active(): boolean { return this.current !== 0 || this.target !== 0 }

  /** Temporarily expose the assembled pose, for example while cloning an export. */
  restore(): void {
    for (const part of this.parts) {
      part.object.position.copy(part.position)
      part.object.updateMatrix()
    }
    for (const part of this.parts) part.object.updateWorldMatrix(true, false)
  }

  /** Forget old poses before the canvas updates placements or replaces geometry. */
  release(): void { this.restore(); this.parts = [] }

  configure(roots: readonly THREE.Object3D[], axis: ExplodeAxis): void {
    this.restore()
    const objects: THREE.Object3D[] = []
    const visit = (object: THREE.Object3D): void => {
      if (!object.visible) return
      const children = object.children.filter(child => child.userData.assemblyPart === true)
      if (object.userData.assemblyContainer === true) children.forEach(visit)
      else objects.push(object)
    }
    roots.forEach(visit)
    const bounded = objects.flatMap(object => {
      object.updateWorldMatrix(true, true)
      const bounds = new THREE.Box3().setFromObject(object)
      if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) return []
      return [{ object, bounds, center: bounds.getCenter(new THREE.Vector3()) }]
    })
    const box = new THREE.Box3()
    for (const part of bounded) box.union(part.bounds)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const major = size.x >= size.y && size.x >= size.z ? "x" : size.y >= size.z ? "y" : "z"
    const concentric = bounded.every(part => part.center.distanceTo(center) < Math.max(size.length() * 1e-6, 1e-9))
    const layoutAxis = axis === "auto" && concentric ? major : axis
    const gap = Math.max(size.length() * 0.15, 1)
    const sorted = [...bounded].sort((a, b) => a.center[layoutAxis === "auto" ? major : layoutAxis] - b.center[layoutAxis === "auto" ? major : layoutAxis])
    const ranks = new Map(sorted.map((part, index) => [part.object, index]))
    const axial = new Map<THREE.Object3D, number>()
    if (layoutAxis !== "auto") {
      let cursor = 0
      for (const part of sorted) {
        const length = part.bounds.max[layoutAxis] - part.bounds.min[layoutAxis]
        axial.set(part.object, cursor + length / 2)
        cursor += length + gap
      }
      const shift = (cursor - gap) / 2
      for (const part of sorted) axial.set(part.object, axial.get(part.object)! - shift + center[layoutAxis] - part.center[layoutAxis])
    }
    this.parts = bounded.map(part => {
      let offset = part.center.clone().sub(center)
      if (layoutAxis !== "auto") offset = new THREE.Vector3().setComponent(layoutAxis === "x" ? 0 : layoutAxis === "y" ? 1 : 2, axial.get(part.object)!)
      else if (offset.length() < Math.max(size.length() * 1e-6, 1e-9)) {
        // Concentric shells/fasteners have identical centres; a stable axial fan still exposes them.
        offset.set(0, 0, 0)
        offset[major] = (ranks.get(part.object)! - (sorted.length - 1) / 2) * gap * 2
      } else offset.normalize().multiplyScalar(Math.max(size.length() * 0.55, 1))
      if (bounded.length < 2) offset.set(0, 0, 0)
      const parent = part.object.parent
      if (parent) {
        const inverse = parent.matrixWorld.clone().invert()
        offset = offset.clone().applyMatrix4(inverse).sub(new THREE.Vector3().applyMatrix4(inverse))
      }
      return { object: part.object, position: part.object.position.clone(), offset }
    })
    this.apply()
  }

  setTarget(amount: number, immediate = false): void {
    this.target = Number.isFinite(amount) ? Math.max(0, Math.min(3, amount)) : 0
    this.lastTime = undefined
    if (immediate) { this.current = this.target; this.apply() }
  }

  /** Returns whether another frame is needed. Reversal starts from the current pose. */
  tick(now: number): boolean {
    if (this.current === this.target) return false
    const dt = this.lastTime === undefined ? 1 / 60 : Math.max(0, Math.min((now - this.lastTime) / 1000, 0.05))
    this.lastTime = now
    this.current += (this.target - this.current) * (1 - Math.exp(-10 * dt))
    if (Math.abs(this.current - this.target) < 0.001) this.current = this.target
    this.apply()
    return this.current !== this.target
  }

  private apply(): void {
    for (const part of this.parts) {
      part.object.position.copy(part.position).addScaledVector(part.offset, this.current)
      part.object.updateMatrix()
    }
    for (const part of this.parts) part.object.updateWorldMatrix(true, false)
  }

  /** Exporters clone the assembled scene synchronously; the displayed pose is then restored. */
  assembled<T>(read: () => T): T {
    this.restore()
    try { return read() } finally { this.apply() }
  }

  dispose(): void { this.release(); this.current = this.target = 0 }
}
