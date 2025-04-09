/**
 * Funzionalità di processamento geometrie per G-code professionale
 * Implementa algoritmi di slicing, offset e ottimizzazione per geometrie CAD/CAM
 */

import * as THREE from 'three';
import { ZSlice, UnifiedComponentInfo } from './unifiedGcodeGenerator';

/**
 * Risultato del calcolo del boundingBox per un componente
 */
export interface BoundingBoxResult {
  box: THREE.Box3;
  dimensions: THREE.Vector3;
  center: THREE.Vector3;
  volume: number;
  surfaceArea: number;
}

/**
 * Opzioni per lo slicing di geometrie
 */
export interface SlicingOptions {
  zStart: number;              // Altezza Z iniziale
  zEnd: number;                // Altezza Z finale
  stepSize: number;            // Distanza tra slice
  resolution?: number;         // Risoluzione delle slice (punti per mm)
  includeTop?: boolean;        // Includere la superficie superiore
  includeBottom?: boolean;     // Includere la superficie inferiore
  orientation?: THREE.Vector3; // Orientazione del piano di slicing
  detectIslands?: boolean;     // Rilevare isole interne
}

/**
 * Enum per i tipi di punto in un contorno
 */
export enum ContourPointType {
  NORMAL = 'normal',           // Punto normale
  CORNER = 'corner',           // Angolo (cambio di direzione)
  INFLECTION = 'inflection',   // Punto di flesso
  START = 'start',             // Punto iniziale
  END = 'end',                 // Punto finale
  LEAD_IN = 'lead_in',         // Punto di entrata
  LEAD_OUT = 'lead_out'        // Punto di uscita
}

/**
 * Punto di un contorno con metadati
 */
export interface ContourPoint {
  x: number;                   // Coordinata X
  y: number;                   // Coordinata Y
  z: number;                   // Coordinata Z
  type: ContourPointType;      // Tipo di punto
  angle?: number;              // Angolo in radianti
  isCritical?: boolean;        // Punto critico (da non semplificare)
  radius?: number;             // Raggio (per archi)
  normal?: THREE.Vector3;      // Vettore normale
  feedrate?: number;           // Velocità avanzamento specifica
}

/**
 * Contorno chiuso con metadati
 */
