import * as THREE from "three";
import { v4 as uuidv4 } from "uuid";
import { Joint, JointType, JointLimits, JointMotion, AssemblyNode } from "../../types/assembly";
import { Vector3 } from "../../types/cad";
import { AssemblyManager } from "./AssemblyManager";

/**
 * Joint System for managing connections between assembly components
 */
export class JointSystem {
  private assemblyManager!: AssemblyManager;
  private joints: Map<string, Joint> = new Map();
  private jointVisuals: Map<string, THREE.Object3D> = new Map();
  private motionState: Map<string, JointMotion> = new Map();

  constructor() {}

  /**
   * Set the AssemblyManager instance
   */
  public setAssemblyManager(manager: AssemblyManager): void {
    this.assemblyManager = manager;
  }

  /**
   * Create a new joint definition (doesn't add to state)
   */
  public createJointDefinition(
    type: JointType,
    parent: string,
    child: string,
    origin: Vector3,
    primaryAxis: Vector3,
    secondaryAxis?: Vector3,
    limits?: JointLimits,
    name: string = "Joint",
    visible: boolean = true,
    color?: number
  ): Joint {
    const id = uuidv4();

    const joint: Joint = {
      id,
      name,
      type,
      parent,
      child,
      origin,
      primaryAxis: this.normalizeAxis(primaryAxis),
      secondaryAxis: secondaryAxis ? this.normalizeAxis(secondaryAxis) : undefined,
      limits,
      visible,
      color,
      value: 0
    };

    return joint;
  }

  /**
   * Add a joint created elsewhere (usually by AssemblyManager) to this system
   */
  public addJointToSystem(joint: Joint): void {
    if (!joint || this.joints.has(joint.id)) return;

    this.joints.set(joint.id, joint);

    // Initialize motion state
    this.motionState.set(joint.id, {
      joint,
      primaryValue: joint.value ?? 0, // Use initial value from joint if provided
      secondaryValue: 0 // Assuming 0 for secondary initially
    });

    // Create visual representation
    this.createJointVisual(joint);
  }

  /**
   * Update joint properties within this system
   */
  public updateJointInSystem(id: string, updates: Partial<Omit<Joint, "id" | "parent" | "child">>): boolean {
    const joint = this.joints.get(id);
    if (!joint) return false;

    // Normalize axes if updated
    if (updates.primaryAxis) {
      updates.primaryAxis = this.normalizeAxis(updates.primaryAxis);
    }
    if (updates.secondaryAxis) {
      updates.secondaryAxis = this.normalizeAxis(updates.secondaryAxis);
    }

    // Update joint properties
    Object.assign(joint, updates);
    this.joints.set(id, joint); // Update the map

    // Update visual representation
    this.updateJointVisual(joint);

    // Update motion state if needed
    const motionState = this.motionState.get(id);
    if (motionState) {
      motionState.joint = joint;
      // If value was updated, potentially update motion state's primaryValue
      if (updates.value !== undefined) {
        motionState.primaryValue = updates.value;
      }
      this.motionState.set(id, motionState);
    }

    return true;
  }

  /**
   * Remove a joint from this system
   */
  public removeJointFromSystem(id: string): boolean {
    const joint = this.joints.get(id);
    if (!joint) return false;

    this.joints.delete(id);
    this.motionState.delete(id);

    const visual = this.jointVisuals.get(id);
    if (visual && visual.parent) {
      visual.parent.remove(visual);
    }
    this.jointVisuals.delete(id);

    return true;
  }

  /**
   * Get a joint by ID
   */
  public getJoint(id: string): Joint | undefined {
    return this.joints.get(id);
  }

  /**
   * Get all joints managed by this system
   */
  public getAllJoints(): Joint[] {
    return Array.from(this.joints.values());
  }

  /**
   * Get joints connected to a specific component ID
   */
  public getJointsForComponent(componentId: string): Joint[] {
    return Array.from(this.joints.values()).filter(
      joint => joint.parent === componentId || joint.child === componentId // Use parent/child
    );
  }

