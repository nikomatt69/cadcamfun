/**
 * Validation Utilities - Estratte da CADCanvas.tsx
 * Funzioni pure per validazione input - ZERO RISCHIO
 */

import * as THREE from 'three';
import { CADElement } from './geometryUtils';

/**
 * Valida se un elemento CAD ha le proprietà minime richieste
 */
export const validateCADElement = (element: any): element is CADElement => {
  if (!element || typeof element !== 'object') {
    return false;
  }

  // Proprietà obbligatorie
  if (!element.id || typeof element.id !== 'string') {
    return false;
  }

  if (!element.type || typeof element.type !== 'string') {
    return false;
  }

  if (typeof element.x !== 'number' || typeof element.y !== 'number') {
    return false;
  }

  // Validazioni specifiche per tipo
  switch (element.type) {
    case 'cube':
      return typeof element.width === 'number' && 
             typeof element.height === 'number' && 
             typeof element.depth === 'number' &&
             element.width > 0 && element.height > 0 && element.depth > 0;

    case 'sphere':
      return typeof element.radius === 'number' && element.radius > 0;

    case 'cylinder':
    case 'cone':
      return typeof element.radius === 'number' && 
             typeof element.height === 'number' &&
             element.radius > 0 && element.height > 0;

    case 'circle':
      return typeof element.radius === 'number' && element.radius > 0;

    case 'rectangle':
      return typeof element.width === 'number' && 
             typeof element.height === 'number' &&
             element.width > 0 && element.height > 0;

    case 'line':
      return typeof element.x1 === 'number' && typeof element.y1 === 'number' &&
             typeof element.x2 === 'number' && typeof element.y2 === 'number';

    case 'polygon':
      return Array.isArray(element.points) && element.points.length >= 3;

    default:
      return true; // Elementi custom possono avere validazioni diverse
  }
};

/**
 * Valida le coordinate di un punto 3D
 */
export const validatePoint3D = (point: any): point is THREE.Vector3 => {
  return point && 
         typeof point.x === 'number' && 
         typeof point.y === 'number' && 
         typeof point.z === 'number' &&
         !isNaN(point.x) && !isNaN(point.y) && !isNaN(point.z);
};

/**
 * Valida le coordinate di un punto 2D
 */
export const validatePoint2D = (point: any): boolean => {
  return point && 
         typeof point.x === 'number' && 
         typeof point.y === 'number' &&
         !isNaN(point.x) && !isNaN(point.y);
};

/**
 * Valida un colore (numero esadecimale o stringa)
 */
export const validateColor = (color: any): boolean => {
  if (typeof color === 'number') {
    return color >= 0x000000 && color <= 0xFFFFFF;
  }
  
  if (typeof color === 'string') {
    // Verifica formato hex (#RRGGBB)
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    return hexRegex.test(color);
  }
  
  return false;
};

/**
 * Valida le dimensioni di un elemento
 */
export const validateDimensions = (
  width: number, 
  height: number, 
  depth?: number
): boolean => {
  const validWidth = typeof width === 'number' && width > 0 && !isNaN(width);
  const validHeight = typeof height === 'number' && height > 0 && !isNaN(height);
  
  if (depth !== undefined) {
    const validDepth = typeof depth === 'number' && depth > 0 && !isNaN(depth);
    return validWidth && validHeight && validDepth;
  }
  
  return validWidth && validHeight;
};

/**
 * Valida un raggio
 */
export const validateRadius = (radius: number): boolean => {
  return typeof radius === 'number' && radius > 0 && !isNaN(radius);
};

/**
 * Valida un angolo in gradi
 */
export const validateAngle = (angle: number): boolean => {
  return typeof angle === 'number' && !isNaN(angle);
};

/**
 * Valida un array di punti per poligoni o percorsi
 */
export const validatePointsArray = (points: any[]): boolean => {
  if (!Array.isArray(points) || points.length < 2) {
    return false;
  }

  return points.every(point => validatePoint2D(point));
};

/**
 * Valida le proprietà di un materiale
 */
