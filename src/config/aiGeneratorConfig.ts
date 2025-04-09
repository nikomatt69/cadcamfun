import { ComponentType, ManufacturingMethod, MaterialCategory, Dimensions } from '../types/ai';

export const COMPONENT_CATEGORIES: { id: ComponentType; label: string }[] = [
  { id: 'mechanical', label: 'Mechanical' },
  { id: 'electronic', label: 'Electronic' },
  { id: 'structural', label: 'Structural' },
  { id: 'fixture', label: 'Fixture' },
  { id: 'enclosure', label: 'Enclosure' },
  { id: 'fastener', label: 'Fastener' }
];

export const MANUFACTURING_METHODS: { id: ManufacturingMethod; label: string }[] = [
  { id: '3d-printing', label: '3D Printing' },
  { id: 'cnc-machining', label: 'CNC Machining' },
  { id: 'injection-molding', label: 'Injection Molding' },
  { id: 'laser-cutting', label: 'Laser Cutting' },
  { id: 'sheet-metal', label: 'Sheet Metal' },
  { id: 'extrusion', label: 'Extrusion' }
];

export const MATERIAL_CATEGORIES: { id: MaterialCategory; label: string }[] = [
  { id: 'metal', label: 'Metal' },
  { id: 'plastic', label: 'Plastic' },
  { id: 'composite', label: 'Composite' },
  { id: 'wood', label: 'Wood' },
  { id: 'ceramic', label: 'Ceramic' }
];

export const EXAMPLE_PROMPTS = [
  "Bearing housing for a 608ZZ bearing with mounting holes",
  "T-slot corner bracket for 20mm aluminum extrusion",
  "Electronics enclosure with ventilation and cable routing",
  "Adjustable tablet mounting bracket with VESA pattern",
  "Heatsink with optimal fin design for passive cooling",
  "Tool holder for CNC with quick-release mechanism"
];

export const DEFAULT_DIMENSIONS: Dimensions = {
  maxWidth: 150,
  maxHeight: 150,
  maxDepth: 150,
  minWallThickness: 2
};