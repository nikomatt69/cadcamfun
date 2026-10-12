/**
 * The assembly workspace: the node tree, joints and constraints, through the store and the panel.
 *
 * `AssemblyManager`/`JointSystem` were already in the tree and tested by the rest of the app; what
 * this covers is what the new UI needs from them — a node added from the panel shows up in the
 * tree, a joint connects two nodes, a constraint carries its value, and undo steps it all back.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { useAssemblyStore } from "../store/assemblyStore.ts"

const resetStore = (): void => useAssemblyStore.getState().reset()

const addNode = (name: string, parentId?: string): string =>
  useAssemblyStore.getState().addComponent(name, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, parentId ?? null, "", {})

beforeEach(resetStore)
afterEach(resetStore)

describe("assembly tree", () => {
  test("a node is added at the top level, then nested under the active node", () => {
    const base = addNode("Base")
    const store = useAssemblyStore.getState()
    expect(store.assemblyState.rootNodes).toContain(base)

    store.setActiveNode(base)
    const arm = addNode("Arm")
    const state = useAssemblyStore.getState().assemblyState
    expect(state.nodes[arm]?.parent).toBe(base)
    expect(state.nodes[base]?.children).toEqual([arm])
    expect(state.rootNodes).toEqual([base])
  })

  test("removing a node removes its children, their joints and their constraints", () => {
    const base = addNode("Base")
    const arm = addNode("Arm", base)
    const store = useAssemblyStore.getState()
    store.addJoint("revolute", base, arm, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, undefined, {}, "hinge")
    store.addConstraint("fixed", base, arm, {})
    expect(Object.keys(useAssemblyStore.getState().assemblyState.joints).length).toBe(1)

    expect(useAssemblyStore.getState().removeNode(base)).toBe(true)
    const state = useAssemblyStore.getState().assemblyState
    expect(Object.keys(state.nodes)).toEqual([])
    expect(Object.keys(state.joints)).toEqual([])
    expect(Object.keys(state.constraints)).toEqual([])
  })

  test("undo and redo step through node additions", () => {
    const store = useAssemblyStore.getState()
    const base = addNode("Base")
    expect(useAssemblyStore.getState().assemblyState.nodes[base]).toBeDefined()
    expect(useAssemblyStore.getState().undo()).toBe(true)
    expect(useAssemblyStore.getState().assemblyState.nodes[base]).toBeUndefined()
    expect(useAssemblyStore.getState().redo()).toBe(true)
    expect(useAssemblyStore.getState().assemblyState.nodes[base]).toBeDefined()
    void store
  })
})

describe("assembly joints", () => {
  test("a joint joins a parent to a child with its axis and limits", () => {
    const base = addNode("Base")
    const arm = addNode("Arm", base)
    const joint = useAssemblyStore.getState().addJoint("revolute", base, arm, { x: 0, y: 5, z: 0 }, { x: 0, y: 0, z: 1 }, undefined, { minAngle: -45, maxAngle: 45 }, "hinge")

    expect(joint).not.toBeNull()
    const stored = useAssemblyStore.getState().getJointById(joint!.id)
    expect(stored?.type).toBe("revolute")
    expect(stored?.parent).toBe(base)
    expect(stored?.child).toBe(arm)
    expect(stored?.limits).toEqual({ minAngle: -45, maxAngle: 45 })
    // The joint system is the one that holds the kinematic relationship.
    expect(useAssemblyStore.getState().getJointsForComponent(base).map((entry) => entry.id)).toContain(joint!.id)
  })

  test("a joint between nodes that do not exist is refused", () => {
    expect(useAssemblyStore.getState().addJoint("fixed", "nope", "nada", { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })).toBeNull()
  })

  test("joint visibility is a switch on the assembly state", () => {
    expect(useAssemblyStore.getState().assemblyState.visibleJoints).toBe(false)
    useAssemblyStore.getState().setJointsVisibility(true)
    expect(useAssemblyStore.getState().showJoints).toBe(true)
  })
})

describe("assembly constraints", () => {
  test("a distance constraint keeps its value, an angle constraint keeps its angle", () => {
    const base = addNode("Base")
    const arm = addNode("Arm", base)
    const store = useAssemblyStore.getState()
    const distance = store.addConstraint("distance", base, arm, { distance: 12.5 })
    const angle = store.addConstraint("angle", base, arm, { angle: 90 })

    expect(useAssemblyStore.getState().getConstraintById(distance!.id)?.parameters).toEqual({ distance: 12.5 })
    expect(useAssemblyStore.getState().getConstraintById(angle!.id)?.parameters).toEqual({ angle: 90 })
    expect(useAssemblyStore.getState().getConstraintsForEntity(arm).length).toBe(2)
  })

  test("a constraint can be removed", () => {
    const base = addNode("Base")
    const constraint = useAssemblyStore.getState().addConstraint("parallel", base, base, {})
    expect(useAssemblyStore.getState().removeConstraint(constraint!.id)).toBe(true)
    expect(Object.keys(useAssemblyStore.getState().assemblyState.constraints)).toEqual([])
  })
})
