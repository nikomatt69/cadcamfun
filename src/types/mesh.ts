import { Mesh as ThreeMesh, BufferGeometry, Material } from "three";

// Extending Three.js Mesh type to add properties needed for our simulation system
export interface Mesh extends ThreeMesh {
  // Include the base ThreeMesh properties
  geometry: BufferGeometry;
  material: Material | Material[];

  // Additional properties for simulation
  uuid: string; // Use uuid instead of id for string identifier
  name: string;
  userData: {
    // Custom properties for our application
    type?: "solid" | "shell" | "beam";
    materialId?: number;
    thickness?: number; // For shell elements
    visible?: boolean;
    locked?: boolean;
    simulationProperties?: {
      density?: number;
      youngsModulus?: number;
      poissonRatio?: number;
      thermalConductivity?: number;
      specificHeat?: number;
      thermalExpansion?: number;
    };
  };
}
