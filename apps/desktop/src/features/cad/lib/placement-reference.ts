import type { Object3D } from "three"
import type { Point } from "../store/elementsStore.ts"

/** The reference belongs to a live part, so deleting/undoing it cannot leave a stale snap anchor. */
export function createPlacementReference() {
  let id: string | undefined
  return {
    remember: (placedId: string) => { id = placedId || undefined },
    clear: () => { id = undefined },
    anchor: (
      elements: ReadonlyArray<{ readonly id: string }>,
      objectOf: (id: string) => Object3D | undefined,
      offset: Point
    ): Point | undefined => {
      if (!id || !elements.some((element) => element.id === id)) return undefined
      const at = objectOf(id)?.userData.pivot as Point | undefined
      return at ? { x: at.x - offset.x, y: at.y - offset.y, z: at.z - offset.z } : undefined
    }
  }
}
