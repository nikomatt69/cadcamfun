import * as THREE from "three";

export interface ToolpathSegment {
  id: string;
  color: string;
  points: THREE.Vector3[];
  isRapid: boolean;
}

export interface MultiColorToolpathOptions {
  defaultColor?: string;
  rapidColor?: string;
  lineWidth?: number;
  opacity?: number;
}

/**
 * Crea una visualizzazione multi-colore per i toolpath
 */
export function createMultiColorToolpath(
  segments: ToolpathSegment[],
  options: MultiColorToolpathOptions = {}
): THREE.Group {
  const { defaultColor = "#00FF00", rapidColor = "#FF0000", lineWidth = 2, opacity = 1 } = options;

  const group = new THREE.Group();
  group.name = "MultiColorToolpath";

  segments.forEach(segment => {
    if (segment.points.length < 2) return;

    // Crea geometria per questo segmento
    const geometry = new THREE.BufferGeometry().setFromPoints(segment.points);

    // Determina il colore
    const color = segment.isRapid ? rapidColor : segment.color || defaultColor;

    // Crea materiale con il colore specifico
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(color),
      linewidth: lineWidth,
      opacity: opacity,
      transparent: opacity < 1
    });

    // Crea linea
    const line = new THREE.Line(geometry, material);
    line.name = `ToolpathSegment-${segment.id}`;
    line.userData = {
      segmentId: segment.id,
      color: segment.color,
      isRapid: segment.isRapid
    };

    group.add(line);
  });

  return group;
}

/**
 * Parse G-code con supporto per marcatori di colore
 */
export function parseMultiColorGCode(gcode: string): ToolpathSegment[] {
  const lines = gcode.split("\n");
  const segments: ToolpathSegment[] = [];

  let currentSegment: ToolpathSegment | null = null;
  let currentColor = "#00FF00";
  let currentId = "default";
  let currentX = 0;
  let currentY = 0;
  let currentZ = 0;

  lines.forEach(line => {
    const trimmedLine = line.trim();

    // Controlla marcatore colore
    if (trimmedLine.includes("TOOLPATH_COLOR:")) {
      const colorMatch = trimmedLine.match(/TOOLPATH_COLOR:\s*(.+)/);
      if (colorMatch) {
        currentColor = colorMatch[1].trim();
      }
    }

    // Controlla marcatore ID
    if (trimmedLine.includes("TOOLPATH_ID:")) {
      const idMatch = trimmedLine.match(/TOOLPATH_ID:\s*(.+)/);
      if (idMatch) {
        // Salva il segmento precedente se esistente
        if (currentSegment && currentSegment.points.length > 0) {
          segments.push(currentSegment);
        }

        // Crea nuovo segmento
        currentId = idMatch[1].trim();
        currentSegment = {
          id: currentId,
          color: currentColor,
          points: [],
          isRapid: false
        };
      }
    }

    // Parse movimenti G-code
    const isG0 = trimmedLine.startsWith("G0");
    const isG1 = trimmedLine.startsWith("G1");

    if ((isG0 || isG1) && currentSegment) {
      const xMatch = trimmedLine.match(/X([+-]?\d*\.?\d+)/);
      const yMatch = trimmedLine.match(/Y([+-]?\d*\.?\d+)/);
      const zMatch = trimmedLine.match(/Z([+-]?\d*\.?\d+)/);

      if (xMatch) currentX = parseFloat(xMatch[1]);
      if (yMatch) currentY = parseFloat(yMatch[1]);
      if (zMatch) currentZ = parseFloat(zMatch[1]);

      // Aggiungi punto al segmento corrente
      currentSegment.points.push(new THREE.Vector3(currentX, currentY, currentZ));
      currentSegment.isRapid = isG0;
    }
  });

  // Salva l'ultimo segmento
  if (currentSegment && (currentSegment as ToolpathSegment).points.length > 0) {
    segments.push(currentSegment);
  }

  return segments;
}

/**
 * Crea un sistema di particelle per evidenziare i punti del toolpath
 */
