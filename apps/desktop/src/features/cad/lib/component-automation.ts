/**
 * Component automations of the CAD canvas on the exact model. The pure part (scene solids, smart fasteners, interference, bill
 * of materials, inferred joints) lives in `@cadcamfun/core` (`cad/scene-automation.ts`) so the sidecar and the assistant run the
 * same code; this module re-exports it for the panel and keeps what needs the assembly store: writing the inferred joints.
 */
import { sceneJoints } from "@cadcamfun/core"

export {
  bomCsv,
  fastenScene,
  fastenerOf,
  sceneBom,
  sceneInterference,
  sceneJoints,
  sceneParts,
  threadMaterial,
  type FastenResult,
  type FastenerMeta,
  type SceneInterference,
  type ScenePart,
  type SceneParts
} from "@cadcamfun/core"

/** The part of the assembly store the joints are written through (one history step per joint, as the joint form does). */
export interface JointTarget {
  readonly assemblyState: { readonly nodes: Readonly<Record<string, { readonly id: string; readonly componentId?: string }>>; readonly joints: Readonly<Record<string, { readonly parent: string; readonly child: string }>> }
  addComponent(name: string, position: { x: number; y: number; z: number }, rotation: { x: number; y: number; z: number }, parentId?: string | null, componentId?: string, metadata?: Record<string, unknown>): string
  addJoint(type: "fixed" | "revolute", parentId: string, childId: string, origin: { x: number; y: number; z: number }, primaryAxis: { x: number; y: number; z: number }, secondaryAxis?: undefined, limits?: undefined, name?: string): unknown
}

/**
 * Writes inferred joints into the assembly: each part gets the node that already references it (`componentId`) or a new
 * one; a pair that already has a joint keeps it. Returns how many joints were added and how many were already there.
 */
export const applyJoints = (inferred: ReturnType<typeof sceneJoints>, store: () => JointTarget): { readonly added: number; readonly existing: number } => {
  const nodeOf = (part: string): string => {
    const found = Object.values(store().assemblyState.nodes).find((n) => n.componentId === part)
    if (found !== undefined) return found.id
    return store().addComponent(inferred.names.get(part) ?? part, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, null, part, { automation: "joints-from-holes" })
  }
  let added = 0, existing = 0
  for (const j of inferred.joints) {
    const parent = nodeOf(j.parent), child = nodeOf(j.child)
    const joined = Object.values(store().assemblyState.joints).some((x) => (x.parent === parent && x.child === child) || (x.parent === child && x.child === parent))
    if (joined) { existing++; continue }
    const name = `${inferred.names.get(j.child) ?? j.child} on ${inferred.names.get(j.parent) ?? j.parent} (${j.kind === "fixed" ? `${j.axes} hole axes` : "hole axis"})`
    if (store().addJoint(j.kind, parent, child, j.origin, j.axis, undefined, undefined, name) !== null) added++
  }
  return { added, existing }
}
