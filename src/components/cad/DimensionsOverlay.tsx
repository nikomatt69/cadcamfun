import React, { useState, useEffect, useMemo } from "react";
import { useElementsStore } from "src/store/elementsStore";
import { useCADStore } from "src/store/cadStore";
import { useSelectionStore } from "src/store/selectorStore";
import * as THREE from "three";

interface DimensionsOverlayProps {
  camera: THREE.Camera;
  scene: THREE.Scene;
  // We might need viewport dimensions for accurate screen projection
  viewportWidth?: "100%";
  viewportHeight?: "100%";
}

interface ScreenDimension {
  id: string;
  type: "width" | "height" | "depth";
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  textX: number;
  textY: number;
  value: string;
}

const DimensionsOverlay: React.FC<DimensionsOverlayProps> = ({ camera, scene }) => {
  const showDimensions = useCADStore(state => state.showDimensions);
  const elements = useElementsStore(state => state.elements); // We might not need this directly if we rely on scene objects
  const selectedElementIds = useSelectionStore(state => state.selectedElementIds);
  const [screenDimensions, setScreenDimensions] = useState<ScreenDimension[]>([]);

  // Helper to project 3D point to 2D screen coordinates
  const projectToScreen = (point3D: THREE.Vector3): { x: number; y: number } | null => {
    // TODO: Get actual viewport dimensions for accurate projection
    const viewportWidth = "100%"; // Placeholder
    const viewportHeight = "100%"; // Placeholder

    const vector = point3D.clone().project(camera);

    // Check if point is behind the camera
    if (vector.z > 1) {
      return null;
    }

    // Use actual viewport dimensions if placeholders are provided
    const numViewportWidth = typeof viewportWidth === "string" ? window.innerWidth : viewportWidth;
    const numViewportHeight = typeof viewportHeight === "string" ? window.innerHeight : viewportHeight;

    const x = (vector.x * 0.5 + 0.5) * numViewportWidth;
    const y = (-vector.y * 0.5 + 0.5) * numViewportHeight;
    return { x, y };
  };

  useEffect(() => {
    if (!showDimensions || selectedElementIds.length === 0) {
      setScreenDimensions([]);
      return;
    }

    const dimensions: ScreenDimension[] = [];
    const selectedObjects: THREE.Object3D[] = [];

    // Find corresponding THREE.Object3D for selected elements
    scene.traverse(object => {
      // Assuming object name or userData stores the element ID
      // Adjust this logic based on how element IDs are associated with scene objects
      if (selectedElementIds.includes(object.name) || selectedElementIds.includes(object.userData.elementId)) {
        selectedObjects.push(object);
      }
    });

    if (selectedObjects.length === 0) {
      setScreenDimensions([]);
      return;
    }

    selectedObjects.forEach((object, index) => {
      const box = new THREE.Box3().setFromObject(object, true); // Use precise bounding box
      const size = new THREE.Vector3();
      box.getSize(size);

      // Define corners for dimension lines (example for width, height, depth)
      const points = {
        min: box.min,
        max: box.max,
        p1: new THREE.Vector3(box.min.x, box.min.y, box.min.z),
        p2: new THREE.Vector3(box.max.x, box.min.y, box.min.z), // Width
        p3: new THREE.Vector3(box.min.x, box.max.y, box.min.z), // Height
        p4: new THREE.Vector3(box.min.x, box.min.y, box.max.z) // Depth
      };

      // Project points to screen
      const screenPoints = {
        p1: projectToScreen(points.p1),
        p2: projectToScreen(points.p2),
        p3: projectToScreen(points.p3),
        p4: projectToScreen(points.p4)
      };

      const elementId = object.name || object.userData.elementId || `dim-${index}`;

      // Create width dimension if points are valid
      if (screenPoints.p1 && screenPoints.p2) {
        dimensions.push({
          id: `${elementId}-width`,
          type: "width",
          startX: screenPoints.p1.x,
          startY: screenPoints.p1.y,
          endX: screenPoints.p2.x,
          endY: screenPoints.p2.y,
          textX: (screenPoints.p1.x + screenPoints.p2.x) / 2,
          textY: screenPoints.p1.y - 15, // Offset text slightly
          value: size.x.toFixed(2)
        });
      }

      // Create height dimension if points are valid
      if (screenPoints.p1 && screenPoints.p3) {
        dimensions.push({
          id: `${elementId}-height`,
          type: "height",
          startX: screenPoints.p1.x,
          startY: screenPoints.p1.y,
          endX: screenPoints.p3.x,
          endY: screenPoints.p3.y,
          textX: screenPoints.p1.x - 30, // Offset text slightly
          textY: (screenPoints.p1.y + screenPoints.p3.y) / 2,
          value: size.y.toFixed(2)
        });
      }
      // NOTE: Depth dimension might be less useful in 2D projection or overlap heavily
      // Add logic for depth (p1 to p4) if needed, considering projection issues
    });

    setScreenDimensions(dimensions);

    // Re-calculate when selection, camera, or scene potentially changes
    // Note: Camera/Scene changes might require a more robust update mechanism (e.g., listening to render loop)
  }, [showDimensions, selectedElementIds, camera, scene]);

  if (!showDimensions || screenDimensions.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%", // Assumes overlay covers the whole canvas area
        height: "100%",
        pointerEvents: "none", // Allow interactions with the canvas below
        overflow: "hidden", // Prevent scrollbars if dimensions go off-screen
        zIndex: 10 // Ensure it's above the canvas but potentially below UI elements
      }}
    >
      {screenDimensions.map(dim => {
        const dx = dim.endX - dim.startX;
        const dy = dim.endY - dim.startY;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);

        return (
          <React.Fragment key={dim.id}>
            {/* Dimension Line */}
            <div
              style={{
                position: "absolute",
                left: `${dim.startX}px`,
                top: `${dim.startY}px`,
                width: `${length}px`,
                height: "1px",
                backgroundColor: "cyan", // Style as needed
                transformOrigin: "0 0",
                transform: `rotate(${angle}deg)`
              }}
            />
            {/* Dimension Text */}
            <div
              style={{
                position: "absolute",
                left: `${dim.textX}px`,
                top: `${dim.textY}px`,
                color: "cyan", // Style as needed
                backgroundColor: "rgba(0, 0, 0, 0.6)",
                padding: "1px 4px",
                borderRadius: "2px",
                fontSize: "10px",
                whiteSpace: "nowrap",
                transform: "translate(-50%, -50%)" // Center text on position
              }}
            >
              {dim.value}
            </div>
            {/* TODO: Add extension lines if desired */}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default DimensionsOverlay;
