import { cam, segmentsFor } from "@cadcamfun/core";
import { useCADStore } from "../store/cadStore.ts";
import { useElementsStore } from "../store/elementsStore.ts";
import * as THREE from "three";

interface SolidMesh { readonly positions: ArrayLike<number>; readonly indices: ArrayLike<number> }

/** A solid mesh in scene coordinates as a Three mesh (the drawing's origin offset is added; smooth normals are not wanted on a CAD solid). */
const solidObject = (mesh: SolidMesh, element: any, offset: { x: number; y: number; z: number }): THREE.Mesh => {
  const positions = new Float32Array(mesh.positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = mesh.positions[i]! + offset.x;
    positions[i + 1] = mesh.positions[i + 1]! + offset.y;
    positions[i + 2] = mesh.positions[i + 2]! + offset.z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(Array.from(mesh.indices));
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: element.color || 0x4285f4, wireframe: element.wireframe || false });
  return new THREE.Mesh(geometry, material);
};

/** The elements a Boolean depends on, itself included, so a cached result is invalidated when any operand changes. */
const dependencies = (element: any, all: ReadonlyArray<any>, seen = new Set<string>()): any[] => {
  if (seen.has(element.id)) return [];
  seen.add(element.id);
  const out: any[] = [element];
  if (Array.isArray(element.operands)) for (const id of element.operands) {
    const operand = all.find((candidate) => candidate.id === id);
    if (operand) out.push(...dependencies(operand, all, seen));
  }
  return out;
};

const booleanCache = new Map<string, SolidMesh | null>();

/** The solid a Boolean element stands for (cached on its operands), or null when it cannot be formed. */
const booleanSolid = (element: any): SolidMesh | null => {
  const all = useElementsStore.getState().elements;
  const key = JSON.stringify(dependencies(element, all));
  const hit = booleanCache.get(key);
  if (hit !== undefined) return hit;
  let result: SolidMesh | null = null;
  try { result = cam.model.booleanElementMesh(all as any, element)?.mesh ?? null; } catch { result = null; }
  if (booleanCache.size >= 32) booleanCache.delete(booleanCache.keys().next().value as string);
  booleanCache.set(key, result);
  return result;
};

/** The editor never draws a curve with more chords than this by default (an element can ask for more with `segments`). */
const DISPLAY_SEGMENT_CAP = 256;