  /**
   * Apply motion to a joint (update its value)
   */
  public applyJointMotion(jointId: string, primaryValue: number, secondaryValue?: number): boolean {
    const joint = this.joints.get(jointId);
    if (!joint) return false; // Joint must exist in the system

    const motionState = this.motionState.get(jointId);
    if (!motionState) {
      // Should not happen if joint exists, but good practice to check
      console.warn(`Motion state not found for joint ${jointId}`);
      return false;
    }

    // Validate and clamp the primary value based on limits
    const validatedPrimaryValue = this.validateJointValue(joint, primaryValue);

    // Update motion state
    motionState.primaryValue = validatedPrimaryValue;
    if (secondaryValue !== undefined) {
      // TODO: Add validation for secondary value
      motionState.secondaryValue = secondaryValue;
    }
    // No need to set motionState back into map, it's an object reference

    // Update the joint's value property itself in the map
    // Use updateJointInSystem to ensure visuals are also updated
    this.updateJointInSystem(jointId, { value: validatedPrimaryValue });

    // Note: updateJointInSystem calls updateJointVisual, which calls updateVisualFromMotion
    // So the visual update happens implicitly.

    // Notify manager that a joint value has changed
    if (this.assemblyManager) {
      // Consider if a specific event/notification is needed for value change
      // this.assemblyManager.notifyJointValueUpdate(jointId, validatedPrimaryValue);
    }

    return true;
  }

  /**
   * Get current motion state of a joint
   */
  public getJointMotion(jointId: string): JointMotion | undefined {
    return this.motionState.get(jointId);
  }

  // --- Visual Representation Methods ---

  /**
   * Create visual representation of a joint
   */
  private createJointVisual(joint: Joint): THREE.Object3D | null {
    let visual: THREE.Object3D | null = null;

    // Use string literals for type checking
    switch (joint.type) {
      case "revolute":
        visual = this.createRevoluteJointVisual(joint);
        break;
      case "prismatic":
        visual = this.createPrismaticJointVisual(joint);
        break;
      case "fixed":
        visual = this.createFixedJointVisual(joint);
        break;
      case "cylindrical":
      case "spherical":
      case "planar":
      case "free":
      default:
        visual = this.createGenericJointVisual(joint);
    }

    if (visual) {
      visual.userData = { jointId: joint.id };
      visual.visible = joint.visible ?? true; // Use nullish coalescing for default
      this.jointVisuals.set(joint.id, visual);
    }

    return visual;
  }

  /**
   * Update visual representation of a joint
   */
  private updateJointVisual(joint: Joint): void {
    let visual = this.jointVisuals.get(joint.id);

    const shouldBeVisible = joint.visible ?? true;

    if (!visual && shouldBeVisible) {
      // visual = this.createJointVisual(joint);
      const createdVisual = this.createJointVisual(joint);
      visual = createdVisual ?? undefined; // Convert null to undefined
      if (!visual) return; // Exit if creation failed or returned null
    } else if (!visual) {
      return;
    }

    // Update visibility
    visual.visible = joint.visible ?? true;

    // Only proceed with transform/color updates if visible
    if (visual.visible) {
      // Update position based on joint origin (relative to parent's frame)
      visual.position.set(joint.origin.x, joint.origin.y, joint.origin.z);

      // Update orientation based on primary axis
      if (joint.primaryAxis) {
        // Only align if axis exists (e.g., not for 'fixed')
        this.alignVisualToAxis(visual, joint.primaryAxis);
      }

      // Update visual state based on motion (if available)
      const motion = this.motionState.get(joint.id);
      if (motion) {
        this.updateVisualFromMotion(visual, joint, motion);
      }

      // Update color if changed
      // Attempt to find the main mesh material to update color
      const mainMesh = visual.children.find(c => c instanceof THREE.Mesh) as THREE.Mesh;
      if (mainMesh && mainMesh.material instanceof THREE.MeshStandardMaterial) {
        const material = mainMesh.material as THREE.MeshStandardMaterial;
        const targetColor = joint.color ?? this.getDefaultJointColor(joint.type); // Use default if undefined
        if (material.color.getHex() !== targetColor) {
          material.color.setHex(targetColor);
        }
      }
    }
  }

  // Helper to get default color based on type
  private getDefaultJointColor(type: JointType): number {
    switch (type) {
      case "revolute":
        return 0x2196f3;
      case "prismatic":
        return 0x4caf50;
      case "fixed":
        return 0xf44336;
      case "cylindrical":
        return 0x00bcd4; // Cyan
      case "spherical":
        return 0xffeb3b; // Yellow
      case "planar":
        return 0x9c27b0; // Purple
      case "free":
        return 0xcccccc; // Gray
      default:
        return 0xff9800; // Orange
    }
  }

