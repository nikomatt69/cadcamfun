import SmartRenderer from "@/src/lib/canvas/SmartRenderer";
import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import { createManagedRenderer } from "../../../lib/webgl/webglContextManager";

interface Element3dPreviewProps {
  element: any;
  size?: { width: number; height: number };
}

export const Element3dPreview: React.FC<Element3dPreviewProps> = ({ element, size = { width: 100, height: 100 } }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Configurazione scena Three.js
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    const camera = new THREE.PerspectiveCamera(50, size.width / size.height, 0.1, 1000);
    camera.position.z = 5;

    const renderer = createManagedRenderer({
      contextId: `element-preview-${element.id || "default"}`,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    renderer.setSize(size.width, size.height);
    containerRef.current.appendChild(renderer.domElement);

    // Luci
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Crea geometria in base al tipo di elemento
    let mesh: THREE.Mesh | THREE.Line;

    switch (element.type) {
      case "cube":
        const geometry = new THREE.BoxGeometry(element.width || 1, element.height || 1, element.depth || 1);
        const material = new THREE.MeshStandardMaterial({
          color: element.color || 0x1e88e5,
          wireframe: element.wireframe || false
        });
        mesh = new THREE.Mesh(geometry, material);
        break;

      case "sphere":
        const sphereGeometry = new THREE.SphereGeometry(element.radius || 0.5, 32, 32);
        const sphereMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x1e88e5,
          wireframe: element.wireframe || false
        });
        mesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
        break;

      case "cylinder":
        const cylinderGeometry = new THREE.CylinderGeometry(
          element.radius || 0.5,
          element.radius || 0.5,
          element.height || 1,
          32
        );
        const cylinderMaterial = new THREE.MeshStandardMaterial({
          color: element.color || 0x1e88e5,
          wireframe: element.wireframe || false
        });
        mesh = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
        break;

      case "line":
        const points = [
          new THREE.Vector3(element.x1 || 0, element.y1 || 0, element.z1 || 0),
          new THREE.Vector3(element.x2 || 1, element.y2 || 0, element.z2 || 0)
        ];
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const lineMaterial = new THREE.LineBasicMaterial({
          color: element.color || 0x1e88e5,
          linewidth: element.linewidth || 1
        });
        mesh = new THREE.Line(lineGeometry, lineMaterial);
        break;

      default:
        // Fallback a un cubo semplice
        const defaultGeometry = new THREE.BoxGeometry(1, 1, 1);
        const defaultMaterial = new THREE.MeshStandardMaterial({
          color: 0xcccccc,
          wireframe: true
        });
        mesh = new THREE.Mesh(defaultGeometry, defaultMaterial);
    }

    scene.add(mesh);

    // Aggiungi animazione per rotazione
    const animate = () => {
      requestAnimationFrame(animate);

      SmartRenderer?.smartRender(scene, camera, renderer);
    };

    animate();

    // Cleanup
    return () => {
      if (containerRef.current && containerRef.current.contains(renderer.domElement)) {
        try {
          containerRef.current.removeChild(renderer.domElement);
        } catch (error) {
          console.warn("Failed to remove renderer element:", error);
        }
      }

      // Clean up THREE.js resources
      if (mesh instanceof THREE.Mesh) {
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(material => material.dispose());
        } else {
          mesh.material.dispose();
        }
      }
      // The managed renderer will be cleaned up by the context manager
    };
  }, [element, size.width, size.height]);

  return (
    <div
      ref={containerRef}
      style={{ width: size.width, height: size.height }}
      className="bg-gray-50 dark:bg-gray-900 rounded"
    />
  );
};
