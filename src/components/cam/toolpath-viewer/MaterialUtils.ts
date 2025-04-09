import * as THREE from 'three';

/**
 * Material colors and textures based on workpiece material type
 */
export interface MaterialSettings {
  color: THREE.Color;
  roughness: number;
  metalness: number;
  normalMapIntensity?: number;
  bumpMapIntensity?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  opacity?: number;
  wireframe?: boolean;
}

/**
 * Get material settings based on material type
 */
export function getMaterialSettings(materialType: string): MaterialSettings {
  switch(materialType.toLowerCase()) {
    case 'aluminum':
      return {
        color: new THREE.Color(0xCCCCCC),
        roughness: 0.3,
        metalness: 0.9,
        clearcoat: 0.1,
        clearcoatRoughness: 0.3,
        opacity: 0.95
      };
      
    case 'steel':
      return {
        color: new THREE.Color(0x777777),
        roughness: 0.4,
        metalness: 0.8,
        normalMapIntensity: 0.2,
        opacity: 0.95
      };
      
    case 'stainless':
    case 'stainless_steel':
      return {
        color: new THREE.Color(0x888888),
        roughness: 0.2,
        metalness: 0.9,
        clearcoat: 0.2,
        clearcoatRoughness: 0.2,
        opacity: 0.95
      };
      
    case 'wood':
    case 'timber':
      return {
        color: new THREE.Color(0xA0522D),
        roughness: 0.9,
        metalness: 0.0,
        normalMapIntensity: 0.7,
        bumpMapIntensity: 0.3,
        opacity: 1.0
      };
      
    case 'plastic':
      return {
        color: new THREE.Color(0x1E90FF),
        roughness: 0.5,
        metalness: 0.1,
        clearcoat: 0.7,
        clearcoatRoughness: 0.3,
        opacity: 0.9
      };
      
    case 'copper':
      return {
        color: new THREE.Color(0xB87333),
        roughness: 0.3,
        metalness: 0.8,
        opacity: 1.0
      };
      
    case 'brass':
      return {
        color: new THREE.Color(0xB5A642),
        roughness: 0.3,
        metalness: 0.8,
        opacity: 1.0
      };
      
    case 'bronze':
      return {
        color: new THREE.Color(0xCD7F32),
        roughness: 0.3,
        metalness: 0.8,
        opacity: 1.0
      };
      
    case 'titanium':
      return {
        color: new THREE.Color(0xBCC6CC),
        roughness: 0.4,
        metalness: 0.7,
        opacity: 1.0
      };
      
    case 'carbon_fiber':
    case 'carbon':
      return {
        color: new THREE.Color(0x222222),
        roughness: 0.4,
        metalness: 0.3,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1,
        opacity: 1.0
      };
      
    case 'composite':
      return {
        color: new THREE.Color(0x607D8B),
        roughness: 0.6,
        metalness: 0.2,
        opacity: 1.0
      };
      
    case 'acrylic':
      return {
        color: new THREE.Color(0xE6E6FA),
        roughness: 0.2,
        metalness: 0.0,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1,
        opacity: 0.6
      };
    
    case 'glass':
      return {
        color: new THREE.Color(0xE0EEE0),
        roughness: 0.1,
        metalness: 0.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        opacity: 0.3
      };
      
    // Default material
    default:
      return {
        color: new THREE.Color(0xAAAAAA),
        roughness: 0.5,
        metalness: 0.5,
        opacity: 0.9
      };
  }
}

/**
 * Create a THREE.Material for workpiece based on material type and rendering mode
 */
export function createWorkpieceMaterial(
  materialType: string,
  mode: 'realistic' | 'shaded' | 'wireframe' | 'x-ray',
  opacity?: number
): THREE.Material {
  const settings = getMaterialSettings(materialType);
  
  // Override opacity if provided
  if (opacity !== undefined) {
    settings.opacity = opacity;
  }
  
  // Choose material based on rendering mode
  switch (mode) {
    case 'realistic':
      // Most realistic material with all textures
      return new THREE.MeshPhysicalMaterial({
        color: settings.color,
        metalness: settings.metalness,
        roughness: settings.roughness,
        clearcoat: settings.clearcoat ?? 0,
        clearcoatRoughness: settings.clearcoatRoughness ?? 0,
        transparent: (settings.opacity ?? 1.0) < 1.0,
        opacity: settings.opacity ?? 1.0,
        side: THREE.DoubleSide
      });
    case 'shaded':
      // Simpler standard material without complex properties
      return new THREE.MeshStandardMaterial({
        color: settings.color,
        metalness: settings.metalness * 0.8,
        roughness: settings.roughness,
        transparent: (settings.opacity ?? 1.0) < 1.0,
        opacity: settings.opacity ?? 1.0,
        side: THREE.DoubleSide
      });
    case 'wireframe':
      // Wireframe material
      return new THREE.MeshBasicMaterial({
        color: settings.color,
        wireframe: true,
        transparent: true,
        opacity: 0.8
      });
      
    case 'x-ray':
      // X-ray semi-transparent material
      return new THREE.MeshBasicMaterial({
        color: settings.color,
        transparent: true,
        opacity: 0.3,
        depthWrite: false
      });
      
    default:
      return new THREE.MeshStandardMaterial({
        color: settings.color,
        metalness: settings.metalness ?? 0.5,
        roughness: settings.roughness ?? 0.5,
        transparent: (settings.opacity ?? 1.0) < 1.0,
        opacity: settings.opacity ?? 1.0,
        side: THREE.DoubleSide
      });
  }
}

/**
 * Create normal map and bump map textures for materials
 * This can be used to enhance material realism
 */
export function createMaterialTextures(
  materialType: string
): { normalMap?: THREE.Texture; bumpMap?: THREE.Texture } {
  // Placeholder implementation - in a real app you'd load actual textures
  // We're not implementing texture loading here to keep it simple
  return {};
}

/**
 * Create material for cutaway sections when using section planes
 */
export function createCutMaterial(baseMaterial: THREE.Material): THREE.Material {
  if (baseMaterial instanceof THREE.MeshStandardMaterial ||
      baseMaterial instanceof THREE.MeshPhysicalMaterial) {
    return new THREE.MeshStandardMaterial({
      color: baseMaterial.color,
      metalness: baseMaterial.metalness,
      roughness: baseMaterial.roughness,
      side: THREE.DoubleSide,
      clippingPlanes: baseMaterial.clippingPlanes
    });
  }
  
  return baseMaterial.clone();
}
