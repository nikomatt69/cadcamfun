import { v4 as uuidv4 } from "uuid";
import * as THREE from "three";
import {
  AssemblyNode,
  AssemblyState,
  Joint,
  JointType,
  JointLimits,
  Constraint,
  ConstraintType,
  NodeType,
  AssemblyNodeEventType,
  AssemblyEventListener,
  StateChangeHandler,
  AssemblyAction,
  AssemblyActionType
} from "../../types/assembly";
import { JointSystem } from "./JointSystem";
import { Vector3, Rotation } from "../../types/cad";

/**
 * Assembly Manager for handling component hierarchies, joints, constraints, and history.
 */
export class AssemblyManager {
  private state: AssemblyState;
  private jointSystem: JointSystem;
  private listeners: AssemblyEventListener[] = [];
  private stateChangeHandlers: StateChangeHandler[] = [];

  /**
   * Create a new Assembly Manager instance
   */
  constructor(jointSystem: JointSystem) {
    this.jointSystem = jointSystem;
    this.state = this.createInitialState();
    this.jointSystem.setAssemblyManager(this);
  }

  /**
   * Initialize empty assembly state
   */
  private createInitialState(): AssemblyState {
    return {
      nodes: {},
      joints: {},
      constraints: {},
      rootNodes: [],
      activeNode: null,
      selectedNodes: [],
      visibleJoints: true,
      history: [],
      historyIndex: -1
    };
  }