export const createThreeObject = (element: any): THREE.Object3D | null => {
    const { originOffset, tolerance: documentTolerance } = useCADStore.getState();
    // Round shapes: the element's own `segments`, else enough for its tolerance (its own, else the drawing's), never coarser than 32.
    const seg = (radius: number): number =>
      typeof element.segments === "number" ? element.segments
        : Math.max(32, segmentsFor(Number(radius) || 0, typeof element.tolerance === "number" ? element.tolerance : documentTolerance, DISPLAY_SEGMENT_CAP));
    // Check if element is on a visible layer

    switch (element.type) {
      // ======= BASIC PRIMITIVES =======
      case "cube":
        const cubeGeometry = new THREE.BoxGeometry(element.width, element.height, element.depth);

        const cubeMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x1e88e5,
          wireframe: element.wireframe || false
        });

        const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
        cube.position.set(element.x + originOffset.x, element.y + originOffset.y, (element.z || 0) + originOffset.z);

        return cube;

      case "sphere":
        const sphereGeometry = new THREE.SphereGeometry(element.radius, seg(element.radius), seg(element.radius));

        const sphereMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x1e88e5,
          wireframe: element.wireframe || false
        });

        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere.position.set(element.x + originOffset.x, element.y + originOffset.y, (element.z || 0) + originOffset.z);

        return sphere;

      case "cylinder":
        const cylinderGeometry = new THREE.CylinderGeometry(
          element.radius,
          element.radius,
          element.height,
          seg(element.radius)
        );

        const cylinderMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0xffc107,
          wireframe: element.wireframe || false
        });

        const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
        cylinder.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        // Rotation for standard orientation
        cylinder.rotation.x = Math.PI / 2;
        return cylinder;

      case "cone":
        const coneGeometry = new THREE.ConeGeometry(element.radius, element.height, seg(element.radius));

        const coneMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x9c27b0,
          wireframe: element.wireframe || false
        });

        const cone = new THREE.Mesh(coneGeometry, coneMaterial);
        cone.position.set(element.x + originOffset.x, element.y + originOffset.y, (element.z || 0) + originOffset.z);

        cone.rotation.x = Math.PI / 2;
        return cone;

      case "torus":
        const torusGeometry = new THREE.TorusGeometry(
          element.radius,
          element.tubeRadius || element.radius / 4,
          element.radialSegments || Math.max(16, seg(element.tubeRadius || element.radius / 4)),
          element.tubularSegments || Math.max(100, seg(element.radius + (element.tubeRadius || element.radius / 4)))
        );

        const torusMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0xff9800,
          wireframe: element.wireframe || false
        });

        const torus = new THREE.Mesh(torusGeometry, torusMaterial);
        torus.position.set(element.x + originOffset.x, element.y + originOffset.y, (element.z || 0) + originOffset.z);

        return torus;

      // ======= ADVANCED PRIMITIVES =======
      case "pyramid":
        // Create pyramid geometry using BufferGeometry
        const pyramidGeometry = new THREE.BufferGeometry();

        // Define vertices for a square-based pyramid
        const baseWidth = element.baseWidth || 1;
        const baseDepth = element.baseDepth || 1;
        const pyramidHeight = element.height || 1;

        const vertices = new Float32Array([
          // Base
          -baseWidth / 2,
          -pyramidHeight / 2,
          -baseDepth / 2,
          baseWidth / 2,
          -pyramidHeight / 2,
          -baseDepth / 2,
          baseWidth / 2,
          -pyramidHeight / 2,
          baseDepth / 2,
          -baseWidth / 2,
          -pyramidHeight / 2,
          baseDepth / 2,
          // Apex
          0,
          pyramidHeight / 2,
          0
        ]);

        // Define faces using indices
        const indices = [
          // Base
          0, 1, 2, 0, 2, 3,
          // Sides
          0, 4, 1, 1, 4, 2, 2, 4, 3, 3, 4, 0
        ];

        pyramidGeometry.setIndex(indices);
        pyramidGeometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
        pyramidGeometry.computeVertexNormals();

        const pyramidMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0xe91e63,
          wireframe: element.wireframe || false
        });

        const pyramid = new THREE.Mesh(pyramidGeometry, pyramidMaterial);
        pyramid.position.set(element.x + originOffset.x, element.y + originOffset.y, (element.z || 0) + originOffset.z);

        // Built with its apex on +Y; the scene is Z-up like every other primitive and like the toolpath.
        pyramid.rotation.x = Math.PI / 2;
        return pyramid;

      case "prism":
        // Create prism geometry (like a cylinder with polygon base)
        const sides = element.sides || 6;
        const prismGeometry = new THREE.CylinderGeometry(element.radius, element.radius, element.height, sides);

        const prismMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x3f51b5,
          wireframe: element.wireframe || false
        });

        const prism = new THREE.Mesh(prismGeometry, prismMaterial);
        prism.position.set(element.x + originOffset.x, element.y + originOffset.y, (element.z || 0) + originOffset.z);

        prism.rotation.x = Math.PI / 2;
        return prism;

      case "hemisphere":
        const hemisphereGeometry = new THREE.SphereGeometry(
          element.radius,
          seg(element.radius),
          seg(element.radius),
          0,
          Math.PI * 2,
          0,
          Math.PI / 2
        );

        const hemisphereMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x00bcd4,
          wireframe: element.wireframe || false
        });

        const hemisphere = new THREE.Mesh(hemisphereGeometry, hemisphereMaterial);
        hemisphere.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        // The dome is built on +Y; stand it on Z: up = dome toward +Z, down = toward -Z.
        hemisphere.rotation.x = element.direction === "down" ? -Math.PI / 2 : Math.PI / 2;
        return hemisphere;

      case "ellipsoid":
        // Create sphere and scale it to make an ellipsoid
        const ellipsoidGeometry = new THREE.SphereGeometry(
          1, // We'll scale it
          seg(Math.max(element.radiusX || 0, element.radiusY || 0, element.radiusZ || 0)),
          seg(Math.max(element.radiusX || 0, element.radiusY || 0, element.radiusZ || 0))
        );

        const ellipsoidMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x8bc34a,
          wireframe: element.wireframe || false
        });

        const ellipsoid = new THREE.Mesh(ellipsoidGeometry, ellipsoidMaterial);
        ellipsoid.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        // Scale to create ellipsoid shape
        ellipsoid.scale.set(element.radiusX || 1, element.radiusY || 0.75, element.radiusZ || 0.5);

        return ellipsoid;

      case "capsule":
        // Three.js doesn't have a built-in capsule, so use CapsuleGeometry from three/examples
        // Fallback to cylinder with hemisphere caps if not available
        let capsuleGeometry;

        try {
          // Try to use CapsuleGeometry if available
          capsuleGeometry = new THREE.CapsuleGeometry(
            element.radius || 0.5,
            element.height || 2,
            element.capSegments || 8,
            element.radialSegments || 16
          );
        } catch (e) {
          // Fallback: Create a group with cylinder and two hemispheres
          const capsuleGroup = new THREE.Group();

          const radius = element.radius || 0.5;
          const height = element.height || 2;

          // Cylinder for body
          const bodyCylinder = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius, height, 32),
            new THREE.MeshStandardMaterial({ color: element.color || 0x673ab7 })
          );
          capsuleGroup.add(bodyCylinder);

          // Top hemisphere
          const topHemisphere = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
            new THREE.MeshStandardMaterial({ color: element.color || 0x673ab7 })
          );
          topHemisphere.position.y = height / 2;
          topHemisphere.rotation.x = Math.PI;
          capsuleGroup.add(topHemisphere);

          // Bottom hemisphere
          const bottomHemisphere = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
            new THREE.MeshStandardMaterial({ color: element.color || 0x673ab7 })
          );
          bottomHemisphere.position.y = -height / 2;
          capsuleGroup.add(bottomHemisphere);

          capsuleGroup.position.set(
            element.x + originOffset.x,
            element.y + originOffset.y,
            (element.z || 0) + originOffset.z
          );

          // Set rotation based on direction
          if (element.direction === "x") {
            capsuleGroup.rotation.z = Math.PI / 2;
          } else if (element.direction === "z") {
            capsuleGroup.rotation.x = Math.PI / 2;
          }

          return capsuleGroup;
        }

        // If CapsuleGeometry is available
        const capsuleMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x673ab7,
          wireframe: element.wireframe || false
        });

        const capsule = new THREE.Mesh(capsuleGeometry, capsuleMaterial);
        capsule.position.set(element.x + originOffset.x, element.y + originOffset.y, (element.z || 0) + originOffset.z);

        // Set rotation based on direction
        if (element.direction === "x") {
          capsule.rotation.z = Math.PI / 2;
        } else if (element.direction === "z") {
          capsule.rotation.x = Math.PI / 2;
        }

        return capsule;

      // ======= MEASUREMENT ELEMENTS =======
      case "linear-dimension":
        // Create a linear dimension between two points
        if (!element.startPoint || !element.endPoint) return null; // Checks startPoint/endPoint

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
        const textPlaceholder2 = new THREE.Mesh(
          new THREE.PlaneGeometry(dimensionText.length * 0.8, 1),
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.7
          })
        );

        textPlaceholder2.position.copy(textPosition);
        textPlaceholder2.userData.text = dimensionText;
        textPlaceholder2.userData.isDimensionText = true;

        dimensionGroup.add(textPlaceholder2);

        // Add arrows at the ends of the dimension line
        // This would require custom geometry for proper arrows

        dimensionGroup.userData.isDimension = true;
        dimensionGroup.userData.dimensionType = "linear";
        dimensionGroup.userData.dimensionValue = dimensionValue;
        dimensionGroup.userData.dimensionUnit = dimensionUnit;

        return dimensionGroup;

      case "angular-dimension":
        if (!element.vertex || !element.startPoint || !element.endPoint) return null;

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
        const arcGeometry2 = new THREE.BufferGeometry().setFromPoints(arcPoints);

        const arcMaterial2 = new THREE.LineBasicMaterial({
          color: element.color || 0x000000,
          linewidth: element.linewidth || 1
        });

        const arc2 = new THREE.Line(arcGeometry2, arcMaterial2);
        arc2.position.z = vertex.z;
        angularDimensionGroup.add(arc2);

        // Extension lines from vertex to start/end points
        const angularLine1Geometry = new THREE.BufferGeometry().setFromPoints([vertex, angularStartPoint]);

        const angularLine2Geometry = new THREE.BufferGeometry().setFromPoints([vertex, angularEndPoint]);

        const angularLine1 = new THREE.Line(angularLine1Geometry, arcMaterial2);
        const angularLine2 = new THREE.Line(angularLine2Geometry, arcMaterial2);

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

        angularDimensionGroup.userData.isDimension = true;
        angularDimensionGroup.userData.dimensionType = "angular";
        angularDimensionGroup.userData.dimensionValue = angleInDegrees;

        return angularDimensionGroup;

      case "radius-dimension":
        if (!element.center || !element.pointOnCircle) return null;

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

        radiusDimensionGroup.userData.isDimension = true;
        radiusDimensionGroup.userData.dimensionType = "radius";
        radiusDimensionGroup.userData.dimensionValue = radiusLength.toFixed(2);

        return radiusDimensionGroup;

      case "diameter-dimension":
        if (!element.center || !element.pointOnCircle) return null;

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

        diameterDimensionGroup.userData.isDimension = true;
        diameterDimensionGroup.userData.dimensionType = "diameter";
        diameterDimensionGroup.userData.dimensionValue = diameterLength.toFixed(2);

        return diameterDimensionGroup;

      // ======= DRAWING ELEMENTS =======
      case "drawing-pen":
        if (!element.points || element.points.length < 2) return null;

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
        penLine.userData.isDrawingElement = true;
        penLine.userData.drawingType = "pen";

        return penLine;

      case "drawing-highlighter":
        if (!element.points || element.points.length < 2) return null;

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
        highlighterLine.userData.isDrawingElement = true;
        highlighterLine.userData.drawingType = "highlighter";

        return highlighterLine;

      case "drawing-text":
        if (!element.position || !element.text) return null;

        // Create a placeholder for the text
        // In a real implementation, you would use TextGeometry with loaded fonts
        const drawingTextMaterial = new THREE.MeshBasicMaterial({
          color: element.color || 0x000000,
          transparent: true,
          opacity: 0.9
        });

        // Create a simple plane as placeholder
        const textWidth2 = element.text.length * (element.textSize || 12) * 0.05;
        const textHeight2 = (element.textSize || 12) * 0.1;

        const drawingTextGeometry = new THREE.PlaneGeometry(textWidth2, textHeight2);
        const drawingTextMesh = new THREE.Mesh(drawingTextGeometry, drawingTextMaterial);

        drawingTextMesh.position.set(
          element.position.x + originOffset.x,
          element.position.y + originOffset.y,
          (element.position.z || 0) + originOffset.z
        );

        drawingTextMesh.userData.isDrawingElement = true;
        drawingTextMesh.userData.drawingType = "text";
        drawingTextMesh.userData.text = element.text;
        drawingTextMesh.userData.textSize = element.textSize || 12;
        drawingTextMesh.userData.font = element.font || "Arial";

        return drawingTextMesh;

      case "drawing-eraser":
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
          eraserLine.userData.isDrawingElement = true;
          eraserLine.userData.drawingType = "eraser";

          return eraserLine;
        }
        return null;

      case "drawing-screenshot-area":
        // Visualize screenshot selection area
        if (!element.startPoint || !element.endPoint) return null;

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
        const height2 = Math.abs(endPoint.y - startPoint.y);

        // Create rectangle shape
        const screenshotGeometry = new THREE.PlaneGeometry(width, height2);
        const screenshotMaterial = new THREE.MeshBasicMaterial({
          color: 0x2196f3,
          transparent: true,
          opacity: 0.2,
          side: THREE.DoubleSide
        });

        const screenshotMesh = new THREE.Mesh(screenshotGeometry, screenshotMaterial);

        // Position at center of rectangle
        screenshotMesh.position.set((startPoint.x + endPoint.x) / 2, (startPoint.y + endPoint.y) / 2, startPoint.z);

        // Add border
        const borderGeometry = new THREE.EdgesGeometry(screenshotGeometry);
        const borderMaterial = new THREE.LineBasicMaterial({
          color: 0x2196f3,
          linewidth: 2
        });

        const border = new THREE.LineSegments(borderGeometry, borderMaterial);
        screenshotMesh.add(border);

        screenshotMesh.userData.isDrawingElement = true;
        screenshotMesh.userData.drawingType = "screenshot-area";

        return screenshotMesh;

      // ======= 2D ELEMENTS =======
      case "circle":
        const circleGeometry = new THREE.CircleGeometry(element.radius, seg(element.radius));

        const circleMaterial = new THREE.MeshBasicMaterial({
          color: element.color || 0x000000,
          wireframe: element.wireframe || true,
          side: THREE.DoubleSide
        });

        const circle = new THREE.Mesh(circleGeometry, circleMaterial);
        circle.position.set(element.x + originOffset.x, element.y + originOffset.y, (element.z || 0) + originOffset.z);

        return circle;

      case "rectangle":
        const rectGeometry = new THREE.PlaneGeometry(element.width, element.height);

        const rectMaterial = new THREE.MeshBasicMaterial({
          color: element.color || 0x000000,
          wireframe: element.wireframe || true,
          side: THREE.DoubleSide
        });

        const rect = new THREE.Mesh(rectGeometry, rectMaterial);
        rect.position.set(element.x + originOffset.x, element.y + originOffset.y, (element.z || 0) + originOffset.z);

        if (element.angle) {
          rect.rotation.z = (element.angle * Math.PI) / 180;
        }

        return rect;

      case "triangle":
        const triangleShape = new THREE.Shape();

        // If points are provided, use them
        if (element.points && element.points.length >= 3) {
          triangleShape.moveTo(element.points[0].x, element.points[0].y);
          triangleShape.lineTo(element.points[1].x, element.points[1].y);
          triangleShape.lineTo(element.points[2].x, element.points[2].y);
        } else {
          // Otherwise, create an equilateral triangle
          const size = element.size || 1;
          triangleShape.moveTo(0, size);
          triangleShape.lineTo((-size * Math.sqrt(3)) / 2, -size / 2);
          triangleShape.lineTo((size * Math.sqrt(3)) / 2, -size / 2);
        }

        triangleShape.closePath();

        const triangleGeometry = new THREE.ShapeGeometry(triangleShape);
        const triangleMaterial = new THREE.MeshBasicMaterial({
          color: element.color || 0x000000,
          wireframe: element.wireframe || true,
          side: THREE.DoubleSide
        });

        const triangle = new THREE.Mesh(triangleGeometry, triangleMaterial);
        triangle.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        return triangle;

      case "polygon":
        const polygonShape = new THREE.Shape();

        if (element.points && element.points.length >= 3) {
          // Use provided points
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

        // Only close the path if curves have been added (i.e., moveTo/lineTo was called)
        if (polygonShape.curves.length > 0) {
          polygonShape.closePath();
        }

        const polygonGeometry = new THREE.ShapeGeometry(polygonShape);
        const polygonMaterial = new THREE.MeshBasicMaterial({
          color: element.color || 0x795548,
          wireframe: element.wireframe || true,
          side: THREE.DoubleSide
        });

        const polygon = new THREE.Mesh(polygonGeometry, polygonMaterial);
        polygon.position.set(
          (element.x || 0) + originOffset.x,
          (element.y || 0) + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        return polygon;

      case "ellipse":
        const ellipseShape = new THREE.Shape();
        const rx = element.radiusX || 1;
        const ry = element.radiusY || 0.5;

        // Create ellipse shape
        ellipseShape.ellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);

        const ellipseGeometry = new THREE.ShapeGeometry(ellipseShape);
        const ellipseMaterial = new THREE.MeshBasicMaterial({
          color: element.color || 0x000000,
          wireframe: element.wireframe || true,
          side: THREE.DoubleSide
        });

        const ellipseMesh = new THREE.Mesh(ellipseGeometry, ellipseMaterial);
        ellipseMesh.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        return ellipseMesh;

      case "arc":
        const arcShape = new THREE.Shape();
        const arcRadius = element.radius || 1;
        const startAngle = element.startAngle || 0;
        const endAngle = element.endAngle || Math.PI;

        // Create arc shape
        arcShape.moveTo(0, 0);
        arcShape.lineTo(arcRadius * Math.cos(startAngle), arcRadius * Math.sin(startAngle));
        arcShape.absarc(0, 0, arcRadius, startAngle, endAngle, false);
        arcShape.lineTo(0, 0);

        const arcGeometry = new THREE.ShapeGeometry(arcShape);
        const arcMaterial = new THREE.MeshBasicMaterial({
          color: element.color || 0x000000,
          wireframe: element.wireframe || true,
          side: THREE.DoubleSide
        });

        const arc = new THREE.Mesh(arcGeometry, arcMaterial);
        arc.position.set(element.x + originOffset.x, element.y + originOffset.y, (element.z || 0) + originOffset.z);

        return arc;

      // ======= CURVE ELEMENTS =======
      case "line":
        const lineMaterial = new THREE.LineBasicMaterial({
          color: element.color || 0x000000,
          linewidth: element.linewidth || 1
        });

        const lineGeometry = new THREE.BufferGeometry().setFromPoints([
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
        ]);

        return new THREE.Line(lineGeometry, lineMaterial);

      case "spline":
        if (!element.points || element.points.length < 2) return null;

        // Convert points to Vector3 and apply offset
        const splinePoints = element.points.map(
          (point: any) =>
            new THREE.Vector3(point.x + originOffset.x, point.y + originOffset.y, (point.z || 0) + originOffset.z)
        );

        // Create curve
        const splineCurve = new THREE.CatmullRomCurve3(splinePoints);

        // Sample points along the curve for the line geometry
        const splineDivisions = element.divisions || 50;
        const splineGeometry = new THREE.BufferGeometry().setFromPoints(splineCurve.getPoints(splineDivisions));

        const splineMaterial = new THREE.LineBasicMaterial({
          color: element.color || 0x000000,
          linewidth: element.linewidth || 1
        });

        return new THREE.Line(splineGeometry, splineMaterial);

      case "bezier":
        if (!element.points || element.points.length < 4) return null;

        // For a cubic bezier, we need at least 4 points (start, 2 control points, end)
        const bezierPoints = element.points.map(
          (point: any) =>
            new THREE.Vector3(point.x + originOffset.x, point.y + originOffset.y, (point.z || 0) + originOffset.z)
        );

        // Create cubic bezier curve
        const bezierCurve = new THREE.CubicBezierCurve3(
          bezierPoints[0],
          bezierPoints[1],
          bezierPoints[2],
          bezierPoints[3]
        );

        // Sample points along the curve for the line geometry
        const bezierDivisions = element.divisions || 50;
        const bezierGeometry = new THREE.BufferGeometry().setFromPoints(bezierCurve.getPoints(bezierDivisions));

        const bezierMaterial = new THREE.LineBasicMaterial({
          color: element.color || 0x000000,
          linewidth: element.linewidth || 1
        });

        return new THREE.Line(bezierGeometry, bezierMaterial);

      case "nurbs":
        if (!element.points || element.points.length < 4) return null;

        // This is a simplified NURBS implementation using SplineCurve3
        // For a full NURBS implementation, you'd need additional libraries

        // Convert points to Vector3 and apply offset
        const nurbsPoints = element.points.map(
          (point: any) =>
            new THREE.Vector3(point.x + originOffset.x, point.y + originOffset.y, (point.z || 0) + originOffset.z)
        );

        // Create curve
        const nurbsCurve = new THREE.CatmullRomCurve3(nurbsPoints, false, "centripetal");

        // Sample points along the curve for the line geometry
        const nurbsDivisions = element.divisions || 100;
        const nurbsGeometry = new THREE.BufferGeometry().setFromPoints(nurbsCurve.getPoints(nurbsDivisions));

        const nurbsMaterial = new THREE.LineBasicMaterial({
          color: element.color || 0x000000,
          linewidth: element.linewidth || 1
        });

        return new THREE.Line(nurbsGeometry, nurbsMaterial);

      // ======= TRANSFORMATION OPERATIONS =======
      case "extrusion":
        if (!element.shape && !element.profile) return null;

        const extrudeShape = new THREE.Shape();

        if (element.shape === "rect") {
          const width = element.width || 50;
          const height = element.height || 30;
          extrudeShape.moveTo(-width / 2, -height / 2);
          extrudeShape.lineTo(width / 2, -height / 2);
          extrudeShape.lineTo(width / 2, height / 2);
          extrudeShape.lineTo(-width / 2, height / 2);
          extrudeShape.closePath();
        } else if (element.shape === "circle") {
          const radius = element.radius || 25;
          extrudeShape.absarc(0, 0, radius, 0, Math.PI * 2, false);
        } else if (element.profile && element.profile.length >= 3) {
          const firstPoint = element.profile[0];
          extrudeShape.moveTo(firstPoint.x, firstPoint.y);

          for (let i = 1; i < element.profile.length; i++) {
            extrudeShape.lineTo(element.profile[i].x, element.profile[i].y);
          }

          extrudeShape.closePath();
        }

        const extrudeSettings = {
          depth: element.depth || 10,
          bevelEnabled: element.bevel || false,
          bevelThickness: element.bevelThickness || 1,
          bevelSize: element.bevelSize || 1,
          bevelSegments: element.bevelSegments || 1
        };

        const extrudeGeometry = new THREE.ExtrudeGeometry(extrudeShape, extrudeSettings);
        const extrudeMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x4caf50,
          wireframe: element.wireframe || false
        });

        const extrusion = new THREE.Mesh(extrudeGeometry, extrudeMaterial);
        extrusion.position.set(
          (element.x || 0) + originOffset.x,
          (element.y || 0) + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        return extrusion;

      case "revolution":
        if (!element.profile || element.profile.length < 2) return null;

        // Create a shape from the profile points
        const revolutionPoints = element.profile.map((point: any) => new THREE.Vector2(point.x, point.y));

        // LatheGeometry revolves a shape around an axis
        const revolutionGeometry = new THREE.LatheGeometry(
          revolutionPoints,
          typeof element.segments === "number" ? element.segments : seg(Math.max(0, ...element.profile.map((point: any) => Math.abs(point.x)))),
          element.phiStart || 0,
          element.angle || Math.PI * 2
        );

        const revolutionMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0xff5722,
          wireframe: element.wireframe || false
        });

        const revolution = new THREE.Mesh(revolutionGeometry, revolutionMaterial);
        revolution.position.set(
          (element.x || 0) + originOffset.x,
          (element.y || 0) + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        // Rotate based on the specified axis
        if (element.axis === "x") {
          revolution.rotation.y = Math.PI / 2;
        } else if (element.axis === "y") {
          revolution.rotation.x = Math.PI / 2;
        }

        return revolution;

      case "sweep":
        if (!element.profile || !element.path) return null;

        // This requires the three-csg library or similar for advanced operations
        // Simplified implementation using TubeGeometry

        // Create a shape from the profile
        const sweepShape = new THREE.Shape();
        if (element.profile.length >= 3) {
          sweepShape.moveTo(element.profile[0].x, element.profile[0].y);
          for (let i = 1; i < element.profile.length; i++) {
            sweepShape.lineTo(element.profile[i].x, element.profile[i].y);
          }
          sweepShape.closePath();
        } else {
          // Default to circle if profile not provided properly
          sweepShape.absarc(0, 0, element.radius || 0.5, 0, Math.PI * 2, false);
        }

        // Create a path for the sweep
        const pathPoints = element.path.map((point: any) => new THREE.Vector3(point.x, point.y, point.z || 0));

        const sweepPath = new THREE.CatmullRomCurve3(pathPoints);

        // Create a tube along the path with the shape as cross-section
        // Note: This is a simplification; full sweep would need custom geometry
        const tubeGeometry = new THREE.TubeGeometry(
          sweepPath,
          element.segments || 64,
          element.radius || 0.5,
          element.radialSegments || 8,
          element.closed || false
        );

        const sweepMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x2196f3,
          wireframe: element.wireframe || false
        });

        const sweep = new THREE.Mesh(tubeGeometry, sweepMaterial);
        sweep.position.set(originOffset.x, originOffset.y, originOffset.z);

        return sweep;

      case "loft":
        if (!element.profiles || !element.positions || element.profiles.length < 2) return null;

        // Create a group to hold all sections
        const loftGroup = new THREE.Group();
        loftGroup.position.set(
          (element.x || 0) + originOffset.x,
          (element.y || 0) + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        // Create meshes between consecutive profile sections
        for (let i = 0; i < element.profiles.length - 1; i++) {
          const profileA = element.profiles[i];
          const profileB = element.profiles[i + 1];

          const posA = element.positions[i];
          const posB = element.positions[i + 1];

          // Create simple representation for now (would need custom geometry for proper loft)
          const sectionGeometry = new THREE.CylinderGeometry(
            profileA.radius || 1,
            profileB.radius || 1,
            Math.sqrt(Math.pow(posB.x - posA.x, 2) + Math.pow(posB.y - posA.y, 2) + Math.pow(posB.z - posA.z, 2)),
            32
          );

          const sectionMesh = new THREE.Mesh(
            sectionGeometry,
            new THREE.MeshStandardMaterial({
              color: element.color || 0x9c27b0,
              wireframe: element.wireframe || false
            })
          );

          // Position and orient the section
          const midPoint = {
            x: (posA.x + posB.x) / 2,
            y: (posA.y + posB.y) / 2,
            z: (posA.z + posB.z) / 2
          };

          sectionMesh.position.set(midPoint.x, midPoint.y, midPoint.z);

          // Orient section to point from A to B
          sectionMesh.lookAt(new THREE.Vector3(posB.x, posB.y, posB.z));
          sectionMesh.rotateX(Math.PI / 2);

          loftGroup.add(sectionMesh);
        }

        return loftGroup;

      // ======= BOOLEAN OPERATIONS =======
      case "boolean-union":
      case "boolean-subtract":
      case "boolean-intersect": {
        if (!element.operands || element.operands.length < 2) return null;
        // The real result of the operation on the operands' solids (mesh CSG). Where it cannot be formed (an operand that is not a
        // solid, a missing one) the wireframe marker stays, so the element is still there to select and fix.
        const solid = booleanSolid(element);
        if (solid) {
          const result = solidObject(solid, { color: 0x4caf50, ...element }, originOffset);
          result.userData.isBooleanOperation = true;
          result.userData.operationType = element.type;
          result.userData.operandIds = element.operands;
          return result;
        }
        const booleanPlaceholder = new THREE.Mesh(
          new THREE.SphereGeometry(1, 16, 16),
          new THREE.MeshStandardMaterial({ color: element.color || 0xf44336, wireframe: true, opacity: 0.7, transparent: true })
        );
        booleanPlaceholder.position.set((element.x || 0) + originOffset.x, (element.y || 0) + originOffset.y, (element.z || 0) + originOffset.z);
        booleanPlaceholder.userData.isBooleanOperation = true;
        booleanPlaceholder.userData.operationType = element.type;
        booleanPlaceholder.userData.operandIds = element.operands;
        return booleanPlaceholder;
      }

      // A parametric model: its feature history rebuilt into one solid (the same solid the CAM machines).
      case "parametric": {
        const solid = cam.model.elementMesh(element);
        return solid ? solidObject(solid, { color: 0x26a69a, ...element }, originOffset) : null;
      }

      // ======= INDUSTRIAL ELEMENTS =======
      case "thread":
        // Create a simplified thread representation
        const threadGroup = new THREE.Group();

        // Base cylinder
        const threadBase = new THREE.Mesh(
          new THREE.CylinderGeometry(element.diameter / 2, element.diameter / 2, element.length, 32),
          new THREE.MeshStandardMaterial({
            color: element.color || 0xb0bec5,
            wireframe: element.wireframe || false
          })
        );

        // Thread helix (simplified representation)
        const helixSegments = Math.ceil(element.length / element.pitch) * 8;
        const threadCurvePoints = [];

        for (let i = 0; i <= helixSegments; i++) {
          const t = i / helixSegments;
          const angle = t * (element.length / element.pitch) * Math.PI * 2;
          const radius = element.diameter / 2 + element.pitch * 0.1; // Slightly larger than base
          const x = radius * Math.cos(angle);
          const y = -element.length / 2 + t * element.length;
          const z = radius * Math.sin(angle);

          threadCurvePoints.push(new THREE.Vector3(x, y, z));
        }

        const threadCurve = new THREE.CatmullRomCurve3(threadCurvePoints);
        const threadGeometry = new THREE.TubeGeometry(
          threadCurve,
          helixSegments,
          element.pitch * 0.1, // Thread thickness
          8,
          false
        );

        const threadMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x9e9e9e,
          wireframe: element.wireframe || false
        });

        const threadHelix = new THREE.Mesh(threadGeometry, threadMaterial);

        threadGroup.add(threadBase);
        threadGroup.add(threadHelix);

        // Set handedness rotation
        if (element.handedness === "left") {
          threadHelix.rotation.y = Math.PI;
        }

        threadGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        // Rotate to standard orientation
        threadGroup.rotation.x = Math.PI / 2;

        return threadGroup;

      case "chamfer":
        // Chamfer would normally modify an existing edge
        // For standalone visualization, create a placeholder
        const chamferGroup = new THREE.Group();

        // Create a box with chamfered edges (simplified representation)
        const chamferBaseGeometry = new THREE.BoxGeometry(element.width || 1, element.height || 1, element.depth || 1);

        const chamferBaseMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x607d8b,
          wireframe: element.wireframe || false
        });

        const chamferBase = new THREE.Mesh(chamferBaseGeometry, chamferBaseMaterial);
        chamferGroup.add(chamferBase);

        // Highlight the chamfered edges
        if (element.edges && element.edges.length > 0) {
          const edgesMaterial = new THREE.LineBasicMaterial({
            color: 0xff5722,
            linewidth: 3
          });

          // Here we'd create proper chamfer visualization
          // For now just highlight edges
          const edgesGeometry = new THREE.EdgesGeometry(chamferBaseGeometry);
          const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
          chamferGroup.add(edges);
        }

        chamferGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        return chamferGroup;

      case "fillet":
        // Similar to chamfer, fillets modify existing edges
        // Create a simplified representation
        const filletGroup = new THREE.Group();

        // Create a base geometry
        const filletBaseGeometry = new THREE.BoxGeometry(element.width || 1, element.height || 1, element.depth || 1);

        const filletBaseMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x607d8b,
          wireframe: element.wireframe || false
        });

        const filletBase = new THREE.Mesh(filletBaseGeometry, filletBaseMaterial);
        filletGroup.add(filletBase);

        // Highlight the filleted edges
        if (element.edges && element.edges.length > 0) {
          const filletedEdgesMaterial = new THREE.LineBasicMaterial({
            color: 0x4caf50,
            linewidth: 3
          });

          // Here we'd create proper fillet visualization
          // For now just highlight edges
          const edgesGeometry = new THREE.EdgesGeometry(filletBaseGeometry);
          const edges = new THREE.LineSegments(edgesGeometry, filletedEdgesMaterial);
          filletGroup.add(edges);
        }

        filletGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        return filletGroup;

      case "gear":
        // Create a simplified gear visualization
        const gearGroup = new THREE.Group();

        // Basic parameters
        const moduleValue = element.moduleValue || 1; // Module in mm
        const teeth = element.teeth || 20;
        const thickness = element.thickness || 5;
        const pressureAngle = ((element.pressureAngle || 20) * Math.PI) / 180;

        // Derived parameters
        const pitchDiameter = moduleValue * teeth;
        const pitchRadius = pitchDiameter / 2;
        const baseRadius = pitchRadius * Math.cos(pressureAngle);
        const addendum = moduleValue;
        const dedendum = 1.25 * moduleValue;
        const outerRadius = pitchRadius + addendum;
        const rootRadius = pitchRadius - dedendum;

        // Create the base cylinder
        const gearCylinder = new THREE.Mesh(
          new THREE.CylinderGeometry(pitchRadius, pitchRadius, thickness, 32),
          new THREE.MeshStandardMaterial({
            color: element.color || 0xb0bec5,
            wireframe: element.wireframe || false
          })
        );
        gearGroup.add(gearCylinder);

        // Create teeth (simplified as cylinders)
        for (let i = 0; i < teeth; i++) {
          const angle = (i / teeth) * Math.PI * 2;
          const x = (outerRadius + moduleValue * 0.25) * Math.cos(angle);
          const z = (outerRadius + moduleValue * 0.25) * Math.sin(angle);

          const tooth = new THREE.Mesh(
            new THREE.CylinderGeometry(moduleValue * 0.8, moduleValue * 0.8, thickness, 8),
            new THREE.MeshStandardMaterial({
              color: element.color || 0xb0bec5
            })
          );

          tooth.position.set(x, 0, z);
          gearGroup.add(tooth);
        }

        // Create center hole if specified
        if (element.holeDiameter) {
          const hole = new THREE.Mesh(
            new THREE.CylinderGeometry(element.holeDiameter / 2, element.holeDiameter / 2, thickness + 1, 32),
            new THREE.MeshStandardMaterial({
              color: 0x212121
            })
          );
          gearGroup.add(hole);
        }

        gearGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        // Rotate to standard orientation
        gearGroup.rotation.x = Math.PI / 2;

        return gearGroup;

      case "spring":
        // Create a helical spring
        const springRadius = element.radius || 1;
        const wireRadius = element.wireRadius || 0.1;
        const turns = element.turns || 5;
        const height = element.height || 5;

        const springCurvePoints = [];
        const segments = turns * 16;

        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const angle = t * turns * Math.PI * 2;
          const x = springRadius * Math.cos(angle);
          const y = -height / 2 + t * height;
          const z = springRadius * Math.sin(angle);

          springCurvePoints.push(new THREE.Vector3(x, y, z));
        }

        const springCurve = new THREE.CatmullRomCurve3(springCurvePoints);
        const springGeometry = new THREE.TubeGeometry(springCurve, segments, wireRadius, 8, false);

        const springMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x9e9e9e,
          wireframe: element.wireframe || false
        });

        const spring = new THREE.Mesh(springGeometry, springMaterial);
        spring.position.set(element.x + originOffset.x, element.y + originOffset.y, (element.z || 0) + originOffset.z);

        return spring;

      // ======= ASSEMBLY ELEMENTS =======
      case "screw":
      case "bolt":
        // Create a simplified screw or bolt
        const screwGroup = new THREE.Group();

        // Parse size
        let diameter = 5; // Default 5mm
        if (element.size && typeof element.size === "string") {
          const match = element.size.match(/M(\d+)/i);
          if (match) {
            diameter = parseInt(match[1], 10);
          }
        }

        // Create head
        const headDiameter = diameter * 1.8;
        const headHeight = diameter * 0.8;
        const screwHead = new THREE.Mesh(
          new THREE.CylinderGeometry(headDiameter / 2, headDiameter / 2, headHeight, 32),
          new THREE.MeshStandardMaterial({
            color: element.color || 0x9e9e9e,
            wireframe: element.wireframe || false
          })
        );
        screwHead.position.y = (element.length || 20) / 2 - headHeight / 2;
        screwGroup.add(screwHead);

        // Create shaft
        const shaftLength2 = (element.length || 20) - headHeight;
        const shaft2 = new THREE.Mesh(
          new THREE.CylinderGeometry(diameter / 2, diameter / 2, shaftLength2, 32),
          new THREE.MeshStandardMaterial({
            color: element.color || 0x9e9e9e,
            wireframe: element.wireframe || false
          })
        );
        shaft2.position.y = -shaftLength2 / 2;
        screwGroup.add(shaft2);

        // Add thread detail
        const threadHelixPoints = [];
        const threadSegments = Math.ceil(shaftLength2 / (diameter * 0.2)) * 8;

        for (let i = 0; i <= threadSegments; i++) {
          const t = i / threadSegments;
          const angle = t * (shaftLength2 / (diameter * 0.2)) * Math.PI * 2;
          const radius = diameter / 2 + 0.05;
          const x = radius * Math.cos(angle);
          const y = -shaftLength2 + t * shaftLength2;
          const z = radius * Math.sin(angle);

          threadHelixPoints.push(new THREE.Vector3(x, y, z));
        }

        const threadCurve2 = new THREE.CatmullRomCurve3(threadHelixPoints);
        const threadGeometry2 = new THREE.TubeGeometry(threadCurve2, threadSegments, diameter * 0.05, 8, false);

        const threadMaterial2 = new THREE.MeshStandardMaterial({
          color: element.color || 0x9e9e9e,
          wireframe: element.wireframe || false
        });

        const thread = new THREE.Mesh(threadGeometry2, threadMaterial2);
        screwGroup.add(thread);

        screwGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        // Apply rotation if specified
        if (element.rotation) {
          screwGroup.rotation.x = THREE.MathUtils.degToRad(element.rotation.x || 0);
          screwGroup.rotation.y = THREE.MathUtils.degToRad(element.rotation.y || 0);
          screwGroup.rotation.z = THREE.MathUtils.degToRad(element.rotation.z || 0);
        } else {
          // Default orientation
          screwGroup.rotation.x = Math.PI;
        }

        return screwGroup;

      case "nut":
        // Create a simplified nut
        const nutGroup = new THREE.Group();

        // Parse size
        let nutDiameter = 5; // Default 5mm
        if (element.size && typeof element.size === "string") {
          const match = element.size.match(/M(\d+)/i);
          if (match) {
            nutDiameter = parseInt(match[1], 10);
          }
        }

        // Derived dimensions
        const nutThickness = nutDiameter * 0.8;
        const nutWidth = nutDiameter * 1.8;

        // Create hexagonal prism
        const nutShape = new THREE.Shape();
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2;
          const x = (nutWidth / 2) * Math.cos(angle);
          const y = (nutWidth / 2) * Math.sin(angle);

          if (i === 0) {
            nutShape.moveTo(x, y);
          } else {
            nutShape.lineTo(x, y);
          }
        }
        nutShape.closePath();

        const extrudeSettings2 = {
          depth: nutThickness,
          bevelEnabled: false
        };

        const nutGeometry = new THREE.ExtrudeGeometry(nutShape, extrudeSettings2);
        const nutMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x9e9e9e,
          wireframe: element.wireframe || false
        });

        const nutBody = new THREE.Mesh(nutGeometry, nutMaterial);
        nutBody.rotation.x = Math.PI / 2;
        nutGroup.add(nutBody);

        // Create center hole
        const holeGeometry = new THREE.CylinderGeometry(nutDiameter / 2, nutDiameter / 2, nutThickness + 0.2, 32);

        const holeMaterial = new THREE.MeshBasicMaterial({
          color: 0x000000
        });

        const hole = new THREE.Mesh(holeGeometry, holeMaterial);
        nutGroup.add(hole);

        nutGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        // Apply rotation if specified
        if (element.rotation) {
          nutGroup.rotation.x = THREE.MathUtils.degToRad(element.rotation.x || 0);
          nutGroup.rotation.y = THREE.MathUtils.degToRad(element.rotation.y || 0);
          nutGroup.rotation.z = THREE.MathUtils.degToRad(element.rotation.z || 0);
        }

        return nutGroup;

      case "washer":
        // Create a washer
        let washerDiameter = 5; // Default 5mm
        if (element.size && typeof element.size === "string") {
          const match = element.size.match(/M(\d+)/i);
          if (match) {
            washerDiameter = parseInt(match[1], 10);
          }
        }

        // Derived dimensions
        const outerDiameter = washerDiameter * 2.2;
        const washerThickness = washerDiameter * 0.2;

        // Create washer geometry (toroidal shape)
        const washerGeometry = new THREE.RingGeometry(washerDiameter / 2, outerDiameter / 2, 32, 1);

        const washerMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x9e9e9e,
          wireframe: element.wireframe || false
        });

        const washer = new THREE.Mesh(washerGeometry, washerMaterial);
        washer.position.set(element.x + originOffset.x, element.y + originOffset.y, (element.z || 0) + originOffset.z);

        // Give it thickness
        washer.scale.set(1, 1, washerThickness);

        // Apply rotation if specified
        if (element.rotation) {
          washer.rotation.x = THREE.MathUtils.degToRad(element.rotation.x || 0);
          washer.rotation.y = THREE.MathUtils.degToRad(element.rotation.y || 0);
          washer.rotation.z = THREE.MathUtils.degToRad(element.rotation.z || 0);
        }

        return washer;

      case "rivet":
        // Create a simplified rivet
        const rivetGroup = new THREE.Group();

        const rivetDiameter = element.diameter || 3;
        const rivetLength = element.length || 10;

        // Create head
        const rivetHeadDiameter = rivetDiameter * 2;
        const rivetHeadHeight = rivetDiameter * 0.6;

        const rivetHead = new THREE.Mesh(
          new THREE.CylinderGeometry(rivetHeadDiameter / 2, rivetHeadDiameter / 2, rivetHeadHeight, 32),
          new THREE.MeshStandardMaterial({
            color: element.color || 0x9e9e9e,
            wireframe: element.wireframe || false
          })
        );
        rivetHead.position.y = rivetLength / 2 - rivetHeadHeight / 2;
        rivetGroup.add(rivetHead);

        // Create shaft
        const shaftLength = rivetLength - rivetHeadHeight;
        const shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(rivetDiameter / 2, rivetDiameter / 2, shaftLength, 32),
          new THREE.MeshStandardMaterial({
            color: element.color || 0x9e9e9e,
            wireframe: element.wireframe || false
          })
        );
        shaft.position.y = -shaftLength / 2;
        rivetGroup.add(shaft);

        rivetGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        // Apply rotation if specified
        if (element.rotation) {
          rivetGroup.rotation.x = THREE.MathUtils.degToRad(element.rotation.x || 0);
          rivetGroup.rotation.y = THREE.MathUtils.degToRad(element.rotation.y || 0);
          rivetGroup.rotation.z = THREE.MathUtils.degToRad(element.rotation.z || 0);
        } else {
          // Default orientation
          rivetGroup.rotation.x = Math.PI;
        }

        return rivetGroup;

      // ======= ARCHITECTURAL ELEMENTS =======
      case "wall":
        const wallLength = element.length || 100;
        const wallHeight = element.height || 30;
        const wallThickness = element.thickness || 5;

        const wallGeometry = new THREE.BoxGeometry(wallLength, wallHeight, wallThickness);
        const wallMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0xe0e0e0,
          wireframe: element.wireframe || false
        });

        const wall = new THREE.Mesh(wallGeometry, wallMaterial);

        // Position wall with bottom at y=0 by default
        wall.position.set(
          (element.x || 0) + originOffset.x,
          (element.y || wallHeight / 2) + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        // Add openings if specified
        if (element.openings && Array.isArray(element.openings)) {
          // This would require CSG operations for proper holes
          // For now, we'll just add visual markers for the openings
          element.openings.forEach((opening: any) => {
            const openingMaterial = new THREE.MeshBasicMaterial({
              color: 0x000000,
              wireframe: true
            });

            const openingGeometry = new THREE.BoxGeometry(
              opening.width || 10,
              opening.height || 20,
              wallThickness + 0.2
            );

            const openingMesh = new THREE.Mesh(openingGeometry, openingMaterial);

            openingMesh.position.set(opening.x || 0, opening.y || 0, 0);

            wall.add(openingMesh);
          });
        }

        return wall;

      case "floor":
        const floorWidth = element.width || 100;
        const floorLength = element.length || 100;
        const floorThickness = element.thickness || 2;

        const floorGeometry = new THREE.BoxGeometry(floorWidth, floorThickness, floorLength);
        const floorMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0xbcaaa4,
          wireframe: element.wireframe || false
        });

        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.position.set(
          (element.x || 0) + originOffset.x,
          (element.y || 0) + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        return floor;

      case "roof":
        const roofWidth = element.width || 100;
        const roofLength = element.length || 100;
        const roofHeight = element.height || 20;
        const roofStyle = element.style || "pitched";

        const roofGroup = new THREE.Group();
        roofGroup.position.set(
          (element.x || 0) + originOffset.x,
          (element.y || 0) + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        if (roofStyle === "flat") {
          // Flat roof is just a box
          const flatRoofGeometry = new THREE.BoxGeometry(roofWidth, roofHeight / 4, roofLength);
          const flatRoofMaterial = new THREE.MeshStandardMaterial({
            color: element.color || 0x795548,
            wireframe: element.wireframe || false
          });

          const flatRoof = new THREE.Mesh(flatRoofGeometry, flatRoofMaterial);
          roofGroup.add(flatRoof);
        } else if (roofStyle === "pitched") {
          // Create a pitched roof (triangle extrusion)
          const pitchedRoofShape = new THREE.Shape();
          pitchedRoofShape.moveTo(-roofWidth / 2, 0);
          pitchedRoofShape.lineTo(roofWidth / 2, 0);
          pitchedRoofShape.lineTo(0, roofHeight);
          pitchedRoofShape.closePath();

          const extrudeSettings = {
            depth: roofLength,
            bevelEnabled: false
          };

          const pitchedRoofGeometry = new THREE.ExtrudeGeometry(pitchedRoofShape, extrudeSettings);
          const pitchedRoofMaterial = new THREE.MeshStandardMaterial({
            color: element.color || 0x795548,
            wireframe: element.wireframe || false
          });

          const pitchedRoof = new THREE.Mesh(pitchedRoofGeometry, pitchedRoofMaterial);
          pitchedRoof.rotation.x = -Math.PI / 2;
          pitchedRoof.position.z = -roofLength / 2;
          roofGroup.add(pitchedRoof);
        }

        return roofGroup;

      case "window":
        const windowWidth = element.width || 10;
        const windowHeight = element.height || 15;
        const windowThickness = element.thickness || 0.5;
        const windowStyle = element.style || "simple";

        const windowGroup = new THREE.Group();

        // Create window frame
        const frameGeometry = new THREE.BoxGeometry(windowWidth, windowHeight, windowThickness);
        const frameMaterial = new THREE.MeshStandardMaterial({
          color: element.frameColor || 0x8d6e63,
          wireframe: element.wireframe || false
        });

        const frame = new THREE.Mesh(frameGeometry, frameMaterial);
        windowGroup.add(frame);

        // Create glass
        const glassWidth = windowWidth * 0.8;
        const glassHeight = windowHeight * 0.8;

        const glassGeometry = new THREE.BoxGeometry(glassWidth, glassHeight, windowThickness * 0.2);
        const glassMaterial = new THREE.MeshStandardMaterial({
          color: 0xb3e5fc,
          transparent: true,
          opacity: 0.6,
          wireframe: element.wireframe || false
        });

        const glass = new THREE.Mesh(glassGeometry, glassMaterial);
        glass.position.z = windowThickness * 0.3;
        windowGroup.add(glass);

        // Add window details based on style
        if (windowStyle === "divided") {
          // Add dividers
          const dividerWidth = windowWidth * 0.05;
          const horizontalDivider = new THREE.Mesh(
            new THREE.BoxGeometry(glassWidth + dividerWidth, dividerWidth, windowThickness * 0.4),
            frameMaterial
          );
          horizontalDivider.position.z = windowThickness * 0.3;
          windowGroup.add(horizontalDivider);
          const verticalDivider = new THREE.Mesh(
            new THREE.BoxGeometry(dividerWidth, glassHeight + dividerWidth, windowThickness * 0.4),
            frameMaterial
          );
          verticalDivider.position.z = windowThickness * 0.3;
          windowGroup.add(verticalDivider);
        }

        windowGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        return windowGroup;

      case "door":
        const doorWidth = element.width || 10;
        const doorHeight = element.height || 20;
        const doorThickness = element.thickness || 1;
        const doorStyle = element.style || "simple";

        const doorGroup = new THREE.Group();

        // Create door panel
        const doorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, doorThickness);
        const doorMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x8d6e63,
          wireframe: element.wireframe || false
        });

        const door = new THREE.Mesh(doorGeometry, doorMaterial);
        doorGroup.add(door);

        // Add details based on style
        if (doorStyle === "paneled") {
          // Add panels
          const panelDepth = doorThickness * 0.3;
          const panelWidth = doorWidth * 0.7;
          const panelHeight = doorHeight * 0.25;

          const topPanel = new THREE.Mesh(new THREE.BoxGeometry(panelWidth, panelHeight, panelDepth), doorMaterial);
          topPanel.position.y = doorHeight * 0.25;
          topPanel.position.z = -doorThickness * 0.2;
          doorGroup.add(topPanel);

          const bottomPanel = new THREE.Mesh(new THREE.BoxGeometry(panelWidth, panelHeight, panelDepth), doorMaterial);
          bottomPanel.position.y = -doorHeight * 0.25;
          bottomPanel.position.z = -doorThickness * 0.2;
          doorGroup.add(bottomPanel);
        }

        // Add doorknob
        const doorknob = new THREE.Mesh(
          new THREE.SphereGeometry(doorWidth * 0.08, 16, 16),
          new THREE.MeshStandardMaterial({
            color: 0xffd700,
            wireframe: element.wireframe || false
          })
        );
        doorknob.position.x = doorWidth * 0.4;
        doorknob.position.z = doorThickness * 0.6;
        doorGroup.add(doorknob);

        doorGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        return doorGroup;

      case "stair":
        const stairWidth = element.width || 10;
        const stairHeight = element.height || 20;
        const stairDepth = element.depth || 30;
        const stepsCount = element.steps || 10;

        const stairGroup = new THREE.Group();

        // Create individual steps
        const stepWidth = stairWidth;
        const stepHeight = stairHeight / stepsCount;
        const stepDepth = stairDepth / stepsCount;

        for (let i = 0; i < stepsCount; i++) {
          const stepGeometry = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
          const stepMaterial = new THREE.MeshStandardMaterial({
            color: element.color || 0xbcaaa4,
            wireframe: element.wireframe || false
          });

          const step = new THREE.Mesh(stepGeometry, stepMaterial);
          step.position.y = i * stepHeight + stepHeight / 2;
          step.position.z = i * stepDepth + stepDepth / 2;

          stairGroup.add(step);
        }

        stairGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        return stairGroup;

      case "column":
        const columnRadius = element.radius || 5;
        const columnHeight = element.height || 30;
        const columnStyle = element.style || "simple";

        const columnGroup = new THREE.Group();

        // Create base column
        const columnGeometry = new THREE.CylinderGeometry(columnRadius, columnRadius, columnHeight, 20);
        const columnMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0xe0e0e0,
          wireframe: element.wireframe || false
        });

        const column = new THREE.Mesh(columnGeometry, columnMaterial);
        columnGroup.add(column);

        // Add details based on style
        if (columnStyle === "doric" || columnStyle === "ionic" || columnStyle === "corinthian") {
          // Add base
          const baseHeight = columnHeight * 0.05;
          const baseRadius = columnRadius * 1.2;

          const base = new THREE.Mesh(
            new THREE.CylinderGeometry(baseRadius, baseRadius, baseHeight, 20),
            columnMaterial
          );
          base.position.y = -columnHeight / 2 + baseHeight / 2;
          columnGroup.add(base);

          // Add capital
          const capitalHeight = columnHeight * 0.05;
          const capitalRadius = columnRadius * 1.2;

          const capital = new THREE.Mesh(
            new THREE.CylinderGeometry(capitalRadius, capitalRadius, capitalHeight, 20),
            columnMaterial
          );
          capital.position.y = columnHeight / 2 - capitalHeight / 2;
          columnGroup.add(capital);

          // For more elaborate styles, add fluting (vertical grooves)
          if (columnStyle === "ionic" || columnStyle === "corinthian") {
            // Add simplified decoration to capital
            const decorationRadius = capitalRadius * 1.1;
            const decoration = new THREE.Mesh(
              new THREE.CylinderGeometry(decorationRadius, capitalRadius, capitalHeight * 0.5, 20),
              columnMaterial
            );
            decoration.position.y = columnHeight / 2 + capitalHeight * 0.25;
            columnGroup.add(decoration);
          }
        }

        columnGroup.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        return columnGroup;

      // ======= SPECIAL ELEMENTS =======
      case "text3d":
        // Three.js requires loading fonts for proper TextGeometry
        // For a placeholder, we'll create a plane with the text content
        const textWidth = element.text ? element.text.length * element.height * 0.6 : 10;
        const textHeight = element.height || 5;
        const textDepth = element.depth || 2;

        const textPlaceholder = new THREE.Mesh(
          new THREE.BoxGeometry(textWidth, textHeight, textDepth),
          new THREE.MeshStandardMaterial({
            color: element.color || 0x4285f4,
            wireframe: element.wireframe || false
          })
        );

        textPlaceholder.position.set(
          element.x + originOffset.x,
          element.y + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        textPlaceholder.userData.text = element.text;
        textPlaceholder.userData.isTextPlaceholder = true;

        return textPlaceholder;

      case "path3d":
        if (!element.points || element.points.length < 2) return null;

        // Create a path from the points
        const pathVectors = element.points.map(
          (point: any) =>
            new THREE.Vector3(point.x + originOffset.x, point.y + originOffset.y, (point.z || 0) + originOffset.z)
        );

        const path = new THREE.CatmullRomCurve3(pathVectors);

        // Create geometry and material
        const pathGeometry = new THREE.TubeGeometry(
          path,
          element.segments || 64,
          element.radius || 0.5,
          element.radialSegments || 8,
          element.closed || false
        );

        const pathMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x4285f4,
          wireframe: element.wireframe || false
        });

        const pathMesh = new THREE.Mesh(pathGeometry, pathMaterial);

        return pathMesh;

      case "point-cloud":
        if (!element.points || !Array.isArray(element.points)) return null;

        // Create a point cloud from the points
        const pointPositions = new Float32Array(element.points.length * 3);

        element.points.forEach((point: any, i: number) => {
          pointPositions[i * 3] = point.x + originOffset.x;
          pointPositions[i * 3 + 1] = point.y + originOffset.y;
          pointPositions[i * 3 + 2] = (point.z || 0) + originOffset.z;
        });

        const pointGeometry = new THREE.BufferGeometry();
        pointGeometry.setAttribute("position", new THREE.BufferAttribute(pointPositions, 3));

        // If color data is provided, use it
        if (element.colors && Array.isArray(element.colors)) {
          const colors = new Float32Array(element.colors.length * 3);

          element.colors.forEach((color: any, i: number) => {
            colors[i * 3] = color.r || 0.5;
            colors[i * 3 + 1] = color.g || 0.5;
            colors[i * 3 + 2] = color.b || 0.5;
          });

          pointGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        }

        const pointMaterial = new THREE.PointsMaterial({
          color: element.color || 0x4285f4,
          size: element.pointSize || 0.5,
          sizeAttenuation: true,
          vertexColors: element.colors ? true : false
        });

        const pointCloud = new THREE.Points(pointGeometry, pointMaterial);

        return pointCloud;

      case "mesh":
        // For a custom mesh, we need vertices and faces data
        if (!element.vertices || !element.faces) return null;

        const meshGeometry = new THREE.BufferGeometry();

        // Convert vertices to Float32Array
        const vertices2 = new Float32Array(element.vertices.length * 3);
        element.vertices.forEach((vertex: any, i: number) => {
          vertices2[i * 3] = vertex.x + originOffset.x;
          vertices2[i * 3 + 1] = vertex.y + originOffset.y;
          vertices2[i * 3 + 2] = (vertex.z || 0) + originOffset.z;
        });

        // Convert faces to indices
        const indices2: number[] = [];
        element.faces.forEach((face: any) => {
          if (Array.isArray(face) && face.length >= 3) {
            // Basic triangles
            indices2.push(face[0], face[1], face[2]);

            // If more than 3 vertices (quad or n-gon), triangulate
            for (let i = 3; i < face.length; i++) {
              indices2.push(face[0], face[i - 1], face[i]);
            }
          }
        });

        meshGeometry.setIndex(indices2);
        meshGeometry.setAttribute("position", new THREE.BufferAttribute(vertices2, 3));
        meshGeometry.computeVertexNormals();

        const meshMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x4285f4,
          wireframe: element.wireframe || false
        });

        const mesh = new THREE.Mesh(meshGeometry, meshMaterial);
        ensureObjectMetadata(mesh, element.id);
        return mesh;

      case "group":
        const group = new THREE.Group();
        group.position.set(
          (element.x || 0) + originOffset.x,
          (element.y || 0) + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        // Add child elements if provided
        if (element.elements && Array.isArray(element.elements)) {
          element.elements.forEach((childElement: any) => {
            // Set zero origin offset for children to avoid double-offset
            const childThreeObject = createThreeObject({
              ...childElement,
              x: childElement.x || 0,
              y: childElement.y || 0,
              z: childElement.z || 0
            });

            if (childThreeObject) {
              childThreeObject.userData.isCADElement = true;
              childThreeObject.userData.elementId = childElement.id;
              group.add(childThreeObject);
            }
          });
        }

        return group;

      case "workpiece":
        // Create a transparent cube to represent the raw workpiece
        const workpieceGeometry = new THREE.BoxGeometry(element.width, element.height, element.depth);

        const workpieceMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0xaaaaaa,
          wireframe: element.wireframe || false,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide
        });

        const workpiece = new THREE.Mesh(workpieceGeometry, workpieceMaterial);
        workpiece.position.set(
          (element.x || 0) + originOffset.x,
          (element.y || 0) + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        if (!element.wireframe) {
          const edgesGeometry = new THREE.EdgesGeometry(workpieceGeometry);
          const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
          const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
          workpiece.add(edges);
        }

        return workpiece;

      case "component":
        const componentThreeGroup = new THREE.Group();
        componentThreeGroup.position.set(
          (element.x || 0) + originOffset.x,
          (element.y || 0) + originOffset.y,
          (element.z || 0) + originOffset.z
        );

        // Ensure main group has proper metadata for selection
        componentThreeGroup.userData.isCADElement = true;
        componentThreeGroup.userData.elementId = element.id;
        componentThreeGroup.userData.isComponent = true;

        // Add child elements if provided
        if (element.elements && Array.isArray(element.elements)) {
          element.elements.forEach((childElement: any) => {
            // Set zero origin offset for children to avoid double-offset
            const childThreeObject = createThreeObject({
              ...childElement,
              x: childElement.x || 0,
              y: childElement.y || 0,
              z: childElement.z || 0
            });

            if (childThreeObject) {
              // Ensure children have the component's ID for selection
              childThreeObject.userData.isCADElement = true;
              childThreeObject.userData.elementId = element.id;
              childThreeObject.userData.isComponentChild = true;
              childThreeObject.userData.parentComponentId = element.id;
              componentThreeGroup.add(childThreeObject);
            }
          });
        } else if (element.data?.elements && Array.isArray(element.data.elements)) {
          // Try to get elements from element.data if available
          element.data.elements.forEach((childElement: any) => {
            const childThreeObject = createThreeObject({
              ...childElement,
              x: childElement.x || 0,
              y: childElement.y || 0,
              z: childElement.z || 0
            });

            if (childThreeObject) {
              childThreeObject.userData.isCADElement = true;
              childThreeObject.userData.elementId = element.id;
              childThreeObject.userData.isComponentChild = true;
              childThreeObject.userData.parentComponentId = element.id;
              componentThreeGroup.add(childThreeObject);
            }
          });
        } else {
          // If no elements are found, create a visual placeholder
          console.log("Creating placeholder for component with no elements:", element.id);

          const placeholderGeometry = new THREE.BoxGeometry(
            element.width || 50,
            element.height || 50,
            element.depth || 50
          );

          const placeholderMaterial = new THREE.MeshStandardMaterial({
            color: element.color || 0x3f51b5,
            wireframe: true,
            opacity: 0.7,
            transparent: true
          });

          const placeholder = new THREE.Mesh(placeholderGeometry, placeholderMaterial);
          placeholder.userData.isCADElement = true;
          placeholder.userData.elementId = element.id;
          placeholder.userData.isComponentPlaceholder = true;
          componentThreeGroup.add(placeholder);
        }

        return componentThreeGroup;

      default:
        console.warn(`Unknown element type: ${element.type}`);
        return null;
    }
  };

  const ensureObjectMetadata = (object: THREE.Object3D, elementId: string) => {
    // Imposta i metadata sull'oggetto principale
    object.userData.isCADElement = true;
    object.userData.elementId = elementId;

    // Propaga i metadata a tutti i figli
    object.traverse(child => {
      if (child !== object) {
        child.userData.isCADElement = true;
        child.userData.elementId = elementId;
        child.userData.isChild = true; // Opzionale: per distinguere i figli
      }
    });
  };



  