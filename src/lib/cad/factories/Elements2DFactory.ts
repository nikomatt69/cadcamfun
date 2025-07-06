/**
 * 2D Elements Factory - Elementi bidimensionali
 * Estratto da CADCanvas.tsx createThreeObject() - COMPORTAMENTO IDENTICO
 */

import * as THREE from 'three';
import { degreesToRadians } from '../utils';
import type { CADElement } from '../utils/geometryUtils';

export interface Element2D extends CADElement {
  x1?: number;
  y1?: number;
  z1?: number;
  x2?: number;
  y2?: number;
  z2?: number;
  width?: number;
  height?: number;
  radius?: number;
  angle?: number;
  points?: Array<{ x: number; y: number; z?: number }>;
  sides?: number;
  text?: string;
  fontSize?: number;
  font?: string;
  strokeWidth?: number;
  filled?: boolean;
  startAngle?: number;
  endAngle?: number;
  controlPoints?: Array<{ x: number; y: number; z?: number }>;
}

export class Elements2DFactory {
  /**
   * Crea una linea - IDENTICO all'originale
   */
  static createLine(element: Element2D, originOffset: THREE.Vector3): THREE.Line {
    if (element.x1 === undefined || element.y1 === undefined || 
        element.x2 === undefined || element.y2 === undefined) {
      throw new Error('Line requires x1, y1, x2, y2 properties');
    }

    const points = [
      new THREE.Vector3(
        element.x1 + originOffset.x,
        element.y1 + originOffset.y,
        (element.z1 || 0) + originOffset.z
      ),
      new THREE.Vector3(
        element.x2 + originOffset.x,
        element.y2 + originOffset.y,
        (element.z2 || 0) + originOffset.z
      )
    ];

    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: element.color || 0x000000,
      linewidth: element.strokeWidth || 1
    });

    const line = new THREE.Line(lineGeometry, lineMaterial);

    // Metadata per compatibilità
    line.userData.isCADElement = true;
    line.userData.elementId = element.id;
    line.userData.elementType = 'line';

    return line;
  }

  /**
   * Crea un rettangolo - IDENTICO all'originale
   */
  static createRectangle(element: Element2D, originOffset: THREE.Vector3): THREE.Object3D {
    const width = element.width || 1;
    const height = element.height || 1;

    let rectGeometry: THREE.BufferGeometry;
    let rectMaterial: THREE.Material;
    let rect: THREE.Object3D;

    if (element.filled) {
      // Filled rectangle
      rectGeometry = new THREE.PlaneGeometry(width, height);
      rectMaterial = new THREE.MeshBasicMaterial({
        color: element.color || 0x888888,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7
      });
      rect = new THREE.Mesh(rectGeometry, rectMaterial);
    } else {
      // Wireframe rectangle - create edges
      const shape = new THREE.Shape();
      shape.moveTo(-width / 2, -height / 2);
      shape.lineTo(width / 2, -height / 2);
      shape.lineTo(width / 2, height / 2);
      shape.lineTo(-width / 2, height / 2);
      shape.lineTo(-width / 2, -height / 2);

      rectGeometry = new THREE.BufferGeometry().setFromPoints(shape.getPoints());
      rectMaterial = new THREE.LineBasicMaterial({
        color: element.color || 0x000000,
        linewidth: element.strokeWidth || 1
      });
      rect = new THREE.Line(rectGeometry, rectMaterial);
    }

    rect.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );

    // Apply rotation if specified
    if (element.angle) {
      rect.rotation.z = degreesToRadians(element.angle);
    }

    // Metadata per compatibilità
    rect.userData.isCADElement = true;
    rect.userData.elementId = element.id;
    rect.userData.elementType = 'rectangle';

    return rect;
  }

  /**
   * Crea un cerchio - IDENTICO all'originale
   */
  static createCircle(element: Element2D, originOffset: THREE.Vector3): THREE.Object3D {
    const radius = element.radius || 1;
    const segments = 64;

    let circleGeometry: THREE.BufferGeometry;
    let circleMaterial: THREE.Material;
    let circle: THREE.Object3D;

    if (element.filled) {
      // Filled circle
      circleGeometry = new THREE.CircleGeometry(radius, segments);
      circleMaterial = new THREE.MeshBasicMaterial({
        color: element.color || 0x888888,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7
      });
      circle = new THREE.Mesh(circleGeometry, circleMaterial);
    } else {
      // Circle outline
      const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, 2 * Math.PI, false, 0);
      const points = curve.getPoints(segments);
      circleGeometry = new THREE.BufferGeometry().setFromPoints(points);
      circleMaterial = new THREE.LineBasicMaterial({
        color: element.color || 0x000000,
        linewidth: element.strokeWidth || 1
      });
      circle = new THREE.Line(circleGeometry, circleMaterial);
    }

    circle.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );

    // Metadata per compatibilità
    circle.userData.isCADElement = true;
    circle.userData.elementId = element.id;
    circle.userData.elementType = 'circle';

    return circle;
  }

  /**
   * Crea un poligono - IDENTICO all'originale
   */
  static createPolygon(element: Element2D, originOffset: THREE.Vector3): THREE.Object3D {
    const polygonShape = new THREE.Shape();

    if (element.points && element.points.length > 0) {
      // Create polygon from points
      polygonShape.moveTo(element.points[0].x, element.points[0].y);
      for (let i = 1; i < element.points.length; i++) {
        polygonShape.lineTo(element.points[i].x, element.points[i].y);
      }
    } else if (element.sides && element.radius) {
      // Create regular polygon
      const sides = element.sides || 6;
      const radius = element.radius || 1;

      for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2;
        const x = radius * Math.cos(angle);
        const y = radius * Math.sin(angle);

        if (i === 0) {
          polygonShape.moveTo(x, y);
        } else {
          polygonShape.lineTo(x, y);
        }
      }
    }
    polygonShape.closePath();

    let polygonGeometry: THREE.BufferGeometry;
    let polygonMaterial: THREE.Material;
    let polygon: THREE.Object3D;

    if (element.filled) {
      polygonGeometry = new THREE.ShapeGeometry(polygonShape);
      polygonMaterial = new THREE.MeshBasicMaterial({
        color: element.color || 0x795548,
        wireframe: false,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7
      });
      polygon = new THREE.Mesh(polygonGeometry, polygonMaterial);
    } else {
      const points = polygonShape.getPoints();
      polygonGeometry = new THREE.BufferGeometry().setFromPoints(points);
      polygonMaterial = new THREE.LineBasicMaterial({
        color: element.color || 0x795548,
        linewidth: element.strokeWidth || 1
      });
      polygon = new THREE.Line(polygonGeometry, polygonMaterial);
    }

    polygon.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );

    // Metadata per compatibilità
    polygon.userData.isCADElement = true;
    polygon.userData.elementId = element.id;
    polygon.userData.elementType = 'polygon';

    return polygon;
  }

  /**
   * Crea un arco - SIMILE all'originale
   */
  static createArc(element: Element2D, originOffset: THREE.Vector3): THREE.Line {
    const radius = element.radius || 1;
    const startAngle = element.startAngle || 0;
    const endAngle = element.endAngle || Math.PI;

    const curve = new THREE.EllipseCurve(
      0, 0, // center
      radius, radius, // radii
      startAngle, endAngle, // start/end angles
      false, // clockwise
      0 // rotation
    );

    const points = curve.getPoints(64);
    const arcGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const arcMaterial = new THREE.LineBasicMaterial({
      color: element.color || 0x000000,
      linewidth: element.strokeWidth || 1
    });

    const arc = new THREE.Line(arcGeometry, arcMaterial);
    arc.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );

    // Metadata per compatibilità
    arc.userData.isCADElement = true;
    arc.userData.elementId = element.id;
    arc.userData.elementType = 'arc';

    return arc;
  }

  /**
   * Crea una curva di Bezier - SIMILE all'originale
   */
  static createBezier(element: Element2D, originOffset: THREE.Vector3): THREE.Line {
    if (!element.controlPoints || element.controlPoints.length < 4) {
      throw new Error('Bezier curve requires at least 4 control points');
    }

    const controlPoints = element.controlPoints;
    
    // Create cubic bezier curve
    const curve = new THREE.CubicBezierCurve(
      new THREE.Vector2(controlPoints[0].x, controlPoints[0].y),
      new THREE.Vector2(controlPoints[1].x, controlPoints[1].y),
      new THREE.Vector2(controlPoints[2].x, controlPoints[2].y),
      new THREE.Vector2(controlPoints[3].x, controlPoints[3].y)
    );

    const points = curve.getPoints(100);
    const points3D = points.map(p => new THREE.Vector3(p.x, p.y, 0));

    const bezierGeometry = new THREE.BufferGeometry().setFromPoints(points3D);
    const bezierMaterial = new THREE.LineBasicMaterial({
      color: element.color || 0x000000,
      linewidth: element.strokeWidth || 1
    });

    const bezier = new THREE.Line(bezierGeometry, bezierMaterial);
    bezier.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );

    // Metadata per compatibilità
    bezier.userData.isCADElement = true;
    bezier.userData.elementId = element.id;
    bezier.userData.elementType = 'bezier';

    return bezier;
  }

  /**
   * Crea del testo - PLACEHOLDER come nell'originale
   */
  static createText(element: Element2D, originOffset: THREE.Vector3): THREE.Mesh {
    if (!element.text) {
      throw new Error('Text element requires text property');
    }

    // Create a placeholder for the text - IDENTICO all'originale
    const textMaterial = new THREE.MeshBasicMaterial({
      color: element.color || 0x000000,
      transparent: true,
      opacity: 0.9
    });

    // Create a simple plane as placeholder
    const textWidth = element.text.length * (element.fontSize || 12) * 0.05;
    const textHeight = (element.fontSize || 12) * 0.1;

    const textGeometry = new THREE.PlaneGeometry(textWidth, textHeight);
    const textMesh = new THREE.Mesh(textGeometry, textMaterial);

    textMesh.position.set(
      element.x + originOffset.x,
      element.y + originOffset.y,
      (element.z || 0) + originOffset.z
    );

    // Metadata per compatibilità
    textMesh.userData.isCADElement = true;
    textMesh.userData.elementId = element.id;
    textMesh.userData.elementType = 'text';
    textMesh.userData.text = element.text;
    textMesh.userData.fontSize = element.fontSize || 12;
    textMesh.userData.font = element.font || "Arial";

    return textMesh;
  }

  /**
   * Factory method principale - router per tutti i tipi 2D
   */
  static create(element: Element2D, originOffset: THREE.Vector3): THREE.Object3D | null {
    try {
      switch (element.type) {
        case 'line':
          return this.createLine(element, originOffset);
        case 'rectangle':
          return this.createRectangle(element, originOffset);
        case 'circle':
          return this.createCircle(element, originOffset);
        case 'polygon':
          return this.createPolygon(element, originOffset);
        case 'arc':
          return this.createArc(element, originOffset);
        case 'bezier':
          return this.createBezier(element, originOffset);
        case 'text':
          return this.createText(element, originOffset);
        default:
          console.warn(`Elements2DFactory: Tipo non supportato: ${element.type}`);
          return null;
      }
    } catch (error) {
      console.error(`Errore nella creazione dell'elemento 2D ${element.type}:`, error);
      return null;
    }
  }

  /**
   * Verifica se un tipo è supportato da questa factory
   */
  static supports(elementType: string): boolean {
    return ['line', 'rectangle', 'circle', 'polygon', 'arc', 'bezier', 'text'].includes(elementType);
  }

  /**
   * Lista di tutti i tipi supportati
   */
  static getSupportedTypes(): string[] {
    return ['line', 'rectangle', 'circle', 'polygon', 'arc', 'bezier', 'text'];
  }
}
