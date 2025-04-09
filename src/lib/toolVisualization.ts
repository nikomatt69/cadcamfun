import * as THREE from 'three';

/**
 * Crea un modello 3D dettagliato di un utensile basato sulle sue proprietà
 * @param tool Dati dell'utensile
 * @returns Oggetto THREE.js che rappresenta l'utensile
 */
export function createToolModel(tool: any): THREE.Object3D {
  // Crea un gruppo per contenere tutte le parti dell'utensile
  const toolGroup = new THREE.Group();
  toolGroup.name = `Tool-${tool.name || 'unknown'}`;
  
  // Estrai le proprietà principali dell'utensile
  const {
    type = 'endmill',
    diameter = 6,
    numberOfFlutes = 2,
    cuttingLength = diameter * 3,
    shankDiameter = diameter * 1.2,
    totalLength = diameter * 8,
    material = 'carbide',
    angle = 0
  } = tool;
  
  // Colore in base al materiale dell'utensile
  let toolColor: number;
  switch (material.toLowerCase()) {
    case 'hss':
      toolColor = 0xCCCCCC; // Grigio brillante per HSS
      break;
    case 'carbide':
      toolColor = 0x444444; // Grigio scuro per carburo
      break;
    case 'diamond':
      toolColor = 0xB9F2FF; // Azzurro leggero per diamante
      break;
    case 'ceramic':
      toolColor = 0xE8D8C9; // Beige per ceramica
      break;
    default:
      toolColor = 0x999999; // Grigio standard
  }
  
  // Crea differenti geometrie in base al tipo di utensile
  switch (type.toLowerCase()) {
    case 'endmill': {
      // Gambo (parte superiore)
      const shankHeight = totalLength - cuttingLength;
      const shankGeometry = new THREE.CylinderGeometry(
        shankDiameter/2, 
        shankDiameter/2, 
        shankHeight, 
        32
      );
      const shankMaterial = new THREE.MeshStandardMaterial({
        color: 0x777777,
        metalness: 0.8,
        roughness: 0.2
      });
      const shank = new THREE.Mesh(shankGeometry, shankMaterial);
      shank.position.set(0, 0, shankHeight/2);
      
      // Parte di taglio (parte inferiore)
      const cuttingGeometry = new THREE.CylinderGeometry(
        diameter/2, 
        diameter/2, 
        cuttingLength, 
        32
      );
      const cuttingMaterial = new THREE.MeshStandardMaterial({
        color: toolColor,
        metalness: 0.9,
        roughness: 0.1
      });
      const cutting = new THREE.Mesh(cuttingGeometry, cuttingMaterial);
      cutting.position.set(0, 0, -cuttingLength/2);
      
      // Aggiungi le scanalature (flutes)
      if (numberOfFlutes > 0) {
        for (let i = 0; i < numberOfFlutes; i++) {
          const angle = (i / numberOfFlutes) * Math.PI * 2;
          const fluteWidth = diameter * 0.1;
          const fluteDepth = diameter * 0.2;
          
          const fluteGeometry = new THREE.BoxGeometry(
            fluteWidth,
            cuttingLength * 0.9,
            fluteDepth
          );
          const fluteMaterial = new THREE.MeshStandardMaterial({
            color: 0x222222,
            metalness: 0.5,
            roughness: 0.8
          });
          
          const flute = new THREE.Mesh(fluteGeometry, fluteMaterial);
          
          // Posiziona la scanalatura correttamente
          flute.position.set(
            Math.cos(angle) * (diameter/2 - fluteDepth/2),
            Math.sin(angle) * (diameter/2 - fluteDepth/2),
            -cuttingLength * 0.45
          );
          
          // Ruota la scanalatura per orientarla correttamente
          flute.rotation.z = angle;
          
          cutting.add(flute);
        }
      }
      
      toolGroup.add(shank);
      toolGroup.add(cutting);
      break;
    }
    
    case 'ballnose':
    case 'ballendmill': {
      // Gambo
      const shankHeight = totalLength - cuttingLength;
      const shankGeometry = new THREE.CylinderGeometry(
        shankDiameter/2, 
        shankDiameter/2, 
        shankHeight, 
        32
      );
      const shankMaterial = new THREE.MeshStandardMaterial({
        color: 0x777777,
        metalness: 0.8,
        roughness: 0.2
      });
      const shank = new THREE.Mesh(shankGeometry, shankMaterial);
      shank.position.set(0, 0, shankHeight/2);
      
      // Parte cilindrica della porzione di taglio
      const cuttingStemHeight = cuttingLength - diameter/2;
      const cuttingStemGeometry = new THREE.CylinderGeometry(
        diameter/2, 
        diameter/2, 
        cuttingStemHeight, 
        32
      );
      const cuttingMaterial = new THREE.MeshStandardMaterial({
        color: toolColor,
        metalness: 0.9,
        roughness: 0.1
      });
      const cuttingStem = new THREE.Mesh(cuttingStemGeometry, cuttingMaterial);
      cuttingStem.position.set(0, 0, -cuttingStemHeight/2 - diameter/2);
      
      // Punta semisferica
      const ballGeometry = new THREE.SphereGeometry(
        diameter/2, 
        32, 
        32,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2
      );
      const ballTip = new THREE.Mesh(ballGeometry, cuttingMaterial);
      ballTip.position.set(0, 0, -cuttingLength);
      ballTip.rotation.x = Math.PI;
      
      // Aggiungi le scanalature
      if (numberOfFlutes > 0) {
        for (let i = 0; i < numberOfFlutes; i++) {
          const angle = (i / numberOfFlutes) * Math.PI * 2;
          const fluteWidth = diameter * 0.1;
          const fluteDepth = diameter * 0.2;
          
          // Scanalatura sulla parte cilindrica
          const fluteGeometry = new THREE.BoxGeometry(
            fluteWidth,
            cuttingStemHeight,
            fluteDepth
          );
          const fluteMaterial = new THREE.MeshStandardMaterial({
            color: 0x222222,
            metalness: 0.5,
            roughness: 0.8
          });
          
          const flute = new THREE.Mesh(fluteGeometry, fluteMaterial);
          flute.position.set(
            Math.cos(angle) * (diameter/2 - fluteDepth/2),
            Math.sin(angle) * (diameter/2 - fluteDepth/2),
            -cuttingStemHeight/2 - diameter/2
          );
          flute.rotation.z = angle;
          
          cuttingStem.add(flute);
          
          // Scanalatura sulla parte sferica (semplificata)
          const sphereCutGeometry = new THREE.SphereGeometry(
            diameter/2 * 0.9, 
            16, 
            16,
            angle - 0.2,
            0.4,
            0,
            Math.PI / 2
          );
          const sphereCut = new THREE.Mesh(sphereCutGeometry, fluteMaterial);
          sphereCut.position.set(0, 0, 0);
          ballTip.add(sphereCut);
        }
      }
      
      toolGroup.add(shank);
      toolGroup.add(cuttingStem);
      toolGroup.add(ballTip);
      break;
    }
    
    case 'chamfer':
    case 'vbit': {
      // Gambo
      const shankHeight = totalLength - cuttingLength;
      const shankGeometry = new THREE.CylinderGeometry(
        shankDiameter/2, 
        shankDiameter/2, 
        shankHeight, 
        32
      );
      const shankMaterial = new THREE.MeshStandardMaterial({
        color: 0x777777,
        metalness: 0.8,
        roughness: 0.2
      });
      const shank = new THREE.Mesh(shankGeometry, shankMaterial);
      shank.position.set(0, 0, shankHeight/2);
      
      // Parte conica
      const tipHeight = cuttingLength;
      const vAngle = angle || 90; // Angolo della punta V in gradi (default 90)
      const tipRadius = Math.tan(vAngle * Math.PI / 360) * tipHeight;
      
      const coneGeometry = new THREE.ConeGeometry(
        diameter/2,
        tipHeight,
        32
      );
      const coneMaterial = new THREE.MeshStandardMaterial({
        color: toolColor,
        metalness: 0.9,
        roughness: 0.1
      });
      const cone = new THREE.Mesh(coneGeometry, coneMaterial);
      cone.position.set(0, 0, -tipHeight/2);
      cone.rotation.x = Math.PI;
      
      // Aggiungi le scanalature
      if (numberOfFlutes > 0) {
        for (let i = 0; i < numberOfFlutes; i++) {
          const angle = (i / numberOfFlutes) * Math.PI * 2;
          const fluteWidth = diameter * 0.1;
          const fluteDepth = diameter * 0.2;
          
          // Scanalatura conica
          const fluteGeometry = new THREE.BoxGeometry(
            fluteWidth,
            tipHeight,
            fluteDepth
          );
          const fluteMaterial = new THREE.MeshStandardMaterial({
            color: 0x222222,
            metalness: 0.5,
            roughness: 0.8
          });
          
          const flute = new THREE.Mesh(fluteGeometry, fluteMaterial);
          flute.position.set(
            Math.cos(angle) * (diameter/4),
            Math.sin(angle) * (diameter/4),
            -tipHeight/2
          );
          flute.rotation.z = angle;
          
          // Scala la scanalatura per adattarla alla forma conica
          flute.scale.set(1, 1, 0.5);
          
          cone.add(flute);
        }
      }
      
      toolGroup.add(shank);
      toolGroup.add(cone);
      break;
    }
    
    case 'drill': {
      // Gambo
      const shankHeight = totalLength - cuttingLength;
      const shankGeometry = new THREE.CylinderGeometry(
        shankDiameter/2, 
        shankDiameter/2, 
        shankHeight, 
        32
      );
      const shankMaterial = new THREE.MeshStandardMaterial({
        color: 0x777777,
        metalness: 0.8,
        roughness: 0.2
      });
      const shank = new THREE.Mesh(shankGeometry, shankMaterial);
      shank.position.set(0, 0, shankHeight/2);
      
      // Parte principale della punta
      const drillGeometry = new THREE.CylinderGeometry(
        diameter/2, 
        diameter/2, 
        cuttingLength - diameter, 
        32
      );
      const drillMaterial = new THREE.MeshStandardMaterial({
        color: toolColor,
        metalness: 0.9,
        roughness: 0.1
      });
      const drill = new THREE.Mesh(drillGeometry, drillMaterial);
      drill.position.set(0, 0, -cuttingLength/2 + diameter/2);
      
      // Punta conica
      const tipAngle = angle || 118; // Angolo standard della punta (118 gradi)
      const tipHeight = diameter;
      
      const tipGeometry = new THREE.ConeGeometry(
        diameter/2,
        tipHeight,
        32
      );
      const tip = new THREE.Mesh(tipGeometry, drillMaterial);
      tip.position.set(0, 0, -cuttingLength + diameter/2);
      tip.rotation.x = Math.PI;
      
      // Aggiungi le scanalature elicoidali
      if (numberOfFlutes > 0) {
        for (let i = 0; i < numberOfFlutes; i++) {
          const startAngle = (i / numberOfFlutes) * Math.PI * 2;
          
          // Crea una geometria personalizzata per la scanalatura elicoidale
          const helixPoints = [];
          const helixSegments = 20;
          const helixRadius = diameter * 0.4;
          const helixHeight = cuttingLength;
          const helixTurns = 3; // Numero di giri dell'elica
          
          for (let j = 0; j <= helixSegments; j++) {
            const t = j / helixSegments;
            const angle = startAngle + t * Math.PI * 2 * helixTurns;
            const z = -t * helixHeight;
            
            helixPoints.push(
              new THREE.Vector3(
                Math.cos(angle) * helixRadius,
                Math.sin(angle) * helixRadius,
                z
              )
            );
          }
          
          const helixGeometry = new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(helixPoints),
            helixSegments,
            diameter * 0.08,
            8,
            false
          );
          
          const helixMaterial = new THREE.MeshStandardMaterial({
            color: 0x222222,
            metalness: 0.5,
            roughness: 0.8
          });
          
          const helix = new THREE.Mesh(helixGeometry, helixMaterial);
          toolGroup.add(helix);
        }
      }
      
      toolGroup.add(shank);
      toolGroup.add(drill);
      toolGroup.add(tip);
      break;
    }
    
    case 'reamer': {
      // Gambo
      const shankHeight = totalLength - cuttingLength;
      const shankGeometry = new THREE.CylinderGeometry(
        shankDiameter/2, 
        shankDiameter/2, 
        shankHeight, 
        32
      );
      const shankMaterial = new THREE.MeshStandardMaterial({
        color: 0x777777,
        metalness: 0.8,
        roughness: 0.2
      });
      const shank = new THREE.Mesh(shankGeometry, shankMaterial);
      shank.position.set(0, 0, shankHeight/2);
      
      // Parte di taglio
      const reaperGeometry = new THREE.CylinderGeometry(
        diameter/2, 
        diameter/2 * 0.95, 
        cuttingLength, 
        32
      );
      const reaperMaterial = new THREE.MeshStandardMaterial({
        color: toolColor,
        metalness: 0.9,
        roughness: 0.1
      });
      const reaper = new THREE.Mesh(reaperGeometry, reaperMaterial);
      reaper.position.set(0, 0, -cuttingLength/2);
      
      // Aggiungi le scanalature diritte
      if (numberOfFlutes > 0) {
        for (let i = 0; i < numberOfFlutes; i++) {
          const angle = (i / numberOfFlutes) * Math.PI * 2;
          const fluteWidth = diameter * 0.08;
          const fluteDepth = diameter * 0.15;
          
          const fluteGeometry = new THREE.BoxGeometry(
            fluteWidth,
            cuttingLength * 0.8,
            fluteDepth
          );
          const fluteMaterial = new THREE.MeshStandardMaterial({
            color: 0x222222,
            metalness: 0.5,
            roughness: 0.8
          });
          
          const flute = new THREE.Mesh(fluteGeometry, fluteMaterial);
          flute.position.set(
            Math.cos(angle) * (diameter/2 - fluteDepth/2),
            Math.sin(angle) * (diameter/2 - fluteDepth/2),
            -cuttingLength * 0.4
          );
          flute.rotation.z = angle;
          
          reaper.add(flute);
        }
      }
      
      toolGroup.add(shank);
      toolGroup.add(reaper);
      break;
    }
    
    case 'facemill': {
      // Gambo
      const shankHeight = totalLength - cuttingLength;
      const shankGeometry = new THREE.CylinderGeometry(
        shankDiameter/2, 
        shankDiameter/2, 
        shankHeight, 
        32
      );
      const shankMaterial = new THREE.MeshStandardMaterial({
        color: 0x777777,
        metalness: 0.8,
        roughness: 0.2
      });
      const shank = new THREE.Mesh(shankGeometry, shankMaterial);
      shank.position.set(0, 0, shankHeight/2);
      
      // Corpo principale
      const bodyGeometry = new THREE.CylinderGeometry(
        diameter/2 * 0.8, 
        diameter/2 * 0.8, 
        cuttingLength * 0.6, 
        32
      );
      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: toolColor,
        metalness: 0.9,
        roughness: 0.1
      });
      const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
      body.position.set(0, 0, -cuttingLength * 0.3);
      
      // Testa della fresa frontale
      const headGeometry = new THREE.CylinderGeometry(
        diameter/2, 
        diameter/2 * 0.8, 
        cuttingLength * 0.4, 
        32
      );
      const headMaterial = new THREE.MeshStandardMaterial({
        color: toolColor,
        metalness: 0.9,
        roughness: 0.1
      });
      const head = new THREE.Mesh(headGeometry, headMaterial);
      head.position.set(0, 0, -cuttingLength * 0.7);
      
      // Aggiungi gli inserti di taglio
      const inserts = numberOfFlutes || 4;
      for (let i = 0; i < inserts; i++) {
        const angle = (i / inserts) * Math.PI * 2;
        
        // Corpo dell'inserto
        const insertGeometry = new THREE.BoxGeometry(
          diameter * 0.15,
          diameter * 0.15,
          diameter * 0.05
        );
        const insertMaterial = new THREE.MeshStandardMaterial({
          color: 0x666666,
          metalness: 0.9,
          roughness: 0.3
        });
        const insert = new THREE.Mesh(insertGeometry, insertMaterial);
        
        // Posiziona l'inserto sul bordo della fresa
        insert.position.set(
          Math.cos(angle) * (diameter/2 * 0.85),
          Math.sin(angle) * (diameter/2 * 0.85),
          -cuttingLength * 0.5
        );
        
        // Ruota l'inserto per orientarlo correttamente
        insert.rotation.z = angle;
        insert.rotation.x = Math.PI / 6;
        
        head.add(insert);
      }
      
      toolGroup.add(shank);
      toolGroup.add(body);
      toolGroup.add(head);
      break;
    }
    
    default: {
      // Strumento generico per tipi sconosciuti
      const genericGeometry = new THREE.CylinderGeometry(
        diameter/2,
        diameter/2,
        totalLength,
        32
      );
      const genericMaterial = new THREE.MeshStandardMaterial({
        color: toolColor,
        metalness: 0.5,
        roughness: 0.5
      });
      const genericTool = new THREE.Mesh(genericGeometry, genericMaterial);
      genericTool.position.set(0, 0, 0);
      
      toolGroup.add(genericTool);
    }
  }
  
  // Applica la rotazione per orientare l'utensile correttamente nell'asse Z
  toolGroup.rotation.x = Math.PI / 2;
  
  return toolGroup;
}

