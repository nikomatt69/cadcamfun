import {
  Component3D,
  calculateComponentDimensions,
  calculateZLevels,
  calculateZLevelIntersection,
  generateOptimizedToolpath,
  convertToolpathToGcode,
  calculate3DComponentDetails,
  ElementDimensions
} from './unifiedGeometryCalculator';

/**
 * Integra le funzionalità di unifiedGeometryCalculator.ts nel processo di generazione
 * di toolpath per componenti CAD/CAM.
 * 
 * Questa libreria risolve la discrepanza tra la visualizzazione 3D degli oggetti 
 * e il G-code generato, garantendo che le dimensioni siano calcolate correttamente
 * specialmente per forme composte e componenti con operazioni booleane.
 */

/**
 * Converte un elemento generico nel formato Component3D richiesto da unifiedGeometryCalculator
 * @param element Elemento da convertire
 * @param parentPosition Posizione del componente padre (opzionale)
 * @returns Elemento convertito in formato Component3D
 */
export function convertToComponent3D(element: any, parentPosition = { x: 0, y: 0, z: 0 }): Component3D {
  const component: Component3D = {
    id: element.id || crypto.randomUUID(),
    type: element.type || 'unknown',
    x: (element.x || 0) + parentPosition.x,
    y: (element.y || 0) + parentPosition.y,
    z: (element.z || 0) + parentPosition.z,
  };

  // Copia le proprietà comuni
  if (element.width !== undefined) component.width = element.width;
  if (element.height !== undefined) component.height = element.height;
  if (element.depth !== undefined) component.depth = element.depth;
  if (element.radius !== undefined) component.radius = element.radius;
  if (element.radiusX !== undefined) component.radiusX = element.radiusX;
  if (element.radiusY !== undefined) component.radiusY = element.radiusY;
  if (element.radiusZ !== undefined) component.radiusZ = element.radiusZ;
  if (element.direction !== undefined) component.direction = element.direction;
  if (element.orientation !== undefined) component.orientation = element.orientation;
  if (element.operation !== undefined) component.operation = element.operation;
  if (element.sides !== undefined) component.sides = element.sides;

  // Gestione di geometrie generiche
  if (element.vertices !== undefined) component.vertices = element.vertices;
  if (element.faces !== undefined) component.faces = element.faces;
  if (element.edges !== undefined) component.edges = element.edges;
  if (element.boundingDimensions !== undefined) component.boundingDimensions = element.boundingDimensions;

  // Gestione di elementi figli
  if (element.elements && Array.isArray(element.elements) && element.elements.length > 0) {
    component.elements = element.elements.map((child: any) => convertToComponent3D(child, {
      x: component.x,
      y: component.y, 
      z: component.z
    }));
  }

  return component;
}

/**
 * Estrae tutti gli elementi da un componente principale
 * @param component Il componente da processare
 * @returns Array di Component3D con posizione relativa al componente
 */
export function extractComponentElements(component: any): Component3D[] {
  if (!component) {
    return [];
  }
  
  // Se è un componente principale, estrai i suoi elementi
  if ((component.type === 'component' || component.type === 'group') && 
      component.elements && Array.isArray(component.elements)) {
    // Converti ogni elemento al formato Component3D
    return component.elements.map((element: any) => 
      convertToComponent3D(element, { 
        x: component.x || 0, 
        y: component.y || 0, 
        z: component.z || 0 
      })
    );
  }
  
  // Se è un elemento singolo, convertilo direttamente
  return [convertToComponent3D(component)];
}

/**
 * Genera un riepilogo delle dimensioni di un componente
 * @param component Componente da analizzare
 * @returns Stringa con le informazioni sul componente
 */
export function generateComponentSummary(component: any): string {
  try {
    // Converti al formato Component3D
    const component3D = convertToComponent3D(component);
    
    // Ottieni i dettagli 3D completi
    const details = calculate3DComponentDetails(component3D);
    
    // Genera il riepilogo come testo
    let summary = `Componente: ${component.name || component.id || 'Senza nome'}\n`;
    summary += `Posizione: (${component.x || 0}, ${component.y || 0}, ${component.z || 0})\n`;
    summary += `Dimensioni: ${details.dimensions.width.toFixed(2)} x ${details.dimensions.depth.toFixed(2)} x ${details.dimensions.height.toFixed(2)} mm\n`;
    summary += `Centro: (${details.dimensions.center.x.toFixed(2)}, ${details.dimensions.center.y.toFixed(2)}, ${details.dimensions.center.z.toFixed(2)})\n`;
    summary += `Volume: ${details.volume.toFixed(2)} cm³\n`;
    summary += `Area superficiale: ${details.surfaceArea.toFixed(2)} cm²\n`;
    
    // Aggiunge elementi contenuti nel componente
    if (component.elements && Array.isArray(component.elements)) {
      summary += `Elementi: ${component.elements.length}\n`;
      
      component.elements.forEach((element: any, index: number) => {
        summary += `  ${index+1}. ${element.type}`;
        if (element.name || element.id) {
          summary += ` (${element.name || element.id})`;
        }
        summary += `\n`;
      });
    }
    
    return summary;
  } catch (error) {
    return `Errore nell'analisi del componente: ${error}`;
  }
}

