// src/lib/materialProperties.ts
/**
 * Database of material properties for visualization in the preview
 * Contains detailed information on materials used in CNC machining
 */

export interface MaterialPropertyDetail {
  density: string;
  hardness: string;
  thermalBehavior: string;
  chipType: string;
  coolant: string;
  recommendedToolCoating?: string;
  machinability?: string;
  feedrateModifier?: number;
  speedModifier?: number;
}

export const materialProperties: Record<string, MaterialPropertyDetail> = {
  aluminum: {
    density: "2.7 g/cm³",
    hardness: "Medium-low",
    thermalBehavior: "High thermal conductivity",
    chipType: "Long and continuous chips",
    coolant: "Recommended",
    recommendedToolCoating: "TiAlN, AlTiN",
    machinability: "Excellent",
    feedrateModifier: 1.0,
    speedModifier: 1.0
  },
  steel: {
    density: "7.85 g/cm³",
    hardness: "Medium-high",
    thermalBehavior: "Medium thermal conductivity",
    chipType: "Ribbon or segmented chips",
    coolant: "Required",
    recommendedToolCoating: "TiCN, AlTiN",
    machinability: "Good",
    feedrateModifier: 0.6,
    speedModifier: 0.5
  },
  wood: {
    density: "0.4-1.2 g/cm³",
    hardness: "Variable",
    thermalBehavior: "Low thermal conductivity",
    chipType: "Fibrous chips",
    coolant: "Not required",
    recommendedToolCoating: "Not required",
    machinability: "Excellent",
    feedrateModifier: 1.2,
    speedModifier: 1.2
  },
  plastic: {
    density: "0.9-2.2 g/cm³",
    hardness: "Low",
    thermalBehavior: "Heat sensitive",
    chipType: "Melted or curled chips",
    coolant: "Compressed air",
    recommendedToolCoating: "Not required",
    machinability: "Good",
    feedrateModifier: 0.8,
    speedModifier: 0.9
  },
  brass: {
    density: "8.4-8.7 g/cm³",
    hardness: "Medium",
    thermalBehavior: "High thermal conductivity",
    chipType: "Short chips",
    coolant: "Recommended",
    recommendedToolCoating: "TiN",
    machinability: "Excellent",
    feedrateModifier: 1.0,
    speedModifier: 0.8
  },
  titanium: {
    density: "4.5 g/cm³",
    hardness: "High",
    thermalBehavior: "Low thermal conductivity",
    chipType: "Segmented chips",
    coolant: "High pressure required",
    recommendedToolCoating: "AlTiN, TiAlN",
    machinability: "Difficult",
    feedrateModifier: 0.3,
    speedModifier: 0.2
  },
  composite: {
    density: "1.0-2.0 g/cm³",
    hardness: "Variable",
    thermalBehavior: "Low thermal conductivity",
    chipType: "Abrasive chips",
    coolant: "Recommended",
    recommendedToolCoating: "Diamond",
    machinability: "Moderate",
    feedrateModifier: 0.7,
    speedModifier: 0.6
  },
  other: {
    density: "Variable",
    hardness: "Variable",
    thermalBehavior: "Variable",
    chipType: "Variable",
    coolant: "Consult specifications",
    machinability: "Variable"
  }
};
