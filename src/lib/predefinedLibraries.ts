// src/lib/predefinedLibraries.ts

import { Tool, Material, Component } from '@prisma/client';

// Predefined CAD Components Library - Solo componenti strutturali CAD
export const predefinedComponents: Omit<Component, 'id' | 'createdAt' | 'updatedAt' | 'projectId'>[] = [
  {
    name: 'T-Slot Extrusion 20mm',
    description: '20mm x 20mm T-Slot aluminum extrusion profile',
    data: {
      type: 'structural',
      subtype: 'extrusion',
      specifications: {
        width: 20,
        height: 20,
        material: 'aluminum',
        profileType: 'T-slot'
      },
      geometry: {
        elements: [
          { type: 'extrusion', width: 20, height: 20, length: 100, position: { x: 0, y: 0, z: 0 } }
        ]
      }
    },
    thumbnail: null,
    type: null,
    isPublic: true
  },
  {
    name: 'T-Slot Extrusion 40x40mm',
    description: '40mm x 40mm T-Slot aluminum extrusion profile',
    data: {
      type: 'structural',
      subtype: 'extrusion',
      specifications: {
        width: 40,
        height: 40,
        material: 'aluminum',
        profileType: 'T-slot'
      },
      geometry: {
        elements: [
          { type: 'extrusion', width: 40, height: 40, length: 100, position: { x: 0, y: 0, z: 0 } }
        ]
      }
    },
    thumbnail: null,
    type: null,
    isPublic: true
  },
  {
    name: 'Angle Bracket 40x40x40mm',
    description: '40mm angle bracket for structural support',
    data: {
      type: 'structural',
      subtype: 'bracket',
      specifications: {
        size: '40x40x40',
        thickness: 4,
        material: 'steel'
      },
      geometry: {
        elements: [
          { type: 'box', width: 40, length: 40, height: 4, position: { x: 0, y: 0, z: 0 } },
          { type: 'box', width: 4, length: 40, height: 40, position: { x: 0, y: 0, z: 0 } }
        ]
      }
    },
    thumbnail: null,
    type: null,
    isPublic: true
  },
  {
    name: 'Flat Plate 100x50x5mm',
    description: 'Flat steel plate 100x50x5mm',
    data: {
      type: 'structural',
      subtype: 'plate',
      specifications: {
        width: 100,
        length: 50,
        thickness: 5,
        material: 'steel'
      },
      geometry: {
        elements: [
          { type: 'box', width: 100, length: 50, height: 5, position: { x: 0, y: 0, z: 0 } }
        ]
      }
    },
    thumbnail: null,
    type: null,
    isPublic: true
  },
  {
    name: 'I-Beam 100x50x5x200mm',
    description: 'I-beam with 100mm height, 50mm flange, 5mm thickness, 200mm length',
    data: {
      type: 'structural',
      subtype: 'beam',
      specifications: {
        height: 100,
        flangeWidth: 50,
        thickness: 5,
        length: 200,
        material: 'steel'
      },
      geometry: {
        elements: [
          { type: 'box', width: 50, length: 200, height: 5, position: { x: 0, y: 0, z: 0 } },
          { type: 'box', width: 5, length: 200, height: 90, position: { x: 22.5, y: 0, z: 5 } },
          { type: 'box', width: 50, length: 200, height: 5, position: { x: 0, y: 0, z: 95 } }
        ]
      }
    },
    thumbnail: null,
    type: null,
    isPublic: true
  },
  {
    name: 'C-Channel 80x40mm',
    description: 'C-channel structural profile',
    data: {
      type: 'structural',
      subtype: 'channel',
      specifications: {
        height: 80,
        width: 40,
        thickness: 4,
        material: 'steel'
      },
      geometry: {
        elements: [
          { type: 'box', width: 40, height: 4, depth: 80, position: { x: 0, y: 0, z: 0 } },
          { type: 'box', width: 4, height: 72, depth: 80, position: { x: 0, y: 4, z: 0 } },
          { type: 'box', width: 40, height: 4, depth: 80, position: { x: 0, y: 76, z: 0 } }
        ]
      }
    },
    thumbnail: null,
    type: null,
    isPublic: true
  },
  {
    name: 'Angle Iron 40x40mm',
    description: 'Standard structural steel angle iron',
    data: {
      type: 'structural',
      subtype: 'angle',
      specifications: {
        height: 40,
        width: 40,
        thickness: 3,
        material: 'steel'
      },
      geometry: {
        elements: [
          { type: 'box', width: 40, height: 3, depth: 100, position: { x: 0, y: 0, z: 0 } },
          { type: 'box', width: 3, height: 40, depth: 100, position: { x: 0, y: 0, z: 0 } }
        ]
      }
    },
    thumbnail: null,
    type: null,
    isPublic: true
  },
  {
    name: 'Box Section 40x40mm',
    description: 'Square hollow section for structural applications',
    data: {
      type: 'structural',
      subtype: 'box',
      specifications: {
        width: 40,
        height: 40,
        wallThickness: 3,
        material: 'steel'
      },
      geometry: {
        elements: [
          { type: 'box', width: 40, height: 40, depth: 100, position: { x: 0, y: 0, z: 0 } },
          { type: 'box', width: 34, height: 34, depth: 100, position: { x: 3, y: 3, z: 0 }, negative: true }
        ]
      }
    },
    thumbnail: null,
    type: null,
    isPublic: true
  },
  {
    name: 'Mounting Plate 200x200mm',
    description: 'Base plate with mounting holes pattern',
    data: {
      type: 'structural',
      subtype: 'plate',
      specifications: {
        width: 200,
        length: 200,
        thickness: 10,
        material: 'aluminum',
        holePattern: '4x corner M8'
      },
      geometry: {
        elements: [
          { type: 'box', width: 200, height: 10, depth: 200, position: { x: 0, y: 0, z: 0 } }
        ]
      }
    },
    thumbnail: null,
    type: null,
    isPublic: true
  },
  {
    name: 'Structural Tube 30mm',
    description: 'Round structural tube',
    data: {
      type: 'structural',
      subtype: 'tube',
      specifications: {
        outerDiameter: 30,
        wallThickness: 2,
        material: 'steel'
      },
      geometry: {
        elements: [
          {
            type: 'cylinder',
            innerDiameter: 26,
            outerDiameter: 30,
            height: 100,
            position: { x: 0, y: 0, z: 0 }
          }
        ]
      }
    },
    thumbnail: null,
    type: null,
    isPublic: true
  },
  {
    name: 'H-Beam 150x75x5mm',
    description: 'H-shaped steel beam for heavy structural applications',
    data: {
      type: 'structural',
      subtype: 'beam',
      specifications: {
        height: 150,
        flangeWidth: 75,
        thickness: 5,
        length: 300,
        material: 'steel'
      },
      geometry: {
        elements: [
          { type: 'box', width: 75, length: 300, height: 5, position: { x: 0, y: 0, z: 0 } },
          { type: 'box', width: 5, length: 300, height: 140, position: { x: 35, y: 0, z: 5 } },
          { type: 'box', width: 75, length: 300, height: 5, position: { x: 0, y: 0, z: 145 } }
        ]
      }
    },
    thumbnail: null,
    type: null,
    isPublic: true
  },
  {
    name: 'T-Beam 80x60x5mm',
    description: 'T-shaped beam for medium load applications',
    data: {
      type: 'structural',
      subtype: 'beam',
      specifications: {
        height: 80,
        flangeWidth: 60,
        thickness: 5,
        length: 200,
        material: 'aluminum'
      },
      geometry: {
        elements: [
          { type: 'box', width: 60, length: 200, height: 5, position: { x: 0, y: 0, z: 0 } },
          { type: 'box', width: 5, length: 200, height: 75, position: { x: 27.5, y: 0, z: 5 } }
        ]
      }
    },
    thumbnail: null,
    type: null,
    isPublic: true
  },
  {
    name: 'Corner Bracket 60x60x60mm',
    description: 'Reinforced corner bracket for 90-degree connections',
    data: {
      type: 'structural',
      subtype: 'bracket',
      specifications: {
        size: '60x60x60',
        thickness: 5,
        material: 'steel'
      },
      geometry: {
        elements: [
          { type: 'box', width: 60, length: 60, height: 5, position: { x: 0, y: 0, z: 0 } },
          { type: 'box', width: 5, length: 60, height: 60, position: { x: 0, y: 0, z: 0 } },
          { type: 'box', width: 50, length: 5, height: 50, position: { x: 5, y: 5, z: 5 } }
        ]
      }
    },
    thumbnail: null,
    type: null,
    isPublic: true
  },
  {
    name: 'V-Slot Extrusion 20x20mm',
    description: '20mm x 20mm V-Slot aluminum extrusion profile',
    data: {
      type: 'structural',
      subtype: 'extrusion',
      specifications: {
        width: 20,
        height: 20,
        material: 'aluminum',
        profileType: 'V-slot'
      },
      geometry: {
        elements: [
          { type: 'extrusion', width: 20, height: 20, length: 100, position: { x: 0, y: 0, z: 0 } }
        ]
      }
    },
    thumbnail: null,
    type: null,
    isPublic: true
  },
  {
    name: 'Rectangular Tube 60x40x3mm',
    description: 'Rectangular hollow section for structural framing',
    data: {
      type: 'structural',
      subtype: 'tube',
      specifications: {
        width: 60,
        height: 40,
        wallThickness: 3,
        material: 'steel'
      },
      geometry: {
        elements: [
          { type: 'box', width: 60, height: 40, depth: 100, position: { x: 0, y: 0, z: 0 } },
          { type: 'box', width: 54, height: 34, depth: 100, position: { x: 3, y: 3, z: 0 }, negative: true }
        ]
      }
    },
    thumbnail: null,
    type: null,
    isPublic: true
  },
  {
    name: 'Gusset Plate 100x100x5mm',
    description: 'Triangular gusset plate for reinforcing joints',
    data: {
      type: 'structural',
      subtype: 'plate',
      specifications: {
        width: 100,
        height: 100,
        thickness: 5,
        material: 'steel'
      },
      geometry: {
        elements: [
          { type: 'polygon', points: [
            { x: 0, y: 0, z: 0 },
            { x: 100, y: 0, z: 0 },
            { x: 0, y: 0, z: 100 }
          ], height: 5, position: { x: 0, y: 0, z: 0 } }
        ]
      }
    },
    thumbnail: null,
    type: null,
    isPublic: true
  },
  {
    name: 'U-Channel 80x40x4mm',
    description: 'U-shaped channel profile for structural applications',
    data: {
      type: 'structural',
      subtype: 'channel',
      specifications: {
        height: 80,
        width: 40,
        thickness: 4,
        material: 'aluminum'
      },
      geometry: {
        elements: [
          { type: 'box', width: 40, height: 4, depth: 80, position: { x: 0, y: 0, z: 0 } },
          { type: 'box', width: 4, height: 72, depth: 80, position: { x: 0, y: 4, z: 0 } },
          { type: 'box', width: 4, height: 72, depth: 80, position: { x: 36, y: 4, z: 0 } }
        ]
      }
    },
    thumbnail: null,
    type: null,
    isPublic: true
  },
  {
    name: 'T-Slot 30x30mm with Base',
    description: '30mm T-slot extrusion with mounting base plate',
    data: {
      type: 'structural',
      subtype: 'extrusion',
      specifications: {
        width: 30,
        height: 30,
        baseWidth: 60,
        baseHeight: 5,
        material: 'aluminum',
        profileType: 'T-slot base'
      },
      geometry: {
        elements: [
          { type: 'extrusion', width: 30, height: 30, length: 100, position: { x: 15, y: 5, z: 0 } },
          { type: 'box', width: 60, height: 5, depth: 100, position: { x: 0, y: 0, z: 0 } }
        ]
      }
    },
    thumbnail: null,
    type: null,
    isPublic: true
  },
  {
    name: 'Perforated Plate 200x100x2mm',
    description: 'Perforated steel plate with 5mm holes in grid pattern',
    data: {
      type: 'structural',
      subtype: 'plate',
      specifications: {
        width: 200,
        length: 100,
        thickness: 2,
        material: 'steel',
        holePattern: 'grid 10mm',
        holeSize: 5
      },
      geometry: {
        elements: [
          { type: 'box', width: 200, height: 2, depth: 100, position: { x: 0, y: 0, z: 0 } }
        ]
      }
    },
    thumbnail: null,
    type: null,
    isPublic: true
  },
  {
    name: 'Z-Purlin 120x50x2mm',
    description: 'Z-shaped purlin for roof and wall support',
    data: {
      type: 'structural',
      subtype: 'purlin',
      specifications: {
        height: 120,
        flangeWidth: 50,
        thickness: 2,
        length: 300,
        material: 'galvanized steel'
      },
      geometry: {
        elements: [
          { type: 'box', width: 50, height: 2, depth: 300, position: { x: 0, y: 0, z: 0 } },
          { type: 'box', width: 2, height: 116, depth: 300, position: { x: 48, y: 2, z: 0 } },
          { type: 'box', width: 50, height: 2, depth: 300, position: { x: 0, y: 118, z: 0 } }
        ]
      }
    },
    thumbnail: null,
    type: null,
    isPublic: true
  },
  {
    name: 'Aluminum Base Plate 150x150x10mm',
    description: 'Heavy duty aluminum base plate with mounting holes',
    data: {
      type: 'structural',
      subtype: 'plate',
      specifications: {
        width: 150,
        length: 150,
        thickness: 10,
        material: 'aluminum',
        holePattern: '4x corner M10'
      },
      geometry: {
        elements: [
          { type: 'box', width: 150, height: 10, depth: 150, position: { x: 0, y: 0, z: 0 } }
        ]
      }
    },
    thumbnail: null,
    type: null,
    isPublic: true
  },
  {
    name: 'Slotted Angle 40x40x2mm',
    description: 'Perforated angle iron with slots for adjustable mounting',
    data: {
      type: 'structural',
      subtype: 'angle',
      specifications: {
        height: 40,
        width: 40,
        thickness: 2,
        material: 'steel',
        slotPattern: 'regular'
      },
      geometry: {
        elements: [
          { type: 'box', width: 40, height: 2, depth: 100, position: { x: 0, y: 0, z: 0 } },
          { type: 'box', width: 2, height: 38, depth: 100, position: { x: 0, y: 2, z: 0 } }
        ]
      }
    },
    thumbnail: null,
    type: null,
    isPublic: true
  }
];