/**
 * Genera G-code unificato per un componente CAD
 * @param component Componente da processare
 * @param settings Impostazioni di generazione toolpath
 * @returns Stringa G-code
 */
export function generateUnifiedComponentGcode(component: any, settings: any): string {
  // Converti il componente in formato Component3D
  const convertedComponent = convertToComponent3D(component);
  
  // Estrai gli elementi dal componente
  let elements: Component3D[] = [];
  
  if (convertedComponent.type === 'component' && convertedComponent.elements && Array.isArray(convertedComponent.elements)) {
    elements = convertedComponent.elements;
  } else {
    elements = [convertedComponent];
  }
  
  // Genera il G-code
  try {
    // Importa le funzioni necessarie
    const { generateComponentUnifiedGcode } = require('./unifiedGeometryCalculator');
    return generateComponentUnifiedGcode(convertedComponent, settings);
  } catch (error) {
    console.error('Errore nella generazione G-code unificato:', error);
    // Fallback a metodo base in caso di errore
    return generateBasicGcode(elements, settings);
  }
}

/**
 * Genera G-code di base per gli elementi (fallback)
 * @param elements Array di elementi
 * @param settings Impostazioni di generazione toolpath
 * @returns Stringa G-code
 */
function generateBasicGcode(elements: Component3D[], settings: any): string {
  // Impostazioni di default
  const mergedSettings = {
    feedrate: 1000,
    plungerate: 500,
    stepdown: 1.0,
    safeHeight: 5,
    toolDiameter: 6,
    spindleSpeed: 12000,
    ...settings
  };

  // Intestazione del G-code
  let gcode = `; CAD/CAM SYSTEM - G-code base (fallback)\n`;
  gcode += `G90 ; Absolute positioning\n`;
  gcode += `G21 ; Metric units\n`;
  gcode += `M3 S${mergedSettings.spindleSpeed} ; Start spindle\n`;
  gcode += `M8 ; Coolant on\n`;
  gcode += `G0 Z${mergedSettings.safeHeight} ; Move to safe height\n\n`;

  // Calcola i livelli Z che intersecano gli elementi
  const zLevels = calculateZLevels(elements, mergedSettings);

  // Per ogni livello Z
  for (const zLevel of zLevels) {
    gcode += `; Z Level: ${zLevel.toFixed(3)}\n`;
    
    // Calcola le intersezioni a questo livello Z
    const intersection = calculateZLevelIntersection(elements, zLevel, mergedSettings);
    
    // Se ci sono elementi che intersecano questo livello Z
    if (intersection.elements.length > 0) {
      // Genera il toolpath e convertilo in G-code
      const toolpath = generateOptimizedToolpath(intersection.elements, zLevel, mergedSettings);
      gcode += convertToolpathToGcode(toolpath, mergedSettings);
      gcode += '\n';
    } else {
      gcode += `; No elements intersect at this Z level\n\n`;
    }
  }

  // Chiusura
  gcode += `G0 Z${mergedSettings.safeHeight} ; Move to safe height\n`;
  gcode += `M9 ; Coolant off\n`;
  gcode += `M5 ; Stop spindle\n`;


  return gcode;
}

/**
 * Importa una mesh 3D da un formato CAD esterno
 * @param fileData Dati del file da importare
 * @param fileType Tipo di file (stl, obj, etc)
 * @param scale Fattore di scala da applicare
 * @returns Elemento in formato Component3D
 */