  /**
   * Get the current assembly state (read-only copy)
   */
  public getState(): AssemblyState {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Add a state change handler
   */
  public addStateChangeHandler(handler: StateChangeHandler): () => void {
    this.stateChangeHandlers.push(handler);
    return () => {
      this.stateChangeHandlers = this.stateChangeHandlers.filter(h => h !== handler);
    };
  }

  /**
   * Notify all registered state change handlers
   */
  private notifyStateChangeHandlers() {
    const currentState = this.getState();
    this.stateChangeHandlers.forEach(handler => {
      try {
        handler(currentState);
      } catch (error) {
        console.error("Error in state change handler:", error);
      }
    });
  }

  /**
   * Add an event listener
   */
  public addEventListener(listener: AssemblyEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Dispatch an event to all listeners and notify state change handlers
   */
  private dispatchEvent(eventType: AssemblyNodeEventType, payload: any) {
    const listeners = [...this.listeners];
    listeners.forEach(listener => {
      try {
        listener(eventType, payload);
      } catch (error) {
        console.error(`Error in event listener for ${eventType}:`, error);
      }
    });
    this.notifyStateChangeHandlers();
  }

  /**
   * Add an action to history
   */
  private addToHistory(action: AssemblyAction) {
    if (!action.previousState) {
      console.warn("History action added without previousState snapshot:", action.type);
    }

    if (this.state.historyIndex < this.state.history.length - 1) {
      this.state.history = this.state.history.slice(0, this.state.historyIndex + 1);
    }

    this.state.history.push(action);
    this.state.historyIndex = this.state.history.length - 1;
  }

  /**
   * Undo the last action
   */
  public undo(): boolean {
    if (this.state.historyIndex < 0) {
      return false;
    }

    const action = this.state.history[this.state.historyIndex];
    const previousStateSnapshot = action.previousState;

    if (previousStateSnapshot) {
      this.reverseAction(action);
    } else {
      console.warn("Cannot undo action: Previous state not found.", action);
      return false;
    }

    this.state.historyIndex--;

    this.dispatchEvent("stateChanged", { historyIndex: this.state.historyIndex });

    return true;
  }

  /**
   * Redo the last undone action
   */
  public redo(): boolean {
    if (this.state.historyIndex >= this.state.history.length - 1) {
      return false;
    }

    this.state.historyIndex++;

    const action = this.state.history[this.state.historyIndex];

    this.applyAction(action);

    this.dispatchEvent("stateChanged", { historyIndex: this.state.historyIndex });

    return true;
  }

  /**
   * Helper to apply an action (used by redo)
   */
  private applyAction(action: AssemblyAction, isInternalUpdate = true): void {
    switch (action.type) {
      case "ADD_NODE": {
        const { node } = action.payload;
        this.internalAddNode(node, isInternalUpdate);
        break;
      }
      case "REMOVE_NODE": {
        const { nodeId } = action.payload;
        this.internalRemoveNode(nodeId, isInternalUpdate);
        break;
      }
      case "UPDATE_NODE": {
        const { nodeId, updates } = action.payload;
        this.internalUpdateNode(nodeId, updates, isInternalUpdate);
        break;
      }
      case "REPARENT_NODE": {
        const { nodeId, newParentId } = action.payload;
        this.internalMoveNode(nodeId, newParentId, isInternalUpdate);
        break;
      }
      case "ADD_JOINT": {
        const { joint } = action.payload;
        this.internalAddJoint(joint, isInternalUpdate);
        break;
      }
      case "REMOVE_JOINT": {
        const { jointId } = action.payload;
        this.internalRemoveJoint(jointId, isInternalUpdate);
        break;
      }
      case "UPDATE_JOINT": {
        const { jointId, updates } = action.payload;
        this.internalUpdateJoint(jointId, updates, isInternalUpdate);
        break;
      }
      case "ADD_CONSTRAINT": {
        const { constraint } = action.payload;
        this.internalAddConstraint(constraint, isInternalUpdate);
        break;
      }
      case "REMOVE_CONSTRAINT": {
        const { constraintId } = action.payload;
        this.internalRemoveConstraint(constraintId, isInternalUpdate);
        break;
      }
      case "UPDATE_CONSTRAINT": {
        const { constraintId, updates } = action.payload;
        this.internalUpdateConstraint(constraintId, updates, isInternalUpdate);
        break;
      }
      case "SET_ACTIVE_NODE": {
        const { nodeId } = action.payload;
        this.internalSetActiveNode(nodeId, isInternalUpdate);
        break;
      }
      case "SELECT_NODES": {
        const { nodeIds, clearExisting } = action.payload;
        this.internalSelectNodes(nodeIds, clearExisting, isInternalUpdate);
        break;
      }
    }
  }

  /**
   * Helper to reverse an action (used by undo)
   */
  private reverseAction(action: AssemblyAction): void {
    const isInternalUpdate = true;
    switch (action.type) {
      case "ADD_NODE": {
        const { node } = action.payload;
        this.internalRemoveNode(node.id, isInternalUpdate);
        break;
      }
      case "REMOVE_NODE": {
        if (action.previousState?.node) this.internalAddNode(action.previousState.node, isInternalUpdate);
        break;
      }
      case "UPDATE_NODE": {
        const { nodeId } = action.payload;
        if (action.previousState?.node)
          this.internalUpdateNode(nodeId, action.previousState.node, isInternalUpdate, true);
        break;
      }
      case "REPARENT_NODE": {
        const { nodeId, oldParentId } = action.payload;
        this.internalMoveNode(nodeId, oldParentId, isInternalUpdate);
        break;
      }
      case "ADD_JOINT": {
        const { joint } = action.payload;
        this.internalRemoveJoint(joint.id, isInternalUpdate);
        break;
      }
      case "REMOVE_JOINT": {
        if (action.previousState?.joint) this.internalAddJoint(action.previousState.joint, isInternalUpdate);
        break;
      }
      case "UPDATE_JOINT": {
        const { jointId } = action.payload;
        if (action.previousState?.joint)
          this.internalUpdateJoint(jointId, action.previousState.joint, isInternalUpdate, true);
        break;
      }
      case "ADD_CONSTRAINT": {
        const { constraint } = action.payload;
        this.internalRemoveConstraint(constraint.id, isInternalUpdate);
        break;
      }
      case "REMOVE_CONSTRAINT": {
        if (action.previousState?.constraint)
          this.internalAddConstraint(action.previousState.constraint, isInternalUpdate);
        break;
      }
      case "UPDATE_CONSTRAINT": {
        const { constraintId } = action.payload;
        if (action.previousState?.constraint)
          this.internalUpdateConstraint(constraintId, action.previousState.constraint, isInternalUpdate, true);
        break;
      }
      case "SET_ACTIVE_NODE": {
        this.internalSetActiveNode(action.previousState?.activeNode ?? null, isInternalUpdate);
        break;
      }
      case "SELECT_NODES": {
        this.internalSelectNodes(action.previousState?.selectedNodes ?? [], true, isInternalUpdate);
        break;
      }
    }
  }

  /**
   * Get a node by its ID.
   */
  public getNode(nodeId: string): AssemblyNode | null {
    return this.state.nodes[nodeId] || null;
  }

  /**
   * Find a node by ID (recursive helper - potentially slow for deep trees)
   * Consider using direct lookup via state.nodes[id] if needed elsewhere.
   */
  public findNodeById(id: string): AssemblyNode | undefined {
    return this.state.nodes[id];
  }

  /**
   * Create a new assembly node object (doesn't add to state)
   */
  private createNode(
    type: NodeType,
    name: string,
    position: Vector3 = { x: 0, y: 0, z: 0 },
    rotation: Rotation = { x: 0, y: 0, z: 0 },
    parent: string | null = null,
    metadata: Record<string, any> = {},
    componentId?: string,
    jointId?: string
  ): AssemblyNode {
    const id = uuidv4();
    const node: AssemblyNode = {
      id,
      type,
      name,
      position,
      rotation,
      parent,
      metadata,
      componentId,
      jointId,
      visible: true,
      locked: false,
      children: []
    };
    return node;
  }

  private internalAddNode(node: AssemblyNode, skipHistory = false): void {
    if (!node || this.state.nodes[node.id]) {
      console.warn(`Node with ID ${node?.id} already exists or is invalid. Skipping add.`);
      return;
    }

    const previousState = skipHistory ? undefined : this.getState();

    this.state.nodes[node.id] = { ...node, children: [...node.children] };

    if (node.parent && this.state.nodes[node.parent]) {
      const parentNode = this.state.nodes[node.parent];
      if (!parentNode.children.includes(node.id)) {
        parentNode.children.push(node.id);
      }
    } else if (!node.parent) {
      if (!this.state.rootNodes.includes(node.id)) {
        this.state.rootNodes.push(node.id);
      }
    } else {
      console.warn(`Parent node ${node.parent} not found for node ${node.id}. Adding as root.`);
      this.state.nodes[node.id].parent = null;
      if (!this.state.rootNodes.includes(node.id)) {
        this.state.rootNodes.push(node.id);
      }
    }

    if (!skipHistory) {
      this.addToHistory({ type: "ADD_NODE", payload: { node: this.state.nodes[node.id] }, previousState });
    }

    this.dispatchEvent("nodeAdded", { node: this.state.nodes[node.id] });
  }

  /**
   * Add a component node to the assembly.
   */
  public addComponent(
    name: string,
    position: Vector3 = { x: 0, y: 0, z: 0 },
    rotation: Rotation = { x: 0, y: 0, z: 0 },
    parentId: string | null = null,
    componentId: string,
    metadata: Record<string, any> = {}
  ): AssemblyNode {
    const node = this.createNode("component", name, position, rotation, parentId, metadata, componentId);
    this.internalAddNode(node, false);
    return this.state.nodes[node.id];
  }

  /**
   * Add a subassembly node.
   */
  public addSubassembly(
    name: string,
    position: Vector3 = { x: 0, y: 0, z: 0 },
    rotation: Rotation = { x: 0, y: 0, z: 0 },
    parentId: string | null = null,
    metadata: Record<string, any> = {}
  ): AssemblyNode {
    const node = this.createNode("subassembly", name, position, rotation, parentId, metadata);
    this.internalAddNode(node, false);
    return this.state.nodes[node.id];
  }

  /**
   * Add a group node.
   */
  public addGroup(
    name: string,
    position: Vector3 = { x: 0, y: 0, z: 0 },
    rotation: Rotation = { x: 0, y: 0, z: 0 },
    parentId: string | null = null,
    metadata: Record<string, any> = {}
  ): AssemblyNode {
    const node = this.createNode("group", name, position, rotation, parentId, metadata);
    this.internalAddNode(node, false);
    return this.state.nodes[node.id];
  }

  private internalRemoveNode(nodeId: string, skipHistory = false): boolean {
    const nodeToRemove = this.state.nodes[nodeId];
    if (!nodeToRemove) return false;

    const previousState = skipHistory ? undefined : this.getState();
    const nodeDataCopy = { ...nodeToRemove };

    const childrenToRemove = [...nodeToRemove.children];
    childrenToRemove.forEach(childId => this.internalRemoveNode(childId, true));

    const connectedJoints = this.getNodeJoints(nodeId);
    connectedJoints.forEach(joint => this.internalRemoveJoint(joint.id, true));

    const connectedConstraints = this.getEntityConstraints(nodeId);
    connectedConstraints.forEach(constraint => this.internalRemoveConstraint(constraint.id, true));

    const parentId = nodeToRemove.parent;
    if (parentId && this.state.nodes[parentId]) {
      this.state.nodes[parentId].children = this.state.nodes[parentId].children.filter(id => id !== nodeId);
    } else {
      this.state.rootNodes = this.state.rootNodes.filter(id => id !== nodeId);
    }

    delete this.state.nodes[nodeId];

    if (this.state.selectedNodes.includes(nodeId)) {
      this.state.selectedNodes = this.state.selectedNodes.filter(id => id !== nodeId);
    }
    if (this.state.activeNode === nodeId) {
      this.state.activeNode = null;
    }

    if (!skipHistory) {
      this.addToHistory({
        type: "REMOVE_NODE",
        payload: { nodeId, nodeData: nodeDataCopy },
        previousState
      });
    }

    this.dispatchEvent("nodeRemoved", { nodeId, nodeData: nodeDataCopy });

    return true;
  }

  /**
   * Remove a node and its descendants from the assembly.
   */
  public removeNode(nodeId: string): boolean {
    return this.internalRemoveNode(nodeId, false);
  }

  private internalUpdateNode(
    nodeId: string,
    updates: Partial<AssemblyNode>,
    skipHistory = false,
    isFullReplace = false
  ): boolean {
    const nodeToUpdate = this.state.nodes[nodeId];
    if (!nodeToUpdate) return false;

    const previousState = skipHistory ? undefined : this.getState();
    const previousNodeData = { ...nodeToUpdate };

    let appliedUpdates: Partial<AssemblyNode>;

    if (isFullReplace) {
      appliedUpdates = { ...updates };
      appliedUpdates.id = nodeId;
      appliedUpdates.children = nodeToUpdate.children;
      appliedUpdates.parent = nodeToUpdate.parent;
      this.state.nodes[nodeId] = { ...appliedUpdates } as AssemblyNode;
    } else {
      const { id, type, children, parent, ...safeUpdates } = updates;
      appliedUpdates = safeUpdates;
      const hasChanged = Object.keys(appliedUpdates).some(
        key => appliedUpdates[key as keyof typeof appliedUpdates] !== nodeToUpdate[key as keyof AssemblyNode]
      );
      if (!hasChanged) return true;

      this.state.nodes[nodeId] = { ...nodeToUpdate, ...appliedUpdates };
    }

    if (!skipHistory) {
      this.addToHistory({
        type: "UPDATE_NODE",
        payload: { nodeId, updates: appliedUpdates },
        previousState
      });
    }

    this.dispatchEvent("nodeUpdated", { nodeId, updates: appliedUpdates, node: this.state.nodes[nodeId] });
    return true;
  }

  /**
   * Update properties of an existing node.
   */
  public updateNode(
    nodeId: string,
    updates: Partial<Omit<AssemblyNode, "id" | "type" | "children" | "parent">>,
    isInternalUpdate = false
  ): boolean {
    return this.internalUpdateNode(nodeId, updates, isInternalUpdate);
  }

  private internalMoveNode(nodeId: string, newParentId: string | null, skipHistory = false): boolean {
    const node = this.state.nodes[nodeId];
    if (!node) {
      console.warn(`MoveNode: Node ${nodeId} not found.`);
      return false;
    }
    if (node.parent === newParentId) return true;
    if (newParentId !== null && !this.state.nodes[newParentId]) {
      console.warn(`MoveNode: Target parent ${newParentId} not found.`);
      return false;
    }
    if (nodeId === newParentId) {
      console.warn(`MoveNode: Cannot move node ${nodeId} into itself.`);
      return false;
    }
    if (this.isDescendantOf(newParentId, nodeId)) {
      console.warn(`MoveNode: Cannot move node ${nodeId} into its descendant ${newParentId}.`);
      return false;
    }

    const previousState = skipHistory ? undefined : this.getState();
    const oldParentId = node.parent;

    if (oldParentId && this.state.nodes[oldParentId]) {
      this.state.nodes[oldParentId].children = this.state.nodes[oldParentId].children.filter(id => id !== nodeId);
    } else {
      this.state.rootNodes = this.state.rootNodes.filter(id => id !== nodeId);
    }

    if (newParentId && this.state.nodes[newParentId]) {
      const newParentNode = this.state.nodes[newParentId];
      if (!newParentNode.children) newParentNode.children = [];
      if (!newParentNode.children.includes(nodeId)) {
        newParentNode.children.push(nodeId);
      }
      node.parent = newParentId;
    } else {
      if (!this.state.rootNodes.includes(nodeId)) {
        this.state.rootNodes.push(nodeId);
      }
      node.parent = null;
    }

    if (!skipHistory) {
      this.addToHistory({
        type: "REPARENT_NODE",
        payload: { nodeId, newParentId, oldParentId },
        previousState
      });
    }

    this.dispatchEvent("nodeReparented", { nodeId, newParentId, oldParentId });
    return true;
  }

  /**
   * Move a node to a new parent (reparent).
   */
  public moveNode(nodeId: string, newParentId: string | null): boolean {
    return this.internalMoveNode(nodeId, newParentId, false);
  }

  private isDescendantOf(nodeId: string | null, potentialAncestorId: string): boolean {
    if (!nodeId) return false;
    let currentId: string | null = nodeId;
    while (currentId) {
      if (currentId === potentialAncestorId) return true;
      const currentNode: AssemblyNode | null = this.getNode(currentId);
      currentId = currentNode ? currentNode.parent : null;
    }
    return false;
  }

  /**
   * Get a joint by its ID.
   */
  public getJoint(jointId: string): Joint | null {
    return this.state.joints[jointId] || null;
  }

  /**
   * Get all joints connected to a specific node ID.
   */
  public getNodeJoints(nodeId: string): Joint[] {
    return Object.values(this.state.joints).filter(joint => joint.parent === nodeId || joint.child === nodeId);
  }

  private internalAddJoint(joint: Joint, skipHistory = false): void {
    if (!joint || this.state.joints[joint.id]) {
      console.warn(`Joint with ID ${joint?.id} already exists or is invalid. Skipping add.`);
      return;
    }
    if (!this.state.nodes[joint.parent] || !this.state.nodes[joint.child]) {
      console.warn(`Cannot add joint ${joint.id}: Parent ${joint.parent} or child ${joint.child} node not found.`);
      return;
    }

    const previousState = skipHistory ? undefined : this.getState();

    this.state.joints[joint.id] = { ...joint };

    this.jointSystem.addJointToSystem(this.state.joints[joint.id]);

    const childNode = this.state.nodes[joint.child];
    if (childNode) {
      childNode.jointId = joint.id;
    }

    if (!skipHistory) {
      this.addToHistory({ type: "ADD_JOINT", payload: { joint: this.state.joints[joint.id] }, previousState });
    }

    this.dispatchEvent("jointAdded", { joint: this.state.joints[joint.id] });
  }

  /**
   * Add a joint between two assembly nodes.
   */
  public addJoint(
    type: JointType,
    parentId: string,
    childId: string,
    origin: Vector3,
    primaryAxis: Vector3,
    secondaryAxis?: Vector3,
    limits?: JointLimits,
    name?: string
  ): Joint | null {
    if (!this.state.nodes[parentId] || !this.state.nodes[childId]) {
      console.error("Cannot add joint: Parent or child node not found.");
      return null;
    }

    const jointDefinition = this.jointSystem.createJointDefinition(
      type,
      parentId,
      childId,
      origin,
      primaryAxis,
      secondaryAxis,
      limits,
      name
    );

    this.internalAddJoint(jointDefinition, false);

    return this.state.joints[jointDefinition.id] || null;
  }

  private internalRemoveJoint(jointId: string, skipHistory = false): boolean {
    const jointToRemove = this.state.joints[jointId];
    if (!jointToRemove) return false;

    const previousState = skipHistory ? undefined : this.getState();
    const jointDataCopy = JSON.parse(JSON.stringify(jointToRemove));

    const childNode = this.state.nodes[jointToRemove.child];
    if (childNode && childNode.jointId === jointId) {
      childNode.jointId = undefined;
    }

    delete this.state.joints[jointId];

    this.jointSystem.removeJointFromSystem(jointId);

    if (!skipHistory) {
      this.addToHistory({
        type: "REMOVE_JOINT",
        payload: { jointId, jointData: jointDataCopy },
        previousState
      });
    }

    this.dispatchEvent("jointRemoved", { jointId, jointData: jointDataCopy });
    return true;
  }

  /**
   * Remove a joint between assembly nodes.
   */
  public removeJoint(jointId: string): boolean {
    return this.internalRemoveJoint(jointId, false);
  }

  private internalUpdateJoint(
    jointId: string,
    updates: Partial<Joint>,
    skipHistory = false,
    isFullReplace = false
  ): boolean {
    const jointToUpdate = this.state.joints[jointId];
    if (!jointToUpdate) return false;

    const previousState = skipHistory ? undefined : this.getState();
    const previousJointData = { ...jointToUpdate };

    let appliedUpdates: Partial<Joint>;
    let finalJointState: Joint;

    if (isFullReplace) {
      appliedUpdates = {
        ...updates,
        id: jointId,
        parent: previousJointData.parent,
        child: previousJointData.child
      };
      finalJointState = { ...appliedUpdates } as Joint;
    } else {
      appliedUpdates = updates;

      const hasChanged = Object.keys(appliedUpdates).some(
        key => appliedUpdates[key as keyof typeof appliedUpdates] !== jointToUpdate[key as keyof Joint]
      );
      if (!hasChanged) return true;
      finalJointState = { ...jointToUpdate, ...appliedUpdates };
    }

    this.state.joints[jointId] = finalJointState;

    this.jointSystem.updateJointInSystem(jointId, appliedUpdates);

    if (!skipHistory) {
      this.addToHistory({
        type: "UPDATE_JOINT",
        payload: { jointId, updates: appliedUpdates },
        previousState
      });
    }

    this.dispatchEvent("jointUpdated", { jointId, updates: appliedUpdates, joint: finalJointState });
    return true;
  }

  /**
   * Update properties of an existing joint.
   * Prevents changing id, parent, child directly.
   */
  public updateJoint(jointId: string, updates: Partial<Omit<Joint, "id" | "parent" | "child">>): boolean {
    return this.internalUpdateJoint(jointId, updates, false);
  }

  /**
   * Set the visibility of all joints.
   */
  public setJointsVisibility(visible: boolean): void {
    if (this.state.visibleJoints === visible) return;

    this.state.visibleJoints = visible;
    this.jointSystem.setAllJointsVisibility(visible);

    this.dispatchEvent("stateChanged", { visibleJoints: visible });
  }

  /**
   * Get a constraint by its ID.
   */
  public getConstraint(constraintId: string): Constraint | null {
    return this.state.constraints[constraintId] || null;
  }

  /**
   * Get all constraints involving a specific entity (node or feature ID).
   */
  public getEntityConstraints(entityId: string): Constraint[] {
    return Object.values(this.state.constraints).filter(c => c.entityA === entityId || c.entityB === entityId);
  }

  private internalAddConstraint(constraint: Constraint, skipHistory = false): void {
    if (!constraint || this.state.constraints[constraint.id]) {
      console.warn(`Constraint with ID ${constraint?.id} already exists or is invalid. Skipping add.`);
      return;
    }
    const previousState = skipHistory ? undefined : this.getState();

    this.state.constraints[constraint.id] = { ...constraint };

    if (!skipHistory) {
      this.addToHistory({
        type: "ADD_CONSTRAINT",
        payload: { constraint: this.state.constraints[constraint.id] },
        previousState
      });
    }

    this.dispatchEvent("constraintAdded", { constraint: this.state.constraints[constraint.id] });
  }

  /**
   * Add a constraint between two entities.
   */
  public addConstraint(
    type: ConstraintType,
    entityA: string,
    entityB: string,
    parameters: Record<string, any> = {},
    name?: string
  ): Constraint | null {
    const id = uuidv4();
    const constraintName = name ?? `${type} Constraint (${entityA.substring(0, 4)}<->${entityB.substring(0, 4)})`;
    const constraint: Constraint = { id, name: constraintName, type, entityA, entityB, parameters };

    this.internalAddConstraint(constraint, false);
    return this.state.constraints[id] || null;
  }

  private internalRemoveConstraint(constraintId: string, skipHistory = false): boolean {
    const constraintToRemove = this.state.constraints[constraintId];
    if (!constraintToRemove) return false;

    const previousState = skipHistory ? undefined : this.getState();
    const constraintDataCopy = JSON.parse(JSON.stringify(constraintToRemove));

    delete this.state.constraints[constraintId];

    if (!skipHistory) {
      this.addToHistory({
        type: "REMOVE_CONSTRAINT",
        payload: { constraintId, constraintData: constraintDataCopy },
        previousState
      });
    }

    this.dispatchEvent("constraintRemoved", { constraintId, constraintData: constraintDataCopy });
    return true;
  }

  /**
   * Remove a constraint.
   */
  public removeConstraint(constraintId: string): boolean {
    return this.internalRemoveConstraint(constraintId, false);
  }

  private internalUpdateConstraint(
    constraintId: string,
    updates: Partial<Constraint>,
    skipHistory = false,
    isFullReplace = false
  ): boolean {
    const constraintToUpdate = this.state.constraints[constraintId];
    if (!constraintToUpdate) return false;

    const previousState = skipHistory ? undefined : this.getState();
    const previousConstraintData = { ...constraintToUpdate };

    let appliedUpdates: Partial<Constraint>;
    let finalConstraintState: Constraint;

    if (isFullReplace) {
      appliedUpdates = {
        ...updates,
        id: constraintId,
        entityA: updates.entityA ?? previousConstraintData.entityA,
        entityB: updates.entityB ?? previousConstraintData.entityB,
        type: updates.type ?? previousConstraintData.type
      };
      finalConstraintState = { ...appliedUpdates } as Constraint;
    } else {
      const { id, entityA, entityB, type, ...safeUpdates } = updates;
      appliedUpdates = safeUpdates;
      const hasChanged = Object.keys(appliedUpdates).some(
        key => appliedUpdates[key as keyof typeof appliedUpdates] !== constraintToUpdate[key as keyof Constraint]
      );
      if (!hasChanged) return true;
      finalConstraintState = { ...constraintToUpdate, ...appliedUpdates };
    }

    this.state.constraints[constraintId] = finalConstraintState;

    if (!skipHistory) {
      this.addToHistory({
        type: "UPDATE_CONSTRAINT",
        payload: { constraintId, updates: appliedUpdates },
        previousState
      });
    }

    this.dispatchEvent("constraintUpdated", {
      constraintId,
      updates: appliedUpdates,
      constraint: finalConstraintState
    });
    return true;
  }

  /**
   * Update properties of an existing constraint.
   * Prevents changing id, entityA, entityB, type directly.
   */
  public updateConstraint(
    constraintId: string,
    updates: Partial<Omit<Constraint, "id" | "entityA" | "entityB" | "type">>
  ): boolean {
    return this.internalUpdateConstraint(constraintId, updates, false);
  }

  private internalSetActiveNode(nodeId: string | null, skipHistory = false): boolean {
    if (this.state.activeNode === nodeId) return true;
    if (nodeId !== null && !this.state.nodes[nodeId]) return false;

    const previousState = skipHistory ? undefined : this.getState();
    const previousActiveNode = this.state.activeNode;

    this.state.activeNode = nodeId;

    if (nodeId !== null && !this.state.selectedNodes.includes(nodeId)) {
      this.internalSelectNodes([nodeId], true, true);
    }

    if (!skipHistory) {
      this.addToHistory({
        type: "SET_ACTIVE_NODE",
        payload: { nodeId, previousActiveNode },
        previousState
      });
    }

    this.dispatchEvent("activeNodeChanged", { nodeId, previousActiveNode });
    return true;
  }

  /**
   * Set the active node.
   */
  public setActiveNode(nodeId: string | null): boolean {
    return this.internalSetActiveNode(nodeId, false);
  }

  private internalSelectNodes(nodeIds: string[], clearExisting: boolean = true, skipHistory = false): boolean {
    const validIds = nodeIds.filter(id => this.state.nodes[id]);

    const previousState = skipHistory ? undefined : this.getState();
    const previousSelection = [...this.state.selectedNodes];

    let selectionChanged = false;
    let newSelection: string[];

    if (clearExisting) {
      if (validIds.length !== previousSelection.length || !validIds.every(id => previousSelection.includes(id))) {
        selectionChanged = true;
        newSelection = validIds;
      } else {
        newSelection = previousSelection;
      }
    } else {
      newSelection = [...previousSelection];
      validIds.forEach(id => {
        if (!newSelection.includes(id)) {
          newSelection.push(id);
          selectionChanged = true;
        }
      });
    }

    if (!selectionChanged) return true;

    this.state.selectedNodes = newSelection;

    if (!skipHistory) {
      this.addToHistory({
        type: "SELECT_NODES",
        payload: { nodeIds: validIds, clearExisting, previousSelection },
        previousState
      });
    }

    this.dispatchEvent("selectionChanged", { selectedNodes: newSelection, previousSelection });
    return true;
  }

  /**
   * Set selected nodes.
   */
  public selectNodes(nodeIds: string[], clearExisting: boolean = true): boolean {
    return this.internalSelectNodes(nodeIds, clearExisting, false);
  }

  /**
   * Reset the assembly to an empty state.
   */
  public reset(): void {
    const previousState = this.getState();
    this.state = this.createInitialState();
    this.jointSystem.clear();
    this.dispatchEvent("stateChanged", { reset: true });
  }

  public notifyJointUpdate(jointId: string, updates: Partial<Joint>, updatedJoint: Joint): void {
    if (JSON.stringify(this.state.joints[jointId]) !== JSON.stringify(updatedJoint)) {
      this.internalUpdateJoint(jointId, updates, true);
    }
  }

  public notifyJointRemoval(jointId: string, removedJointData: Joint): void {
    if (this.state.joints[jointId]) {
      this.internalRemoveJoint(jointId, true);
    }
  }
}