  /**
   * Create visual for revolute (rotational) joint
   */
  private createRevoluteJointVisual(joint: Joint): THREE.Object3D {
    const group = new THREE.Group();
    const geometry = new THREE.TorusGeometry(0.5, 0.1, 16, 32);
    const material = new THREE.MeshStandardMaterial({
      color: joint.color ?? this.getDefaultJointColor("revolute"),
      roughness: 0.5,
      metalness: 0.5,
      transparent: true,
      opacity: 0.8
    });
    const torus = new THREE.Mesh(geometry, material);
    torus.name = "RevoluteVisual";
    group.add(torus);

    const axis = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 0.7, 0xff0000);
    axis.name = "AxisIndicator";
    group.add(axis);

    group.position.set(joint.origin.x, joint.origin.y, joint.origin.z);
    this.alignVisualToAxis(group, joint.primaryAxis);
    return group;
  }

  /**
   * Create visual for prismatic (sliding) joint
   */
  private createPrismaticJointVisual(joint: Joint): THREE.Object3D {
    const group = new THREE.Group();
    const geometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 16);
    const material = new THREE.MeshStandardMaterial({
      color: joint.color ?? this.getDefaultJointColor("prismatic"),
      roughness: 0.5,
      metalness: 0.5,
      transparent: true,
      opacity: 0.8
    });
    const cylinder = new THREE.Mesh(geometry, material);
    cylinder.name = "PrismaticVisual";
    group.add(cylinder);

    const arrowMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const arrowGeom = new THREE.ConeGeometry(0.05, 0.15);
    const arrowHead1 = new THREE.Mesh(arrowGeom, arrowMaterial);
    arrowHead1.position.y = 0.5;
    arrowHead1.name = "Arrow1";
    const arrowHead2 = new THREE.Mesh(arrowGeom, arrowMaterial);
    arrowHead2.position.y = -0.5;
    arrowHead2.rotation.z = Math.PI;
    arrowHead2.name = "Arrow2";
    group.add(arrowHead1);
    group.add(arrowHead2);

    group.position.set(joint.origin.x, joint.origin.y, joint.origin.z);
    this.alignVisualToAxis(group, joint.primaryAxis);
    return group;
  }

  /**
   * Create visual for fixed joint
   */
  private createFixedJointVisual(joint: Joint): THREE.Object3D {
    const group = new THREE.Group();
    const geometry = new THREE.SphereGeometry(0.15, 16, 16);
    const material = new THREE.MeshStandardMaterial({
      color: joint.color ?? this.getDefaultJointColor("fixed"),
      roughness: 0.5,
      metalness: 0.5
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.name = "FixedVisual";
    group.add(sphere);
    group.position.set(joint.origin.x, joint.origin.y, joint.origin.z);
    return group;
  }

  /**
   * Create a generic visual for other joint types
   */
  private createGenericJointVisual(joint: Joint): THREE.Object3D {
    const group = new THREE.Group();
    const geometry = new THREE.SphereGeometry(0.2, 16, 16);
    const material = new THREE.MeshStandardMaterial({
      color: joint.color ?? this.getDefaultJointColor(joint.type), // Use default based on actual type
      roughness: 0.5,
      metalness: 0.5,
      transparent: true,
      opacity: 0.7
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.name = "GenericVisual";
    group.add(sphere);
    group.position.set(joint.origin.x, joint.origin.y, joint.origin.z);

    if (joint.primaryAxis) {
      const axis = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 0.5, 0xcccccc);
      // Need to align the arrow helper itself, not the group
      const axisVector = new THREE.Vector3(joint.primaryAxis.x, joint.primaryAxis.y, joint.primaryAxis.z);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axisVector);
      axis.setRotationFromQuaternion(quaternion);
      group.add(axis);
    }
    return group;
  }

  /**
   * Align a visual object's local Y-axis to the joint's axis
   */
  private alignVisualToAxis(visual: THREE.Object3D, axis: Vector3): void {
    // Ensure axis is normalized (should be done on joint creation/update)
    const axisVector = new THREE.Vector3(axis.x, axis.y, axis.z);
    const defaultUp = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion();

    // Check for edge cases (axis aligned with defaultUp or its negative)
    if (axisVector.distanceTo(defaultUp) < 1e-6) {
      // Already aligned, do nothing
      visual.quaternion.identity();
    } else if (axisVector.distanceTo(defaultUp.clone().negate()) < 1e-6) {
      // Aligned opposite, rotate 180 degrees around X or Z
      quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
      visual.setRotationFromQuaternion(quaternion);
    } else {
      // General case: use setFromUnitVectors
      quaternion.setFromUnitVectors(defaultUp, axisVector);
      visual.setRotationFromQuaternion(quaternion);
    }
  }

  /**
   * Update visual representation based on joint motion
   */
  private updateVisualFromMotion(visual: THREE.Object3D, joint: Joint, motion: JointMotion): void {
    // Use string literals for type checking
    switch (joint.type) {
      case "revolute": {
        const rotationPart = visual.getObjectByName("RevoluteVisual"); // Find the torus
        if (rotationPart) {
          // Rotate the torus around the group's local Y-axis (aligned with joint axis)
          rotationPart.rotation.y = THREE.MathUtils.degToRad(motion.primaryValue);
        }
        break;
      }
      case "prismatic": {
        // Move the main cylinder visual along the group's local Y-axis
        const slidingPart = visual.getObjectByName("PrismaticVisual");
        if (slidingPart) {
          // Move relative to its initial centered position (0)
          slidingPart.position.y = motion.primaryValue * 0.1; // Scale factor for visual effect
        }
        break;
      }
      // Add other cases as needed
      default:
        break;
    }
  }

  /**
   * Get the visual representation for a joint
   */
  public getJointVisual(jointId: string): THREE.Object3D | undefined {
    return this.jointVisuals.get(jointId);
  }

  /**
   * Set the visibility of all joint visuals
   */
  public setAllJointsVisibility(visible: boolean): void {
    // Use Array.from for iteration compatibility
    Array.from(this.joints.keys()).forEach(jointId => {
      // Call updateJointInSystem which handles visual update
      this.updateJointInSystem(jointId, { visible });
    });
  }

  /**
   * Clear all joints and visuals
   */
  public clear(): void {
    // Use Array.from for iteration compatibility
    Array.from(this.jointVisuals.values()).forEach(visual => {
      if (visual.parent) {
        visual.parent.remove(visual);
      }
    });
    this.joints.clear();
    this.jointVisuals.clear();
    this.motionState.clear();
  }

  // --- Constraint Calculation Methods (Require AssemblyManager) ---

  /**
   * Calculate the allowed movement of a node based on joints connecting it as a child.
   * Requires AssemblyManager for full context. Returns unconstrained if manager not set.
   */
  public calculateAllowedMovement(nodeId: string): {
    translationLimits: { min: Vector3; max: Vector3 };
    rotationLimits: { min: Vector3; max: Vector3 };
  } {
    const defaultFreedom = {
      translationLimits: {
        min: { x: -Infinity, y: -Infinity, z: -Infinity },
        max: { x: Infinity, y: Infinity, z: Infinity }
      },
      rotationLimits: {
        min: { x: -Infinity, y: -Infinity, z: -Infinity },
        max: { x: Infinity, y: Infinity, z: Infinity }
      }
    };

    if (!this.assemblyManager) {
      console.warn("AssemblyManager not set in JointSystem. Cannot calculate allowed movement.");
      return defaultFreedom;
    }

    // Get joints where this node is the CHILD
    const joints = this.getJointsForComponent(nodeId).filter(j => j.child === nodeId);

    if (joints.length === 0) {
      return defaultFreedom; // No constraints as child, free relative to parent
    }

    // Apply constraints from the FIRST joint found (simplification)
    const joint = joints[0];
    const result = JSON.parse(JSON.stringify(defaultFreedom)); // Deep copy default
    this.applyJointConstraints(joint, result); // Modify result based on joint type/limits

    return result;
  }

  /**
   * Helper to apply constraints for a single joint type. Modifies the result object.
   */
  private applyJointConstraints(
    joint: Joint,
    result: {
      translationLimits: { min: Vector3; max: Vector3 };
      rotationLimits: { min: Vector3; max: Vector3 };
    }
  ): void {
    const limits = joint.limits;
    const axis = joint.primaryAxis; // Assumed normalized

    // Use string literals for type checking
    switch (joint.type) {
      case "fixed":
        result.translationLimits = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
        result.rotationLimits = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
        break;

      case "revolute": {
        result.translationLimits = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }; // No translation
        const minAngle = limits?.minAngle ?? -Infinity;
        const maxAngle = limits?.maxAngle ?? Infinity;
        // Lock axes perpendicular to dominant axis (simplified)
        if (Math.abs(axis.x) > 0.9) {
          // X-axis rotation
          result.rotationLimits = { min: { x: minAngle, y: 0, z: 0 }, max: { x: maxAngle, y: 0, z: 0 } };
        } else if (Math.abs(axis.y) > 0.9) {
          // Y-axis rotation
          result.rotationLimits = { min: { x: 0, y: minAngle, z: 0 }, max: { x: 0, y: maxAngle, z: 0 } };
        } else {
          // Z-axis rotation
          result.rotationLimits = { min: { x: 0, y: 0, z: minAngle }, max: { x: 0, y: 0, z: maxAngle } };
        }
        break;
      }
      case "prismatic": {
        result.rotationLimits = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }; // No rotation
        const minDist = limits?.minDistance ?? -Infinity;
        const maxDist = limits?.maxDistance ?? Infinity;
        // Lock axes perpendicular to dominant axis (simplified)
        if (Math.abs(axis.x) > 0.9) {
          // X-axis translation
          result.translationLimits = { min: { x: minDist, y: 0, z: 0 }, max: { x: maxDist, y: 0, z: 0 } };
        } else if (Math.abs(axis.y) > 0.9) {
          // Y-axis translation
          result.translationLimits = { min: { x: 0, y: minDist, z: 0 }, max: { x: 0, y: maxDist, z: 0 } };
        } else {
          // Z-axis translation
          result.translationLimits = { min: { x: 0, y: 0, z: minDist }, max: { x: 0, y: 0, z: maxDist } };
        }
        break;
      }
      case "cylindrical": {
        const minAngle = limits?.minAngle ?? -Infinity;
        const maxAngle = limits?.maxAngle ?? Infinity;
        const minDist = limits?.minDistance ?? -Infinity;
        const maxDist = limits?.maxDistance ?? Infinity;
        // Lock perpendicular axes, allow along dominant axis
        if (Math.abs(axis.x) > 0.9) {
          // X-axis
          result.translationLimits = { min: { x: minDist, y: 0, z: 0 }, max: { x: maxDist, y: 0, z: 0 } };
          result.rotationLimits = { min: { x: minAngle, y: 0, z: 0 }, max: { x: maxAngle, y: 0, z: 0 } };
        } else if (Math.abs(axis.y) > 0.9) {
          // Y-axis
          result.translationLimits = { min: { x: 0, y: minDist, z: 0 }, max: { x: 0, y: maxDist, z: 0 } };
          result.rotationLimits = { min: { x: 0, y: minAngle, z: 0 }, max: { x: 0, y: maxAngle, z: 0 } };
        } else {
          // Z-axis
          result.translationLimits = { min: { x: 0, y: 0, z: minDist }, max: { x: 0, y: 0, z: maxDist } };
          result.rotationLimits = { min: { x: 0, y: 0, z: minAngle }, max: { x: 0, y: 0, z: maxAngle } };
        }
        break;
      }
      case "spherical":
        result.translationLimits = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }; // No translation
        // Full rotation freedom (ignoring complex limits for simplicity)
        result.rotationLimits = {
          min: { x: -Infinity, y: -Infinity, z: -Infinity },
          max: { x: Infinity, y: Infinity, z: Infinity }
        };
        break;
      case "planar": {
        result.rotationLimits = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }; // No rotation
        const normal = axis; // For planar, primaryAxis is the normal
        const minDist = limits?.minDistance ?? -Infinity; // Apply distance limits to planar movement
        const maxDist = limits?.maxDistance ?? Infinity;
        // Lock translation along normal, allow perpendicular (simplified)
        if (Math.abs(normal.x) > 0.9) {
          // Normal X -> Move YZ
          result.translationLimits = { min: { x: 0, y: minDist, z: minDist }, max: { x: 0, y: maxDist, z: maxDist } };
        } else if (Math.abs(normal.y) > 0.9) {
          // Normal Y -> Move XZ
          result.translationLimits = { min: { x: minDist, y: 0, z: minDist }, max: { x: maxDist, y: 0, z: maxDist } };
        } else {
          // Normal Z -> Move XY
          result.translationLimits = { min: { x: minDist, y: minDist, z: 0 }, max: { x: maxDist, y: maxDist, z: 0 } };
        }
        break;
      }
      case "free": // No constraints imposed by this joint
        break;
    }
  }

  /**
   * Update assembly node transforms based on joint values. Requires AssemblyManager.
   */
  public updateAssemblyPositions(): void {
    if (!this.assemblyManager) {
      console.warn("AssemblyManager not set in JointSystem. Cannot update assembly positions.");
      return;
    }

    const rootNodeIds = this.assemblyManager.getState().rootNodes;
    const worldTransforms = new Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }>();

    rootNodeIds.forEach(rootId => {
      this.updateNodeTransformRecursive(rootId, null, worldTransforms);
    });

    worldTransforms.forEach((transform, nodeId) => {
      const node = this.assemblyManager.getNode(nodeId);
      if (node) {
        const euler = new THREE.Euler().setFromQuaternion(transform.quaternion, "XYZ");
        const newPosition = { x: transform.position.x, y: transform.position.y, z: transform.position.z };
        const newRotation = {
          x: THREE.MathUtils.radToDeg(euler.x),
          y: THREE.MathUtils.radToDeg(euler.y),
          z: THREE.MathUtils.radToDeg(euler.z)
        };
        // Check if transform actually changed to avoid unnecessary updates/history spam
        const posChanged =
          Math.abs(node.position.x - newPosition.x) > 1e-6 ||
          Math.abs(node.position.y - newPosition.y) > 1e-6 ||
          Math.abs(node.position.z - newPosition.z) > 1e-6;
        const rotChanged =
          Math.abs(node.rotation.x - newRotation.x) > 1e-6 ||
          Math.abs(node.rotation.y - newRotation.y) > 1e-6 ||
          Math.abs(node.rotation.z - newRotation.z) > 1e-6;

        if (posChanged || rotChanged) {
          this.assemblyManager.updateNode(nodeId, {
            position: newPosition,
            rotation: newRotation
          }); // isInternalUpdate = true (prevents history loop)
        }
      }
    });
  }

  /**
   * Recursively update world transforms of a node and its children (Helper).
   */
  private updateNodeTransformRecursive(
    nodeId: string,
    parentWorldTransform: { position: THREE.Vector3; quaternion: THREE.Quaternion } | null,
    worldTransforms: Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }>
  ): void {
    if (!this.assemblyManager) return;
    const node = this.assemblyManager.getNode(nodeId);
    if (!node) return;

    // 1. Local Transform (Node's position/rotation relative to parent)
    const localPosition = new THREE.Vector3(node.position.x, node.position.y, node.position.z);
    const localQuaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(node.rotation.x),
        THREE.MathUtils.degToRad(node.rotation.y),
        THREE.MathUtils.degToRad(node.rotation.z),
        "XYZ"
      )
    );

    // 2. Joint Transform (Child's offset/orientation relative to parent due to joint value)
    let jointPositionOffset = new THREE.Vector3(0, 0, 0);
    let jointQuaternionOffset = new THREE.Quaternion();

    if (node.parent && node.jointId) {
      const joint = this.getJoint(node.jointId);
      // Ensure this node is the child and joint exists
      if (joint && joint.child === nodeId) {
        const jointTransform = this.calculateJointTransform(joint); // Gets local transform from joint value
        jointPositionOffset = jointTransform.position;
        jointQuaternionOffset = jointTransform.quaternion;
      }
    }

    // 3. Calculate World Transform
    let currentWorldPosition: THREE.Vector3;
    let currentWorldQuaternion: THREE.Quaternion;

    if (parentWorldTransform) {
      // Start with parent's world transform
      currentWorldPosition = parentWorldTransform.position.clone();
      currentWorldQuaternion = parentWorldTransform.quaternion.clone();

      // Apply local node transform (relative to parent)
      const rotatedLocalPosition = localPosition.clone().applyQuaternion(parentWorldTransform.quaternion);
      currentWorldPosition.add(rotatedLocalPosition);
      currentWorldQuaternion.multiply(localQuaternion);

      // Apply joint transform (relative to parent's frame *after* local node transform)
      // Note: Joint origin is often defined relative to parent, so this step might need adjustment
      // depending on the exact definition of joint origin and axes.
      // Assuming joint transform is applied last in the local frame before parent world transform.
      // Revisit this logic based on coordinate system conventions.

      // Simpler: Combine local + joint first, then apply parent world transform
      const combinedLocalPosition = localPosition.clone().add(jointPositionOffset);
      const combinedLocalQuaternion = localQuaternion.clone().multiply(jointQuaternionOffset);

      currentWorldPosition = combinedLocalPosition.clone().applyQuaternion(parentWorldTransform.quaternion);
      currentWorldPosition.add(parentWorldTransform.position);
      currentWorldQuaternion = parentWorldTransform.quaternion.clone().multiply(combinedLocalQuaternion);
    } else {
      // Root node: World transform is just local transform (plus any root joint effect if applicable)
      currentWorldPosition = localPosition.clone().add(jointPositionOffset); // Should be (0,0,0) for roots usually
      currentWorldQuaternion = localQuaternion.clone().multiply(jointQuaternionOffset); // Should be identity for roots usually
    }

    // Store the calculated world transform
    worldTransforms.set(nodeId, { position: currentWorldPosition, quaternion: currentWorldQuaternion });

    // Update children recursively
    node.children.forEach(childId => {
      this.updateNodeTransformRecursive(childId, worldTransforms.get(nodeId)!, worldTransforms);
    });
  }

  /**
   * Calculate the local transform (position offset and rotation offset) applied by a joint based on its value.
   * This transform is relative to the parent's coordinate system at the joint origin.
   */
  private calculateJointTransform(joint: Joint): {
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
  } {
    const result = {
      position: new THREE.Vector3(0, 0, 0),
      quaternion: new THREE.Quaternion()
    };

    const jointValue = joint.value ?? 0;
    // Use THREE.Vector3 for calculations
    const axis = new THREE.Vector3(joint.primaryAxis.x, joint.primaryAxis.y, joint.primaryAxis.z); // Assumed normalized by definition

    // Use string literals for type checking
    switch (joint.type) {
      case "revolute": {
        const angleRad = THREE.MathUtils.degToRad(jointValue);
        result.quaternion.setFromAxisAngle(axis, angleRad);
        // Position offset is zero for pure rotation
        break;
      }
      case "prismatic": {
        result.position.copy(axis).multiplyScalar(jointValue);
        // Rotation offset is identity for pure translation
        break;
      }
      case "cylindrical": {
        // How is value mapped? Needs clear definition. Assume value = distance for now.
        const distance = jointValue;
        const angleRad = 0; // Need secondary value or convention (e.g., motionState.secondaryValue)

        result.position.copy(axis).multiplyScalar(distance);
        result.quaternion.setFromAxisAngle(axis, angleRad);
        break;
      }
      // --- Simplifications for other types ---
      // These joints constrain position/orientation but don't typically have a single 'value' driving transform offset
      case "spherical":
      case "planar":
      case "fixed":
      case "free":
        break;
    }

    return result;
  }

  /**
   * Normalize a vector to unit length
   */
  private normalizeAxis(axis: Vector3): Vector3 {
    const length = Math.sqrt(axis.x * axis.x + axis.y * axis.y + axis.z * axis.z);
    if (length < 1e-6) {
      return { x: 0, y: 0, z: 1 };
    }
    return { x: axis.x / length, y: axis.y / length, z: axis.z / length };
  }

  /**
   * Validate and clamp a joint value based on its limits
   */
  public validateJointValue(joint: Joint, value: number): number {
    let validValue = value;
    const limits = joint.limits;
    if (!limits) return validValue;

    // Use string literals for type checking
    switch (joint.type) {
      case "revolute":
      case "spherical": // Simple angle limits for spherical
        if (limits.minAngle !== undefined && validValue < limits.minAngle) {
          validValue = limits.minAngle;
        }
        if (limits.maxAngle !== undefined && validValue > limits.maxAngle) {
          validValue = limits.maxAngle;
        }
        break;

      case "prismatic":
      case "planar": // Simple distance limits for planar
        if (limits.minDistance !== undefined && validValue < limits.minDistance) {
          validValue = limits.minDistance;
        }
        if (limits.maxDistance !== undefined && validValue > limits.maxDistance) {
          validValue = limits.maxDistance;
        }
        break;

      case "cylindrical":
        // Apply distance limits first (assuming value maps primarily to distance)
        if (limits.minDistance !== undefined && validValue < limits.minDistance) {
          validValue = limits.minDistance;
        }
        if (limits.maxDistance !== undefined && validValue > limits.maxDistance) {
          validValue = limits.maxDistance;
        }
        // TODO: Consider how angle limits apply if secondaryValue is used
        break;

      case "fixed":
        validValue = 0;
        break;

      case "free":
        break;
    }

    return validValue;
  }
}
