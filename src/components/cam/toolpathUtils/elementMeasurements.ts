// src/toolpath/elementMeasurements.ts
import { Element } from 'src/store/elementsStore';
import { SelectionBounds } from 'src/store/selectorStore';

/**
 * Interfaccia per dimensioni e posizione estratte da un elemento
 */
export interface ElementDimensions {
  // Posizione
  x: number;
  y: number;
  z: number;
  // Dimensioni
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;
  // Per elementi lineari
  x1?: number;
  y1?: number;
  z1?: number;
  x2?: number;
  y2?: number;
  z2?: number;
  // Rotazione
  angleX?: number;
  angleY?: number;
  angleZ?: number;
}

/**
 * Estrae le dimensioni e la posizione da un elemento
 * @param element Elemento da cui estrarre le dimensioni
 * @returns Dimensioni e posizione dell'elemento
 */
export function getElementDimensions(element: Element): ElementDimensions {
  const dimensions: ElementDimensions = {
    x: element.x || 0,
    y: element.y || 0,
    z: element.z || 0,
    angleX: element.angleX || 0,
    angleY: element.angleY || 0,
    angleZ: element.angleZ || 0,
  };

  switch (element.type) {
    case 'rectangle':
    case 'cube':
      dimensions.width = element.width || 0;
      dimensions.height = element.height || 0;
      if (element.type === 'cube') {
        dimensions.depth = element.depth || 0;
      }
      break;
    case 'circle':
    case 'sphere':
      dimensions.radius = element.radius || 0;
      break;
    case 'line':
      dimensions.x1 = element.x1 || 0;
      dimensions.y1 = element.y1 || 0;
      dimensions.z1 = element.z1 || 0;
      dimensions.x2 = element.x2 || 0;
      dimensions.y2 = element.y2 || 0;
      dimensions.z2 = element.z2 || 0;
      break;
    case 'component':
    case 'group':
      // Per componenti compositi, utilizziamo le dimensioni fornite
      dimensions.width = element.width || 0;
      dimensions.height = element.height || 0;
      dimensions.depth = element.depth || 0;
      break;
  }

  return dimensions;
}

/**
 * Ottiene i punti caratteristici di un elemento in base al suo tipo
 * (es. centro di un cerchio, vertici di un rettangolo)
 * @param element Elemento da cui estrarre i punti
 * @returns Array di punti {x, y, z} caratteristici dell'elemento
 */
export function getElementFeaturePoints(element: Element): {x: number, y: number, z: number}[] {
  const dimensions = getElementDimensions(element);
  const points: {x: number, y: number, z: number}[] = [];

  switch (element.type) {
    case 'rectangle':
    case 'cube':
      // Aggiungi i vertici
      const halfWidth = (dimensions.width || 0) / 2;
      const halfHeight = (dimensions.height || 0) / 2;
      const halfDepth = (dimensions.depth || 0) / 2;
      
      // Centro
      points.push({ x: dimensions.x, y: dimensions.y, z: dimensions.z });
      
      // Vertici (in piano XY per rectangle, in 3D per cube)
      points.push({ x: dimensions.x - halfWidth, y: dimensions.y - halfHeight, z: dimensions.z - halfDepth });
      points.push({ x: dimensions.x + halfWidth, y: dimensions.y - halfHeight, z: dimensions.z - halfDepth });
      points.push({ x: dimensions.x + halfWidth, y: dimensions.y + halfHeight, z: dimensions.z - halfDepth });
      points.push({ x: dimensions.x - halfWidth, y: dimensions.y + halfHeight, z: dimensions.z - halfDepth });
      
      if (element.type === 'cube') {
        // Aggiungi i vertici superiori per i cubi
        points.push({ x: dimensions.x - halfWidth, y: dimensions.y - halfHeight, z: dimensions.z + halfDepth });
        points.push({ x: dimensions.x + halfWidth, y: dimensions.y - halfHeight, z: dimensions.z + halfDepth });
        points.push({ x: dimensions.x + halfWidth, y: dimensions.y + halfHeight, z: dimensions.z + halfDepth });
        points.push({ x: dimensions.x - halfWidth, y: dimensions.y + halfHeight, z: dimensions.z + halfDepth });
      }
      break;
    
    case 'circle':
    case 'sphere':
      // Centro
      points.push({ x: dimensions.x, y: dimensions.y, z: dimensions.z });
      // Punti cardinali sul cerchio/sfera
      const radius = dimensions.radius || 0;
      points.push({ x: dimensions.x + radius, y: dimensions.y, z: dimensions.z }); // Est
      points.push({ x: dimensions.x, y: dimensions.y + radius, z: dimensions.z }); // Nord
      points.push({ x: dimensions.x - radius, y: dimensions.y, z: dimensions.z }); // Ovest
      points.push({ x: dimensions.x, y: dimensions.y - radius, z: dimensions.z }); // Sud
      
      if (element.type === 'sphere') {
        // Poli superiore e inferiore
        points.push({ x: dimensions.x, y: dimensions.y, z: dimensions.z + radius });
        points.push({ x: dimensions.x, y: dimensions.y, z: dimensions.z - radius });
      }
      break;
    
    case 'line':
      // Punti di inizio e fine
      points.push({ x: dimensions.x1 || 0, y: dimensions.y1 || 0, z: dimensions.z1 || 0 });
      points.push({ x: dimensions.x2 || 0, y: dimensions.y2 || 0, z: dimensions.z2 || 0 });
      // Punto medio
      points.push({ 
        x: ((dimensions.x1 || 0) + (dimensions.x2 || 0)) / 2,
        y: ((dimensions.y1 || 0) + (dimensions.y2 || 0)) / 2,
        z: ((dimensions.z1 || 0) + (dimensions.z2 || 0)) / 2
      });
      break;
    
    case 'component':
    case 'group':
      // Centro del componente
      points.push({ x: dimensions.x, y: dimensions.y, z: dimensions.z });
      
      // Se il componente ha elementi figli, aggiungi anche i loro punti
      if (element.elements && Array.isArray(element.elements)) {
        element.elements.forEach((childElement: Element) => {
          // Calcola la posizione assoluta degli elementi figlio
          const childPoints = getElementFeaturePoints(childElement).map(point => ({
            x: point.x + dimensions.x,
            y: point.y + dimensions.y,
            z: point.z + dimensions.z
          }));
          points.push(...childPoints);
        });
      }
      break;
  }

  return points;
}