/**
 * Applica materiali realistici all'utensile in base al suo tipo
 * @param tool Oggetto THREE.js dell'utensile
 * @param material Tipo di materiale (hss, carbide, ecc.)
 */
export function applyRealisticMaterial(tool: THREE.Object3D, material: string = 'carbide') {
  tool.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    
    // Applica materiali diversi in base al tipo di parte dell'utensile
    const isShank = child.name.includes('shank') || 
                    child.parent?.name.includes('shank');
    
    const isCutting = child.name.includes('cutting') || 
                     child.parent?.name.includes('cutting') ||
                     child.position.z < 0;
    
    const isFlute = child.name.includes('flute') || 
                   child.parent?.name.includes('flute');
    
    // Crea il materiale appropriato
    let meshMaterial: THREE.MeshStandardMaterial;
    
    if (isShank) {
      // Gambo - grigio standard
      meshMaterial = new THREE.MeshStandardMaterial({
        color: 0x777777,
        metalness: 0.8,
        roughness: 0.2
      });
    } else if (isFlute) {
      // Scanalatura - scuro
      meshMaterial = new THREE.MeshStandardMaterial({
        color: 0x222222,
        metalness: 0.5,
        roughness: 0.8
      });
    } else if (isCutting) {
      // Parte di taglio - dipende dal materiale
      switch (material.toLowerCase()) {
        case 'hss':
          meshMaterial = new THREE.MeshStandardMaterial({
            color: 0xCCCCCC,
            metalness: 0.9,
            roughness: 0.1,
            envMapIntensity: 1.0
          });
          break;
        case 'carbide':
          meshMaterial = new THREE.MeshStandardMaterial({
            color: 0x444444,
            metalness: 0.9,
            roughness: 0.1,
            envMapIntensity: 0.8
          });
          break;
        case 'diamond':
          meshMaterial = new THREE.MeshStandardMaterial({
            color: 0xB9F2FF,
            metalness: 0.9,
            roughness: 0.05,
            envMapIntensity: 1.2
          });
          break;
        default:
          meshMaterial = new THREE.MeshStandardMaterial({
            color: 0x999999,
            metalness: 0.8,
            roughness: 0.2
          });
      }
    } else {
      // Parti generiche - materiale standard
      meshMaterial = new THREE.MeshStandardMaterial({
        color: 0x999999,
        metalness: 0.5,
        roughness: 0.5
      });
    }
    
    // Assegna il materiale
    child.material = meshMaterial;
  });
}