// Predefined Materials Library
export const predefinedMaterials: Omit<Material, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    "name": "Aluminum 6061",
    "description": "General purpose aluminum alloy with good machinability",
    "properties": {
      "density": 2.7,
      "hardness": 95,
      "color": "#C0C0C0",
      "thermalConductivity": 167,
      "machinability": "good",
      "corrosionResistance": "good"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Mild Steel",
    "description": "Low carbon steel, easy to machine and weld",
    "properties": {
      "density": 7.85,
      "hardness": 120,
      "color": "#808080",
      "thermalConductivity": 50,
      "machinability": "good",
      "corrosionResistance": "poor"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Stainless Steel 304",
    "description": "Common austenitic stainless steel with excellent corrosion resistance",
    "properties": {
      "density": 8.0,
      "hardness": 200,
      "color": "#A0A0A0",
      "thermalConductivity": 16.2,
      "machinability": "moderate",
      "corrosionResistance": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Brass",
    "description": "Copper-zinc alloy, good for decorative parts and low friction applications",
    "properties": {
      "density": 8.5,
      "hardness": 110,
      "color": "#D4AF37",
      "thermalConductivity": 109,
      "machinability": "excellent",
      "corrosionResistance": "good"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "ABS Plastic",
    "description": "Common thermoplastic polymer, good for general purpose parts",
    "properties": {
      "density": 1.05,
      "hardness": 75,
      "color": "#FFFFEF",
      "thermalConductivity": 0.17,
      "machinability": "good",
      "melting_point": 105
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Titanium Grade 5",
    "description": "High-strength titanium alloy with excellent strength-to-weight ratio",
    "properties": {
      "density": 4.43,
      "hardness": 349,
      "color": "#B5B5B5",
      "thermalConductivity": 6.7,
      "machinability": "poor",
      "corrosionResistance": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "PEEK",
    "description": "High-performance thermoplastic with excellent mechanical properties",
    "properties": {
      "density": 1.32,
      "hardness": 85,
      "color": "#F5F5DC",
      "thermalConductivity": 0.25,
      "machinability": "good",
      "melting_point": 343
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Copper C110",
    "description": "Pure copper with excellent electrical and thermal conductivity",
    "properties": {
      "density": 8.94,
      "hardness": 68,
      "color": "#B87333",
      "thermalConductivity": 391,
      "machinability": "good",
      "corrosionResistance": "good"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Magnesium AZ31",
    "description": "Lightweight magnesium alloy with good machining characteristics",
    "properties": {
      "density": 1.77,
      "hardness": 54,
      "color": "#AAAAAA",
      "thermalConductivity": 96,
      "machinability": "excellent",
      "corrosionResistance": "moderate"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Nickel 200",
    "description": "Commercially pure nickel with excellent corrosion resistance",
    "properties": {
      "density": 8.9,
      "hardness": 150,
      "color": "#727472",
      "thermalConductivity": 70,
      "machinability": "fair",
      "corrosionResistance": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Carbon Fiber Composite",
    "description": "High-strength, lightweight material with excellent stiffness",
    "properties": {
      "density": 1.6,
      "hardness": 120,
      "color": "#000000",
      "thermalConductivity": 5,
      "machinability": "challenging",
      "tensileStrength": 3500
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Inconel 718",
    "description": "Nickel-based superalloy for high-temperature applications",
    "properties": {
      "density": 8.19,
      "hardness": 300,
      "color": "#818181",
      "thermalConductivity": 11.4,
      "machinability": "difficult",
      "corrosionResistance": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Nylon 6/6",
    "description": "Engineering thermoplastic with good mechanical properties",
    "properties": {
      "density": 1.14,
      "hardness": 72,
      "color": "#F5F5F5",
      "thermalConductivity": 0.25,
      "machinability": "good",
      "melting_point": 263
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Acrylic (PMMA)",
    "description": "Transparent thermoplastic with excellent optical clarity",
    "properties": {
      "density": 1.18,
      "hardness": 68,
      "color": "#FFFFFF",
      "transparency": "excellent",
      "thermalConductivity": 0.19,
      "machinability": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Silicon Nitride",
    "description": "Advanced ceramic with high-temperature capabilities",
    "properties": {
      "density": 3.25,
      "hardness": 1400,
      "color": "#D3D3D3",
      "thermalConductivity": 30,
      "machinability": "very difficult",
      "temperatureResistance": 1400
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Tungsten Carbide",
    "description": "Extremely hard material used for cutting tools",
    "properties": {
      "density": 15.63,
      "hardness": 1600,
      "color": "#2F4F4F",
      "thermalConductivity": 84,
      "machinability": "extremely difficult",
      "wearResistance": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Cast Iron",
    "description": "Iron alloy with high carbon content, excellent for structural components",
    "properties": {
      "density": 7.2,
      "hardness": 180,
      "color": "#36454F",
      "thermalConductivity": 50,
      "machinability": "good",
      "dampingCapacity": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Polycarbonate",
    "description": "Impact-resistant engineering thermoplastic with optical clarity",
    "properties": {
      "density": 1.2,
      "hardness": 70,
      "color": "#F0F8FF",
      "thermalConductivity": 0.2,
      "machinability": "good",
      "impactStrength": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Tool Steel A2",
    "description": "Air-hardened tool steel with good dimensional stability",
    "properties": {
      "density": 7.86,
      "hardness": 455,
      "color": "#71797E",
      "thermalConductivity": 24.5,
      "machinability": "moderate",
      "wearResistance": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Fiberglass",
    "description": "Glass-reinforced polymer composite with good specific strength",
    "properties": {
      "density": 1.8,
      "hardness": 85,
      "color": "#FFFAFA",
      "thermalConductivity": 0.3,
      "machinability": "fair",
      "corrosionResistance": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Bronze",
    "description": "Copper-tin alloy with good bearing properties",
    "properties": {
      "density": 8.8,
      "hardness": 130,
      "color": "#CD7F32",
      "thermalConductivity": 61,
      "machinability": "excellent",
      "wearResistance": "good"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "High Speed Steel M2",
    "description": "Common tool steel with good wear resistance for cutting tools",
    "properties": {
      "density": 8.16,
      "hardness": 785,
      "color": "#707070",
      "thermalConductivity": 21,
      "machinability": "difficult",
      "redHardness": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Delrin (Acetal)",
    "description": "Engineering thermoplastic with high stiffness and low friction",
    "properties": {
      "density": 1.41,
      "hardness": 92,
      "color": "#FFFFFF",
      "thermalConductivity": 0.23,
      "machinability": "excellent",
      "wearResistance": "good"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Chromoly Steel 4130",
    "description": "Low-alloy steel with good strength-to-weight ratio",
    "properties": {
      "density": 7.85,
      "hardness": 207,
      "color": "#555555",
      "thermalConductivity": 42.7,
      "machinability": "good",
      "weldability": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Cobalt Chrome",
    "description": "Biocompatible alloy with excellent wear and corrosion resistance",
    "properties": {
      "density": 8.5,
      "hardness": 330,
      "color": "#C0C0C0",
      "thermalConductivity": 13,
      "machinability": "difficult",
      "biocompatibility": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Zirconia Ceramic",
    "description": "Advanced ceramic with high fracture toughness",
    "properties": {
      "density": 6.05,
      "hardness": 1200,
      "color": "#FFFFEF",
      "thermalConductivity": 2.5,
      "machinability": "very difficult",
      "thermalExpansion": "low"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Beryllium Copper",
    "description": "Copper alloy with high strength and non-sparking properties",
    "properties": {
      "density": 8.25,
      "hardness": 275,
      "color": "#CC5500",
      "thermalConductivity": 118,
      "machinability": "good",
      "electricalConductivity": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Glass-Filled Nylon",
    "description": "Engineering thermoplastic reinforced with glass fibers",
    "properties": {
      "density": 1.34,
      "hardness": 92,
      "color": "#E8E8E8",
      "thermalConductivity": 0.35,
      "machinability": "moderate",
      "dimensionalStability": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Maraging Steel 250",
    "description": "Ultra-high-strength steel with excellent toughness",
    "properties": {
      "density": 8.0,
      "hardness": 480,
      "color": "#545454",
      "thermalConductivity": 25.3,
      "machinability": "moderate",
      "yieldStrength": 1700
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "HDPE",
    "description": "High-density polyethylene with good impact resistance",
    "properties": {
      "density": 0.97,
      "hardness": 65,
      "color": "#FFFFFF",
      "thermalConductivity": 0.48,
      "machinability": "good",
      "chemicalResistance": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Hastelloy C-276",
    "description": "Nickel-molybdenum-chromium superalloy for corrosive environments",
    "properties": {
      "density": 8.89,
      "hardness": 210,
      "color": "#8C8C8C",
      "thermalConductivity": 9.8,
      "machinability": "difficult",
      "corrosionResistance": "superior"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Alumina Ceramic",
    "description": "Hard ceramic oxide with excellent electrical insulation",
    "properties": {
      "density": 3.95,
      "hardness": 1800,
      "color": "#FFFFFF",
      "thermalConductivity": 35,
      "machinability": "extremely difficult",
      "electricalResistivity": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "PTFE (Teflon)",
    "description": "Fluoropolymer with lowest coefficient of friction of any solid",
    "properties": {
      "density": 2.2,
      "hardness": 55,
      "color": "#FFFAFA",
      "thermalConductivity": 0.25,
      "machinability": "good",
      "frictionCoefficient": 0.05
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "CPM S30V Steel",
    "description": "Premium stainless tool steel with excellent edge retention",
    "properties": {
      "density": 7.5,
      "hardness": 580,
      "color": "#707070",
      "thermalConductivity": 16.2,
      "machinability": "difficult",
      "edgeRetention": "superior"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Molybdenum",
    "description": "Refractory metal with high-temperature strength",
    "properties": {
      "density": 10.2,
      "hardness": 230,
      "color": "#8C8C8C",
      "thermalConductivity": 138,
      "machinability": "difficult",
      "meltingPoint": 2623
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Ultem (PEI)",
    "description": "Amber-colored thermoplastic with high heat resistance",
    "properties": {
      "density": 1.27,
      "hardness": 109,
      "color": "#D2691E",
      "thermalConductivity": 0.22,
      "machinability": "good",
      "flameRetardancy": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Damascus Steel",
    "description": "Pattern-welded steel with distinctive surface patterns",
    "properties": {
      "density": 7.85,
      "hardness": 300,
      "color": "#414A4C",
      "thermalConductivity": 50,
      "machinability": "moderate",
      "aesthetics": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Tungsten",
    "description": "Dense refractory metal with high melting point",
    "properties": {
      "density": 19.3,
      "hardness": 310,
      "color": "#808080",
      "thermalConductivity": 173,
      "machinability": "difficult",
      "meltingPoint": 3422
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Silicon Carbide",
    "description": "Extremely hard ceramic compound for abrasives and electronics",
    "properties": {
      "density": 3.21,
      "hardness": 2600,
      "color": "#1C1C1C",
      "thermalConductivity": 120,
      "machinability": "extremely difficult",
      "temperatureResistance": 1600
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Macor Ceramic",
    "description": "Machinable glass-ceramic with zero porosity",
    "properties": {
      "density": 2.52,
      "hardness": 370,
      "color": "#F5F5F5",
      "thermalConductivity": 1.46,
      "machinability": "good for ceramic",
      "temperatureStability": 1000
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Silver",
    "description": "Precious metal with highest electrical and thermal conductivity",
    "properties": {
      "density": 10.49,
      "hardness": 25,
      "color": "#C0C0C0",
      "thermalConductivity": 429,
      "machinability": "excellent",
      "electricalConductivity": "superior"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Spring Steel 1095",
    "description": "High-carbon steel with excellent elasticity for springs",
    "properties": {
      "density": 7.85,
      "hardness": 420,
      "color": "#363636",
      "thermalConductivity": 46.6,
      "machinability": "fair",
      "elasticity": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Zirconium",
    "description": "Corrosion-resistant refractory metal used in nuclear applications",
    "properties": {
      "density": 6.52,
      "hardness": 105,
      "color": "#F5F5F5",
      "thermalConductivity": 22.7,
      "machinability": "difficult",
      "neutronTransparency": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Borosilicate Glass",
    "description": "Low-expansion glass with high thermal shock resistance",
    "properties": {
      "density": 2.23,
      "hardness": 480,
      "color": "#TRANSPARENT",
      "thermalConductivity": 1.2,
      "machinability": "brittle",
      "thermalShockResistance": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Stellite 6",
    "description": "Cobalt-based superalloy with excellent wear resistance",
    "properties": {
      "density": 8.44,
      "hardness": 410,
      "color": "#A9A9A9",
      "thermalConductivity": 14.6,
      "machinability": "difficult",
      "wearResistance": "superior"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Vanadium",
    "description": "Soft, ductile metal used in steel alloys",
    "properties": {
      "density": 6.0,
      "hardness": 170,
      "color": "#C0C0C0",
      "thermalConductivity": 30.7,
      "machinability": "moderate",
      "corrosionResistance": "good"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  },
  {
    "name": "Monel 400",
    "description": "Nickel-copper alloy with excellent seawater resistance",
    "properties": {
      "density": 8.8,
      "hardness": 140,
      "color": "#C0C0C0",
      "thermalConductivity": 21.8,
      "machinability": "fair",
      "seawaterResistance": "excellent"
    },
    "isPublic": true,
    "ownerId": null,
    "organizationId": null
  }
 
];

// Predefined CAM Tools Library - Solo utensili per il CAM
export const predefinedTools: Omit<Tool, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'End Mill 6mm 2-Flute',
    type: 'endmill',
    diameter: 6,
    material: 'Carbide',
    numberOfFlutes: 2,
    maxRPM: 18000,
    coolantType: 'flood',
    cuttingLength: 20,
    totalLength: 50,
    shankDiameter: 6,
    notes: 'General purpose end mill for aluminum and plastics',
    isPublic: true,
    ownerId: null,
    organizationId: null
  },
  {
    name: 'End Mill 10mm 4-Flute',
    type: 'endmill',
    diameter: 10,
    material: 'Carbide',
    numberOfFlutes: 4,
    maxRPM: 15000,
    coolantType: 'flood',
    cuttingLength: 25,
    totalLength: 75,
    shankDiameter: 10,
    notes: 'Heavy duty end mill for steel and harder materials',
    isPublic: true,
    ownerId: null,
    organizationId: null
  },
  {
    name: 'Ball End Mill 4mm 2-Flute',
    type: 'ballendmill',
    diameter: 4,
    material: 'Carbide',
    numberOfFlutes: 2,
    maxRPM: 20000,
    coolantType: 'flood',
    cuttingLength: 15,
    totalLength: 50,
    shankDiameter: 4,
    notes: '3D contouring and finishing operations',
    isPublic: true,
    ownerId: null,
    organizationId: null
  },
  {
    name: 'Drill Bit 5mm',
    type: 'drillbit',
    diameter: 5,
    material: 'HSS',
    numberOfFlutes: 2,
    maxRPM: 10000,
    coolantType: 'flood',
    cuttingLength: 40,
    totalLength: 80,
    shankDiameter: 5,
    notes: 'Standard twist drill for through holes',
    isPublic: true,
    ownerId: null,
    organizationId: null
  },
  {
    name: 'Chamfer Mill 45°',
    type: 'chamfermill',
    diameter: 12,
    material: 'Carbide',
    numberOfFlutes: 3,
    maxRPM: 12000,
    coolantType: 'flood',
    cuttingLength: 10,
    totalLength: 60,
    shankDiameter: 12,
    notes: '45 degree chamfer mill for edge breaking and chamfering',
    isPublic: true,
    ownerId: null,
    organizationId: null
  },
  
    {
      "name": "Ball End Mill 6mm 3-Flute",
      "type": "ballendmill",
      "diameter": 6,
      "material": "Carbide",
      "numberOfFlutes": 3,
      "maxRPM": 18000,
      "coolantType": "flood",
      "cuttingLength": 18,
      "totalLength": 60,
      "shankDiameter": 6,
      "notes": "Medium-size ball end mill for 3D finishing and contours",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "End Mill 8mm 3-Flute",
      "type": "endmill",
      "diameter": 8,
      "material": "Carbide",
      "numberOfFlutes": 3,
      "maxRPM": 16000,
      "coolantType": "flood",
      "cuttingLength": 22,
      "totalLength": 65,
      "shankDiameter": 8,
      "notes": "Versatile end mill for various materials",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Chamfer Mill 45° 10mm",
      "type": "chamfermill",
      "diameter": 10,
      "material": "Carbide",
      "numberOfFlutes": 2,
      "maxRPM": 14000,
      "coolantType": "flood",
      "cuttingLength": 15,
      "totalLength": 60,
      "shankDiameter": 10,
      "notes": "For chamfering edges at 45 degree angle",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Drill Bit 8mm",
      "type": "drillbit",
      "diameter": 8,
      "material": "HSS",
      "numberOfFlutes": 2,
      "maxRPM": 8000,
      "coolantType": "flood",
      "cuttingLength": 45,
      "totalLength": 90,
      "shankDiameter": 8,
      "notes": "Medium-size drill bit for steel and aluminum",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "End Mill 12mm 4-Flute",
      "type": "endmill",
      "diameter": 12,
      "material": "Carbide",
      "numberOfFlutes": 4,
      "maxRPM": 12000,
      "coolantType": "flood",
      "cuttingLength": 30,
      "totalLength": 80,
      "shankDiameter": 12,
      "notes": "Large diameter end mill for heavy stock removal",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Micro End Mill 1mm 2-Flute",
      "type": "endmill",
      "diameter": 1,
      "material": "Carbide",
      "numberOfFlutes": 2,
      "maxRPM": 40000,
      "coolantType": "mist",
      "cuttingLength": 5,
      "totalLength": 38,
      "shankDiameter": 3,
      "notes": "Precision micro end mill for fine details",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "V-Bit Engraving 60°",
      "type": "vbit",
      "diameter": 6,
      "material": "Carbide",
      "numberOfFlutes": 1,
      "maxRPM": 24000,
      "coolantType": "air",
      "cuttingLength": 10,
      "totalLength": 50,
      "shankDiameter": 6,
      "notes": "V-shaped bit for engraving and beveling at 60 degrees",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Ball End Mill 10mm 4-Flute",
      "type": "ballendmill",
      "diameter": 10,
      "material": "Carbide",
      "numberOfFlutes": 4,
      "maxRPM": 15000,
      "coolantType": "flood",
      "cuttingLength": 25,
      "totalLength": 75,
      "shankDiameter": 10,
      "notes": "Large ball end mill for 3D contouring and large radius corners",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Drill Bit 3mm",
      "type": "drillbit",
      "diameter": 3,
      "material": "HSS",
      "numberOfFlutes": 2,
      "maxRPM": 12000,
      "coolantType": "flood",
      "cuttingLength": 35,
      "totalLength": 65,
      "shankDiameter": 3,
      "notes": "Small drill bit for precision holes",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Roughing End Mill 12mm",
      "type": "roughingendmill",
      "diameter": 12,
      "material": "Carbide",
      "numberOfFlutes": 3,
      "maxRPM": 10000,
      "coolantType": "flood",
      "cuttingLength": 28,
      "totalLength": 80,
      "shankDiameter": 12,
      "notes": "Serrated edge tool for fast material removal",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Corner Rounding End Mill 6mm R2",
      "type": "cornerroundingmill",
      "diameter": 6,
      "material": "Carbide",
      "numberOfFlutes": 2,
      "maxRPM": 18000,
      "coolantType": "flood",
      "cuttingLength": 15,
      "totalLength": 55,
      "shankDiameter": 6,
      "notes": "For creating rounded corners with 2mm radius",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "T-Slot Cutter 6mm",
      "type": "tslotcutter",
      "diameter": 18,
      "material": "HSS",
      "numberOfFlutes": 4,
      "maxRPM": 8000,
      "coolantType": "flood",
      "cuttingLength": 6,
      "totalLength": 65,
      "shankDiameter": 12,
      "notes": "Specialized cutter for creating T-slots in workpieces",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "End Mill 3mm 2-Flute",
      "type": "endmill",
      "diameter": 3,
      "material": "Carbide",
      "numberOfFlutes": 2,
      "maxRPM": 25000,
      "coolantType": "mist",
      "cuttingLength": 12,
      "totalLength": 45,
      "shankDiameter": 3,
      "notes": "Small end mill for precision slotting and profiling",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Thread Mill M6",
      "type": "threadmill",
      "diameter": 5.95,
      "material": "Carbide",
      "numberOfFlutes": 3,
      "maxRPM": 16000,
      "coolantType": "flood",
      "cuttingLength": 12,
      "totalLength": 60,
      "shankDiameter": 6,
      "notes": "For milling M6 internal and external threads",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Face Mill 50mm",
      "type": "facemill",
      "diameter": 50,
      "material": "Carbide",
      "numberOfFlutes": 5,
      "maxRPM": 8000,
      "coolantType": "flood",
      "cuttingLength": 5,
      "totalLength": 40,
      "shankDiameter": 22,
      "notes": "Large facing operations to create flat surfaces",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Drill Bit 10mm",
      "type": "drillbit",
      "diameter": 10,
      "material": "HSS",
      "numberOfFlutes": 2,
      "maxRPM": 6000,
      "coolantType": "flood",
      "cuttingLength": 50,
      "totalLength": 100,
      "shankDiameter": 10,
      "notes": "Standard size drill bit for larger holes",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Ball End Mill 8mm 3-Flute",
      "type": "ballendmill",
      "diameter": 8,
      "material": "Carbide",
      "numberOfFlutes": 3,
      "maxRPM": 16000,
      "coolantType": "flood",
      "cuttingLength": 20,
      "totalLength": 65,
      "shankDiameter": 8,
      "notes": "Medium-size ball end mill for efficient 3D milling",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Dovetail Cutter 12mm 45°",
      "type": "dovetailcutter",
      "diameter": 12,
      "material": "Carbide",
      "numberOfFlutes": 2,
      "maxRPM": 10000,
      "coolantType": "flood",
      "cuttingLength": 10,
      "totalLength": 60,
      "shankDiameter": 8,
      "notes": "For cutting dovetail joints and undercuts",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Micro Drill Bit 1mm",
      "type": "drillbit",
      "diameter": 1,
      "material": "Carbide",
      "numberOfFlutes": 2,
      "maxRPM": 30000,
      "coolantType": "mist",
      "cuttingLength": 12,
      "totalLength": 38,
      "shankDiameter": 3,
      "notes": "Precision micro drill for small holes",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "End Mill 16mm 4-Flute",
      "type": "endmill",
      "diameter": 16,
      "material": "Carbide",
      "numberOfFlutes": 4,
      "maxRPM": 10000,
      "coolantType": "flood",
      "cuttingLength": 32,
      "totalLength": 90,
      "shankDiameter": 16,
      "notes": "Extra large end mill for heavy machining",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "V-Bit Engraving 90°",
      "type": "vbit",
      "diameter": 6,
      "material": "Carbide",
      "numberOfFlutes": 1,
      "maxRPM": 24000,
      "coolantType": "air",
      "cuttingLength": 10,
      "totalLength": 50,
      "shankDiameter": 6,
      "notes": "V-shaped bit for square bottom engraving",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Ball End Mill 2mm 2-Flute",
      "type": "ballendmill",
      "diameter": 2,
      "material": "Carbide",
      "numberOfFlutes": 2,
      "maxRPM": 30000,
      "coolantType": "mist",
      "cuttingLength": 8,
      "totalLength": 40,
      "shankDiameter": 4,
      "notes": "Small ball end mill for fine details and tight radiuses",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Chamfer Mill 30° 8mm",
      "type": "chamfermill",
      "diameter": 8,
      "material": "Carbide",
      "numberOfFlutes": 2,
      "maxRPM": 16000,
      "coolantType": "flood",
      "cuttingLength": 12,
      "totalLength": 55,
      "shankDiameter": 8,
      "notes": "For chamfering edges at 30 degree angle",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Keyway Cutter 6mm",
      "type": "keywaycutter",
      "diameter": 6,
      "material": "HSS",
      "numberOfFlutes": 2,
      "maxRPM": 8000,
      "coolantType": "flood",
      "cuttingLength": 15,
      "totalLength": 50,
      "shankDiameter": 6,
      "notes": "For cutting keyways in shafts",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Drill Bit 12mm",
      "type": "drillbit",
      "diameter": 12,
      "material": "HSS",
      "numberOfFlutes": 2,
      "maxRPM": 5000,
      "coolantType": "flood",
      "cuttingLength": 55,
      "totalLength": 110,
      "shankDiameter": 12,
      "notes": "Large drill bit for deep holes",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "End Mill 4mm 3-Flute",
      "type": "endmill",
      "diameter": 4,
      "material": "Carbide",
      "numberOfFlutes": 3,
      "maxRPM": 22000,
      "coolantType": "mist",
      "cuttingLength": 15,
      "totalLength": 50,
      "shankDiameter": 4,
      "notes": "Small end mill with increased flutes for better finish",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Thread Mill M8",
      "type": "threadmill",
      "diameter": 7.95,
      "material": "Carbide",
      "numberOfFlutes": 3,
      "maxRPM": 14000,
      "coolantType": "flood",
      "cuttingLength": 16,
      "totalLength": 65,
      "shankDiameter": 8,
      "notes": "For milling M8 internal and external threads",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Ball End Mill 12mm 4-Flute",
      "type": "ballendmill",
      "diameter": 12,
      "material": "Carbide",
      "numberOfFlutes": 4,
      "maxRPM": 12000,
      "coolantType": "flood",
      "cuttingLength": 30,
      "totalLength": 80,
      "shankDiameter": 12,
      "notes": "Extra large ball end mill for large radius features",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Engraving Bit 0.5mm V-bit",
      "type": "engraver",
      "diameter": 0.5,
      "material": "Carbide",
      "numberOfFlutes": 1,
      "maxRPM": 24000,
      "coolantType": "air",
      "cuttingLength": 5,
      "totalLength": 40,
      "shankDiameter": 3.175,
      "notes": "Fine detail engraving for text and detailed features",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Tapered End Mill 6mm",
      "type": "taperedendmill",
      "diameter": 6,
      "material": "Carbide",
      "numberOfFlutes": 4,
      "maxRPM": 16000,
      "coolantType": "flood",
      "cuttingLength": 25,
      "totalLength": 70,
      "shankDiameter": 6,
      "notes": "Tapered profile for draft angles and mold work",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Drill Bit 6mm",
      "type": "drillbit",
      "diameter": 6,
      "material": "HSS",
      "numberOfFlutes": 2,
      "maxRPM": 9000,
      "coolantType": "flood",
      "cuttingLength": 42,
      "totalLength": 85,
      "shankDiameter": 6,
      "notes": "Common size drill bit for medium holes",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Face Mill 63mm",
      "type": "facemill",
      "diameter": 63,
      "material": "Carbide",
      "numberOfFlutes": 6,
      "maxRPM": 6000,
      "coolantType": "flood",
      "cuttingLength": 6,
      "totalLength": 50,
      "shankDiameter": 27,
      "notes": "Large diameter face mill for efficient surface machining",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Micro End Mill 0.5mm 2-Flute",
      "type": "endmill",
      "diameter": 0.5,
      "material": "Carbide",
      "numberOfFlutes": 2,
      "maxRPM": 50000,
      "coolantType": "mist",
      "cuttingLength": 3,
      "totalLength": 35,
      "shankDiameter": 3,
      "notes": "Ultra-precision micro end mill for extremely fine details",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Corner Rounding End Mill 8mm R3",
      "type": "cornerroundingmill",
      "diameter": 8,
      "material": "Carbide",
      "numberOfFlutes": 3,
      "maxRPM": 16000,
      "coolantType": "flood",
      "cuttingLength": 18,
      "totalLength": 60,
      "shankDiameter": 8,
      "notes": "For creating rounded corners with 3mm radius",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Reamer 8mm",
      "type": "reamer",
      "diameter": 8,
      "material": "HSS",
      "numberOfFlutes": 6,
      "maxRPM": 5000,
      "coolantType": "flood",
      "cuttingLength": 35,
      "totalLength": 90,
      "shankDiameter": 8,
      "notes": "For finishing and sizing precise holes",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "End Mill 20mm 6-Flute",
      "type": "endmill",
      "diameter": 20,
      "material": "Carbide",
      "numberOfFlutes": 6,
      "maxRPM": 8000,
      "coolantType": "flood",
      "cuttingLength": 40,
      "totalLength": 100,
      "shankDiameter": 20,
      "notes": "Extra large end mill for heavy machining and finishing",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Drill Bit 4mm",
      "type": "drillbit",
      "diameter": 4,
      "material": "HSS",
      "numberOfFlutes": 2,
      "maxRPM": 11000,
      "coolantType": "flood",
      "cuttingLength": 38,
      "totalLength": 75,
      "shankDiameter": 4,
      "notes": "Small to medium drill bit for versatile applications",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Woodruff Cutter 10mm",
      "type": "woodruffcutter",
      "diameter": 32,
      "material": "HSS",
      "numberOfFlutes": 8,
      "maxRPM": 5000,
      "coolantType": "flood",
      "cuttingLength": 5,
      "totalLength": 60,
      "shankDiameter": 10,
      "notes": "Specialized cutter for woodruff keyways",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Ball End Mill 3mm 2-Flute",
      "type": "ballendmill",
      "diameter": 3,
      "material": "Carbide",
      "numberOfFlutes": 2,
      "maxRPM": 25000,
      "coolantType": "mist",
      "cuttingLength": 12,
      "totalLength": 45,
      "shankDiameter": 3,
      "notes": "Small ball end mill for fine 3D details",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Aluminum Rougher 12mm",
      "type": "roughingendmill",
      "diameter": 12,
      "material": "Carbide",
      "numberOfFlutes": 3,
      "maxRPM": 14000,
      "coolantType": "flood",
      "cuttingLength": 30,
      "totalLength": 80,
      "shankDiameter": 12,
      "notes": "Specialized tool for high-speed roughing of aluminum",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Thread Mill M10",
      "type": "threadmill",
      "diameter": 9.95,
      "material": "Carbide",
      "numberOfFlutes": 3,
      "maxRPM": 12000,
      "coolantType": "flood",
      "cuttingLength": 20,
      "totalLength": 70,
      "shankDiameter": 10,
      "notes": "For milling M10 internal and external threads",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Boring Bar 20-50mm",
      "type": "boringbar",
      "diameter": 20,
      "material": "Carbide",
      "numberOfFlutes": 1,
      "maxRPM": 6000,
      "coolantType": "flood",
      "cuttingLength": 30,
      "totalLength": 100,
      "shankDiameter": 20,
      "notes": "For precision boring of holes",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Drill Bit 2mm",
      "type": "drillbit",
      "diameter": 2,
      "material": "HSS",
      "numberOfFlutes": 2,
      "maxRPM": 15000,
      "coolantType": "mist",
      "cuttingLength": 24,
      "totalLength": 50,
      "shankDiameter": 2,
      "notes": "Small drill bit for precision holes",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "End Mill 5mm 2-Flute",
      "type": "endmill",
      "diameter": 5,
      "material": "Carbide",
      "numberOfFlutes": 2,
      "maxRPM": 20000,
      "coolantType": "mist",
      "cuttingLength": 15,
      "totalLength": 50,
      "shankDiameter": 5,
      "notes": "Medium-small end mill for general purpose machining",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    },
    {
      "name": "Chamfer Mill 60° 6mm",
      "type": "chamfermill",
      "diameter": 6,
      "material": "Carbide",
      "numberOfFlutes": 2,
      "maxRPM": 18000,
      "coolantType": "flood",
      "cuttingLength": 10,
      "totalLength": 50,
      "shankDiameter": 6,
      "notes": "For chamfering edges at 60 degree angle",
      "isPublic": true,
      "ownerId": null,
      "organizationId": null
    }
   ,
  {
    name: 'Engraving Bit 0.5mm V-bit',
    type: 'engraver',
    diameter: 0.5,
    material: 'Carbide',
    numberOfFlutes: 1,
    maxRPM: 24000,
    coolantType: 'air',
    cuttingLength: 5,
    totalLength: 40,
    shankDiameter: 3.175,
    notes: 'Fine detail engraving for text and detailed features',
    isPublic: true,
    ownerId: null,
    organizationId: null
  },
  {
    name: 'Face Mill 50mm',
    type: 'facemill',
    diameter: 50,
    material: 'Carbide',
    numberOfFlutes: 5,
    maxRPM: 8000,
    coolantType: 'flood',
    cuttingLength: 5,
    totalLength: 40,
    shankDiameter: 22,
    notes: 'Large facing operations to create flat surfaces',
    isPublic: true,
    ownerId: null,
    organizationId: null
  },
  {
    name: 'T-Slot Cutter 5mm',
    type: 'tslotcutter',
    diameter: 16,
    material: 'HSS',
    numberOfFlutes: 4,
    maxRPM: 6000,
    coolantType: 'flood',
    cuttingLength: 5,
    totalLength: 60,
    shankDiameter: 10,
    notes: 'For cutting T-slots in workpieces',
    isPublic: true,
    ownerId: null,
    organizationId: null
  },
  {
    name: 'Roughing End Mill 10mm',
    type: 'roughingendmill',
    diameter: 10,
    material: 'Carbide',
    numberOfFlutes: 4,
    maxRPM: 12000,
    coolantType: 'flood',
    cuttingLength: 25,
    totalLength: 75,
    shankDiameter: 10,
    notes: 'For high-speed roughing operations',
    isPublic: true,
    ownerId: null,
    organizationId: null
  },
  {
    name: 'Thread Mill M6',
    type: 'threadmill',
    diameter: 6,
    material: 'Carbide',
    numberOfFlutes: 3,
    maxRPM: 10000,
    coolantType: 'flood',
    cuttingLength: 12,
    totalLength: 60,
    shankDiameter: 6,
    notes: 'For milling M6 internal and external threads',
    isPublic: true,
    ownerId: null,
    organizationId: null
  },
  {
    name: 'Dovetail Cutter 12mm 45°',
    type: 'dovetailcutter',
    diameter: 12,
    material: 'Carbide',
    numberOfFlutes: 2,
    maxRPM: 10000,
    coolantType: 'flood',
    cuttingLength: 10,
    totalLength: 60,
    shankDiameter: 8,
    notes: 'For cutting dovetail joints',
    isPublic: true,
    ownerId: null,
    organizationId: null
  },
  {
    name: 'Keyway Cutter 6mm',
    type: 'keywaycutter',
    diameter: 6,
    material: 'HSS',
    numberOfFlutes: 2,
    maxRPM: 8000,
    coolantType: 'flood',
    cuttingLength: 15,
    totalLength: 50,
    shankDiameter: 6,
    notes: 'For cutting keyways in shafts',
    isPublic: true,
    ownerId: null,
    organizationId: null
  },
  {
    name: 'Boring Head 20-50mm',
    type: 'boringhead',
    diameter: 20,
    material: 'Carbide',
    numberOfFlutes: 1,
    maxRPM: 6000,
    coolantType: 'flood',
    cuttingLength: 30,
    totalLength: 100,
    shankDiameter: 20,
    notes: 'Adjustable boring head for precise hole diameters',
    isPublic: true,
    ownerId: null,
    organizationId: null
  },
  {
    name: 'Corner Rounding End Mill 5mm R2',
    type: 'cornerroundingmill',
    diameter: 5,
    material: 'Carbide',
    numberOfFlutes: 2,
    maxRPM: 18000,
    coolantType: 'mist',
    cuttingLength: 15,
    totalLength: 50,
    shankDiameter: 5,
    notes: 'For rounding sharp edges with 2mm radius',
    isPublic: true,
    ownerId: null,
    organizationId: null
  }
];

// Machine configurations for CAM
export const predefinedMachineConfigs = [
  {
    id: 'mill-small',
    name: 'Desktop CNC Mill',
    description: 'Compact CNC mill suitable for small workshop environments',
    type: 'mill',
    config: {
      maxSpindleSpeed: 10000,
      maxFeedRate: 4000,
      workVolume: {
        x: 300,
        y: 200,
        z: 100
      },
      controller: 'GRBL',
      rapidFeedRate: 3000,
      maxDepthPerPass: 1.5
    },
    tags: ['small', 'desktop', 'hobby', 'mill']
  },
  {
    id: 'mill-medium',
    name: 'Mid-Size CNC Mill',
    description: 'Professional grade CNC mill for medium-scale production',
    type: 'mill',
    config: {
      maxSpindleSpeed: 18000,
      maxFeedRate: 8000,
      workVolume: {
        x: 600,
        y: 400,
        z: 200
      },
      controller: 'Mach3',
      rapidFeedRate: 6000,
      maxDepthPerPass: 3.0
    },
    tags: ['medium', 'professional', 'production', 'mill']
  },
  {
    id: 'mill-large',
    name: 'Industrial CNC Mill',
    description: 'Heavy-duty industrial CNC mill for large-scale manufacturing',
    type: 'mill',
    config: {
      maxSpindleSpeed: 24000,
      maxFeedRate: 12000,
      workVolume: {
        x: 1200,
        y: 800,
        z: 500
      },
      controller: 'Fanuc',
      rapidFeedRate: 10000,
      maxDepthPerPass: 5.0
    },
    tags: ['large', 'industrial', 'manufacturing', 'mill']
  },
  
  // CNC Lathes
  {
    id: 'lathe-small',
    name: 'Bench-Top CNC Lathe',
    description: 'Compact CNC lathe for small parts and prototyping',
    type: 'lathe',
    config: {
      maxSpindleSpeed: 3000,
      maxFeedRate: 2000,
      workVolume: {
        x: 300, // Length
        y: 150, // Swing diameter
        z: 0    // Not applicable for lathe
      },
      controller: 'GRBL',
      maxTurningDiameter: 150,
      maxColletSize: 25
    },
    tags: ['small', 'bench-top', 'hobby', 'lathe']
  },
  {
    id: 'lathe-medium',
    name: 'Professional CNC Lathe',
    description: 'Mid-size CNC lathe for professional machining operations',
    type: 'lathe',
    config: {
      maxSpindleSpeed: 4500,
      maxFeedRate: 5000,
      workVolume: {
        x: 500, // Length
        y: 300, // Swing diameter
        z: 0    // Not applicable for lathe
      },
      controller: 'Mach3',
      maxTurningDiameter: 300,
      maxColletSize: 52
    },
    tags: ['medium', 'professional', 'production', 'lathe']
  },
  
  // 3D Printers
  {
    id: 'printer-fdm-small',
    name: 'Desktop FDM 3D Printer',
    description: 'Standard desktop FDM printer for general 3D printing',
    type: 'printer',
    config: {
      maxFeedRate: 150,
      workVolume: {
        x: 220,
        y: 220,
        z: 250
      },
      controller: 'Marlin',
      technology: 'FDM',
      nozzleDiameter: 0.4,
      filamentDiameter: 1.75,
      maxTemperature: 250
    },
    tags: ['fdm', 'desktop', 'hobby', 'printer']
  },
  {
    id: 'printer-fdm-large',
    name: 'Large Format FDM Printer',
    description: 'Large-scale FDM printer for bigger projects',
    type: 'printer',
    config: {
      maxFeedRate: 120,
      workVolume: {
        x: 400,
        y: 400,
        z: 500
      },
      controller: 'Marlin',
      technology: 'FDM',
      nozzleDiameter: 0.6,
      filamentDiameter: 1.75,
      maxTemperature: 280
    },
    tags: ['fdm', 'large', 'professional', 'printer']
  },
  {
    id: 'printer-resin',
    name: 'Resin 3D Printer',
    description: 'SLA/DLP resin 3D printer for high-resolution prints',
    type: 'printer',
    config: {
      workVolume: {
        x: 192,
        y: 120,
        z: 200
      },
      controller: 'ChiTu',
      technology: 'MSLA',
      pixelSize: 0.05,
      layerHeight: 0.025,
      maxExposureTime: 12
    },
    tags: ['resin', 'sla', 'dlp', 'high-resolution', 'printer']
  },
  
  // Laser Cutters
  {
    id: 'laser-co2-small',
    name: 'Desktop CO2 Laser Cutter',
    description: 'Compact CO2 laser cutter for small-scale projects',
    type: 'laser',
    config: {
      maxFeedRate: 12000,
      workVolume: {
        x: 500,
        y: 300,
        z: 100
      },
      controller: 'Ruida',
      laserType: 'CO2',
      laserPower: 40, // Watts
      minPowerPercent: 5,
      maxPowerPercent: 100
    },
    tags: ['small', 'co2', 'desktop', 'laser']
  },
  {
    id: 'laser-co2-large',
    name: 'Professional CO2 Laser Cutter',
    description: 'Commercial grade CO2 laser cutter for professional applications',
    type: 'laser',
    config: {
      maxFeedRate: 15000,
      workVolume: {
        x: 1200,
        y: 900,
        z: 150
      },
      controller: 'Ruida',
      laserType: 'CO2',
      laserPower: 100, // Watts
      minPowerPercent: 5,
      maxPowerPercent: 100
    },
    tags: ['large', 'co2', 'professional', 'laser']
  },
  {
    id: 'laser-fiber',
    name: 'Fiber Laser Marker',
    description: 'Precision fiber laser for metal marking and engraving',
    type: 'laser',
    config: {
      maxFeedRate: 8000,
      workVolume: {
        x: 200,
        y: 200,
        z: 100
      },
      controller: 'EZCAD',
      laserType: 'Fiber',
      laserPower: 20, // Watts
      minPowerPercent: 10,
      maxPowerPercent: 100,
      wavelength: 1064 // nm
    },
    tags: ['fiber', 'metal', 'marking', 'laser']
  },
  {
    id: 'laser-diode',
    name: 'Diode Laser Engraver',
    description: 'Compact diode laser for hobbyist engraving',
    type: 'laser',
    config: {
      maxFeedRate: 6000,
      workVolume: {
        x: 400,
        y: 400,
        z: 50
      },
      controller: 'GRBL',
      laserType: 'Diode',
      laserPower: 5.5, // Watts
      minPowerPercent: 1,
      maxPowerPercent: 100,
      wavelength: 445 // nm
    },
    tags: ['diode', 'small', 'hobby', 'laser']
  },
  {
    name: 'Generic 3-Axis Mill',
    type: 'mill',
    description: 'Standard 3-axis vertical milling machine',
    config: {
      type: 'mill',
      workVolume: {
        x: 500,
        y: 300,
        z: 200
      },
      maxSpindleSpeed: 10000,
      maxFeedRate: 5000,
      controller: 'generic',
      toolChanger: {
        type: 'manual',
        positions: 1
      },
      coolant: {
        types: ['flood', 'mist']
      }
    }
  },
  {
    name: 'Haas VF-2',
    type: 'mill',
    description: 'Professional vertical machining center',
    config: {
      type: 'mill',
      workVolume: {
        x: 762,
        y: 406,
        z: 508
      },
      maxSpindleSpeed: 12000,
      maxFeedRate: 18000,
      controller: 'Haas',
      toolChanger: {
        type: 'automatic',
        positions: 20
      },
      coolant: {
        types: ['flood', 'mist', 'through-spindle']
      }
    }
  },
  {
    name: 'Generic CNC Lathe',
    type: 'lathe',
    description: 'Standard 2-axis CNC lathe',
    config: {
      type: 'lathe',
      workVolume: {
        diameter: 250,
        length: 500
      },
      maxSpindleSpeed: 4000,
      maxFeedRate: 3000,
      controller: 'generic',
      toolChanger: {
        type: 'turret',
        positions: 8
      },
      coolant: {
        types: ['flood']
      }
    }
  }
];