/**
 * Ottiene i path per operazioni di contornatura basati sul tipo di elemento
 * @param element Elemento da cui generare i percorsi di contorno
 * @param offset Offset dal bordo dell'elemento (positivo = esterno, negativo = interno)
 * @returns Array di punti che formano il percorso di contorno
 */
export function getElementContourPath(element: Element, offset: number = 0): {x: number, y: number, z: number}[] {
  const dimensions = getElementDimensions(element);
  const contourPoints: {x: number, y: number, z: number}[] = [];

  switch (element.type) {
    case 'rectangle':
      // Per rettangoli, genera un percorso rettangolare
      const halfWidth = (dimensions.width || 0) / 2;
      const halfHeight = (dimensions.height || 0) / 2;
      
      // Applica offset
      const offsetWidth = halfWidth + offset;
      const offsetHeight = halfHeight + offset;
      
      // Genera i quattro vertici del rettangolo
      contourPoints.push({ x: dimensions.x - offsetWidth, y: dimensions.y - offsetHeight, z: dimensions.z });
      contourPoints.push({ x: dimensions.x + offsetWidth, y: dimensions.y - offsetHeight, z: dimensions.z });
      contourPoints.push({ x: dimensions.x + offsetWidth, y: dimensions.y + offsetHeight, z: dimensions.z });
      contourPoints.push({ x: dimensions.x - offsetWidth, y: dimensions.y + offsetHeight, z: dimensions.z });
      // Chiudi il loop
      contourPoints.push({ x: dimensions.x - offsetWidth, y: dimensions.y - offsetHeight, z: dimensions.z });
      break;
    
    case 'circle':
      // Per cerchi, genera un percorso circolare approssimato con punti
      const radius = (dimensions.radius || 0) + offset;
      const numPoints = 36; // Numero di punti per approssimare il cerchio
      
      for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * 2 * Math.PI;
        contourPoints.push({
          x: dimensions.x + radius * Math.cos(angle),
          y: dimensions.y + radius * Math.sin(angle),
          z: dimensions.z
        });
      }
      break;
    
    case 'component':
    case 'group':
      // Per componenti compositi, bisognerebbe analizzare la geometria completa
      // Qui fornisco un semplice rettangolo di contorno
      const width = (dimensions.width || 0) / 2 + offset;
      const height = (dimensions.height || 0) / 2 + offset;
      
      contourPoints.push({ x: dimensions.x - width, y: dimensions.y - height, z: dimensions.z });
      contourPoints.push({ x: dimensions.x + width, y: dimensions.y - height, z: dimensions.z });
      contourPoints.push({ x: dimensions.x + width, y: dimensions.y + height, z: dimensions.z });
      contourPoints.push({ x: dimensions.x - width, y: dimensions.y + height, z: dimensions.z });
      contourPoints.push({ x: dimensions.x - width, y: dimensions.y - height, z: dimensions.z });
      break;
    
    // Altre forme potrebbero essere implementate secondo necessità
  }

  return contourPoints;
}

/**
 * Calcola i punti di ingresso per foratura basati sul tipo di elemento
 * @param element Elemento da analizzare
 * @returns Array di punti di ingresso per foratura
 */
