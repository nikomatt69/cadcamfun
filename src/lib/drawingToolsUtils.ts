import * as THREE from 'three';
import { DrawingToolType } from 'src/components/cam/DrawingToolbar';
import { v4 as uuidv4 } from 'uuid';

export interface DrawingElement {
  id: string;
  type: 'drawing' | 'dimension' | 'text';
  tool: DrawingToolType;
  points: { x: number; y: number; z: number }[];
  color: string;
  size: number;
  opacity?: number;
  text?: string;
  dimensionValue?: number;
  dimensionUnit?: string;
  dimensionStyle?: 'linear' | 'angular' | 'radius' | 'diameter';
}

/**
 * Creates a THREE.js line object from a set of points with the specified style
 */
export const createDrawingLine = (
  points: { x: number; y: number; z: number }[],
  color: string,
  lineWidth: number,
  opacity: number = 1
): THREE.Line => {
  const threePoints = points.map(p => new THREE.Vector3(p.x, p.y, p.z));
  const geometry = new THREE.BufferGeometry().setFromPoints(threePoints);
  
  const material = new THREE.LineBasicMaterial({
    color: new THREE.Color(color),
    linewidth: lineWidth, // Note: WebGL has limitations for line width
    transparent: opacity < 1,
    opacity: opacity
  });
  
  const line = new THREE.Line(geometry, material);
  return line;
};

/**
 * Creates a THREE.js mesh for highlighter (semi-transparent wide line)
 */
export const createHighlighter = (
  points: { x: number; y: number; z: number }[],
  color: string,
  width: number,
  opacity: number = 0.5
): THREE.Mesh => {
  // For a proper highlighter effect, we'll create a ribbon-like mesh
  if (points.length < 2) return new THREE.Mesh(); // Return empty mesh if not enough points
  
  // Create a path from the points
  const path = new THREE.CatmullRomCurve3(
    points.map(p => new THREE.Vector3(p.x, p.y, p.z))
  );
  
  // Create a tube geometry along the path
  const geometry = new THREE.TubeGeometry(
    path,
    points.length * 2, // Segments
    width / 2, // Tube radius
    8, // Radial segments
    false // Closed
  );
  
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: opacity,
    side: THREE.DoubleSide
  });
  
  return new THREE.Mesh(geometry, material);
};

/**
 * Creates a dimension line with text for measurements
 */
export const createDimension = (
  start: { x: number; y: number; z: number },
  end: { x: number; y: number; z: number },
  value: number,
  unit: string,
  style: 'linear' | 'angular' | 'radius' | 'diameter',
  color: string
): THREE.Group => {
  const group = new THREE.Group();
  
  // Create the base line
  const startPoint = new THREE.Vector3(start.x, start.y, start.z);
  const endPoint = new THREE.Vector3(end.x, end.y, end.z);
  
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([startPoint, endPoint]);
  const lineMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(color) });
  const line = new THREE.Line(lineGeometry, lineMaterial);
  group.add(line);
  
  // Add dimension arrow heads
  const arrowHeadSize = 0.5;
  const direction = new THREE.Vector3().subVectors(endPoint, startPoint).normalize();
  
  // Create arrow head at start point
  const arrowStartGeometry = new THREE.ConeGeometry(arrowHeadSize, arrowHeadSize * 2, 8);
  const arrowStartMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
  const arrowStart = new THREE.Mesh(arrowStartGeometry, arrowStartMaterial);
  arrowStart.position.copy(startPoint);
  arrowStart.lookAt(endPoint);
  arrowStart.rotateX(Math.PI / 2);
  group.add(arrowStart);
  
  // Create arrow head at end point
  const arrowEndGeometry = new THREE.ConeGeometry(arrowHeadSize, arrowHeadSize * 2, 8);
  const arrowEndMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
  const arrowEnd = new THREE.Mesh(arrowEndGeometry, arrowEndMaterial);
  arrowEnd.position.copy(endPoint);
  arrowEnd.lookAt(startPoint);
  arrowEnd.rotateX(Math.PI / 2);
  group.add(arrowEnd);
  
  // For dimension text, we'd normally use TextGeometry but it requires font loading
  // Instead, we'll create a sprite with text texture for simplicity
  const dimensionText = `${value.toFixed(2)} ${unit}`;
  
  // Create canvas for the text
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = 'bold 32px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = color;
    context.fillText(dimensionText, canvas.width / 2, canvas.height / 2);
    
    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    
    // Create sprite with the texture
    const spriteMaterial = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true
    });
    
    const sprite = new THREE.Sprite(spriteMaterial);
    
    // Position at midpoint of the line
    const midPoint = new THREE.Vector3().addVectors(startPoint, endPoint).multiplyScalar(0.5);
    sprite.position.copy(midPoint);
    sprite.position.y += 0.5; // offset slightly above the line
    
    // Scale the sprite
    sprite.scale.set(2, 0.5, 1);
    
    group.add(sprite);
  }
  
  // Add dimension-specific styling based on style
  switch(style) {
    case 'angular':
      // For angular dimensions, we might add an arc
      break;
    case 'radius':
      // For radius, we might add 'R' prefix to text and connect to center
      break;
    case 'diameter':
      // For diameter, we might add 'Ø' prefix to text
      break;
    default: 
      // Linear is the default style
      break;
  }
  
  // Store dimension data in userData for later reference
  group.userData = {
    type: 'dimension',
    value,
    unit,
    style,
    startPoint: start,
    endPoint: end
  };
  
  return group;
};