export interface Contour {
  points: ContourPoint[];      // Punti del contorno
  closed: boolean;             // Contorno chiuso
  area: number;                // Area (mm²)
  length: number;              // Lunghezza (mm)
  centroid: THREE.Vector2;     // Centroide
  boundingBox: {               // Bounding box 2D
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  isIsland: boolean;           // È un'isola interna
  parentId?: number;           // ID contorno genitore (per isole)
  childIds?: number[];         // ID contorni figli (isole interne)
  depth: number;               // Profondità di nidificazione
  orientation: 'cw' | 'ccw';   // Orientazione (oraria/antioraria)
}

/**
 * Classe per il processamento di geometrie CAD/CAM
 */
export class GeometryProcessor {
  /**
   * Calcola il bounding box di un componente
   * @param component Componente da analizzare
   * @returns Risultato bounding box
   */
  static calculateBoundingBox(component: UnifiedComponentInfo): BoundingBoxResult {
    // Già esistente bounding box
    if (component.boundingBox instanceof THREE.Box3) {
      const dimensions = new THREE.Vector3();
      component.boundingBox.getSize(dimensions);
      
      const center = new THREE.Vector3();
      component.boundingBox.getCenter(center);
      
      // Stima del volume e dell'area superficiale
      const volume = dimensions.x * dimensions.y * dimensions.z;
      const surfaceArea = 2 * (
        dimensions.x * dimensions.y +
        dimensions.x * dimensions.z +
        dimensions.y * dimensions.z
      );
      
      return {
        box: component.boundingBox.clone(),
        dimensions,
        center,
        volume,
        surfaceArea
      };
    }
    
    // Se è un componente contenitore con elementi
    if (component.elements && component.elements.length > 0) {
      // Calcola il bounding box combinato di tutti gli elementi
      const box = new THREE.Box3();
      
      component.elements.forEach(element => {
        const elementBox = this.calculateBoundingBox(element).box;
        box.union(elementBox);
      });
      
      const dimensions = new THREE.Vector3();
      box.getSize(dimensions);
      
      const center = new THREE.Vector3();
      box.getCenter(center);
      
      // Stima del volume e dell'area superficiale
      const volume = dimensions.x * dimensions.y * dimensions.z;
      const surfaceArea = 2 * (
        dimensions.x * dimensions.y +
        dimensions.x * dimensions.z +
        dimensions.y * dimensions.z
      );
      
      return {
        box,
        dimensions,
        center,
        volume,
        surfaceArea
      };
    }
    
    // Per un singolo elemento
    const box = new THREE.Box3();
    
    // In base al tipo di elemento
    switch (component.type) {
      case 'cube':
      case 'box': {
        const width = component.dimensions?.x || component.parameters?.width || 0;
        const height = component.dimensions?.y || component.parameters?.height || 0;
        const depth = component.dimensions?.z || component.parameters?.depth || 0;
        
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const halfDepth = depth / 2;
        
        box.min.set(
          component.position.x - halfWidth,
          component.position.y - halfDepth,
          component.position.z - halfHeight
        );
        
        box.max.set(
          component.position.x + halfWidth,
          component.position.y + halfDepth,
          component.position.z + halfHeight
        );
        
        break;
      }
      
      case 'sphere': {
        const radius = component.radius || component.parameters?.radius || 0;
        
        box.min.set(
          component.position.x - radius,
          component.position.y - radius,
          component.position.z - radius
        );
        
        box.max.set(
          component.position.x + radius,
          component.position.y + radius,
          component.position.z + radius
        );
        
        break;
      }
      
      case 'cylinder': {
        const radius = component.radius || component.parameters?.radius || 0;
        const height = component.dimensions?.y || component.parameters?.height || 0;
        
        box.min.set(
          component.position.x - radius,
          component.position.y - radius,
          component.position.z - height / 2
        );
        
        box.max.set(
          component.position.x + radius,
          component.position.y + radius,
          component.position.z + height / 2
        );
        
        break;
      }
      
      case 'cone': {
        const radius = component.radius || component.parameters?.radius || 0;
        const height = component.dimensions?.y || component.parameters?.height || 0;
        
        box.min.set(
          component.position.x - radius,
          component.position.y - radius,
          component.position.z - height / 2
        );
        
        box.max.set(
          component.position.x + radius,
          component.position.y + radius,
          component.position.z + height / 2
        );
        
        break;
      }
      
      case 'torus': {
        const radius = component.radius || component.parameters?.radius || 0;
        const tubeRadius = component.parameters?.tubeRadius || radius * 0.2;
        
        box.min.set(
          component.position.x - (radius + tubeRadius),
          component.position.y - (radius + tubeRadius),
          component.position.z - tubeRadius
        );
        
        box.max.set(
          component.position.x + (radius + tubeRadius),
          component.position.y + (radius + tubeRadius),
          component.position.z + tubeRadius
        );
        
        break;
      }
      
      case 'capsule': {
        const radius = component.radius || component.parameters?.radius || 0;
        const height = component.dimensions?.y || component.parameters?.height || 0;
        
        box.min.set(
          component.position.x - radius,
          component.position.y - radius,
          component.position.z - height / 2
        );
        
        box.max.set(
          component.position.x + radius,
          component.position.y + radius,
          component.position.z + height / 2
        );
        
        break;
      }
      
      case 'hemisphere': {
        const radius = component.radius || component.parameters?.radius || 0;
        const direction = component.parameters?.direction || 'up';
        
        if (direction === 'up') {
          box.min.set(
            component.position.x - radius,
            component.position.y - radius,
            component.position.z
          );
          
          box.max.set(
            component.position.x + radius,
            component.position.y + radius,
            component.position.z + radius
          );
        } else {
          box.min.set(
            component.position.x - radius,
            component.position.y - radius,
            component.position.z - radius
          );
          
          box.max.set(
            component.position.x + radius,
            component.position.y + radius,
            component.position.z
          );
        }
        
        break;
      }
      
      default: {
        // Se abbiamo una mesh, usiamo il suo bounding box
        if (component.mesh && component.mesh.geometry) {
          component.mesh.geometry.computeBoundingBox();
          box.copy(component.mesh.geometry.boundingBox as THREE.Box3);
          
          // Applica la trasformazione del componente
          box.applyMatrix4(component.mesh.matrixWorld);
        } else {
          // Fallback: crea un box di dimensione minima attorno alla posizione
          box.min.set(
            component.position.x - 0.1,
            component.position.y - 0.1,
            component.position.z - 0.1
          );
          
          box.max.set(
            component.position.x + 0.1,
            component.position.y + 0.1,
            component.position.z + 0.1
          );
        }
      }
    }
    
    const dimensions = new THREE.Vector3();
    box.getSize(dimensions);
    
    const center = new THREE.Vector3();
    box.getCenter(center);
    
    // Calcolo del volume e dell'area superficiale in base al tipo di elemento
    let volume = 0;
    let surfaceArea = 0;
    
    switch (component.type) {
      case 'cube':
      case 'box': {
        volume = dimensions.x * dimensions.y * dimensions.z;
        surfaceArea = 2 * (
          dimensions.x * dimensions.y +
          dimensions.x * dimensions.z +
          dimensions.y * dimensions.z
        );
        break;
      }
      
      case 'sphere': {
        const radius = component.radius || 0;
        volume = (4 / 3) * Math.PI * Math.pow(radius, 3);
        surfaceArea = 4 * Math.PI * Math.pow(radius, 2);
        break;
      }
      
      case 'cylinder': {
        const radius = component.radius || 0;
        const height = component.dimensions?.y || component.parameters?.height || 0;
        volume = Math.PI * Math.pow(radius, 2) * height;
        surfaceArea = 2 * Math.PI * radius * (radius + height);
        break;
      }
      
      case 'cone': {
        const radius = component.radius || 0;
        const height = component.dimensions?.y || component.parameters?.height || 0;
        volume = (1 / 3) * Math.PI * Math.pow(radius, 2) * height;
        const slantHeight = Math.sqrt(Math.pow(radius, 2) + Math.pow(height, 2));
        surfaceArea = Math.PI * radius * (radius + slantHeight);
        break;
      }
      
      default: {
        // Stima semplificata per forme complesse
        volume = dimensions.x * dimensions.y * dimensions.z;
        surfaceArea = 2 * (
          dimensions.x * dimensions.y +
          dimensions.x * dimensions.z +
          dimensions.y * dimensions.z
        );
      }
    }
    
    return {
      box,
      dimensions,
      center,
      volume,
      surfaceArea
    };
  }

