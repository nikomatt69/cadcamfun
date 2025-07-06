/**
 * Drawing Elements Factory - Elementi di disegno e annotazione
 * Estratto da CADCanvas.tsx createThreeObject() - COMPORTAMENTO IDENTICO
 */

import * as THREE from 'three';
import type { CADElement } from '../utils/geometryUtils';

export interface DrawingElement extends CADElement {
  points?: Array<{ x: number; y: number; z?: number }>;
  penSize?: number;
  highlighterSize?: number;
  opacity?: number;
  text?: string;
  position?: { x: number; y: number; z?: number };
  textSize?: number;
  font?: string;
  showEraserPath?: boolean;
  startPoint?: { x: number; y: number; z?: number };
  endPoint?: { x: number; y: number; z?: number };
}

export class DrawingElementsFactory {
  /**
   * Crea un tracciato con penna - IDENTICO all'originale
   */
  static createDrawingPen(element: DrawingElement, originOffset: THREE.Vector3): THREE.Line {
    if (!element.points || element.points.length < 2) {
      throw new Error('Drawing pen requires at least 2 points');
    }

    // Convert points to Vector3 and apply offset
    const penPoints = element.points.map(
      (point: any) =>
        new THREE.Vector3(point.x + originOffset.x, point.y + originOffset.y, (point.z || 0) + originOffset.z)
    );

    const penGeometry = new THREE.BufferGeometry().setFromPoints(penPoints);
    const penMaterial = new THREE.LineBasicMaterial({
      color: element.color || 0x000000,
      linewidth: element.penSize || 1
    });

    const penLine = new THREE.Line(penGeometry, penMaterial);
    
    // Metadata per compatibilità
    penLine.userData.isCADElement = true;
    penLine.userData.elementId = element.id;
    penLine.userData.elementType = 'drawing-pen';
    penLine.userData.isDrawingElement = true;
    penLine.userData.drawingType = "pen";

    return penLine;
  }

  /**
   * Crea un tracciato con evidenziatore - IDENTICO all'originale
   */
  static createDrawingHighlighter(element: DrawingElement, originOffset: THREE.Vector3): THREE.Line {
    if (!element.points || element.points.length < 2) {
      throw new Error('Drawing highlighter requires at least 2 points');
    }

    // Convert points to Vector3 and apply offset
    const highlighterPoints = element.points.map(
      (point: any) =>
        new THREE.Vector3(point.x + originOffset.x, point.y + originOffset.y, (point.z || 0) + originOffset.z)
    );

    // For highlighter, use wider line with transparency
    const highlighterGeometry = new THREE.BufferGeometry().setFromPoints(highlighterPoints);
    const highlighterMaterial = new THREE.LineBasicMaterial({
      color: element.color || 0xffff00,
      linewidth: element.highlighterSize || 5,
      transparent: true,
      opacity: element.opacity || 0.5
    });

    const highlighterLine = new THREE.Line(highlighterGeometry, highlighterMaterial);
    
    // Metadata per compatibilità
    highlighterLine.userData.isCADElement = true;
    highlighterLine.userData.elementId = element.id;
    highlighterLine.userData.elementType = 'drawing-highlighter';
    highlighterLine.userData.isDrawingElement = true;
    highlighterLine.userData.drawingType = "highlighter";

    return highlighterLine;
  }

  /**
   * Crea del testo di disegno - IDENTICO all'originale
   */
  static createDrawingText(element: DrawingElement, originOffset: THREE.Vector3): THREE.Mesh {
    if (!element.position || !element.text) {
      throw new Error('Drawing text requires position and text properties');
    }

    // Create a placeholder for the text
    // In a real implementation, you would use TextGeometry with loaded fonts
    const drawingTextMaterial = new THREE.MeshBasicMaterial({
      color: element.color || 0x000000,
      transparent: true,
      opacity: 0.9
    });

    // Create a simple plane as placeholder
    const textWidth = element.text.length * (element.textSize || 12) * 0.05;
    const textHeight = (element.textSize || 12) * 0.1;

    const drawingTextGeometry = new THREE.PlaneGeometry(textWidth, textHeight);
    const drawingTextMesh = new THREE.Mesh(drawingTextGeometry, drawingTextMaterial);

    drawingTextMesh.position.set(
      element.position.x + originOffset.x,
      element.position.y + originOffset.y,
      (element.position.z || 0) + originOffset.z
    );

    // Metadata per compatibilità
    drawingTextMesh.userData.isCADElement = true;
    drawingTextMesh.userData.elementId = element.id;
    drawingTextMesh.userData.elementType = 'drawing-text';
    drawingTextMesh.userData.isDrawingElement = true;
    drawingTextMesh.userData.drawingType = "text";
    drawingTextMesh.userData.text = element.text;
    drawingTextMesh.userData.textSize = element.textSize || 12;
    drawingTextMesh.userData.font = element.font || "Arial";

    return drawingTextMesh;
  }

