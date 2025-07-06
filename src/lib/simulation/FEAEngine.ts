import { Vector3, Matrix4 } from "three";
import { Mesh } from "../../types/mesh";

export type Node = {
  id: number;
  position: Vector3;
  fixed: boolean;
  loads: Vector3;
  displacements?: Vector3;
};

export type Element = {
  id: number;
  nodes: number[];
  materialId: number;
  stress?: number[];
  strain?: number[];
};

export type Material = {
  id: number;
  name: string;
  youngsModulus: number; // E
  poissonRatio: number; // ν
  density: number; // ρ (kg/m³)
  thermalConductivity?: number;
  specificHeat?: number;
  thermalExpansion?: number;
};

export type SimulationModel = {
  nodes: Node[];
  elements: Element[];
  materials: Material[];
};

export type SimulationResults = {
  displacements: Vector3[];
  stresses: number[][];
  strains: number[][];
  vonMisesStress: number[];
  maxDisplacement: number;
  maxStress: number;
  safetyFactor: number[];
};

export class FEAEngine {
  private model: SimulationModel;
  private results: SimulationResults | null = null;

  constructor(mesh?: Mesh, materials?: Material[]) {
    this.model = {
      nodes: [],
      elements: [],
      materials: materials || []
    };

    if (mesh) {
      this.importFromMesh(mesh);
    }
  }

  importFromMesh(mesh: Mesh): void {
    // Convert THREE.js geometry to FEA nodes and elements
    // This is a simplified version - real implementation would be more complex
    const positions = mesh.geometry.attributes.position.array;
    const indices = mesh.geometry.index?.array;

    if (!indices) {
      throw new Error("Mesh must have an index buffer");
    }

    // Create nodes
    for (let i = 0; i < positions.length; i += 3) {
      this.model.nodes.push({
        id: i / 3,
        position: new Vector3(positions[i], positions[i + 1], positions[i + 2]),
        fixed: false,
        loads: new Vector3(0, 0, 0)
      });
    }

    // Create elements (tetrahedra or triangles depending on mesh type)
    const isTetrahedral = mesh.geometry.type === "TetrahedronGeometry";

    for (let i = 0; i < indices.length; i += isTetrahedral ? 4 : 3) {
      this.model.elements.push({
        id: i / (isTetrahedral ? 4 : 3),
        nodes: isTetrahedral
          ? [indices[i], indices[i + 1], indices[i + 2], indices[i + 3]]
          : [indices[i], indices[i + 1], indices[i + 2]],
        materialId: 0 // Default material
      });
    }
  }

  applyConstraint(nodeIds: number[], fixed: boolean = true): void {
    nodeIds.forEach(id => {
      const node = this.model.nodes.find(n => n.id === id);
      if (node) {
        node.fixed = fixed;
      }
    });
  }

  applyForce(nodeIds: number[], force: Vector3): void {
    nodeIds.forEach(id => {
      const node = this.model.nodes.find(n => n.id === id);
      if (node) {
        node.loads.add(force);
      }
    });
  }

  applyPressure(elementIds: number[], pressure: number): void {
    // Convert pressure to equivalent nodal forces
    elementIds.forEach(id => {
      const element = this.model.elements.find(e => e.id === id);
      if (element) {
        // Calculate surface normal and area
        // Distribute pressure as forces to nodes
        // Simplified: would need proper implementation
        const nodes = element.nodes.map(nodeId => this.model.nodes.find(n => n.id === nodeId));

        // Apply force to each node
        nodes.forEach(node => {
          if (node) {
            // This is very simplified - actual implementation would compute
            // proper pressure distribution
            const forcePerNode = new Vector3(0, -pressure, 0);
            node.loads.add(forcePerNode);
          }
        });
      }
    });
  }

  solve(): SimulationResults {
    // This is a placeholder for a real FEA solver
    // In a real implementation, we would:
    // 1. Assemble the global stiffness matrix
    // 2. Apply boundary conditions
    // 3. Solve the system of equations
    // 4. Calculate stresses and strains

    // For now, we'll simulate results with placeholder calculations
    const displacements: Vector3[] = this.model.nodes.map(node => {
      if (node.fixed) {
        return new Vector3(0, 0, 0);
      }
      // Simplified displacement calculation
      return new Vector3(node.loads.x * 0.001, node.loads.y * 0.001, node.loads.z * 0.001);
    });

    // Calculate strains and stresses (extremely simplified)
    const stresses: number[][] = this.model.elements.map(element => {
      return [0, 0, 0, 0, 0, 0]; // σx, σy, σz, τxy, τyz, τzx
    });

    const strains: number[][] = this.model.elements.map(element => {
      return [0, 0, 0, 0, 0, 0]; // εx, εy, εz, γxy, γyz, γzx
    });

    // Calculate von Mises stress
    const vonMisesStress = stresses.map(stress => {
      const [sx, sy, sz, txy, tyz, tzx] = stress;
      return Math.sqrt(
        0.5 *
          (Math.pow(sx - sy, 2) + Math.pow(sy - sz, 2) + Math.pow(sz - sx, 2) + 6 * (txy * txy + tyz * tyz + tzx * tzx))
      );
    });

    // Calculate safety factor based on material yield strength
    // Placeholder - would need material yield strength
    const safetyFactor = vonMisesStress.map(stress => (stress > 0 ? 250 / stress : 999));

    const maxDisplacement = Math.max(...displacements.map(d => d.length()));

    const maxStress = Math.max(...vonMisesStress);

    this.results = {
      displacements,
      stresses,
      strains,
      vonMisesStress,
      maxDisplacement,
      maxStress,
      safetyFactor
    };

    return this.results;
  }

  getResults(): SimulationResults | null {
    return this.results;
  }

  // Method to create a mesh with deformation visualization
  createDeformedMesh(originalMesh: Mesh, scale: number = 1.0): Mesh {
    if (!this.results) {
      throw new Error("No simulation results available");
    }

    // Clone the original mesh
    const deformedMesh = originalMesh.clone();

    // Get the position buffer
    const positions = deformedMesh.geometry.attributes.position.array;

    // Apply displacements
    for (let i = 0, j = 0; i < positions.length; i += 3, j++) {
      const displacement = this.results.displacements[j];
      if (displacement) {
        positions[i] += displacement.x * scale;
        positions[i + 1] += displacement.y * scale;
        positions[i + 2] += displacement.z * scale;
      }
    }

    // Update the geometry
    deformedMesh.geometry.attributes.position.needsUpdate = true;

    return deformedMesh;
  }
}
