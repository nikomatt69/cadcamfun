import { Vector3 } from "three";
import { Mesh } from "../../types/mesh";
import { FEAEngine, Material, SimulationResults } from "./FEAEngine";

export type StressAnalysisParams = {
  forces: Array<{
    position: Vector3;
    direction: Vector3;
    magnitude: number;
  }>;
  fixedPoints: Array<{
    position: Vector3;
    fullyFixed: boolean;
  }>;
  material: Material;
};

export type StressAnalysisResults = SimulationResults & {
  failurePoints: Array<{
    position: Vector3;
    safetyFactor: number;
  }>;
  maxEquivalentStress: number;
  deformationScale: number;
};

export class StressAnalysis {
  private engine: FEAEngine;
  private mesh: Mesh;
  private params: StressAnalysisParams | null = null;
  private results: StressAnalysisResults | null = null;

  constructor(mesh: Mesh) {
    this.mesh = mesh;
    this.engine = new FEAEngine(mesh);
  }

  setupAnalysis(params: StressAnalysisParams): void {
    this.params = params;

    // Add material to the engine
    const material = params.material;

    // Find nodes closest to the fixed points
    params.fixedPoints.forEach(point => {
      // Find nodes closest to this point
      const nodeIds = this.findNodesNear(point.position);
      this.engine.applyConstraint(nodeIds, point.fullyFixed);
    });

    // Apply forces
    params.forces.forEach(force => {
      // Find nodes closest to this force application point
      const nodeIds = this.findNodesNear(force.position);
      const forceVector = force.direction.clone().multiplyScalar(force.magnitude);
      this.engine.applyForce(nodeIds, forceVector);
    });
  }

  // Find nodes within a radius of a position
  private findNodesNear(position: Vector3, radius: number = 0.1): number[] {
    // This is a simplified implementation
    // A real implementation would use spatial data structures for efficiency

    // For now, we'll simulate by returning some node IDs
    // In a real implementation, we would:
    // 1. Find nodes within the radius
    // 2. Return their IDs

    return [0, 1, 2]; // Placeholder IDs
  }

  runAnalysis(): StressAnalysisResults {
    if (!this.params) {
      throw new Error("Analysis setup required before running");
    }

    // Run the FEA solver
    const baseResults = this.engine.solve();

    // Calculate critical points where failure is most likely
    const failurePoints = this.findFailurePoints(baseResults);

    // Calculate optimum deformation scale for visualization
    const deformationScale = this.calculateDeformationScale(baseResults);

    // Calculate maximum equivalent (von Mises) stress
    const maxEquivalentStress = Math.max(...baseResults.vonMisesStress);

    // Combine results
    this.results = {
      ...baseResults,
      failurePoints,
      maxEquivalentStress,
      deformationScale
    };

    return this.results;
  }

  private findFailurePoints(results: SimulationResults): Array<{ position: Vector3; safetyFactor: number }> {
    // Find the points with the lowest safety factor
    // In a real implementation, we would use a more sophisticated approach

    const failurePoints: Array<{ position: Vector3; safetyFactor: number }> = [];

    // Get the 5 points with the lowest safety factor
    const safetyFactors = [...results.safetyFactor];
    safetyFactors.sort((a, b) => a - b);

    const threshold = safetyFactors[Math.min(5, safetyFactors.length - 1)];

    results.safetyFactor.forEach((factor, index) => {
      if (factor <= threshold) {
        // Get the node position
        const node = {
          position: new Vector3(0, 0, 0), // Placeholder
          safetyFactor: factor
        };
        failurePoints.push(node);
      }
    });

    return failurePoints;
  }

  private calculateDeformationScale(results: SimulationResults): number {
    // Calculate a reasonable deformation scale for visualization
    // Ideally, we want deformation to be visually noticeable but not exaggerated

    const maxDisplacement = results.maxDisplacement;

    if (maxDisplacement < 0.00001) {
      return 1000; // Very small displacement, needs large scaling
    } else if (maxDisplacement < 0.0001) {
      return 100;
    } else if (maxDisplacement < 0.001) {
      return 10;
    } else if (maxDisplacement > 0.1) {
      return 0.1;
    } else {
      return 1;
    }
  }

  getResults(): StressAnalysisResults | null {
    return this.results;
  }

  getDeformedMesh(scale?: number): Mesh {
    if (!this.results) {
      throw new Error("No analysis results available");
    }

    const actualScale = scale || this.results.deformationScale;

    return this.engine.createDeformedMesh(this.mesh, actualScale);
  }

  static getMaterialLibrary(): Material[] {
    return [
      {
        id: 1,
        name: "Structural Steel",
        youngsModulus: 200e9, // 200 GPa
        poissonRatio: 0.3,
        density: 7850, // kg/m³
        thermalConductivity: 60.5,
        specificHeat: 434,
        thermalExpansion: 12e-6
      },
      {
        id: 2,
        name: "Aluminum Alloy",
        youngsModulus: 71e9, // 71 GPa
        poissonRatio: 0.33,
        density: 2770, // kg/m³
        thermalConductivity: 237,
        specificHeat: 875,
        thermalExpansion: 23.1e-6
      },
      {
        id: 3,
        name: "Titanium Alloy",
        youngsModulus: 116e9, // 116 GPa
        poissonRatio: 0.34,
        density: 4620, // kg/m³
        thermalConductivity: 6.7,
        specificHeat: 526,
        thermalExpansion: 8.6e-6
      },
      {
        id: 4,
        name: "ABS Plastic",
        youngsModulus: 2.3e9, // 2.3 GPa
        poissonRatio: 0.35,
        density: 1050, // kg/m³
        thermalConductivity: 0.17,
        specificHeat: 1300,
        thermalExpansion: 95e-6
      }
    ];
  }
}