  /**
   * Crea un tracciato di cancellazione - IDENTICO all'originale
   */
  static createDrawingEraser(element: DrawingElement, originOffset: THREE.Vector3): THREE.Line | null {
    // Eraser itself doesn't create visual elements
    // It's an operation that removes other elements
    // For debugging purposes, we could visualize the eraser path
    if (element.showEraserPath && element.points && element.points.length >= 2) {
      const eraserPoints = element.points.map(
        (point: any) =>
          new THREE.Vector3(point.x + originOffset.x, point.y + originOffset.y, (point.z || 0) + originOffset.z)
      );

      const eraserGeometry = new THREE.BufferGeometry().setFromPoints(eraserPoints);
      const eraserMaterial = new THREE.LineBasicMaterial({
        color: 0xff0000,
        linewidth: 1,
        transparent: true,
        opacity: 0.5
      });

      const eraserLine = new THREE.Line(eraserGeometry, eraserMaterial);
      
      // Metadata per compatibilità
      eraserLine.userData.isCADElement = true;
      eraserLine.userData.elementId = element.id;
      eraserLine.userData.elementType = 'drawing-eraser';
      eraserLine.userData.isDrawingElement = true;
      eraserLine.userData.drawingType = "eraser";

      return eraserLine;
    }
    return null;
  }

  /**
   * Crea un'area di screenshot - IDENTICO all'originale
   */
  static createDrawingScreenshotArea(element: DrawingElement, originOffset: THREE.Vector3): THREE.Mesh {
    // Visualize screenshot selection area
    if (!element.startPoint || !element.endPoint) {
      throw new Error('Screenshot area requires startPoint and endPoint');
    }

    const startPoint = new THREE.Vector3(
      element.startPoint.x + originOffset.x,
      element.startPoint.y + originOffset.y,
      (element.startPoint.z || 0) + originOffset.z
    );

    const endPoint = new THREE.Vector3(
      element.endPoint.x + originOffset.x,
      element.endPoint.y + originOffset.y,
      (element.endPoint.z || 0) + originOffset.z
    );

    // Calculate width and height
    const width = Math.abs(endPoint.x - startPoint.x);
    const height = Math.abs(endPoint.y - startPoint.y);

    // Create rectangle shape
    const screenshotGeometry = new THREE.PlaneGeometry(width, height);
    const screenshotMaterial = new THREE.MeshBasicMaterial({
      color: 0x2196f3,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide
    });

    const screenshotMesh = new THREE.Mesh(screenshotGeometry, screenshotMaterial);

    // Position at center of rectangle
    screenshotMesh.position.set(
      (startPoint.x + endPoint.x) / 2, 
      (startPoint.y + endPoint.y) / 2, 
      startPoint.z
    );

    // Add border
    const borderGeometry = new THREE.EdgesGeometry(screenshotGeometry);
    const borderMaterial = new THREE.LineBasicMaterial({
      color: 0x2196f3,
      linewidth: 2
    });

    const border = new THREE.LineSegments(borderGeometry, borderMaterial);
    screenshotMesh.add(border);

    // Metadata per compatibilità
    screenshotMesh.userData.isCADElement = true;
    screenshotMesh.userData.elementId = element.id;
    screenshotMesh.userData.elementType = 'drawing-screenshot-area';
    screenshotMesh.userData.isDrawingElement = true;
    screenshotMesh.userData.drawingType = "screenshot-area";

    return screenshotMesh;
  }

  /**
   * Factory method principale - router per tutti i tipi di disegno
   */
  static create(element: DrawingElement, originOffset: THREE.Vector3): THREE.Object3D | null {
    try {
      switch (element.type) {
        case 'drawing-pen':
          return this.createDrawingPen(element, originOffset);
        case 'drawing-highlighter':
          return this.createDrawingHighlighter(element, originOffset);
        case 'drawing-text':
          return this.createDrawingText(element, originOffset);
        case 'drawing-eraser':
          return this.createDrawingEraser(element, originOffset);
        case 'drawing-screenshot-area':
          return this.createDrawingScreenshotArea(element, originOffset);
        default:
          console.warn(`DrawingElementsFactory: Tipo non supportato: ${element.type}`);
          return null;
      }
    } catch (error) {
      console.error(`Errore nella creazione dell'elemento di disegno ${element.type}:`, error);
      return null;
    }
  }

  /**
   * Verifica se un tipo è supportato da questa factory
   */
  static supports(elementType: string): boolean {
    return [
      'drawing-pen', 
      'drawing-highlighter', 
      'drawing-text', 
      'drawing-eraser', 
      'drawing-screenshot-area'
    ].includes(elementType);
  }

  /**
   * Lista di tutti i tipi supportati
   */
  static getSupportedTypes(): string[] {
    return [
      'drawing-pen', 
      'drawing-highlighter', 
      'drawing-text', 
      'drawing-eraser', 
      'drawing-screenshot-area'
    ];
  }
}