/**
 * Aggiunge un effetto di incandescenza al bordo tagliente dell'utensile (per la simulazione)
 * @param tool Oggetto THREE.js dell'utensile
 * @param intensity Intensità dell'incandescenza (0-1)
 */
export function addCuttingGlow(tool: THREE.Object3D, intensity: number = 0) {
  if (intensity <= 0) return;
  
  // Limita l'intensità
  const glowIntensity = Math.min(1, Math.max(0, intensity));
  
  tool.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    
    // Applica l'incandescenza solo ai bordi taglienti
    const isCuttingEdge = child.position.z < -child.geometry.boundingSphere?.radius * 0.8;
    
    if (isCuttingEdge) {
      const material = child.material as THREE.MeshStandardMaterial;
      
      // Converti il colore esistente in un colore incandescente
      const baseColor = material.color.clone();
      const glowColor = new THREE.Color(1, 0.3, 0.1); // Rosso-arancio per l'incandescenza
      
      // Mescola il colore base con il colore incandescente
      const mixedColor = new THREE.Color().copy(baseColor);
      mixedColor.lerp(glowColor, glowIntensity);
      
      // Applica il colore mescolato e l'emissione
      material.color.copy(mixedColor);
      material.emissive.copy(glowColor);
      material.emissiveIntensity = glowIntensity * 0.5;
    }
  });
}

/**
 * Trova l'utensile nella libreria predefinita e ne crea un modello 3D
 * @param toolName Nome dell'utensile dalla libreria
 * @param predefinedTools Array di utensili predefiniti
 * @returns Oggetto THREE.js che rappresenta l'utensile
 */
export function createToolFromLibrary(
  toolName: string, 
  predefinedTools: any[]
): THREE.Object3D | null {
  // Trova l'utensile nella libreria
  const toolData = predefinedTools.find(tool => tool.name === toolName);
  if (!toolData) return null;
  
  // Crea il modello 3D
  return createToolModel(toolData);
}

/**
 * Crea un'animazione di rotazione per l'utensile
 * @param tool Oggetto THREE.js dell'utensile
 * @param rpm Giri al minuto dell'utensile
 * @returns Funzione per aggiornare l'animazione
 */
export function animateToolRotation(tool: THREE.Object3D, rpm: number = 1000) {
  if (!tool) return () => {};
  
  // Converti RPM in radianti per frame (assumendo 60 fps)
  const radiansPerFrame = (rpm * Math.PI * 2) / (60 * 60);
  
  return () => {
    tool.rotation.y += radiansPerFrame;
  };
}