export function getDrillingPoints(element: Element): {x: number, y: number, z: number}[] {
  const drillingPoints: {x: number, y: number, z: number}[] = [];
  const dimensions = getElementDimensions(element);

  switch (element.type) {
    case 'circle':
      // Per un cerchio, usa il centro come punto di foratura
      drillingPoints.push({ x: dimensions.x, y: dimensions.y, z: dimensions.z });
      break;
    
    case 'rectangle':
    case 'cube':
      // Per rettangoli o cubi, usa il centro come punto principale
      drillingPoints.push({ x: dimensions.x, y: dimensions.y, z: dimensions.z });
      
      // Opzionalmente, aggiungi punti agli angoli o altri punti caratteristici
      // come punti di foratura secondari se richiesto
      break;
    
    case 'component':
    case 'group':
      // Per componenti, analizza gli elementi figli alla ricerca di cerchi
      // che potrebbero rappresentare fori
      if (element.elements && Array.isArray(element.elements)) {
        element.elements.forEach((childElement: Element) => {
          if (childElement.type === 'circle' || childElement.type === 'sphere') {
            // Calcola la posizione assoluta
            drillingPoints.push({
              x: (childElement.x || 0) + dimensions.x,
              y: (childElement.y || 0) + dimensions.y,
              z: (childElement.z || 0) + dimensions.z
            });
          }
        });
      }
      
      // Se non sono stati trovati cerchi, usa il centro del componente
      if (drillingPoints.length === 0) {
        drillingPoints.push({ x: dimensions.x, y: dimensions.y, z: dimensions.z });
      }
      break;
  }

  return drillingPoints;
}

/**
 * Calcola il bounding box di un elemento o di una selezione
 */
export function calculateBoundingBox(element: Element | Element[]): {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
  dimensions: { width: number; height: number; depth: number };
} {
  // Inizializza con valori estremi
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  
  const processElement = (el: Element) => {
    const dims = getElementDimensions(el);
    
    switch (el.type) {
      case 'rectangle':
      case 'cube':
        const halfWidth = (dims.width || 0) / 2;
        const halfHeight = (dims.height || 0) / 2;
        const halfDepth = (dims.depth || 0) / 2;
        
        minX = Math.min(minX, dims.x - halfWidth);
        maxX = Math.max(maxX, dims.x + halfWidth);
        minY = Math.min(minY, dims.y - halfHeight);
        maxY = Math.max(maxY, dims.y + halfHeight);
        minZ = Math.min(minZ, dims.z - halfDepth);
        maxZ = Math.max(maxZ, dims.z + halfDepth);
        break;
      
      case 'circle':
      case 'sphere':
        const radius = dims.radius || 0;
        
        minX = Math.min(minX, dims.x - radius);
        maxX = Math.max(maxX, dims.x + radius);
        minY = Math.min(minY, dims.y - radius);
        maxY = Math.max(maxY, dims.y + radius);
        
        if (el.type === 'sphere') {
          minZ = Math.min(minZ, dims.z - radius);
          maxZ = Math.max(maxZ, dims.z + radius);
        } else {
          minZ = Math.min(minZ, dims.z);
          maxZ = Math.max(maxZ, dims.z);
        }
        break;
      
      case 'line':
        minX = Math.min(minX, dims.x1 || 0, dims.x2 || 0);
        maxX = Math.max(maxX, dims.x1 || 0, dims.x2 || 0);
        minY = Math.min(minY, dims.y1 || 0, dims.y2 || 0);
        maxY = Math.max(maxY, dims.y1 || 0, dims.y2 || 0);
        minZ = Math.min(minZ, dims.z1 || 0, dims.z2 || 0);
        maxZ = Math.max(maxZ, dims.z1 || 0, dims.z2 || 0);
        break;
      
      case 'component':
      case 'group':
        // Per componenti, calcola il bounding box basato sui figli
        if (el.elements && Array.isArray(el.elements)) {
          el.elements.forEach((child: Element) => processElement(child));
        } else {
          // Fallback alle dimensioni del componente stesso
          const halfWidth = (dims.width || 0) / 2;
          const halfHeight = (dims.height || 0) / 2;
          const halfDepth = (dims.depth || 0) / 2;
          
          minX = Math.min(minX, dims.x - halfWidth);
          maxX = Math.max(maxX, dims.x + halfWidth);
          minY = Math.min(minY, dims.y - halfHeight);
          maxY = Math.max(maxY, dims.y + halfHeight);
          minZ = Math.min(minZ, dims.z - halfDepth);
          maxZ = Math.max(maxZ, dims.z + halfDepth);
        }
        break;
    }
  };
  
  // Processa elemento singolo o array di elementi
  if (Array.isArray(element)) {
    element.forEach(processElement);
  } else {
    processElement(element);
  }
  
  // Calcola dimensioni e centro
  const width = maxX - minX;
  const height = maxY - minY;
  const depth = maxZ - minZ;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    center: { x: centerX, y: centerY, z: centerZ },
    dimensions: { width, height, depth }
  };
}