  /**
   * Calcola i livelli Z per lo slicing di un componente
   * @param boundingBox Bounding box del componente
   * @param stepSize Distanza tra slice
   * @param options Opzioni aggiuntive
   * @returns Array di quote Z per lo slicing
   */
  static calculateZLevels(boundingBox: THREE.Box3, stepSize: number, options?: {
    includeTop?: boolean;
    includeBottom?: boolean;
    maxDepth?: number;
  }): number[] {
    const zLevels: number[] = [];
    
    const topZ = boundingBox.max.z;
    const bottomZ = boundingBox.min.z;
    
    // Calcola il limite di profondità
    const maxDepth = options?.maxDepth || (topZ - bottomZ);
    const minZ = Math.max(bottomZ, topZ - maxDepth);
    
    // Se specificato, includi il livello superiore
    if (options?.includeTop !== false) {
      zLevels.push(topZ);
    }
    
    // Calcola i livelli intermedi
    let currentZ = topZ - stepSize;
    while (currentZ >= minZ) {
      zLevels.push(currentZ);
      currentZ -= stepSize;
      
      // Aggiungi un controllo di sicurezza
      if (zLevels.length > 1000) {
        console.warn('Numero eccessivo di livelli Z, limitato a 1000');
        break;
      }
    }
    
    // Se specificato e non è già stato aggiunto, includi il livello inferiore
    if (options?.includeBottom !== false && Math.abs(currentZ + stepSize - minZ) > 0.001) {
      zLevels.push(minZ);
    }
    
    return zLevels;
  }
  
