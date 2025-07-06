/**
 * Measurement Elements Factory - Elementi di misurazione e annotazione
 * Estratto da CADCanvas.tsx createThreeObject() - COMPORTAMENTO IDENTICO
 */

import * as THREE from 'three';
import type { CADElement } from '../utils/geometryUtils';

export interface MeasurementElement extends CADElement {
  startPoint?: { x: number; y: number; z?: number };
  endPoint?: { x: number; y: number; z?: number };
  vertex?: { x: number; y: number; z?: number };
  center?: { x: number; y: number; z?: number };
  pointOnCircle?: { x: number; y: number; z?: number };
  offsetDirection?: string;
  offsetAmount?: number;
  value?: number;
  unit?: string;
  linewidth?: number;
  radius?: number;
}

export class MeasurementElementsFactory {
  /**
   * Crea una dimensione lineare - IDENTICO all'originale
   */
  static createLinearDimension(element: MeasurementElement, originOffset: THREE.Vector3): THREE.Group {
    // Create a linear dimension between two points
    if (!element.startPoint || !element.endPoint) {
      throw new Error('Linear dimension requires startPoint and endPoint');
    }

    const dimensionGroup = new THREE.Group();

    // Start and end points - Use startPoint/endPoint consistently
    const startPointVec = new THREE.Vector3(
      element.startPoint.x + originOffset.x,
      element.startPoint.y + originOffset.y,
      (element.startPoint.z || 0) + originOffset.z
    );

    const endPointVec = new THREE.Vector3(
      element.endPoint.x + originOffset.x,
      element.endPoint.y + originOffset.y,
      (element.endPoint.z || 0) + originOffset.z
    );

    // Calculate dimension line offset
    const offsetDirection = element.offsetDirection || "y";
    const offsetAmount = element.offsetAmount || 10;

    // Create dimension line
    const directionVector = new THREE.Vector3().subVectors(endPointVec, startPointVec);
    const length = directionVector.length();

    const dimensionLineMaterial = new THREE.LineBasicMaterial({
      color: element.color || 0x000000,
      linewidth: element.linewidth || 1
    });

    // Create offset points for dimension line
    const startOffset = startPointVec.clone();
    const endOffset = endPointVec.clone();

    if (offsetDirection === "y") {
      startOffset.y += offsetAmount;
      endOffset.y += offsetAmount;
    } else if (offsetDirection === "x") {
      startOffset.x += offsetAmount;
      endOffset.x += offsetAmount;
    } else if (offsetDirection === "z") {
      startOffset.z += offsetAmount;
      endOffset.z += offsetAmount;
    }

    // Main dimension line
    const dimensionLineGeometry = new THREE.BufferGeometry().setFromPoints([startOffset, endOffset]);
    const dimensionLine = new THREE.Line(dimensionLineGeometry, dimensionLineMaterial);
    dimensionGroup.add(dimensionLine);

    // Extension lines
    const extensionLine1Geometry = new THREE.BufferGeometry().setFromPoints([
      startPointVec, // Use startPointVec
      startOffset
    ]);
    const extensionLine2Geometry = new THREE.BufferGeometry().setFromPoints([
      endPointVec, // Use endPointVec
      endOffset
    ]);

    const extensionLine1 = new THREE.Line(extensionLine1Geometry, dimensionLineMaterial);
    const extensionLine2 = new THREE.Line(extensionLine2Geometry, dimensionLineMaterial);

    dimensionGroup.add(extensionLine1);
    dimensionGroup.add(extensionLine2);

    // Add dimension text (requires TextGeometry which needs font loading)
    // For now, we'll create a placeholder for the text
    const textPosition = new THREE.Vector3(
      (startOffset.x + endOffset.x) / 2,
      (startOffset.y + endOffset.y) / 2,
      (startOffset.z + endOffset.z) / 2
    );

    // Format display value
    const dimensionValue = element.value || length.toFixed(2);
    const dimensionUnit = element.unit || "mm";
    const dimensionText = `${dimensionValue} ${dimensionUnit}`;

    // Create text placeholder as a small plane
    const textPlaceholder = new THREE.Mesh(
      new THREE.PlaneGeometry(dimensionText.length * 0.8, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.7
      })
    );

    textPlaceholder.position.copy(textPosition);
    textPlaceholder.userData.text = dimensionText;
    textPlaceholder.userData.isDimensionText = true;

    dimensionGroup.add(textPlaceholder);

    // Metadata per compatibilità
    dimensionGroup.userData.isCADElement = true;
    dimensionGroup.userData.elementId = element.id;
    dimensionGroup.userData.elementType = 'linear-dimension';
    dimensionGroup.userData.isDimension = true;
    dimensionGroup.userData.dimensionType = "linear";
    dimensionGroup.userData.dimensionValue = dimensionValue;
    dimensionGroup.userData.dimensionUnit = dimensionUnit;

