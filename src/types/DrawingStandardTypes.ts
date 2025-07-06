// src/types/DrawingStandardTypes.ts

import { DrawingStandard } from "./TechnicalDrawingTypes";

// Define the standard configuration structure
export interface DrawingStandardConfig {
  name: string;
  description: string;

  lineTypes: {
    visible: {
      width: number;
      color: string;
    };
    hidden: {
      width: number;
      color: string;
      pattern: number[];
    };
    center: {
      width: number;
      color: string;
      pattern: number[];
    };
    construction: {
      width: number;
      color: string;
      pattern: number[];
    };
    dimension: {
      width: number;
      color: string;
    };
    extension: {
      width: number;
      color: string;
    };
    leader: {
      width: number;
      color: string;
    };
  };

  text: {
    standardFont: string;
    titleHeight: number;
    normalHeight: number;
    smallHeight: number;
  };

  dimensions: {
    arrowSize: number;
    textHeight: number;
    textOffset: number;
    extensionLineOffset: number;
    extensionLineExtension: number;
  };

  units: {
    default: "mm" | "inch" | "cm";
    precision: number;
    displayUnitLabels: boolean;
  };

  paperSizes: {
    name: string;
    width: number;
    height: number;
  }[];
}

// Define standard configurations for each drawing standard
const standardConfigs: Record<DrawingStandard, DrawingStandardConfig> = {
  // ISO standard (metric)
  ISO: {
    name: "ISO",
    description: "International Organization for Standardization",

    lineTypes: {
      visible: {
        width: 0.5,
        color: "#000000"
      },
      hidden: {
        width: 0.3,
        color: "#000000",
        pattern: [5, 3]
      },
      center: {
        width: 0.3,
        color: "#000000",
        pattern: [10, 3, 2, 3]
      },
      construction: {
        width: 0.1,
        color: "#888888",
        pattern: [3, 3]
      },
      dimension: {
        width: 0.3,
        color: "#0000FF"
      },
      extension: {
        width: 0.3,
        color: "#0000FF"
      },
      leader: {
        width: 0.3,
        color: "#FF0000"
      }
    },

    text: {
      standardFont: "Arial",
      titleHeight: 5,
      normalHeight: 3.5,
      smallHeight: 2.5
    },

    dimensions: {
      arrowSize: 3,
      textHeight: 3.5,
      textOffset: 1,
      extensionLineOffset: 2,
      extensionLineExtension: 2
    },

    units: {
      default: "mm",
      precision: 1,
      displayUnitLabels: true
    },

    paperSizes: [
      { name: "A0", width: 841, height: 1189 },
      { name: "A1", width: 594, height: 841 },
      { name: "A2", width: 420, height: 594 },
      { name: "A3", width: 297, height: 420 },
      { name: "A4", width: 210, height: 297 }
    ]
  },

  // ANSI standard (imperial)
  ANSI: {
    name: "ANSI",
    description: "American National Standards Institute",

    lineTypes: {
      visible: {
        width: 0.024,
        color: "#000000"
      },
      hidden: {
        width: 0.016,
        color: "#000000",
        pattern: [0.125, 0.0625]
      },
      center: {
        width: 0.016,
        color: "#000000",
        pattern: [0.25, 0.0625, 0.0625, 0.0625]
      },
      construction: {
        width: 0.008,
        color: "#888888",
        pattern: [0.0625, 0.0625]
      },
      dimension: {
        width: 0.016,
        color: "#0000FF"
      },
      extension: {
        width: 0.016,
        color: "#0000FF"
      },
      leader: {
        width: 0.016,
        color: "#FF0000"
      }
    },

    text: {
      standardFont: "Arial",
      titleHeight: 0.2,
      normalHeight: 0.125,
      smallHeight: 0.1
    },

    dimensions: {
      arrowSize: 0.125,
      textHeight: 0.125,
      textOffset: 0.0625,
      extensionLineOffset: 0.0625,
      extensionLineExtension: 0.0625
    },

    units: {
      default: "inch",
      precision: 3,
      displayUnitLabels: true
    },

    paperSizes: [
      { name: "A", width: 8.5, height: 11 },
      { name: "B", width: 11, height: 17 },
      { name: "C", width: 17, height: 22 },
      { name: "D", width: 22, height: 34 },
      { name: "E", width: 34, height: 44 }
    ]
  },

  // DIN standard (German)
  DIN: {
    name: "DIN",
    description: "Deutsches Institut für Normung",

    lineTypes: {
      visible: {
        width: 0.5,
        color: "#000000"
      },
      hidden: {
        width: 0.3,
        color: "#000000",
        pattern: [5, 3]
      },
      center: {
        width: 0.3,
        color: "#000000",
        pattern: [10, 3, 2, 3]
      },
      construction: {
        width: 0.1,
        color: "#888888",
        pattern: [3, 3]
      },
      dimension: {
        width: 0.3,
        color: "#0000FF"
      },
      extension: {
        width: 0.3,
        color: "#0000FF"
      },
      leader: {
        width: 0.3,
        color: "#FF0000"
      }
    },

    text: {
      standardFont: "Arial",
      titleHeight: 5,
      normalHeight: 3.5,
      smallHeight: 2.5
    },

    dimensions: {
      arrowSize: 3,
      textHeight: 3.5,
      textOffset: 1,
      extensionLineOffset: 2,
      extensionLineExtension: 2
    },

    units: {
      default: "mm",
      precision: 1,
      displayUnitLabels: true
    },

    paperSizes: [
      { name: "A0", width: 841, height: 1189 },
      { name: "A1", width: 594, height: 841 },
      { name: "A2", width: 420, height: 594 },
      { name: "A3", width: 297, height: 420 },
      { name: "A4", width: 210, height: 297 }
    ]
  },

  // JIS standard (Japanese)
  JIS: {
    name: "JIS",
    description: "Japanese Industrial Standards",

    lineTypes: {
      visible: {
        width: 0.5,
        color: "#000000"
      },
      hidden: {
        width: 0.3,
        color: "#000000",
        pattern: [5, 3]
      },
      center: {
        width: 0.3,
        color: "#000000",
        pattern: [10, 3, 2, 3]
      },
      construction: {
        width: 0.1,
        color: "#888888",
        pattern: [3, 3]
      },
      dimension: {
        width: 0.3,
        color: "#0000FF"
      },
      extension: {
        width: 0.3,
        color: "#0000FF"
      },
      leader: {
        width: 0.3,
        color: "#FF0000"
      }
    },

    text: {
      standardFont: "Arial",
      titleHeight: 5,
      normalHeight: 3.5,
      smallHeight: 2.5
    },

    dimensions: {
      arrowSize: 3,
      textHeight: 3.5,
      textOffset: 1,
      extensionLineOffset: 2,
      extensionLineExtension: 2
    },

    units: {
      default: "mm",
      precision: 1,
      displayUnitLabels: true
    },

    paperSizes: [
      { name: "A0", width: 841, height: 1189 },
      { name: "A1", width: 594, height: 841 },
      { name: "A2", width: 420, height: 594 },
      { name: "A3", width: 297, height: 420 },
      { name: "A4", width: 210, height: 297 }
    ]
  },

  // GB standard (Chinese)
  GB: {
    name: "GB",
    description: "Guobiao Standards (Chinese National Standards)",

    lineTypes: {
      visible: {
        width: 0.5,
        color: "#000000"
      },
      hidden: {
        width: 0.3,
        color: "#000000",
        pattern: [5, 3]
      },
      center: {
        width: 0.3,
        color: "#000000",
        pattern: [10, 3, 2, 3]
      },
      construction: {
        width: 0.1,
        color: "#888888",
        pattern: [3, 3]
      },
      dimension: {
        width: 0.3,
        color: "#0000FF"
      },
      extension: {
        width: 0.3,
        color: "#0000FF"
      },
      leader: {
        width: 0.3,
        color: "#FF0000"
      }
    },

    text: {
      standardFont: "Arial",
      titleHeight: 5,
      normalHeight: 3.5,
      smallHeight: 2.5
    },

    dimensions: {
      arrowSize: 3,
      textHeight: 3.5,
      textOffset: 1,
      extensionLineOffset: 2,
      extensionLineExtension: 2
    },

    units: {
      default: "mm",
      precision: 1,
      displayUnitLabels: true
    },

    paperSizes: [
      { name: "A0", width: 841, height: 1189 },
      { name: "A1", width: 594, height: 841 },
      { name: "A2", width: 420, height: 594 },
      { name: "A3", width: 297, height: 420 },
      { name: "A4", width: 210, height: 297 }
    ]
  },

  // Custom standard (default values, to be customized)
  custom: {
    name: "Custom",
    description: "User-defined custom standard",

    lineTypes: {
      visible: {
        width: 0.5,
        color: "#000000"
      },
      hidden: {
        width: 0.3,
        color: "#000000",
        pattern: [5, 3]
      },
      center: {
        width: 0.3,
        color: "#000000",
        pattern: [10, 3, 2, 3]
      },
      construction: {
        width: 0.1,
        color: "#888888",
        pattern: [3, 3]
      },
      dimension: {
        width: 0.3,
        color: "#0000FF"
      },
      extension: {
        width: 0.3,
        color: "#0000FF"
      },
      leader: {
        width: 0.3,
        color: "#FF0000"
      }
    },

    text: {
      standardFont: "Arial",
      titleHeight: 5,
      normalHeight: 3.5,
      smallHeight: 2.5
    },

    dimensions: {
      arrowSize: 3,
      textHeight: 3.5,
      textOffset: 1,
      extensionLineOffset: 2,
      extensionLineExtension: 2
    },

    units: {
      default: "mm",
      precision: 1,
      displayUnitLabels: true
    },

    paperSizes: [
      { name: "A0", width: 841, height: 1189 },
      { name: "A1", width: 594, height: 841 },
      { name: "A2", width: 420, height: 594 },
      { name: "A3", width: 297, height: 420 },
      { name: "A4", width: 210, height: 297 }
    ]
  }
};

// Function to get the configuration for a specific standard
export function getStandardConfig(standard: DrawingStandard): DrawingStandardConfig {
  return standardConfigs[standard] || standardConfigs.ISO;
}

// Function to get paper size information for a specific standard and size
export function getPaperSize(standard: DrawingStandard, size: string): { width: number; height: number } | null {
  const config = getStandardConfig(standard);
  const paperSize = config.paperSizes.find(p => p.name === size);

  return paperSize ? { width: paperSize.width, height: paperSize.height } : null;
}

// Function to get all available paper sizes for a specific standard
export function getPaperSizes(standard: DrawingStandard): { name: string; width: number; height: number }[] {
  const config = getStandardConfig(standard);
  return [...config.paperSizes];
}

// Function to get all available standards
export function getAvailableStandards(): { id: DrawingStandard; name: string; description: string }[] {
  return Object.entries(standardConfigs).map(([id, config]) => ({
    id: id as DrawingStandard,
    name: config.name,
    description: config.description
  }));
}