  /**
   * Genera una slice di un componente a un livello Z specificato
   * @param component Componente da analizzare
   * @param zLevel Livello Z per la slice
   * @param options Opzioni di slicing
   * @returns Slice del componente
   */
  static sliceComponentAtZ(component: UnifiedComponentInfo, zLevel: number, options: {
    resolution?: number;
    detectIslands?: boolean;
  } = {}): ZSlice {
    // Imposta valori predefiniti per le opzioni
    const resolution = options.resolution || 10; // punti per mm
    const detectIslands = options.detectIslands !== false;
    
    // Inizializza risultato
    const slice: ZSlice = {
      zLevel,
      contours: [],
      islands: [],
      area: 0,
      bounds: { minX: Number.MAX_VALUE, maxX: -Number.MAX_VALUE, minY: Number.MAX_VALUE, maxY: -Number.MAX_VALUE }
    };
    
    // Se è un componente contenitore, processiamo tutti gli elementi
    if (component.elements && component.elements.length > 0) {
      // Array di tutte le slice degli elementi
      const elementSlices: ZSlice[] = [];
      
      // Per ogni elemento nel componente
      for (const element of component.elements) {
        try {
          const elementSlice = this.sliceComponentAtZ(element, zLevel, options);
          if (elementSlice.contours.length > 0 || elementSlice.islands.length > 0) {
            elementSlices.push(elementSlice);
          }
        } catch (error) {
          console.warn(`Errore nello slicing dell'elemento: ${error}`);
        }
      }
      
      // Se non ci sono slice, ritorna uno slice vuoto
      if (elementSlices.length === 0) {
        return slice;
      }
      
      // Combina le slice (unione delle superfici)
      return this.combineSlices(elementSlices);
    }
    
    // Per ciascun tipo di elemento (geometria primitiva)
    // Analizziamo l'intersezione con il piano Z
    switch (component.type) {
      case 'cube':
      case 'box': {
        const width = component.dimensions?.x || component.parameters?.width || 0;
        const height = component.dimensions?.y || component.parameters?.height || 0;
        const depth = component.dimensions?.z || component.parameters?.depth || 0;
        
        const minZ = component.position.z - height / 2;
        const maxZ = component.position.z + height / 2;
        
        // Verifica se il piano Z interseca il cubo
        if (zLevel >= minZ && zLevel <= maxZ) {
          // Un cubo intersecato dal piano Z forma un rettangolo
          const halfWidth = width / 2;
          const halfDepth = depth / 2;
          
          // Crea il contorno rettangolare
          const contour: THREE.Vector2[] = [
            new THREE.Vector2(component.position.x - halfWidth, component.position.y - halfDepth),
            new THREE.Vector2(component.position.x + halfWidth, component.position.y - halfDepth),
            new THREE.Vector2(component.position.x + halfWidth, component.position.y + halfDepth),
            new THREE.Vector2(component.position.x - halfWidth, component.position.y + halfDepth)
          ];
          
          // Aggiungi il contorno allo slice
          slice.contours.push(contour);
          
          // Calcola area e aggiorna i limiti
          const area = width * depth;
          slice.area += area;
          
          // Aggiorna i limiti
          slice.bounds.minX = Math.min(slice.bounds.minX, component.position.x - halfWidth);
          slice.bounds.maxX = Math.max(slice.bounds.maxX, component.position.x + halfWidth);
          slice.bounds.minY = Math.min(slice.bounds.minY, component.position.y - halfDepth);
          slice.bounds.maxY = Math.max(slice.bounds.maxY, component.position.y + halfDepth);
        }
        
        break;
      }
      
      case 'sphere': {
        const radius = component.radius || component.parameters?.radius || 0;
        
        // Il centro della sfera
        const centerZ = component.position.z;
        
        // Distanza dal centro della sfera al piano Z
        const distanceFromCenter = Math.abs(zLevel - centerZ);
        
        // Verifica se il piano Z interseca la sfera
        if (distanceFromCenter <= radius) {
          // Calcola il raggio della sezione circolare (Teorema di Pitagora)
          const circleRadius = Math.sqrt(Math.pow(radius, 2) - Math.pow(distanceFromCenter, 2));
          
          // Genera punti per un cerchio
          const contour: THREE.Vector2[] = [];
          const numPoints = Math.max(16, Math.ceil(circleRadius * resolution));
          
          for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            const x = component.position.x + circleRadius * Math.cos(angle);
            const y = component.position.y + circleRadius * Math.sin(angle);
            contour.push(new THREE.Vector2(x, y));
          }
          
          // Aggiungi il contorno allo slice
          slice.contours.push(contour);
          
          // Calcola area e aggiorna i limiti
          const area = Math.PI * Math.pow(circleRadius, 2);
          slice.area += area;
          
          // Aggiorna i limiti
          slice.bounds.minX = Math.min(slice.bounds.minX, component.position.x - circleRadius);
          slice.bounds.maxX = Math.max(slice.bounds.maxX, component.position.x + circleRadius);
          slice.bounds.minY = Math.min(slice.bounds.minY, component.position.y - circleRadius);
          slice.bounds.maxY = Math.max(slice.bounds.maxY, component.position.y + circleRadius);
        }
        
        break;
      }
      
      case 'cylinder': {
        const radius = component.radius || component.parameters?.radius || 0;
        const height = component.dimensions?.y || component.parameters?.height || 0;
        
        const minZ = component.position.z - height / 2;
        const maxZ = component.position.z + height / 2;
        
        // Verifica se il piano Z interseca il cilindro
        if (zLevel >= minZ && zLevel <= maxZ) {
          // La sezione di un cilindro è un cerchio
          
          // Genera punti per un cerchio
          const contour: THREE.Vector2[] = [];
          const numPoints = Math.max(16, Math.ceil(radius * resolution));
          
          for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            const x = component.position.x + radius * Math.cos(angle);
            const y = component.position.y + radius * Math.sin(angle);
            contour.push(new THREE.Vector2(x, y));
          }
          
          // Aggiungi il contorno allo slice
          slice.contours.push(contour);
          
          // Calcola area e aggiorna i limiti
          const area = Math.PI * Math.pow(radius, 2);
          slice.area += area;
          
          // Aggiorna i limiti
          slice.bounds.minX = Math.min(slice.bounds.minX, component.position.x - radius);
          slice.bounds.maxX = Math.max(slice.bounds.maxX, component.position.x + radius);
          slice.bounds.minY = Math.min(slice.bounds.minY, component.position.y - radius);
          slice.bounds.maxY = Math.max(slice.bounds.maxY, component.position.y + radius);
        }
        
        break;
      }
      
