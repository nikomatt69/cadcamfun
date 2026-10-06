/**
 * Edit handles of the selected element: the little spheres drawn at its vertices, centre and size controls, and the
 * rules that turn a handle drag into element parameter updates. Pure Three.js and store code, no UI framework.
 */
import * as THREE from "three"
import { useCADStore } from "../store/cadStore.ts"
import { useElementsStore } from "../store/elementsStore.ts"

/* eslint-disable @typescript-eslint/no-explicit-any */
  export const createControlPointsForElement = (element: any): THREE.Object3D[] => {
  const { originOffset } = useCADStore.getState();
    const controlPoints: THREE.Object3D[] = [];
    // Create smaller control points (reduced size from 5 to 3)
    const pointGeometry = new THREE.SphereGeometry(3, 12, 12);
    const pointMaterial = new THREE.MeshBasicMaterial({ color: 0xff3366 });

    switch (element.type) {
      case "line":
        // Create control points for line endpoints
        const point1 = new THREE.Mesh(pointGeometry, pointMaterial);
        point1.position.set(element.x1, element.y1, element.z1 || 0);
        point1.userData.isControlPoint = true;
        point1.userData.elementId = element.id;
        point1.userData.pointIndex = 0; // First endpoint
        point1.userData.controlFor = "line";

        const point2 = new THREE.Mesh(pointGeometry, pointMaterial);
        point2.position.set(element.x2, element.y2, element.z2 || 0);
        point2.userData.isControlPoint = true;
        point2.userData.elementId = element.id;
        point2.userData.pointIndex = 1; // Second endpoint
        point2.userData.controlFor = "line";

        controlPoints.push(point1, point2);
        break;

      case "rectangle":
        // Create control points for rectangle corners and midpoints
        const halfWidth = element.width / 2;
        const halfHeight = element.height / 2;
        const rotationRad = ((element.angle || 0) * Math.PI) / 180;

        // Helper function to calculate rotated position
        const getRotatedPos = (x: number, y: number) => {
          const cos = Math.cos(rotationRad);
          const sin = Math.sin(rotationRad);
          const xRot = x * cos - y * sin + element.x;
          const yRot = x * sin + y * cos + element.y;
          return { x: xRot, y: yRot };
        };

        // Corner points
        const corners = [
          getRotatedPos(-halfWidth, -halfHeight), // Top-left
          getRotatedPos(halfWidth, -halfHeight), // Top-right
          getRotatedPos(halfWidth, halfHeight), // Bottom-right
          getRotatedPos(-halfWidth, halfHeight) // Bottom-left
        ];

        corners.forEach((pos, idx) => {
          const point = new THREE.Mesh(pointGeometry, pointMaterial);
          point.position.set(pos.x, pos.y, element.z || 0);
          point.userData.isControlPoint = true;
          point.userData.elementId = element.id;
          point.userData.pointIndex = idx;
          point.userData.controlFor = "rectangle";
          point.userData.isCorner = true;
          controlPoints.push(point);
        });

        // Midpoints
        const midpoints = [
          getRotatedPos(0, -halfHeight), // Top
          getRotatedPos(halfWidth, 0), // Right
          getRotatedPos(0, halfHeight), // Bottom
          getRotatedPos(-halfWidth, 0) // Left
        ];

        midpoints.forEach((pos, idx) => {
          const point = new THREE.Mesh(pointGeometry, pointMaterial);
          point.position.set(pos.x, pos.y, element.z || 0);
          point.userData.isControlPoint = true;
          point.userData.elementId = element.id;
          point.userData.pointIndex = idx + 4; // Offset after corners
          point.userData.controlFor = "rectangle";
          point.userData.isMidpoint = true;
          controlPoints.push(point);
        });

        // Rotation handle - slightly smaller than in the previous implementation
        const rotationPoint = new THREE.Mesh(
          new THREE.CylinderGeometry(2, 2, 10, 12),
          new THREE.MeshBasicMaterial({ color: 0x00aaff })
        );
        const rotHandlePos = getRotatedPos(0, -halfHeight - 15);
        rotationPoint.position.set(rotHandlePos.x, rotHandlePos.y, element.z || 0);
        rotationPoint.userData.isControlPoint = true;
        rotationPoint.userData.elementId = element.id;
        rotationPoint.userData.pointIndex = 8;
        rotationPoint.userData.controlFor = "rectangle";
        rotationPoint.userData.isRotationHandle = true;
        controlPoints.push(rotationPoint);
        break;

      case "circle":
        // Create control points for circle - center and radius points
        const centerPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        centerPoint.position.set(element.x, element.y, element.z || 0);
        centerPoint.userData.isControlPoint = true;
        centerPoint.userData.elementId = element.id;
        centerPoint.userData.pointIndex = 0;
        centerPoint.userData.controlFor = "circle";
        centerPoint.userData.isCenter = true;

        // Points at cardinal directions for radius control
        const radiusPoints = [];
        for (let i = 0; i < 4; i++) {
          const angle = (i * Math.PI) / 2;
          const radiusPoint = new THREE.Mesh(pointGeometry, pointMaterial);
          radiusPoint.position.set(
            element.x + element.radius * Math.cos(angle),
            element.y + element.radius * Math.sin(angle),
            element.z || 0
          );
          radiusPoint.userData.isControlPoint = true;
          radiusPoint.userData.elementId = element.id;
          radiusPoint.userData.pointIndex = i + 1;
          radiusPoint.userData.controlFor = "circle";
          radiusPoint.userData.isRadiusControl = true;
          radiusPoints.push(radiusPoint);
        }

        controlPoints.push(centerPoint, ...radiusPoints);
        break;

      case "cube":
        // Create control points for cube - center and size controls
        const cubeCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        cubeCenter.position.set(element.x, element.y, element.z || 0);
        cubeCenter.userData.isControlPoint = true;
        cubeCenter.userData.elementId = element.id;
        cubeCenter.userData.pointIndex = 0;
        cubeCenter.userData.controlFor = "cube";
        cubeCenter.userData.isCenter = true;

        // Eight corners of the cube
        const corners3D = [];
        for (let i = 0; i < 8; i++) {
          const xSign = i & 1 ? 1 : -1;
          const ySign = i & 2 ? 1 : -1;
          const zSign = i & 4 ? 1 : -1;

          const cornerPoint = new THREE.Mesh(pointGeometry, pointMaterial);
          cornerPoint.position.set(
            element.x + (xSign * element.width) / 2,
            element.y + (ySign * element.height) / 2,
            element.z + (zSign * element.depth) / 2
          );
          cornerPoint.userData.isControlPoint = true;
          cornerPoint.userData.elementId = element.id;
          cornerPoint.userData.pointIndex = i + 1;
          cornerPoint.userData.controlFor = "cube";
          cornerPoint.userData.isCorner = true;
          corners3D.push(cornerPoint);
        }

        controlPoints.push(cubeCenter, ...corners3D);
        break;

      case "sphere":
        // Create control points for sphere - center and radius controls
        const sphereCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        sphereCenter.position.set(element.x, element.y, element.z || 0);
        sphereCenter.userData.isControlPoint = true;
        sphereCenter.userData.elementId = element.id;
        sphereCenter.userData.pointIndex = 0;
        sphereCenter.userData.controlFor = "sphere";
        sphereCenter.userData.isCenter = true;

        // Six direction controls for radius
        const directions = [
          [1, 0, 0],
          [-1, 0, 0], // X axis
          [0, 1, 0],
          [0, -1, 0], // Y axis
          [0, 0, 1],
          [0, 0, -1] // Z axis
        ];

        const radiusControls = directions.map((dir, idx) => {
          const radiusPoint = new THREE.Mesh(pointGeometry, pointMaterial);
          radiusPoint.position.set(
            element.x + dir[0]! * element.radius,
            element.y + dir[1]! * element.radius,
            element.z + dir[2]! * element.radius
          );
          radiusPoint.userData.isControlPoint = true;
          radiusPoint.userData.elementId = element.id;
          radiusPoint.userData.pointIndex = idx + 1;
          radiusPoint.userData.controlFor = "sphere";
          radiusPoint.userData.isRadiusControl = true;
          radiusPoint.userData.direction = dir;
          return radiusPoint;
        });

        controlPoints.push(sphereCenter, ...radiusControls);
        break;

      case "cylinder":
        // Create control points for cylinder
        const cylinderCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        cylinderCenter.position.set(element.x, element.y, element.z || 0);
        cylinderCenter.userData.isControlPoint = true;
        cylinderCenter.userData.elementId = element.id;
        cylinderCenter.userData.pointIndex = 0;
        cylinderCenter.userData.controlFor = "cylinder";

        // Radius control point
        const cylinderRadiusPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        cylinderRadiusPoint.position.set(element.x + element.radius, element.y, element.z || 0);
        cylinderRadiusPoint.userData.isControlPoint = true;
        cylinderRadiusPoint.userData.elementId = element.id;
        cylinderRadiusPoint.userData.pointIndex = 1;
        cylinderRadiusPoint.userData.controlFor = "cylinder";

        // Height control points
        const topPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        topPoint.position.set(element.x, element.y, element.z + element.height / 2);
        topPoint.userData.isControlPoint = true;
        topPoint.userData.elementId = element.id;
        topPoint.userData.pointIndex = 2;
        topPoint.userData.controlFor = "cylinder";

        const bottomPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        bottomPoint.position.set(element.x, element.y, element.z - element.height / 2);
        bottomPoint.userData.isControlPoint = true;
        bottomPoint.userData.elementId = element.id;
        bottomPoint.userData.pointIndex = 3;
        bottomPoint.userData.controlFor = "cylinder";

        controlPoints.push(cylinderCenter, cylinderRadiusPoint, topPoint, bottomPoint);
        break;

      case "cone":
        // Create control points for cone
        const coneBaseCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        coneBaseCenter.position.set(element.x, element.y, element.z || 0);
        coneBaseCenter.userData.isControlPoint = true;
        coneBaseCenter.userData.elementId = element.id;
        coneBaseCenter.userData.pointIndex = 0;
        coneBaseCenter.userData.controlFor = "cone";

        // Base radius control point
        const coneRadiusPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        coneRadiusPoint.position.set(element.x + element.radius, element.y, element.z || 0);
        coneRadiusPoint.userData.isControlPoint = true;
        coneRadiusPoint.userData.elementId = element.id;
        coneRadiusPoint.userData.pointIndex = 1;
        coneRadiusPoint.userData.controlFor = "cone";

        // Tip (height) control point
        const coneTipPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        coneTipPoint.position.set(element.x, element.y, element.z + element.height);
        coneTipPoint.userData.isControlPoint = true;
        coneTipPoint.userData.elementId = element.id;
        coneTipPoint.userData.pointIndex = 2;
        coneTipPoint.userData.controlFor = "cone";

        controlPoints.push(coneBaseCenter, coneRadiusPoint, coneTipPoint);
        break;

      case "torus":
        // Create control points for torus
        const torusCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        torusCenter.position.set(element.x, element.y, element.z || 0);
        torusCenter.userData.isControlPoint = true;
        torusCenter.userData.elementId = element.id;
        torusCenter.userData.pointIndex = 0;
        torusCenter.userData.controlFor = "torus";

        // Main radius control point
        const mainRadiusPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        mainRadiusPoint.position.set(element.x + element.radius, element.y, element.z || 0);
        mainRadiusPoint.userData.isControlPoint = true;
        mainRadiusPoint.userData.elementId = element.id;
        mainRadiusPoint.userData.pointIndex = 1;
        mainRadiusPoint.userData.controlFor = "torus";

        // Tube radius control point
        const tubeRadius = element.tube || element.radius / 4;
        const tubeRadiusPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        tubeRadiusPoint.position.set(element.x + element.radius + tubeRadius, element.y, element.z || 0);
        tubeRadiusPoint.userData.isControlPoint = true;
        tubeRadiusPoint.userData.elementId = element.id;
        tubeRadiusPoint.userData.pointIndex = 2;
        tubeRadiusPoint.userData.controlFor = "torus";

        controlPoints.push(torusCenter, mainRadiusPoint, tubeRadiusPoint);
        break;

      case "polygon":
        // Create control points for polygon
        const polygonCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        polygonCenter.position.set(element.x, element.y, element.z || 0);
        polygonCenter.userData.isControlPoint = true;
        polygonCenter.userData.elementId = element.id;
        polygonCenter.userData.pointIndex = 0;
        polygonCenter.userData.controlFor = "polygon";

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
        // This is called even if neither 'if' nor 'else if' ran
        polygonShape.closePath();

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

        controlPoints.push(polygonCenter, polygon);
        break;

      case "extrusion":
        // Create control points for extrusion
        const extrusionCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        extrusionCenter.position.set(element.x, element.y, element.z || 0);
        extrusionCenter.userData.isControlPoint = true;
        extrusionCenter.userData.elementId = element.id;
        extrusionCenter.userData.pointIndex = 0;
        extrusionCenter.userData.controlFor = "extrusion";

        const extrusionPoints = [extrusionCenter];

        // Shape size control point
        const shapeControlPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        let controlX = element.x;
        let controlY = element.y;

        if (element.shape === "rect" && element.width && element.height) {
          controlX = element.x + element.width / 2;
          controlY = element.y + element.height / 2;
        } else if (element.shape === "circle" && element.radius) {
          controlX = element.x + element.radius;
        }

        shapeControlPoint.position.set(controlX, controlY, element.z || 0);
        shapeControlPoint.userData.isControlPoint = true;
        shapeControlPoint.userData.elementId = element.id;
        shapeControlPoint.userData.pointIndex = 1;
        shapeControlPoint.userData.controlFor = "extrusion";
        extrusionPoints.push(shapeControlPoint);

        // Depth control point
        const depthControlPoint = new THREE.Mesh(pointGeometry, pointMaterial);
        depthControlPoint.position.set(element.x, element.y, (element.z || 0) + element.depth);
        depthControlPoint.userData.isControlPoint = true;
        depthControlPoint.userData.elementId = element.id;
        depthControlPoint.userData.pointIndex = 2;
        depthControlPoint.userData.controlFor = "extrusion";
        extrusionPoints.push(depthControlPoint);

        // Points for custom shapes
        if (element.points && element.points.length >= 3) {
          element.points.forEach((point: any, idx: number) => {
            const shapePoint = new THREE.Mesh(pointGeometry, pointMaterial);
            shapePoint.position.set(element.x + (point.x || 0), element.y + (point.y || 0), element.z || 0);
            shapePoint.userData.isControlPoint = true;
            shapePoint.userData.elementId = element.id;
            shapePoint.userData.pointIndex = idx + 3; // Offset for center, shape, and depth
            shapePoint.userData.controlFor = "extrusion";
            extrusionPoints.push(shapePoint);
          });
        }

        controlPoints.push(...extrusionPoints);
        break;

      case "tube":
        // Create control points for tube
        const tubePoints = [];

        // Path points
        if (element.path && element.path.length >= 2) {
          element.path.forEach((point: any, idx: number) => {
            const pathPoint = new THREE.Mesh(pointGeometry, pointMaterial);
            pathPoint.position.set(point.x || 0, point.y || 0, point.z || 0);
            pathPoint.userData.isControlPoint = true;
            pathPoint.userData.elementId = element.id;
            pathPoint.userData.pointIndex = idx;
            pathPoint.userData.controlFor = "tube";
            tubePoints.push(pathPoint);
          });

          // Radius control point - place it near the first path point
          const firstPoint = element.path[0];
          const secondPoint = element.path[1];

          // Calculate a direction perpendicular to the tube
          const dx = secondPoint.x - firstPoint.x;
          const dy = secondPoint.y - firstPoint.y;
          const length = Math.sqrt(dx * dx + dy * dy);

          // Normalize and get perpendicular direction
          const perpX = dy / length;
          const perpY = -dx / length;

          const radiusPoint = new THREE.Mesh(pointGeometry, pointMaterial);
          radiusPoint.position.set(
            firstPoint.x + perpX * element.radius,
            firstPoint.y + perpY * element.radius,
            firstPoint.z || 0
          );
          radiusPoint.userData.isControlPoint = true;
          radiusPoint.userData.elementId = element.id;
          radiusPoint.userData.pointIndex = element.path.length; // After all path points
          radiusPoint.userData.controlFor = "tube";
          tubePoints.push(radiusPoint);
        }

        controlPoints.push(...tubePoints);
        break;

      case "lathe":
        // Create control points for lathe
        const latheCenter = new THREE.Mesh(pointGeometry, pointMaterial);
        latheCenter.position.set(element.x, element.y, element.z || 0);
        latheCenter.userData.isControlPoint = true;
        latheCenter.userData.elementId = element.id;
        latheCenter.userData.pointIndex = 0;
        latheCenter.userData.controlFor = "lathe";

        const lathePoints = [latheCenter];

        // Profile points
        if (element.points && element.points.length >= 2) {
          element.points.forEach((point: any, idx: number) => {
            const profilePoint = new THREE.Mesh(pointGeometry, pointMaterial);
            profilePoint.position.set(element.x + (point.x || 0), element.y + (point.y || 0), element.z || 0);
            profilePoint.userData.isControlPoint = true;
            profilePoint.userData.elementId = element.id;
            profilePoint.userData.pointIndex = idx + 1; // Offset for center
            profilePoint.userData.controlFor = "lathe";
            lathePoints.push(profilePoint);
          });
        }

        controlPoints.push(...lathePoints);
        break;

      default:
        if ("x" in element && "y" in element) {
          const centerPoint = new THREE.Mesh(pointGeometry, pointMaterial);
          centerPoint.position.set(element.x, element.y, element.z || 0);
          centerPoint.userData.isControlPoint = true;
          centerPoint.userData.elementId = element.id;
          centerPoint.userData.pointIndex = 0;
          centerPoint.userData.controlFor = element.type;
          centerPoint.userData.isCenter = true;
          controlPoints.push(centerPoint);
        }
        break;
    }
    return controlPoints;
  };