/**
 * Creates a text element
 */
export const createTextElement = (
  position: { x: number; y: number; z: number },
  text: string,
  fontSize: number,
  color: string
): THREE.Group => {
  const group = new THREE.Group();
  
  // Since THREE.js TextGeometry requires font loading,
  // we'll create a sprite with text texture for simplicity
  const canvas = document.createElement('canvas');
  canvas.width = text.length * fontSize * 2;
  canvas.height = fontSize * 4;
  
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = 'rgba(255, 255, 255, 0)'; // Transparent background
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = `${fontSize * 2}px Arial`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = color;
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    
    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    
    // Create sprite with the texture
    const spriteMaterial = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true
    });
    
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.set(position.x, position.y, position.z);
    
    // Scale based on text length and font size
    const scale = fontSize * 0.05;
    sprite.scale.set(text.length * scale, scale, 1);
    
    group.add(sprite);
  }
  
  // Store text data in userData for later reference
  group.userData = {
    type: 'text',
    content: text,
    fontSize,
    position
  };
  
  return group;
};

/**
 * Creates a new drawing element from points
 */
export const createDrawingElement = (
  points: { x: number; y: number; z: number }[],
  tool: DrawingToolType,
  color: string,
  size: number,
  additionalProps: Record<string, any> = {}
): DrawingElement => {
  return {
    id: uuidv4(),
    type: tool === 'dimension' ? 'dimension' : tool === 'text' ? 'text' : 'drawing',
    tool,
    points,
    color,
    size,
    ...additionalProps
  };
};

/**
 * Updates cursor based on the selected tool
 */
export const updateCursorForTool = (
  tool: DrawingToolType,
  canvasElement: HTMLElement | null
): void => {
  if (!canvasElement) return;
  
  switch(tool) {
    case 'pen':
      canvasElement.style.cursor = 'crosshair';
      break;
    case 'eraser':
      canvasElement.style.cursor = 'url("/cursors/eraser.png"), auto';
      break;
    case 'colorPicker':
      canvasElement.style.cursor = 'url("/cursors/color-picker.png"), pointer';
      break;
    case 'highlighter':
      canvasElement.style.cursor = 'url("/cursors/highlighter.png"), auto';
      break;
    case 'dimension':
      canvasElement.style.cursor = 'crosshair';
      break;
    case 'text':
      canvasElement.style.cursor = 'text';
      break;
    case 'select':
    default:
      canvasElement.style.cursor = 'default';
      break;
  }
};