      case 'cone': {
        const radius = component.radius || component.parameters?.radius || 0;
        const height = component.dimensions?.y || component.parameters?.height || 0;
        
        const minZ = component.position.z - height / 2;
        const maxZ = component.position.z + height / 2;
        
        // Verifica se il piano Z interseca il cono
        if (zLevel >= minZ && zLevel <= maxZ) {
          // Per un cono, il raggio varia con l'altezza
          // Formula: r' = r * (1 - h'/h), dove h' è la distanza dalla base
          
          // Distanza dalla base del cono
          const distanceFromBase = zLevel - minZ;
          
          // Raggio della sezione a questa altezza
          const sectionRadius = radius * (1 - distanceFromBase / height);
          
          // Genera punti per un cerchio con questo raggio
          const contour: THREE.Vector2[] = [];
          const numPoints = Math.max(16, Math.ceil(sectionRadius * resolution));
          
          for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            const x = component.position.x + sectionRadius * Math.cos(angle);
            const y = component.position.y + sectionRadius * Math.sin(angle);
            contour.push(new THREE.Vector2(x, y));
          }
          
          // Aggiungi il contorno allo slice
          slice.contours.push(contour);
          
          // Calcola area e aggiorna i limiti
          const area = Math.PI * Math.pow(sectionRadius, 2);
          slice.area += area;
          
          // Aggiorna i limiti
          slice.bounds.minX = Math.min(slice.bounds.minX, component.position.x - sectionRadius);
          slice.bounds.maxX = Math.max(slice.bounds.maxX, component.position.x + sectionRadius);
          slice.bounds.minY = Math.min(slice.bounds.minY, component.position.y - sectionRadius);
          slice.bounds.maxY = Math.max(slice.bounds.maxY, component.position.y + sectionRadius);
        }
        
        break;
      }
      
      case 'torus': {
        const radius = component.radius || component.parameters?.radius || 0;
        const tubeRadius = component.parameters?.tubeRadius || radius * 0.2;
        
        const minZ = component.position.z - tubeRadius;
        const maxZ = component.position.z + tubeRadius;
        
        // Verifica se il piano Z interseca il toro
        if (zLevel >= minZ && zLevel <= maxZ) {
          // Per un toro, l'intersezione è un po' più complessa
          // Distanza dal piano centrale del toro
          const distanceFromCenter = Math.abs(zLevel - component.position.z);
          
          // In base alla distanza, calcoliamo i raggi interni ed esterni della sezione
          // Utilizziamo il teorema di Pitagora
          const offset = Math.sqrt(Math.pow(tubeRadius, 2) - Math.pow(distanceFromCenter, 2));
          
          // Raggio interno ed esterno
          const innerRadius = Math.max(0, radius - offset);
          const outerRadius = radius + offset;
          
          // Genera punti per anello interno ed esterno
          const innerContour: THREE.Vector2[] = [];
          const outerContour: THREE.Vector2[] = [];
          
          const innerPoints = Math.max(16, Math.ceil(innerRadius * resolution));
          const outerPoints = Math.max(16, Math.ceil(outerRadius * resolution));
          
          for (let i = 0; i < innerPoints; i++) {
            const angle = (i / innerPoints) * Math.PI * 2;
            const x = component.position.x + innerRadius * Math.cos(angle);
            const y = component.position.y + innerRadius * Math.sin(angle);
            innerContour.push(new THREE.Vector2(x, y));
          }
          
          for (let i = 0; i < outerPoints; i++) {
            const angle = (i / outerPoints) * Math.PI * 2;
            const x = component.position.x + outerRadius * Math.cos(angle);
            const y = component.position.y + outerRadius * Math.sin(angle);
            outerContour.push(new THREE.Vector2(x, y));
          }
          
          // L'esterno è un contorno, l'interno è un'isola
          slice.contours.push(outerContour);
          
          if (innerRadius > 0) {
            slice.islands.push(innerContour);
          }
          
          // Calcola area e aggiorna i limiti
          const area = Math.PI * (Math.pow(outerRadius, 2) - Math.pow(innerRadius, 2));
          slice.area += area;
          
          // Aggiorna i limiti
          slice.bounds.minX = Math.min(slice.bounds.minX, component.position.x - outerRadius);
          slice.bounds.maxX = Math.max(slice.bounds.maxX, component.position.x + outerRadius);
          slice.bounds.minY = Math.min(slice.bounds.minY, component.position.y - outerRadius);
          slice.bounds.maxY = Math.max(slice.bounds.maxY, component.position.y + outerRadius);
        }
        
        break;
      }
      
