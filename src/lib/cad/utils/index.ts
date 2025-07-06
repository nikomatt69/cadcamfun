/**
 * CAD Utils Index - Punto di accesso centralizzato
 * Esporta tutte le utility estratte da CADCanvas.tsx
 */

// Transform utilities
export {
  worldToScreen,
  screenToWorld,
  calculateElementsBoundingBox,
  calculateOptimalCameraPosition,
  applyTransformation,
  distance3D,
  angleBetweenVectors,
  normalizeAngle,
  degreesToRadians,
  radiansToDegrees,
  type Position3D,
  type Position2D
} from './transformUtils';

// Geometry utilities
export {
  calculateElementGeometry,
  calculateControlPoints,
  calculateElementArea,
  calculateElementVolume,
  isPointInsideElement,
  
} from './geometryUtils';

// Validation utilities
export {
  validateCADElement,
  validatePoint3D,
  validatePoint2D,
  validateColor,
  validateDimensions,
  validateRadius,
  validateAngle,
  validatePointsArray,
  validateMaterial,
  validateTransform,
  validateCameraParams,
  sanitizeCADElement,
  validateCanvasDimensions
} from './validationUtils';

// Re-export common types
export type { CADElement } from './geometryUtils';