export function createToolpathPointCloud(segments: ToolpathSegment[], pointSize: number = 2): THREE.Points {
  const positions: number[] = [];
  const colors: number[] = [];

  segments.forEach(segment => {
    const color = new THREE.Color(segment.color);

    segment.points.forEach(point => {
      positions.push(point.x, point.y, point.z);
      colors.push(color.r, color.g, color.b);
    });
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: pointSize,
    vertexColors: true,
    sizeAttenuation: false
  });

  const points = new THREE.Points(geometry, material);
  points.name = "ToolpathPointCloud";

  return points;
}

/**
 * Anima la transizione tra diversi segmenti di toolpath
 */
export function animateToolpathTransition(
  tool: THREE.Object3D,
  fromSegment: ToolpathSegment,
  toSegment: ToolpathSegment,
  duration: number = 500
): Promise<void> {
  return new Promise(resolve => {
    const fromColor = new THREE.Color(fromSegment.color);
    const toColor = new THREE.Color(toSegment.color);

    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Interpola il colore
      const currentColor = fromColor.clone().lerp(toColor, progress);

      // Applica il colore all'utensile
      tool.traverse(child => {
        if (child instanceof THREE.Mesh && child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => {
              if (mat instanceof THREE.MeshStandardMaterial) {
                mat.emissive = currentColor;
                mat.emissiveIntensity = 0.5;
              }
            });
          } else if (child.material instanceof THREE.MeshStandardMaterial) {
            child.material.emissive = currentColor;
            child.material.emissiveIntensity = 0.5;
          }
        }
      });

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        resolve();
      }
    };

    animate();
  });
}

/**
 * Crea una mappa di calore per visualizzare la densità del toolpath
 */
export function createToolpathHeatmap(segments: ToolpathSegment[], gridSize: number = 50): THREE.Mesh {
  // Trova i limiti del toolpath
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;

  segments.forEach(segment => {
    segment.points.forEach(point => {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    });
  });

  const width = maxX - minX;
  const height = maxY - minY;

  // Crea griglia per la heatmap
  const grid: number[][] = Array(gridSize)
    .fill(0)
    .map(() => Array(gridSize).fill(0));

  // Accumula i punti nella griglia
  segments.forEach(segment => {
    segment.points.forEach(point => {
      const gridX = Math.floor(((point.x - minX) / width) * (gridSize - 1));
      const gridY = Math.floor(((point.y - minY) / height) * (gridSize - 1));

      if (gridX >= 0 && gridX < gridSize && gridY >= 0 && gridY < gridSize) {
        grid[gridY][gridX]++;
      }
    });
  });

  // Trova il valore massimo per la normalizzazione
  const maxValue = Math.max(...grid.flat());

  // Crea geometria plane
  const geometry = new THREE.PlaneGeometry(width, height, gridSize - 1, gridSize - 1);
  const positionAttribute = geometry.attributes.position;
  const colors: number[] = [];

  // Assegna colori basati sulla densità
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const index = y * gridSize + x;
      const value = grid[y][x] / maxValue;

      // Gradiente da blu (bassa densità) a rosso (alta densità)
      const r = value;
      const g = 1 - value;
      const b = 1 - value;

      colors.push(r, g, b);

      // Aggiorna posizione Z basata sulla densità
      if (index < positionAttribute.count) {
        positionAttribute.setZ(index, value * 10);
      }
    }
  }

  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set((minX + maxX) / 2, (minY + maxY) / 2, -5);
  mesh.name = "ToolpathHeatmap";

  return mesh;
}

/**
 * Crea etichette per i segmenti del toolpath
 */
export function createToolpathLabels(
  segments: ToolpathSegment[],
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer
): THREE.Group {
  const labelsGroup = new THREE.Group();
  labelsGroup.name = "ToolpathLabels";

  segments.forEach(segment => {
    if (segment.points.length === 0) return;

    // Trova il centro del segmento
    const center = new THREE.Vector3();
    segment.points.forEach(point => {
      center.add(point);
    });
    center.divideScalar(segment.points.length);

    // Crea sprite per l'etichetta
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.width = 256;
    canvas.height = 64;

    context.fillStyle = segment.color;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = "white";
    context.font = "24px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(segment.id, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      opacity: 0.8,
      transparent: true
    });

    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.copy(center);
    sprite.scale.set(10, 2.5, 1);
    sprite.name = `Label-${segment.id}`;

    labelsGroup.add(sprite);
  });

  return labelsGroup;
}