      case 'hemisphere': {
        const radius = component.radius || component.parameters?.radius || 0;
        const direction = component.parameters?.direction || 'up';
        
        // Calcola il centro e i limiti dell'emisfero
        let centerZ, minZ, maxZ;
        
        if (direction === 'up') {
          centerZ = component.position.z + radius;
          minZ = component.position.z;
          maxZ = component.position.z + 2 * radius;
        } else {
          centerZ = component.position.z - radius;
          minZ = component.position.z - 2 * radius;
          maxZ = component.position.z;
        }
        
        // Verifica se il piano Z interseca l'emisfero
        if (zLevel >= minZ && zLevel <= maxZ) {
          // Calcola il raggio della sezione circolare (come per la sfera)
          const distanceFromCenter = Math.abs(zLevel - centerZ);
          const circleRadius = Math.sqrt(Math.pow(radius, 2) - Math.pow(distanceFromCenter, 2));
          
          // Genera punti per un cerchio
          const contour: THREE.Vector2[] = [];
          const numPoints = Math.max(16, Math.ceil(circleRadius * resolution));
          
          for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            const x = component.position.x + circleRadius * Math.cos(angle);
            const y = component.position.y + circleRadius * Math.sin(angle);
            contour.push(new THREE.Vector2(x, y));
          }
          
          // Aggiungi il contorno allo slice
          slice.contours.push(contour);
          
          // Calcola area e aggiorna i limiti
          const area = Math.PI * Math.pow(circleRadius, 2);
          slice.area += area;
          
          // Aggiorna i limiti
          slice.bounds.minX = Math.min(slice.bounds.minX, component.position.x - circleRadius);
          slice.bounds.maxX = Math.max(slice.bounds.maxX, component.position.x + circleRadius);
          slice.bounds.minY = Math.min(slice.bounds.minY, component.position.y - circleRadius);
          slice.bounds.maxY = Math.max(slice.bounds.maxY, component.position.y + circleRadius);
        }
        
