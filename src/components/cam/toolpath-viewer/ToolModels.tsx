import * as THREE from 'three';

/**
 * Tool type definitions matching predefined tools in the library
 */
export interface ToolDefinition {
  type: string;         // 'endmill', 'ballnose', 'vbit', 'drill', etc.
  diameter: number;     // Tool diameter in mm
  length?: number;      // Tool length in mm
  shankDiameter?: number; // Shank diameter (if different from cutting diameter)
  flutes?: number;      // Number of flutes
  angle?: number;       // For V-bits, chamfer tools (angle in degrees)
  radius?: number;      // For bull nose end mills (corner radius)
  material?: string;    // 'hss', 'carbide', etc.
  coating?: string;     // Tool coating if any
  taper?: number;       // For tapered tools
  tipDiameter?: number; // For tapered tools
  cuttingLength?: number; // Length of cutting portion
  totalLength?: number; // Total length of the tool
  threaded?: boolean;   // For thread mills
  threadPitch?: number; // For thread mills
  color?: number;       // Tool color override
  name?: string;        // Tool name
}

/**
 * Create a detailed 3D model for a cutting tool
 * 
 * @param tool Tool definition object
 * @returns THREE.Group containing the tool 3D model
 */
export function createToolModel(tool: ToolDefinition): THREE.Group {
  const toolGroup = new THREE.Group();
  
  // Default material settings
  const materialColor = tool.color || 
    (tool.material === 'carbide' ? 0x333333 : 0xCCCCCC); // Darker for carbide
    
  const shankMaterial = new THREE.MeshStandardMaterial({
    color: 0x999999,
    metalness: 0.7,
    roughness: 0.3
  });
  
  const cuttingMaterial = new THREE.MeshStandardMaterial({
    color: materialColor,
    metalness: 0.8,
    roughness: 0.2
  });
  
  // Calculate dimensions based on tool properties
  const diameter = tool.diameter;
  const shankDiameter = tool.shankDiameter || Math.max(diameter * 0.75, 3.175); // Default to 3/4 of cutting diameter or 1/8"
  const totalLength = tool.totalLength || diameter * 5; // Default based on diameter
  const cuttingLength = tool.cuttingLength || diameter * 2; // Default based on diameter
  const shankLength = totalLength - cuttingLength;
  
  // Create the appropriate tool model based on type
  switch (tool.type.toLowerCase()) {
    case 'endmill': {
      // Create shank
      const shankGeometry = new THREE.CylinderGeometry(
        shankDiameter / 2, 
        shankDiameter / 2, 
        shankLength, 
        24
      );
      const shank = new THREE.Mesh(shankGeometry, shankMaterial);
      shank.position.y = shankLength / 2;
      
      // Create cutting part
      const cuttingGeometry = new THREE.CylinderGeometry(
        diameter / 2,
        diameter / 2,
        cuttingLength,
        24
      );
      const cutting = new THREE.Mesh(cuttingGeometry, cuttingMaterial);
      cutting.position.y = -cuttingLength / 2;
      
      // Add flutes visualization for better realism
      if (tool.flutes && tool.flutes > 0) {
        for (let i = 0; i < tool.flutes; i++) {
          const fluteAngle = (i / tool.flutes) * Math.PI * 2;
          const fluteWidth = diameter * 0.15;
          const fluteDepth = diameter * 0.4;
          
          const fluteGeometry = new THREE.BoxGeometry(
            fluteWidth,
            cuttingLength,
            fluteDepth
          );
          const fluteMaterial = new THREE.MeshStandardMaterial({
            color: 0x222222,
            metalness: 0.7,
            roughness: 0.3
          });
          const flute = new THREE.Mesh(fluteGeometry, fluteMaterial);
          
          // Position and rotate the flute
          flute.position.set(0, -cuttingLength / 2, 0);
          flute.rotateY(fluteAngle);
          flute.translateZ(diameter / 2 - fluteDepth / 2);
          
          cutting.add(flute);
        }
        
        // Add bottom cutting edge
        const bottomGeometry = new THREE.CircleGeometry(diameter / 2, 24);
        const bottomMaterial = new THREE.MeshStandardMaterial({
          color: materialColor,
          metalness: 0.8,
          roughness: 0.2
        });
        const bottomCutting = new THREE.Mesh(bottomGeometry, bottomMaterial);
        bottomCutting.position.y = -cuttingLength;
        bottomCutting.rotateX(-Math.PI / 2);
        
        toolGroup.add(bottomCutting);
      }
      
      toolGroup.add(shank);
      toolGroup.add(cutting);
      break;
    }
    
    case 'ballnose':
    case 'ball': 
    case 'ballendmill': {
      // Create shank
      const shankGeometry = new THREE.CylinderGeometry(
        shankDiameter / 2, 
        shankDiameter / 2, 
        shankLength, 
        24
      );
      const shank = new THREE.Mesh(shankGeometry, shankMaterial);
      shank.position.y = shankLength / 2;
      
      // Create cylindrical part
      const cylinderLength = cuttingLength - diameter / 2;
      const cylinderGeometry = cylinderLength > 0 
        ? new THREE.CylinderGeometry(
            diameter / 2,
            diameter / 2,
            cylinderLength,
            24
          )
        : null;
        
      if (cylinderGeometry) {
        const cylinder = new THREE.Mesh(cylinderGeometry, cuttingMaterial);
        cylinder.position.y = -cylinderLength / 2;
        toolGroup.add(cylinder);
      }
      
      // Create ball end
      const ballGeometry = new THREE.SphereGeometry(
        diameter / 2,
        24,
        24,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2
      );
      const ball = new THREE.Mesh(ballGeometry, cuttingMaterial);
      ball.position.y = -(cylinderLength > 0 ? cylinderLength : 0) - diameter / 4;
      ball.rotation.x = Math.PI;
      
      // Add flutes if specified
      if (tool.flutes && tool.flutes > 0) {
        const flutesGroup = new THREE.Group();
        
        for (let i = 0; i < tool.flutes; i++) {
          const fluteAngle = (i / tool.flutes) * Math.PI * 2;
          const fluteWidth = diameter * 0.15;
          const fluteDepth = diameter * 0.3;
          
          // Create cylinder part of flute
          if (cylinderLength > 0) {
            const fluteCylGeometry = new THREE.BoxGeometry(
              fluteWidth,
              cylinderLength,
              fluteDepth
            );
            const fluteCyl = new THREE.Mesh(fluteCylGeometry, new THREE.MeshStandardMaterial({
              color: 0x222222,
              metalness: 0.7,
              roughness: 0.3
            }));
            
            fluteCyl.position.set(0, -cylinderLength / 2, 0);
            fluteCyl.rotateY(fluteAngle);
            fluteCyl.translateZ(diameter / 2 - fluteDepth / 2);
            
            flutesGroup.add(fluteCyl);
          }
          
          // Create curved part of flute on ball
          const curvePath = new THREE.CurvePath();
          const radius = diameter / 2;
          const startAngle = 0;
          const endAngle = Math.PI / 2;
          const curve = new THREE.EllipseCurve(
            0, 0,
            radius, radius,
            startAngle, endAngle,
            false, 0
          );
          
          curvePath.add(curve);
          
          const points = curvePath.getPoints(10);
          // Convert to Vector3 array
          const points3D = points.map(p => new THREE.Vector3(
            (p as unknown as {x: number}).x,
            (p as unknown as {y: number}).y, 
            0
          ));
          const curvedGeometry = new THREE.BufferGeometry().setFromPoints(points3D);
          
          const line = new THREE.Line(
            curvedGeometry, 
            new THREE.LineBasicMaterial({ color: 0x222222 })
          );
          
          line.rotateY(fluteAngle);
          line.position.y = -(cylinderLength > 0 ? cylinderLength : 0);
          
          flutesGroup.add(line);
        }
        
        toolGroup.add(flutesGroup);
      }
      
      toolGroup.add(shank);
      toolGroup.add(ball);
      break;
    }
    
    case 'vbit':
    case 'v-bit': {
      // Create shank
      const shankGeometry = new THREE.CylinderGeometry(
        shankDiameter / 2, 
        shankDiameter / 2, 
        shankLength, 
        24
      );
      const shank = new THREE.Mesh(shankGeometry, shankMaterial);
      shank.position.y = shankLength / 2;
      
      // Calculate V-bit properties
      const angle = tool.angle || 90; // Default to 90 degrees if not specified
      const angleInRadians = (angle / 2) * (Math.PI / 180);
      const vbitHeight = (diameter / 2) / Math.tan(angleInRadians);
      
      // Create V-shape
      const vGeometry = new THREE.ConeGeometry(
        diameter / 2,
        vbitHeight,
        24
      );
      const vMaterial = new THREE.MeshStandardMaterial({
        color: materialColor,
        metalness: 0.8,
        roughness: 0.2
      });
      const vTip = new THREE.Mesh(vGeometry, vMaterial);
      vTip.position.y = -vbitHeight / 2;
      vTip.rotation.x = Math.PI;
      
      // Add flutes if specified
      if (tool.flutes && tool.flutes > 0) {
        for (let i = 0; i < tool.flutes; i++) {
          const fluteAngle = (i / tool.flutes) * Math.PI * 2;
          
          const flutePath = new THREE.Shape();
          flutePath.moveTo(0, 0);
          flutePath.lineTo(vbitHeight, diameter / 2 * 0.2);
          flutePath.lineTo(vbitHeight, 0);
          flutePath.lineTo(0, 0);
          
          const extrudeSettings = {
            steps: 1,
            depth: diameter * 0.1,
            bevelEnabled: false
          };
          
          const fluteGeometry = new THREE.ExtrudeGeometry(flutePath, extrudeSettings);
          const fluteMaterial = new THREE.MeshStandardMaterial({
            color: 0x222222,
            metalness: 0.7,
            roughness: 0.3
          });
          
          const flute = new THREE.Mesh(fluteGeometry, fluteMaterial);
          flute.position.set(0, -vbitHeight, 0);
          flute.rotateY(fluteAngle);
          
          vTip.add(flute);
        }
      }
      
      toolGroup.add(shank);
      toolGroup.add(vTip);
      break;
    }
    
    case 'drill':
    case 'drillbit': {
      // Create shank
      const shankGeometry = new THREE.CylinderGeometry(
        shankDiameter / 2, 
        shankDiameter / 2, 
        shankLength, 
        24
      );
      const shank = new THREE.Mesh(shankGeometry, shankMaterial);
      shank.position.y = shankLength / 2;
      
      // Create drill body
      const drillGeometry = new THREE.CylinderGeometry(
        diameter / 2,
        diameter / 2,
        cuttingLength - diameter,
        24
      );
      const drillMaterial = new THREE.MeshStandardMaterial({
        color: materialColor,
        metalness: 0.8,
        roughness: 0.2
      });
      const drillBody = new THREE.Mesh(drillGeometry, drillMaterial);
      drillBody.position.y = -(cuttingLength - diameter) / 2;
      
      // Create drill tip (cone)
      const tipHeight = diameter;
      const tipGeometry = new THREE.ConeGeometry(
        diameter / 2,
        tipHeight,
        24
      );
      const tip = new THREE.Mesh(tipGeometry, drillMaterial);
      tip.position.y = -(cuttingLength - diameter) - tipHeight / 2;
      tip.rotation.x = Math.PI;
      
      // Add flutes
      const fluteCount = tool.flutes || 2;
      for (let i = 0; i < fluteCount; i++) {
        const fluteAngle = (i / fluteCount) * Math.PI * 2;
        
        // Main flute along the body
        const fluteGeometry = new THREE.BoxGeometry(
          diameter * 0.1,
          cuttingLength,
          diameter * 0.7
        );
        const fluteMaterial = new THREE.MeshStandardMaterial({
          color: 0x222222,
          metalness: 0.6,
          roughness: 0.4
        });
        const flute = new THREE.Mesh(fluteGeometry, fluteMaterial);
        flute.position.y = -cuttingLength / 2;
        flute.rotateY(fluteAngle);
        flute.translateZ(diameter * 0.2);
        
        toolGroup.add(flute);
      }
      
      toolGroup.add(shank);
      toolGroup.add(drillBody);
      toolGroup.add(tip);
      break;
    }
    
    case 'chamfer': {
      // Create shank
      const shankGeometry = new THREE.CylinderGeometry(
        shankDiameter / 2, 
        shankDiameter / 2, 
        shankLength, 
        24
      );
      const shank = new THREE.Mesh(shankGeometry, shankMaterial);
      shank.position.y = shankLength / 2;
      
      // Calculate chamfer properties
      const angle = tool.angle || 45; // Default to 45 degrees if not specified
      const angleInRadians = (angle) * (Math.PI / 180);
      const chamferHeight = (diameter / 2) / Math.tan(angleInRadians);
      
      // Create main cylinder
      const cylinderLength = cuttingLength - chamferHeight;
      const cylinderGeometry = new THREE.CylinderGeometry(
        diameter / 2,
        diameter / 2,
        cylinderLength,
        24
      );
      const cylinder = new THREE.Mesh(cylinderGeometry, cuttingMaterial);
      cylinder.position.y = -cylinderLength / 2;
      
      // Create chamfered tip
      const tipGeometry = new THREE.CylinderGeometry(
        0,
        diameter / 2,
        chamferHeight,
        24
      );
      const tip = new THREE.Mesh(tipGeometry, cuttingMaterial);
      tip.position.y = -cylinderLength - chamferHeight / 2;
      
      // Add flutes if specified
      if (tool.flutes && tool.flutes > 0) {
        for (let i = 0; i < tool.flutes; i++) {
          const fluteAngle = (i / tool.flutes) * Math.PI * 2;
          
          // Flute on main cylinder
          const fluteCylGeometry = new THREE.BoxGeometry(
            diameter * 0.15,
            cylinderLength,
            diameter * 0.4
          );
          const fluteCyl = new THREE.Mesh(fluteCylGeometry, new THREE.MeshStandardMaterial({
            color: 0x222222,
            metalness: 0.7,
            roughness: 0.3
          }));
          
          fluteCyl.position.y = -cylinderLength / 2;
          fluteCyl.rotateY(fluteAngle);
          fluteCyl.translateZ(diameter / 2 - diameter * 0.2);
          
          cylinder.add(fluteCyl);
          
          // Flute on chamfer
          const fluteChGeometry = new THREE.BoxGeometry(
            diameter * 0.15,
            chamferHeight,
            diameter * 0.3
          );
          const fluteCh = new THREE.Mesh(fluteChGeometry, new THREE.MeshStandardMaterial({
            color: 0x222222,
            metalness: 0.7,
            roughness: 0.3
          }));
          
          fluteCh.position.y = -chamferHeight / 2 + diameter * 0.05;
          fluteCh.rotateY(fluteAngle);
          fluteCh.translateZ(diameter / 4 - diameter * 0.1);
          
          tip.add(fluteCh);
        }
      }
      
      toolGroup.add(shank);
      toolGroup.add(cylinder);
      toolGroup.add(tip);
      break;
    }
    
    case 'threadmill': {
      // Create shank
      const shankGeometry = new THREE.CylinderGeometry(
        shankDiameter / 2, 
        shankDiameter / 2, 
        shankLength, 
        24
      );
      const shank = new THREE.Mesh(shankGeometry, shankMaterial);
      shank.position.y = shankLength / 2;
      
      // Create cutting part
      const cuttingGeometry = new THREE.CylinderGeometry(
        diameter / 2,
        diameter / 2,
        cuttingLength,
        24
      );
      const cutting = new THREE.Mesh(cuttingGeometry, cuttingMaterial);
      cutting.position.y = -cuttingLength / 2;
      
      // Add thread details
      const threadPitch = tool.threadPitch || 1.0; // Default to 1mm pitch
      const threadDepth = diameter * 0.1;
      const threadTurns = Math.floor(cuttingLength / threadPitch);
      
      for (let i = 0; i < threadTurns; i++) {
        const y = -i * threadPitch - threadPitch / 2;
        
        const threadGeometry = new THREE.TorusGeometry(
          diameter / 2 + threadDepth / 2,
          threadDepth / 2,
          8,
          24
        );
        const threadMaterial = new THREE.MeshStandardMaterial({
          color: 0x333333,
          metalness: 0.8,
          roughness: 0.2
        });
        const thread = new THREE.Mesh(threadGeometry, threadMaterial);
        thread.position.y = y;
        thread.rotateX(Math.PI / 2);
        
        cutting.add(thread);
      }
      
      toolGroup.add(shank);
      toolGroup.add(cutting);
      break;
    }
    
    case 'bullnose': {
      // Create shank
      const shankGeometry = new THREE.CylinderGeometry(
        shankDiameter / 2, 
        shankDiameter / 2, 
        shankLength, 
        24
      );
      const shank = new THREE.Mesh(shankGeometry, shankMaterial);
      shank.position.y = shankLength / 2;
      
      // Define radius of bullnose
      const cornerRadius = tool.radius || (diameter * 0.2);
      
      // Create main cylinder
      const cylinderLength = cuttingLength - cornerRadius;
      const cylinderGeometry = new THREE.CylinderGeometry(
        diameter / 2,
        diameter / 2,
        cylinderLength,
        24
      );
      const cylinder = new THREE.Mesh(cylinderGeometry, cuttingMaterial);
      cylinder.position.y = -cylinderLength / 2;
      
      // Create torus for bullnose corner
      const torusGeometry = new THREE.TorusGeometry(
        diameter / 2 - cornerRadius,
        cornerRadius,
        16,
        24,
        Math.PI / 2
      );
      const torus = new THREE.Mesh(torusGeometry, cuttingMaterial);
      torus.position.y = -cylinderLength;
      torus.rotateX(Math.PI / 2);
      
      // Create flat bottom
      const bottomGeometry = new THREE.CircleGeometry(
        diameter / 2 - cornerRadius,
        24
      );
      const bottom = new THREE.Mesh(bottomGeometry, cuttingMaterial);
      bottom.position.y = -cylinderLength - cornerRadius;
      bottom.rotateX(-Math.PI / 2);
      
      // Add flutes if specified
      if (tool.flutes && tool.flutes > 0) {
        for (let i = 0; i < tool.flutes; i++) {
          const fluteAngle = (i / tool.flutes) * Math.PI * 2;
          
          // Flute on main cylinder
          const fluteGeometry = new THREE.BoxGeometry(
            diameter * 0.15,
            cylinderLength,
            diameter * 0.4
          );
          const fluteMaterial = new THREE.MeshStandardMaterial({
            color: 0x222222,
            metalness: 0.7,
            roughness: 0.3
          });
          const flute = new THREE.Mesh(fluteGeometry, fluteMaterial);
          
          flute.position.y = -cylinderLength / 2;
          flute.rotateY(fluteAngle);
          flute.translateZ(diameter / 2 - diameter * 0.2);
          
          cylinder.add(flute);
        }
      }
      
      toolGroup.add(shank);
      toolGroup.add(cylinder);
      toolGroup.add(torus);
      toolGroup.add(bottom);
      break;
    }
    
    // Default generic tool if type not recognized
    default: {
      // Create a generic cylindrical tool
      const shankGeometry = new THREE.CylinderGeometry(
        shankDiameter / 2, 
        shankDiameter / 2, 
        shankLength, 
        24
      );
      const shank = new THREE.Mesh(shankGeometry, shankMaterial);
      shank.position.y = shankLength / 2;
      
      const cuttingGeometry = new THREE.CylinderGeometry(
        diameter / 2,
        diameter / 2,
        cuttingLength,
        24
      );
      const cutting = new THREE.Mesh(cuttingGeometry, cuttingMaterial);
      cutting.position.y = -cuttingLength / 2;
      
      toolGroup.add(shank);
      toolGroup.add(cutting);
    }
  }
  
  // Add tool identification
  toolGroup.userData.toolType = tool.type;
  toolGroup.userData.toolDiameter = tool.diameter;
  if (tool.name) toolGroup.userData.toolName = tool.name;
  
  // Orient tool to point downward (Z axis)
  toolGroup.rotation.x = Math.PI / 2;
  
  // Enable shadows
  toolGroup.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  
  return toolGroup;
}