export const validateMaterial = (material: any): boolean => {
  if (!material || typeof material !== 'object') {
    return false;
  }

  // Verifica proprietà base del materiale
  if (material.color !== undefined && !validateColor(material.color)) {
    return false;
  }

  if (material.opacity !== undefined) {
    const validOpacity = typeof material.opacity === 'number' && 
                        material.opacity >= 0 && 
                        material.opacity <= 1;
    if (!validOpacity) return false;
  }

  if (material.wireframe !== undefined && typeof material.wireframe !== 'boolean') {
    return false;
  }

  return true;
};

/**
 * Valida i parametri di trasformazione
 */
export const validateTransform = (transform: any): boolean => {
  if (!transform || typeof transform !== 'object') {
    return false;
  }

  if (transform.position && !validatePoint3D(transform.position)) {
    return false;
  }

  if (transform.rotation) {
    if (transform.rotation.x !== undefined && !validateAngle(transform.rotation.x)) return false;
    if (transform.rotation.y !== undefined && !validateAngle(transform.rotation.y)) return false;
    if (transform.rotation.z !== undefined && !validateAngle(transform.rotation.z)) return false;
  }

  if (transform.scale) {
    if (transform.scale.x !== undefined && typeof transform.scale.x !== 'number') return false;
    if (transform.scale.y !== undefined && typeof transform.scale.y !== 'number') return false;
    if (transform.scale.z !== undefined && typeof transform.scale.z !== 'number') return false;
  }

  return true;
};

/**
 * Valida i parametri di una camera
 */
export const validateCameraParams = (params: any): boolean => {
  if (!params || typeof params !== 'object') {
    return false;
  }

  if (params.fov !== undefined) {
    const validFov = typeof params.fov === 'number' && 
                    params.fov > 0 && 
                    params.fov < 180;
    if (!validFov) return false;
  }

  if (params.aspect !== undefined) {
    const validAspect = typeof params.aspect === 'number' && params.aspect > 0;
    if (!validAspect) return false;
  }

  if (params.near !== undefined) {
    const validNear = typeof params.near === 'number' && params.near > 0;
    if (!validNear) return false;
  }

  if (params.far !== undefined) {
    const validFar = typeof params.far === 'number' && params.far > 0;
    if (!validFar) return false;
  }

  return true;
};

/**
 * Sanifica un elemento CAD rimuovendo proprietà non valide
 */
export const sanitizeCADElement = (element: any): Partial<CADElement> | null => {
  if (!validateCADElement(element)) {
    return null;
  }

  const sanitized: Partial<CADElement> = {
    id: element.id,
    type: element.type,
    x: element.x,
    y: element.y
  };

  // Aggiungi proprietà opzionali se valide
  if (typeof element.z === 'number' && !isNaN(element.z)) {
    sanitized.z = element.z;
  }

  if (validateColor(element.color)) {
    sanitized.color = element.color;
  }

  if (typeof element.wireframe === 'boolean') {
    sanitized.wireframe = element.wireframe;
  }

  if (validateAngle(element.angle || 0)) {
    sanitized.angle = element.angle;
  }

  // Proprietà specifiche per tipo
  switch (element.type) {
    case 'cube':
      if (validateDimensions(element.width || 0, element.height || 0, element.depth || 0)) {
        sanitized.width = element.width;
        sanitized.height = element.height;
        sanitized.depth = element.depth;
      }
      break;

    case 'sphere':
      if (validateRadius(element.radius || 0)) {
        sanitized.radius = element.radius;
      }
      break;

    case 'rectangle':
      if (validateDimensions(element.width || 0, element.height || 0)) {
        sanitized.width = element.width;
        sanitized.height = element.height;
      }
      break;

    case 'circle':
      if (validateRadius(element.radius || 0)) {
        sanitized.radius = element.radius;
      }
      break;
  }

  return sanitized;
};

/**
 * Valida le dimensioni del canvas
 */
export const validateCanvasDimensions = (width: any, height: any): boolean => {
  const validWidth = (typeof width === 'number' && width > 0) || 
                    (typeof width === 'string' && width.length > 0);
  
  const validHeight = (typeof height === 'number' && height > 0) || 
                     (typeof height === 'string' && height.length > 0);

  return validWidth && validHeight;
};