/** Applies a handle drag to the element it belongs to (`controlPoints` is the current set of handles in the scene). */
export const applyControlPointDrag = (
  controlPoints: ReadonlyArray<THREE.Object3D>,
  elementId: string,
  pointIndex: number,
  newX: number,
  newY: number,
  newZ: number = 0
): void => {
  const { elements, updateElement } = useElementsStore.getState();
  const element = elements.find((el: any) => el.id === elementId);
  if (!element) return;
      let updates: any = {};

      switch (element.type) {
        case "line":
          if (pointIndex === 0) {
            // First endpoint
            updates = { x1: newX, y1: newY, z1: newZ };
          } else if (pointIndex === 1) {
            // Second endpoint
            updates = { x2: newX, y2: newY, z2: newZ };
          }
          break;

        case "rectangle":
          // Handle rectangle control points differently based on the point type
          if (pointIndex < 4) {
            // It's a corner - we need to recalculate dimensions
            const originalCenter = { x: element.x, y: element.y };
            const angle = ((element.angle || 0) * Math.PI) / 180;

            // Rotate the new position back to get aligned coordinates
            const cosAngle = Math.cos(-angle);
            const sinAngle = Math.sin(-angle);
            const alignedX = (newX - originalCenter.x) * cosAngle - (newY - originalCenter.y) * sinAngle;
            const alignedY = (newX - originalCenter.x) * sinAngle + (newY - originalCenter.y) * cosAngle;

            // Which corner is it?
            const isLeft = pointIndex === 0 || pointIndex === 3;
            const isTop = pointIndex === 0 || pointIndex === 1;

            // Get the opposite corner
            const oppCornerIdx = pointIndex < 2 ? pointIndex + 2 : pointIndex - 2;
            const oppCornerPoint = controlPoints.find(
              pt => pt.userData.elementId === elementId && pt.userData.pointIndex === oppCornerIdx
            );

            if (!oppCornerPoint) return;

            // Rotate the opposite corner position back too
            const oppX =
              (oppCornerPoint.position.x - originalCenter.x) * cosAngle -
              (oppCornerPoint.position.y - originalCenter.y) * sinAngle;
            const oppY =
              (oppCornerPoint.position.x - originalCenter.x) * sinAngle +
              (oppCornerPoint.position.y - originalCenter.y) * cosAngle;

            // Calculate new width, height and center
            const newWidth = Math.abs(alignedX - oppX);
            const newHeight = Math.abs(alignedY - oppY);
            const newCenterX = (alignedX + oppX) / 2;
            const newCenterY = (alignedY + oppY) / 2;

            // Rotate the center back to world coordinates
            const worldCenterX = originalCenter.x + newCenterX * Math.cos(angle) - newCenterY * Math.sin(angle);
            const worldCenterY = originalCenter.y + newCenterX * Math.sin(angle) + newCenterY * Math.cos(angle);

            updates = {
              width: newWidth,
              height: newHeight,
              x: worldCenterX,
              y: worldCenterY
            };
          } else if (pointIndex < 8) {
            // It's a midpoint - adjust one dimension
            const angle = ((element.angle || 0) * Math.PI) / 180;
            const direction = pointIndex - 4; // 0: top, 1: right, 2: bottom, 3: left

            // Get vector from center to new point
            const deltaX = newX - element.x;
            const deltaY = newY - element.y;

            // Rotate it to align with rectangle
            const rotDeltaX = deltaX * Math.cos(-angle) - deltaY * Math.sin(-angle);
            const rotDeltaY = deltaX * Math.sin(-angle) + deltaY * Math.cos(-angle);

            if (direction === 0 || direction === 2) {
              // Top or bottom - adjust height
              const newHeight = Math.abs(rotDeltaY) * 2;
              updates = { height: newHeight };
            } else {
              // Left or right - adjust width
              const newWidth = Math.abs(rotDeltaX) * 2;
              updates = { width: newWidth };
            }
          } else if (pointIndex === 8) {
            // Rotation handle
            // Calculate angle from center to current position
            const deltaX = newX - element.x;
            const deltaY = newY - element.y;
            const newAngle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI + 90;
            updates = { angle: newAngle };
          }
          break;

        case "circle":
          if (pointIndex === 0) {
            // Center point
            updates = { x: newX, y: newY, z: newZ };
          } else {
            // Radius control point
            const dx = newX - element.x;
            const dy = newY - element.y;
            const newRadius = Math.sqrt(dx * dx + dy * dy);
            updates = { radius: newRadius };
          }
          break;

        case "cube":
          if (pointIndex === 0) {
            // Center point
            updates = { x: newX, y: newY, z: newZ };
          } else {
            // Corner point - need to recalculate dimensions
            const i = pointIndex - 1;
            const xSign = i & 1 ? 1 : -1;
            const ySign = i & 2 ? 1 : -1;
            const zSign = i & 4 ? 1 : -1;

            // Distance from corner to center along each axis
            const dx = Math.abs(newX - element.x);
            const dy = Math.abs(newY - element.y);
            const dz = Math.abs(newZ - element.z);

            updates = {
              width: dx * 2,
              height: dy * 2,
              depth: dz * 2
            };
          }
          break;

        case "sphere":
          if (pointIndex === 0) {
            // Center point
            updates = { x: newX, y: newY, z: newZ };
          } else {
            // Radius control point
            const dx = newX - element.x;
            const dy = newY - element.y;
            const dz = newZ - element.z;
            const newRadius = Math.sqrt(dx * dx + dy * dy + dz * dz);
            updates = { radius: newRadius };
          }
          break;

        case "cylinder":
          if (pointIndex === 0) {
            // Center point
            updates = { x: newX, y: newY, z: newZ };
          } else if (pointIndex === 1) {
            // Radius control point
            const dx = newX - element.x;
            const dy = newY - element.y;
            const newRadius = Math.sqrt(dx * dx + dy * dy);
            updates = { radius: newRadius };
          } else if (pointIndex === 2 || pointIndex === 3) {
            // Height control points
            const dz = Math.abs(newZ - element.z);
            updates = { height: dz * 2 };
          }
          break;

        case "cone":
          if (pointIndex === 0) {
            // Center point (base center)
            updates = { x: newX, y: newY, z: newZ };
          } else if (pointIndex === 1) {
            // Base radius control point
            const dx = newX - element.x;
            const dy = newY - element.y;
            const newRadius = Math.sqrt(dx * dx + dy * dy);
            updates = { radius: newRadius };
          } else if (pointIndex === 2) {
            // Height control point (tip of cone)
            const dz = Math.abs(newZ - element.z);
            updates = { height: dz };
          }
          break;

        case "torus":
          if (pointIndex === 0) {
            // Center point
            updates = { x: newX, y: newY, z: newZ };
          } else if (pointIndex === 1) {
            // Main radius control point
            const dx = newX - element.x;
            const dy = newY - element.y;
            const newRadius = Math.sqrt(dx * dx + dy * dy);
            updates = { radius: newRadius };
          } else if (pointIndex === 2) {
            // Tube radius control point
            const tubeRadius = element.tube || element.radius / 4;
            const mainRadius = element.radius;

            // Calculate new tube radius based on drag distance from torus ring
            const dx = newX - element.x;
            const dy = newY - element.y;
            const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);
            const newTubeRadius = Math.abs(distanceFromCenter - mainRadius);

            updates = { tube: newTubeRadius };
          }
          break;

        case "polygon":
          if (pointIndex === 0) {
            // Center point
            updates = { x: newX, y: newY, z: newZ };
          } else if (pointIndex === 1) {
            // Radius control point
            const dx = newX - element.x;
            const dy = newY - element.y;
            const newRadius = Math.sqrt(dx * dx + dy * dy);
            updates = { radius: newRadius };
          } else if (pointIndex > 1 && element.points) {
            // Vertex control point
            const vertexIndex = pointIndex - 2;
            if (vertexIndex < element.points.length) {
              // Create a copy of points array
              const newPoints = [...element.points];
              // Update the point being dragged
              newPoints[vertexIndex] = { x: newX, y: newY, z: newZ };
              updates = { points: newPoints };
            }
          }
          break;

        case "extrusion":
          if (pointIndex === 0) {
            // Center point
            updates = { x: newX, y: newY, z: newZ };
          } else if (pointIndex === 1) {
            // Width/height control point
            const dx = newX - element.x;
            const dy = newY - element.y;

            // For rectangular extrusions
            if (element.shape === "rect") {
              const distance = Math.sqrt(dx * dx + dy * dy);
              updates = { width: distance * 2, height: distance * 1.5 };
            }
            // For circular extrusions
            else if (element.shape === "circle") {
              const newRadius = Math.sqrt(dx * dx + dy * dy);
              updates = { radius: newRadius };
            }
          } else if (pointIndex === 2) {
            // Depth control point
            const dz = Math.abs(newZ - element.z);
            updates = { depth: dz };
          } else if (pointIndex > 2 && element.points) {
            // Shape point control (for custom shapes)
            const adjustedPointIndex = pointIndex - 3;
            if (adjustedPointIndex < element.points.length) {
              // Create a copy of points array
              const newPoints = [...element.points];
              // Update the point being dragged
              newPoints[pointIndex] = { x: newX - element.x, y: newY - element.y };
              updates = { points: newPoints };
            }
          }
          break;

        case "tube":
          if (element.path && pointIndex < element.path.length) {
            // Path point control
            const newPath = [...element.path];
            newPath[pointIndex] = { x: newX, y: newY, z: newZ };
            updates = { path: newPath };
          } else if (pointIndex === element.path?.length) {
            // Radius control point
            // First find the closest point on the path
            let minDist = Infinity;
            let closestPointIndex = 0;

            for (let i = 0; i < element.path.length; i++) {
              const point = element.path[i];
              const dist = Math.sqrt(
                Math.pow(point.x - newX, 2) + Math.pow(point.y - newY, 2) + Math.pow((point.z || 0) - newZ, 2)
              );

              if (dist < minDist) {
                minDist = dist;
                closestPointIndex = i;
              }
            }

            // Calculate new radius as distance from path point to drag position
            const pathPoint = element.path[closestPointIndex];
            const dx = newX - pathPoint.x;
            const dy = newY - pathPoint.y;
            const dz = newZ - (pathPoint.z || 0);
            const newRadius = Math.sqrt(dx * dx + dy * dy + dz * dz);

            updates = { radius: newRadius };
          }
          break;

        case "lathe":
          if (pointIndex === 0) {
            // Center of rotation
            updates = { x: newX, y: newY, z: newZ };
          } else if (element.points && pointIndex - 1 < element.points.length) {
            // Profile point control
            const updatedPointIndex = pointIndex - 1;
            const newPoints = [...element.points];

            // Update relative to center of rotation
            newPoints[updatedPointIndex] = {
              x: Math.abs(newX - element.x), // Keep x positive for lathe profile
              y: newY - element.y
            };

            updates = { points: newPoints };
          }
          break;

        case "component":
          // For components, just update the position
          updates = {
            x: newX,
            y: newY,
            z: newZ
          };
          break;

        case "group":
          // Group elements should be moved together
          updates = {
            x: newX,
            y: newY,
            z: newZ
          };
          break;

        default:
          if ("x" in element && "y" in element) {
            // For center-based elements
            updates = { x: newX, y: newY, z: newZ };
          }
          break;
      }

      // Apply updates if any
      if (Object.keys(updates).length > 0) {
        updateElement(elementId, updates);
      }
  }
