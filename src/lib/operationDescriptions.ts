// src/lib/operationDescriptions.ts
export interface OperationDescription {
  title: string;
  description: string;
  icon?: string; // Optional for future expansion with icons
}

export const getOperationDescription = (operationType: string): OperationDescription => {
  const descriptions: { [key: string]: OperationDescription } = {
    // Milling operations
    "contour": {
      title: "Contouring",
      description: "Contouring - Follows the external or internal profile of the part while maintaining vertical walls."
    },
    "pocket": {
      title: "Pocket Clearing",
      description: "Pocket Clearing - Removes material inside a closed profile creating a cavity."
    },
    "drill": {
      title: "Drilling",
      description: "Drilling - Creates vertical holes of a defined depth."
    },
    "engrave": {
      title: "Engraving",
      description: "Engraving - Traces shallow lines following a path."
    },
    "profile": {
      title: "3D Profile",
      description: "3D Profile - Follows a three-dimensional profile varying the working depth."
    },
    "threading": {
      title: "Threading",
      description: "Threading - Creates internal or external threads with a milling cutter or tap."
    },
    "3d_surface": {
      title: "3D Surface",
      description: "3D Surface - Works on complex three-dimensional surfaces with optimized paths."
    },

    // Lathe operations
    "turning": {
      title: "Turning",
      description: "Turning - Creates external cylindrical surfaces by removing material radially."
    },
    "facing": {
      title: "Facing",
      description: "Facing - Creates flat surfaces perpendicular to the axis of rotation."
    },
    "boring": {
      title: "Boring",
      description: "Boring - Widens or precisely finishes holes or internal surfaces."
    },
    // Other lathe operations with the same keys

    // 3D printing operations
    "standard": {
      title: "Standard Printing",
      description: "Standard Printing - Prints with normal parameters for balanced quality and speed."
    },
    "vase": {
      title: "Vase (Spiral)",
      description: "Vase (Spiral) - Prints in continuous spiral mode without seams for hollow objects."
    }
    // Other 3D printing operations
  };

  return (
    descriptions[operationType] || {
      title: "Custom Operation",
      description: "Custom operation with user-defined parameters."
    }
  );
};