    return dimensionGroup;
  }

  /**
   * Crea una dimensione angolare - IDENTICO all'originale
   */
  static createAngularDimension(element: MeasurementElement, originOffset: THREE.Vector3): THREE.Group {
    if (!element.vertex || !element.startPoint || !element.endPoint) {
      throw new Error('Angular dimension requires vertex, startPoint and endPoint');
    }

    const angularDimensionGroup = new THREE.Group();

    // Points
    const vertex = new THREE.Vector3(
      element.vertex.x + originOffset.x,
      element.vertex.y + originOffset.y,
      (element.vertex.z || 0) + originOffset.z
    );

    const angularStartPoint = new THREE.Vector3(
      element.startPoint.x + originOffset.x,
      element.startPoint.y + originOffset.y,
      (element.startPoint.z || 0) + originOffset.z
    );

    const angularEndPoint = new THREE.Vector3(
      element.endPoint.x + originOffset.x,
      element.endPoint.y + originOffset.y,
      (element.endPoint.z || 0) + originOffset.z
    );

    // Calculate vectors
    const v1 = new THREE.Vector3().subVectors(angularStartPoint, vertex);
    const v2 = new THREE.Vector3().subVectors(angularEndPoint, vertex);

    // Calculate angle
    const angle = v1.angleTo(v2);
    const radius = element.radius || 5;

    // Create circular arc for the angle
    const arcCurve = new THREE.EllipseCurve(vertex.x, vertex.y, radius, radius, 0, angle, false, 0);

    const arcPoints = arcCurve.getPoints(50);
    const arcGeometry = new THREE.BufferGeometry().setFromPoints(arcPoints);

    const arcMaterial = new THREE.LineBasicMaterial({
      color: element.color || 0x000000,
      linewidth: element.linewidth || 1
    });

    const arc = new THREE.Line(arcGeometry, arcMaterial);
    arc.position.z = vertex.z;
    angularDimensionGroup.add(arc);

    // Extension lines from vertex to start/end points
    const angularLine1Geometry = new THREE.BufferGeometry().setFromPoints([vertex, angularStartPoint]);
    const angularLine2Geometry = new THREE.BufferGeometry().setFromPoints([vertex, angularEndPoint]);

    const angularLine1 = new THREE.Line(angularLine1Geometry, arcMaterial);
    const angularLine2 = new THREE.Line(angularLine2Geometry, arcMaterial);

    angularDimensionGroup.add(angularLine1);
    angularDimensionGroup.add(angularLine2);

    // Add angular text
    const angleInDegrees = ((angle * 180) / Math.PI).toFixed(1);
    const midAngle = angle / 2;

    const textX = vertex.x + radius * 1.2 * Math.cos(midAngle);
    const textY = vertex.y + radius * 1.2 * Math.sin(midAngle);

    const angularTextPlaceholder = new THREE.Mesh(
      new THREE.PlaneGeometry(angleInDegrees.length + 2, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.7
      })
    );

    angularTextPlaceholder.position.set(textX, textY, vertex.z);
    angularTextPlaceholder.userData.text = `${angleInDegrees}°`;
    angularTextPlaceholder.userData.isAngularDimensionText = true;

    angularDimensionGroup.add(angularTextPlaceholder);

    // Metadata per compatibilità
    angularDimensionGroup.userData.isCADElement = true;
    angularDimensionGroup.userData.elementId = element.id;
    angularDimensionGroup.userData.elementType = 'angular-dimension';
    angularDimensionGroup.userData.isDimension = true;
    angularDimensionGroup.userData.dimensionType = "angular";
    angularDimensionGroup.userData.dimensionValue = angleInDegrees;

    return angularDimensionGroup;
  }

  /**
   * Crea una dimensione del raggio - IDENTICO all'originale
   */
  static createRadiusDimension(element: MeasurementElement, originOffset: THREE.Vector3): THREE.Group {
    if (!element.center || !element.pointOnCircle) {
      throw new Error('Radius dimension requires center and pointOnCircle');
    }

    const radiusDimensionGroup = new THREE.Group();

    // Points
    const center = new THREE.Vector3(
      element.center.x + originOffset.x,
      element.center.y + originOffset.y,
      (element.center.z || 0) + originOffset.z
    );

    const pointOnCircle = new THREE.Vector3(
      element.pointOnCircle.x + originOffset.x,
      element.pointOnCircle.y + originOffset.y,
      (element.pointOnCircle.z || 0) + originOffset.z
    );

    // Calculate radius
    const radiusVector = new THREE.Vector3().subVectors(pointOnCircle, center);
    const radiusLength = radiusVector.length();

    // Create line from center to point
    const radiusLineGeometry = new THREE.BufferGeometry().setFromPoints([center, pointOnCircle]);

    const radiusLineMaterial = new THREE.LineBasicMaterial({
      color: element.color || 0x000000,
      linewidth: element.linewidth || 1
    });

    const radiusLine = new THREE.Line(radiusLineGeometry, radiusLineMaterial);
    radiusDimensionGroup.add(radiusLine);

    // Add radius text
    const radiusText = `R${radiusLength.toFixed(2)}`;
    const radiusTextPosition = new THREE.Vector3().addVectors(center, radiusVector.clone().multiplyScalar(0.5));

    const radiusTextPlaceholder = new THREE.Mesh(
      new THREE.PlaneGeometry(radiusText.length * 0.8, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.7
      })
    );

    radiusTextPlaceholder.position.copy(radiusTextPosition);
    radiusTextPlaceholder.userData.text = radiusText;
    radiusTextPlaceholder.userData.isRadiusDimensionText = true;

    radiusDimensionGroup.add(radiusTextPlaceholder);

    // Metadata per compatibilità
    radiusDimensionGroup.userData.isCADElement = true;
    radiusDimensionGroup.userData.elementId = element.id;
    radiusDimensionGroup.userData.elementType = 'radius-dimension';
    radiusDimensionGroup.userData.isDimension = true;
    radiusDimensionGroup.userData.dimensionType = "radius";
    radiusDimensionGroup.userData.dimensionValue = radiusLength.toFixed(2);

    return radiusDimensionGroup;
  }

  /**
   * Crea una dimensione del diametro - IDENTICO all'originale
   */
  static createDiameterDimension(element: MeasurementElement, originOffset: THREE.Vector3): THREE.Group {
    if (!element.center || !element.pointOnCircle) {
      throw new Error('Diameter dimension requires center and pointOnCircle');
    }

    const diameterDimensionGroup = new THREE.Group();

    // Points
    const diameterCenter = new THREE.Vector3(
      element.center.x + originOffset.x,
      element.center.y + originOffset.y,
      (element.center.z || 0) + originOffset.z
    );

    const diameterPoint = new THREE.Vector3(
      element.pointOnCircle.x + originOffset.x,
      element.pointOnCircle.y + originOffset.y,
      (element.pointOnCircle.z || 0) + originOffset.z
    );

    // Calculate diameter vector and extend to opposite side
    const diameterVector = new THREE.Vector3().subVectors(diameterPoint, diameterCenter);
    const diameterLength = diameterVector.length() * 2;

    const oppositePoint = diameterCenter.clone().sub(diameterVector);

    // Create line from one side to the other
    const diameterLineGeometry = new THREE.BufferGeometry().setFromPoints([diameterPoint, oppositePoint]);

    const diameterLineMaterial = new THREE.LineBasicMaterial({
      color: element.color || 0x000000,
      linewidth: element.linewidth || 1
    });

    const diameterLine = new THREE.Line(diameterLineGeometry, diameterLineMaterial);
    diameterDimensionGroup.add(diameterLine);

    // Add diameter text
    const diameterText = `Ø${diameterLength.toFixed(2)}`;

    const diameterTextPlaceholder = new THREE.Mesh(
      new THREE.PlaneGeometry(diameterText.length * 0.8, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.7
      })
    );

    diameterTextPlaceholder.position.copy(diameterCenter);
    diameterTextPlaceholder.userData.text = diameterText;
    diameterTextPlaceholder.userData.isDiameterDimensionText = true;

    diameterDimensionGroup.add(diameterTextPlaceholder);

    // Metadata per compatibilità
    diameterDimensionGroup.userData.isCADElement = true;
    diameterDimensionGroup.userData.elementId = element.id;
    diameterDimensionGroup.userData.elementType = 'diameter-dimension';
    diameterDimensionGroup.userData.isDimension = true;
    diameterDimensionGroup.userData.dimensionType = "diameter";
    diameterDimensionGroup.userData.dimensionValue = diameterLength.toFixed(2);

    return diameterDimensionGroup;
  }

  /**
   * Factory method principale - router per tutti i tipi di misurazione
   */
  static create(element: MeasurementElement, originOffset: THREE.Vector3): THREE.Object3D | null {
    try {
      switch (element.type) {
        case 'linear-dimension':
          return this.createLinearDimension(element, originOffset);
        case 'angular-dimension':
          return this.createAngularDimension(element, originOffset);
        case 'radius-dimension':
          return this.createRadiusDimension(element, originOffset);
        case 'diameter-dimension':
          return this.createDiameterDimension(element, originOffset);
        default:
          console.warn(`MeasurementElementsFactory: Tipo non supportato: ${element.type}`);
          return null;
      }
    } catch (error) {
      console.error(`Errore nella creazione dell'elemento di misurazione ${element.type}:`, error);
      return null;
    }
  }

  /**
   * Verifica se un tipo è supportato da questa factory
   */
  static supports(elementType: string): boolean {
    return ['linear-dimension', 'angular-dimension', 'radius-dimension', 'diameter-dimension'].includes(elementType);
  }

  /**
   * Lista di tutti i tipi supportati
   */
  static getSupportedTypes(): string[] {
    return ['linear-dimension', 'angular-dimension', 'radius-dimension', 'diameter-dimension'];
  }
}