export function importMeshGeometry(fileData: string, fileType: string, scale: number = 1.0): Component3D {
  let vertices: {x: number, y: number, z: number}[] = [];
  let faces: number[][] = [];
  
  // Implementazione base per STL in formato ASCII
  if (fileType.toLowerCase() === 'stl') {
    // Estrai vertici e facce dallo STL ASCII
    const vertexMap = new Map<string, number>(); // Mappa per deduplicare i vertici
    let vertexIndex = 0;
    
    // Estrai triangoli dallo STL
    const facetRegex = /facet\s+normal\s+([\-\d\.e]+)\s+([\-\d\.e]+)\s+([\-\d\.e]+)\s+outer\s+loop\s+vertex\s+([\-\d\.e]+)\s+([\-\d\.e]+)\s+([\-\d\.e]+)\s+vertex\s+([\-\d\.e]+)\s+([\-\d\.e]+)\s+([\-\d\.e]+)\s+vertex\s+([\-\d\.e]+)\s+([\-\d\.e]+)\s+([\-\d\.e]+)\s+endloop\s+endfacet/g;
    
    let match;
    while ((match = facetRegex.exec(fileData)) !== null) {
      const triangle = [];
      
      // Estrai i 3 vertici del triangolo
      for (let i = 0; i < 3; i++) {
        const x = parseFloat(match[4 + i * 3]) * scale;
        const y = parseFloat(match[5 + i * 3]) * scale;
        const z = parseFloat(match[6 + i * 3]) * scale;
        
        // Chiave per deduplicare i vertici
        const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
        
        // Se il vertice non esiste, aggiungilo
        if (!vertexMap.has(key)) {
          vertexMap.set(key, vertexIndex);
          vertices.push({ x, y, z });
          vertexIndex++;
        }
        
        // Aggiungi l'indice del vertice alla faccia
        triangle.push(vertexMap.get(key)!);
      }
      
      faces.push(triangle);
    }
  }
  // Implementazione base per OBJ
  else if (fileType.toLowerCase() === 'obj') {
    const lines = fileData.split('\n');
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      
      if (parts[0] === 'v') {
        // Vertice: v x y z
        const x = parseFloat(parts[1]) * scale;
        const y = parseFloat(parts[2]) * scale;
        const z = parseFloat(parts[3]) * scale;
        vertices.push({ x, y, z });
      }
      else if (parts[0] === 'f') {
        // Faccia: f v1 v2 v3 ... (indici 1-based in OBJ)
        const face: number[] = [];
        
        // Gli indici in OBJ possono essere nella forma v/vt/vn, v//vn o v
        for (let i = 1; i < parts.length; i++) {
          // Prendi solo l'indice del vertice, scartando normale e texture
          const vertexIndex = parseInt(parts[i].split('/')[0]) - 1; // -1 perché OBJ è 1-based
          face.push(vertexIndex);
        }
        
        faces.push(face);
      }
    }
  }
  
  // Calcola il bounding box per centrare la mesh
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  
  for (const vertex of vertices) {
    minX = Math.min(minX, vertex.x);
    minY = Math.min(minY, vertex.y);
    minZ = Math.min(minZ, vertex.z);
    maxX = Math.max(maxX, vertex.x);
    maxY = Math.max(maxY, vertex.y);
    maxZ = Math.max(maxZ, vertex.z);
  }
  
  // Centra la mesh all'origine
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  
  for (const vertex of vertices) {
    vertex.x -= centerX;
    vertex.y -= centerY;
    vertex.z -= centerZ;
  }
  
  // Crea l'elemento Component3D con la mesh
  return {
    id: crypto.randomUUID(),
    type: 'mesh',
    x: 0, // La mesh è già centrata
    y: 0,
    z: 0,
    vertices,
    faces,
    width: maxX - minX,
    height: maxZ - minZ,
    depth: maxY - minY
  };
}

/**
 * Valida la geometria di un elemento e verifica la coerenza tra visualizzazione 3D e toolpath
 * @param component Componente da validare
 * @returns Oggetto con i dettagli della validazione
 */
export function validateGeometryToolpath(component: any): {
  isValid: boolean;
  dimensions: ElementDimensions;
  validationErrors: string[];
  warnings: string[];
} {
  const validationErrors: string[] = [];
  const warnings: string[] = [];
  
  // Converti il componente in formato Component3D
  const convertedComponent = convertToComponent3D(component);
  
  // Calcola le dimensioni reali
  let dimensions: ElementDimensions;
  try {
    dimensions = calculateComponentDimensions(convertedComponent);
  } catch (error) {
    validationErrors.push(`Errore nel calcolo delle dimensioni: ${error}`);
    return {
      isValid: false,
      dimensions: {
        minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0,
        width: 0, height: 0, depth: 0, center: { x: 0, y: 0, z: 0 }
      },
      validationErrors,
      warnings
    };
  }
  
  // Verifica la presenza di elementi con dimensioni invalide
  const checkElementDimensions = (element: Component3D): void => {
    if (element.type === 'component' && element.elements) {
      element.elements.forEach(checkElementDimensions);
      return;
    }
    
    // Verifica dimensioni nulle o negative
    switch (element.type) {
      case 'cube':
      case 'rectangle':
        if (!element.width || element.width <= 0) warnings.push(`Elemento ${element.id}: larghezza non valida (${element.width})`);
        if (!element.height || element.height <= 0) warnings.push(`Elemento ${element.id}: altezza non valida (${element.height})`);
        break;
      case 'sphere':
      case 'hemisphere':
      case 'cylinder':
      case 'cone':
      case 'capsule':
        if (!element.radius || element.radius <= 0) warnings.push(`Elemento ${element.id}: raggio non valido (${element.radius})`);
        break;
      case 'mesh':
      case 'custom':
        if (!element.vertices || element.vertices.length < 3) warnings.push(`Elemento ${element.id}: geometria mesh con meno di 3 vertici`);
        if (!element.faces || element.faces.length < 1) warnings.push(`Elemento ${element.id}: geometria mesh senza facce`);
        break;
    }
  };
  
  // Verifica ricorsivamente tutti gli elementi
  checkElementDimensions(convertedComponent);
  
  return {
    isValid: validationErrors.length === 0,
    dimensions,
    validationErrors,
    warnings
  };
}
