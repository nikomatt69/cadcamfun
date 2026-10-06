import { create } from "../../state/zustand.ts";
import { JointSystem } from "../lib/assembly/JointSystem.ts";
import { AssemblyManager } from "../lib/assembly/AssemblyManager.ts";
import {
  type AssemblyNode,
  type AssemblyState,
  type Joint,
  type JointType,
  type JointLimits,
  type Constraint,
  type ConstraintType
} from "../types/assembly.ts";
import { type Vector3, type Rotation } from "../types/cad.ts";

// Create instances of JointSystem and AssemblyManager
const jointSystem = new JointSystem();

// Create assembly manager with state change callback (will be set after store creation)
const assemblyManager = new AssemblyManager(jointSystem);

// Define the store state and actions
interface AssemblyStore {
  // State
  assemblyState: AssemblyState;
  showJoints: boolean;
  activeNodeId: string | null;
  selectedNodeIds: string[];

  // Actions
  addComponent: (
    name: string,
    position: Vector3,
    rotation: Rotation,
    parentId?: string | null,
    componentId?: string,
    metadata?: Record<string, any>
  ) => string;

  addSubassembly: (
    name: string,
    position: Vector3,
    rotation: Rotation,
    parentId?: string | null,
    metadata?: Record<string, any>
  ) => string;

  addGroup: (
    name: string,
    position: Vector3,
    rotation: Rotation,
    parentId?: string | null,
    metadata?: Record<string, any>
  ) => string;

  removeNode: (nodeId: string) => boolean;

  updateNode: (nodeId: string, updates: Partial<Omit<AssemblyNode, "id" | "children" | "type" | "parent">>) => boolean;

  moveNode: (nodeId: string, newParentId: string | null) => boolean;

  addJoint: (
    type: JointType,
    parentId: string,
    childId: string,
    origin: Vector3,
    primaryAxis: Vector3,
    secondaryAxis?: Vector3,
    limits?: JointLimits,
    name?: string
  ) => Joint | null;

  removeJoint: (jointId: string) => boolean;

  addConstraint: (
    type: ConstraintType,
    entityA: string,
    entityB: string,
    parameters?: Record<string, any>,
    name?: string
  ) => Constraint | null;

  removeConstraint: (constraintId: string) => boolean;

  setJointsVisibility: (visible: boolean) => void;

  setActiveNode: (nodeId: string | null) => boolean;

  selectNodes: (nodeIds: string[], clearExisting?: boolean) => boolean;

  undo: () => boolean;

  redo: () => boolean;

  reset: () => void;

  getNodeById: (nodeId: string) => AssemblyNode | undefined;

  getJointById: (jointId: string) => Joint | undefined;

  getConstraintById: (constraintId: string) => Constraint | undefined;

  getJointsForComponent: (componentId: string) => Joint[];

  getConstraintsForEntity: (entityId: string) => Constraint[];
}

// Create the store
export const useAssemblyStore = create<AssemblyStore>(set => {
  // Update state from assembly manager
  assemblyManager.addStateChangeHandler(newState => {
    set({
      assemblyState: newState,
      showJoints: newState.visibleJoints,
      activeNodeId: newState.activeNode,
      selectedNodeIds: newState.selectedNodes
    });
  });

  return {
    // Initial state
    assemblyState: assemblyManager.getState(),
    showJoints: assemblyManager.getState().visibleJoints,
    activeNodeId: assemblyManager.getState().activeNode,
    selectedNodeIds: assemblyManager.getState().selectedNodes,

    // Actions
    addComponent: (name, position, rotation, parentId = null, componentId, metadata) => {
      const node = assemblyManager.addComponent(name, position, rotation, parentId, componentId ?? "", metadata);
      return node.id;
    },

    addSubassembly: (name, position, rotation, parentId = null, metadata) => {
      const node = assemblyManager.addSubassembly(name, position, rotation, parentId, metadata);
      return node.id;
    },

    addGroup: (name, position, rotation, parentId = null, metadata) => {
      const node = assemblyManager.addGroup(name, position, rotation, parentId, metadata);
      return node.id;
    },

    removeNode: nodeId => {
      return assemblyManager.removeNode(nodeId);
    },

    updateNode: (nodeId, updates) => {
      return assemblyManager.updateNode(nodeId, updates);
    },

    moveNode: (nodeId, newParentId) => {
      return assemblyManager.moveNode(nodeId, newParentId);
    },

    addJoint: (type, parentId, childId, origin, primaryAxis, secondaryAxis, limits, name) => {
      const newJoint = assemblyManager.addJoint(
        type,
        parentId,
        childId,
        origin,
        primaryAxis,
        secondaryAxis,
        limits,
        name
      );
      return newJoint;
    },

    removeJoint: jointId => {
      return assemblyManager.removeJoint(jointId);
    },

    addConstraint: (type, entityA, entityB, parameters, name) => {
      return assemblyManager.addConstraint(type, entityA, entityB, parameters, name);
    },

    removeConstraint: constraintId => {
      return assemblyManager.removeConstraint(constraintId);
    },

    setJointsVisibility: visible => {
      assemblyManager.setJointsVisibility(visible);
    },

    setActiveNode: nodeId => {
      return assemblyManager.setActiveNode(nodeId);
    },

    selectNodes: (nodeIds, clearExisting = true) => {
      return assemblyManager.selectNodes(nodeIds, clearExisting);
    },

    undo: () => {
      return assemblyManager.undo();
    },

    redo: () => {
      return assemblyManager.redo();
    },

    reset: () => {
      assemblyManager.reset();
    },

    getNodeById: nodeId => {
      return assemblyManager.getNode(nodeId) ?? undefined;
    },

    getJointById: jointId => {
      return assemblyManager.getJoint(jointId) ?? undefined;
    },

    getConstraintById: constraintId => {
      return assemblyManager.getConstraint(constraintId) ?? undefined;
    },

    getJointsForComponent: componentId => {
      return assemblyManager.getNodeJoints(componentId);
    },

    getConstraintsForEntity: entityId => {
      return assemblyManager.getEntityConstraints(entityId);
    }
  };
});

// Export the assembly manager and joint system for direct access if needed
export { assemblyManager, jointSystem };