        break;
      }
      
      case 'capsule': {
        const radius = component.radius || component.parameters?.radius || 0;
        const height = component.dimensions?.y || component.parameters?.height || 0;
        const orientation = component.parameters?.orientation || 'z';
        
        // Per ora, supportiamo solo capsules orientate lungo l'asse Z
        if (orientation === 'z') {
          const cylinderHeight = Math.max(0, height - 2 * radius);
          const topHemisphereCenter = component.position.z + cylinderHeight / 2;
          const bottomHemisphereCenter = component.position.z - cylinderHeight / 2;
          
          const minZ = component.position.z - cylinderHeight / 2 - radius;
          const maxZ = component.position.z + cylinderHeight / 2 + radius;
          
          // Verifica se il piano Z interseca la capsula
          if (zLevel >= minZ && zLevel <= maxZ) {
            let circleRadius: number;
            
            // Calcola il raggio della sezione in base alla posizione
            if (zLevel > topHemisphereCenter) {
              // Emisfero superiore
              const distanceFromCenter = zLevel - topHemisphereCenter;
              circleRadius = Math.sqrt(Math.pow(radius, 2) - Math.pow(distanceFromCenter, 2));
            } else if (zLevel < bottomHemisphereCenter) {
              // Emisfero inferiore
              const distanceFromCenter = bottomHemisphereCenter - zLevel;
              circleRadius = Math.sqrt(Math.pow(radius, 2) - Math.pow(distanceFromCenter, 2));
            } else {
              // Parte cilindrica
              circleRadius = radius;
            }
            
            // Genera punti per un cerchio
            const contour: THREE.Vector2[] = [];
            const numPoints = Math.max(16, Math.ceil(circleRadius * resolution));
            
            for (let i = 0; i < numPoints; i++) {
              const angle = (i / numPoints) * Math.PI * 2;
              const x = component.position.x + circleRadius * Math.cos(angle);
              const y = component.position.y + circleRadius * Math.sin(angle);
              contour.push(new THREE.Vector2(x, y));
            }
            
            // Aggiungi il contorno allo slice
            slice.contours.push(contour);
            
            // Calcola area e aggiorna i limiti
            const area = Math.PI * Math.pow(circleRadius, 2);
            slice.area += area;
            
            // Aggiorna i limiti
            slice.bounds.minX = Math.min(slice.bounds.minX, component.position.x - circleRadius);
            slice.bounds.maxX = Math.max(slice.bounds.maxX, component.position.x + circleRadius);
            slice.bounds.minY = Math.min(slice.bounds.minY, component.position.y - circleRadius);
            slice.bounds.maxY = Math.max(slice.bounds.maxY, component.position.y + circleRadius);
          }
        } else {
          console.warn(`Capsule orientation ${orientation} not yet supported for slicing`);
        }
        
        break;
      }
      
      default: {
        if (component.mesh && component.mesh.geometry) {
          // Per mesh complesse, dovremmo usare un algoritmo di slicing più avanzato
          // Questo è un fallback molto semplificato
          console.warn(`Slicing for complex meshes not yet implemented`);
        }
      }
    }
    
    // Se i limiti non sono stati aggiornati, reset ai valori predefiniti
    if (slice.bounds.minX === Number.MAX_VALUE) {
      slice.bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }
    
    return slice;
  }
  
  /**
   * Combina più slice in una singola slice
   * @param slices Array di slice da combinare
   * @returns Slice combinata
   */
  static combineSlices(slices: ZSlice[]): ZSlice {
    if (slices.length === 0) {
      throw new Error('No slices to combine');
    }
    
    if (slices.length === 1) {
      return slices[0];
    }
    
    // Prendi il livello Z dalla prima slice
    const zLevel = slices[0].zLevel;
    
    // Inizializza risultato
    const combinedSlice: ZSlice = {
      zLevel,
      contours: [],
      islands: [],
      area: 0,
      bounds: { minX: Number.MAX_VALUE, maxX: -Number.MAX_VALUE, minY: Number.MAX_VALUE, maxY: -Number.MAX_VALUE }
    };
    
    // Aggiungi tutti i contorni e le isole
    for (const slice of slices) {
      combinedSlice.contours.push(...slice.contours);
      combinedSlice.islands.push(...slice.islands);
      combinedSlice.area += slice.area;
      
      // Aggiorna i limiti
      combinedSlice.bounds.minX = Math.min(combinedSlice.bounds.minX, slice.bounds.minX);
      combinedSlice.bounds.maxX = Math.max(combinedSlice.bounds.maxX, slice.bounds.maxX);
      combinedSlice.bounds.minY = Math.min(combinedSlice.bounds.minY, slice.bounds.minY);
      combinedSlice.bounds.maxY = Math.max(combinedSlice.bounds.maxY, slice.bounds.maxY);
    }
    
    // Nota: qui potremmo eseguire operazioni booleane tra i contorni
    // per ottenere una rappresentazione corretta delle intersezioni
    // Ma per ora, è una semplice unione
    
    return combinedSlice;
  }
  
  /**
   * Calcola un offset di un contorno
   * @param contour Contorno di input
   * @param distance Distanza di offset (positiva = esterno, negativa = interno)
   * @returns Contorno con offset applicato
   */
  static offsetContour(contour: THREE.Vector2[], distance: number): THREE.Vector2[] {
    if (distance === 0 || contour.length < 3) {
      return [...contour];
    }
    
    // Implementazione semplificata dell'algoritmo di offset
    const result: THREE.Vector2[] = [];
    
    for (let i = 0; i < contour.length; i++) {
      const prev = contour[(i + contour.length - 1) % contour.length];
      const current = contour[i];
      const next = contour[(i + 1) % contour.length];
      
      // Calcola vettori direzione
      const v1 = new THREE.Vector2().subVectors(current, prev).normalize();
      const v2 = new THREE.Vector2().subVectors(next, current).normalize();
      
      // Calcola le normali
      const n1 = new THREE.Vector2(-v1.y, v1.x);
      const n2 = new THREE.Vector2(-v2.y, v2.x);
      
      // Media delle normali
      const n = new THREE.Vector2().addVectors(n1, n2).normalize();
      
      // Calcola il fattore di scala per gestire angoli acuti/ottusi
      const sinHalfAngle = Math.abs(v1.x * v2.y - v1.y * v2.x) / 2; // sin(angle/2)
      const scaleFactor = sinHalfAngle !== 0 ? 1 / sinHalfAngle : 1;
      
      // Applica offset
      const offsetPoint = new THREE.Vector2()
        .addVectors(current, n.multiplyScalar(distance * scaleFactor));
      
      result.push(offsetPoint);
    }
    
    return result;
  }
  
  /**
   * Verifica se un contorno è orientato in senso orario
   * @param contour Contorno da verificare
   * @returns true se orario, false se antiorario
   */
  static isClockwise(contour: THREE.Vector2[]): boolean {
    if (contour.length < 3) {
      return true;
    }
    
    // Calcola l'area con il metodo della somma dei prodotti incrociati
    let sum = 0;
    
    for (let i = 0; i < contour.length; i++) {
      const current = contour[i];
      const next = contour[(i + 1) % contour.length];
      
      sum += (next.x - current.x) * (next.y + current.y);
    }
    
    // Area positiva = senso antiorario, area negativa = senso orario
    return sum < 0;
  }
  
  /**
   * Calcola il centroide di un contorno
   * @param contour Contorno
   * @returns Centroide come Vector2
   */
  static calculateCentroid(contour: THREE.Vector2[]): THREE.Vector2 {
    let area = 0;
    let cx = 0;
    let cy = 0;
    
    for (let i = 0; i < contour.length; i++) {
      const current = contour[i];
      const next = contour[(i + 1) % contour.length];
      
      const factor = current.x * next.y - next.x * current.y;
      area += factor;
      
      cx += (current.x + next.x) * factor;
      cy += (current.y + next.y) * factor;
    }
    
    area /= 2;
    area = Math.abs(area);
    
    // Evita divisione per zero
    if (area < 0.00001) {
      // Calcola media dei punti come fallback
      cx = cy = 0;
      for (const point of contour) {
        cx += point.x;
        cy += point.y;
      }
      return new THREE.Vector2(cx / contour.length, cy / contour.length);
    }
    
    // Formula del centroide
    cx /= 6 * area;
    cy /= 6 * area;
    
    return new THREE.Vector2(cx, cy);
  }
  
  /**
   * Semplifica un contorno rimuovendo punti ridondanti
   * @param contour Contorno da semplificare
   * @param tolerance Tolleranza (distanza massima)
   * @returns Contorno semplificato
   */
  static simplifyContour(contour: THREE.Vector2[], tolerance: number): THREE.Vector2[] {
    if (contour.length <= 2 || tolerance <= 0) {
      return [...contour];
    }
    
    // Implementazione dell'algoritmo di Douglas-Peucker
    const douglasPeucker = (points: THREE.Vector2[], startIndex: number, endIndex: number, tolerance: number): THREE.Vector2[] => {
      if (endIndex <= startIndex + 1) {
        return [points[startIndex]];
      }
      
      // Trova il punto più lontano dalla linea startIndex-endIndex
      let maxDistance = 0;
      let maxIndex = startIndex;
      
      const start = points[startIndex];
      const end = points[endIndex];
      
      // Vettore linea
      const line = new THREE.Vector2().subVectors(end, start);
      const lineLength = line.length();
      
      for (let i = startIndex + 1; i < endIndex; i++) {
        const point = points[i];
        
        // Calcola la distanza punto-linea
        const v = new THREE.Vector2().subVectors(point, start);
        const projection = v.dot(line) / lineLength;
        const projectedPoint = new THREE.Vector2()
          .copy(start)
          .add(line.clone().multiplyScalar(projection / lineLength));
        
        const distance = new THREE.Vector2().subVectors(point, projectedPoint).length();
        
        if (distance > maxDistance) {
          maxDistance = distance;
          maxIndex = i;
        }
      }
      
      // Se la distanza massima è maggiore della tolleranza, suddividi e continua
      if (maxDistance > tolerance) {
        const left = douglasPeucker(points, startIndex, maxIndex, tolerance);
        const right = douglasPeucker(points, maxIndex, endIndex, tolerance);
        
        // Combina i risultati, evitando duplicati
        return [...left, ...right.slice(1)];
      } else {
        // Altrimenti, semplifica in una linea retta
        return [points[startIndex], points[endIndex]];
      }
    };
    
    // Chiudi il contorno se aperto
    const isClosed = 
      contour[0].x === contour[contour.length - 1].x && 
      contour[0].y === contour[contour.length - 1].y;
    
    let result: THREE.Vector2[];
    
    if (isClosed) {
      // Per contorni chiusi, tratta il primo/ultimo punto come un unico punto
      const tempContour = contour.slice(0, contour.length - 1);
      result = douglasPeucker(tempContour, 0, tempContour.length - 1, tolerance);
      result.push(result[0].clone()); // Chiudi il contorno
    } else {
      result = douglasPeucker(contour, 0, contour.length - 1, tolerance);
    }
    
    return result;
  }
} 