/* eslint-disable jsx-a11y/alt-text */
// src/pages/components/[id].tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { 
  Save, 
  ArrowLeft, 
  Code, 
  Image, 
  Info, 
  Trash2, 
  AlertCircle, 
  Check, 
  Cpu, 
  ExternalLink,
  Copy,
  Layers,
  Activity,
  MessageCircle,
  BarChart2,
  Share,
  Edit3,
  Calendar,
  Clock,
  Clipboard,
  Link2,
  Eye,
  Zap,
  Shield,
  Settings,
  Sliders,
  Download,
  UploadCloud,
  Edit,
  Grid,
  List,
  Share2,
  Maximize2,
  Minimize2
} from 'react-feather';
import { fetchComponentById, updateComponent, deleteComponent } from '@/src/lib/api/components';
import Loading from '@/src/components/ui/Loading';
import { Component  } from 'src/types/component';
import Metatags from '@/src/components/layout/Metatags';
import { useLocalComponentsLibraryStore } from '@/src/store/localComponentsLibraryStore';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { cn } from '@/src/lib/utils';
import toast from 'react-hot-toast';
import dynamic from 'next/dynamic';
import Split from 'react-split';
import { format } from 'date-fns';
import { useDebounce } from 'use-debounce';
import { Chart as ChartJS } from 'chart.js/auto';
import { Graph } from 'react-d3-graph';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import React from 'react';
import { useProjectDrawings } from '@/src/hooks/useDrawings';
import { useCADStore } from '@/src/store/cadStore';
import { ComponentCadBridge } from '@/src/lib/componentCadBridge';

const Layout = dynamic(
  () => import('@/src/components/layout/Layout').then(mod => mod.default),
  { ssr: false }
);
// Dynamically import Monaco Editor to reduce initial bundle size
const MonacoEditor = dynamic(
  () => import('@monaco-editor/react').then(mod => mod.default),
  { ssr: false }
);

// Animation variants
const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.4 } }
};

const slideUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { 
      type: "spring", 
      stiffness: 300, 
      damping: 30 
    } 
  }
};

// Validation function for JSON data
const validateJSON = (jsonString: string) => {
  try {
    const parsedData = JSON.parse(jsonString);
    
    // Define schema validation logic
    const requiredFields = ['type'];
    const missingFields = requiredFields.filter(field => !parsedData[field]);
    
    if (missingFields.length > 0) {
      return {
        valid: false,
        errors: [`Missing required fields: ${missingFields.join(', ')}`]
      };
    }
    
    return { valid: true, parsedData };
  } catch (error) {
    return {
      valid: false,
      errors: [error]
    };
  }
};

// 3D Preview Component
const ThreeDPreview = ({ componentData }: { componentData: any }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!mountRef.current) return;
    
    // Basic Three.js setup
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 5;
    
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    mountRef.current.appendChild(renderer.domElement);
    
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    
    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);
    
    // Generate geometry based on component data
    let object;
    try {
      object = createObjectFromComponentData(componentData);
      if (object) {
        scene.add(object);
      }
    } catch (error) {
      console.error('Error generating 3D preview:', error);
    }
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    
    animate();
    
    // Handle resize
    const handleResize = () => {
      if (!mountRef.current) return;
      
      const newWidth = mountRef.current.clientWidth;
      const newHeight = mountRef.current.clientHeight;
      
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      
      renderer.setSize(newWidth, newHeight);
    };
    
    window.addEventListener('resize', handleResize);
    
    // Cleanup
   return () => {
    if (mountRef.current && renderer.domElement) {
      mountRef.current.removeChild(renderer.domElement);
    }
    window.removeEventListener('resize', handleResize);
    renderer.dispose();
  };
}, [componentData]);

const ensureObjectMetadata = (object: THREE.Object3D, elementId: string) => {
  // Imposta i metadata sull'oggetto principale
  object.userData.isCADElement = true;
  object.userData.elementId = elementId;
  
  // Propaga i metadata a tutti i figli
  object.traverse((child) => {
    if (child !== object) {
      child.userData.isCADElement = true;
      child.userData.elementId = elementId;
      child.userData.isChild = true; // Opzionale: per distinguere i figli
    }
  });
};



// Helper function to create 3D object based on component data
const createObjectFromComponentData = (data: any) : THREE.Object3D | null => {
  if (!data) return null;
  
  const { originOffset } = useCADStore.getState();
   // Check if element is on a visible layer
  
   
  

  switch (data.type) {
    case 'custom':
      // Create a group for custom components
      const customGroup = new THREE.Group();
      
      // Add all child elements if they exist
      if (data.elements && Array.isArray(data.elements)) {
        data.elements.forEach((element: any) => {
          const childObject = createObjectFromComponentData({
            ...element,
            x: (element.x || 0),
            y: (element.y || 0),
            z: (element.z || 0)
          });
          
          if (childObject) {
            customGroup.add(childObject);
          }
        });
      }
      
      // Position the group
      customGroup.position.set(
        data.x + originOffset.x,
        data.y + originOffset.y,
        (data.z || 0) + originOffset.z
      );
      
      return customGroup;
      
    // ======= BASIC PRIMITIVES =======
    case 'cube':
      const cubeGeometry = new THREE.BoxGeometry(
        data.width,
        data.height,
        data.depth
      );
      
      const cubeMaterial = new THREE.MeshStandardMaterial({
        color: data.color || 0x1e88e5,
        wireframe: data.wireframe || false
      });
      
      const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
      cube.position.set(
        data.x + originOffset.x,
        data.y + originOffset.y,
        (data.z || 0) + originOffset.z
      );
      
      return cube;
      
    case 'sphere':
      const sphereGeometry = new THREE.SphereGeometry(
        data.radius,
        data.segments || 32,
        data.segments || 32
      );
      
      const sphereMaterial = new THREE.MeshStandardMaterial({
        color: data.color || 0x1e88e5,
        wireframe: data.wireframe || false
      });
      
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      sphere.position.set(
        data.x + originOffset.x,
        data.y + originOffset.y,
        (data.z || 0) + originOffset.z
      );
      
      return sphere;
      
    case 'cylinder':
      const cylinderGeometry = new THREE.CylinderGeometry(
        data.radius,
        data.radius,
        data.height,
        data.segments || 32
      );
      
      const cylinderMaterial = new THREE.MeshStandardMaterial({
        color: data.color || 0xFFC107,
        wireframe: data.wireframe || false
      });
      
      const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
      cylinder.position.set(
        data.x + originOffset.x,
        data.y + originOffset.y,
        (data.z || 0) + originOffset.z
      );
      
      // Rotation for standard orientation
      cylinder.rotation.x = Math.PI / 2;
      return cylinder;
    
    case 'cone':
      const coneGeometry = new THREE.ConeGeometry(
        data.radius,
        data.height,
        data.segments || 32
      );
      
      const coneMaterial = new THREE.MeshStandardMaterial({
        color: data.color || 0x9C27B0,
        wireframe: data.wireframe || false
      });
      
      const cone = new THREE.Mesh(coneGeometry, coneMaterial);
      cone.position.set(
        data.x + originOffset.x,
        data.y + originOffset.y,
        (data.z || 0) + originOffset.z
      );
      
      cone.rotation.x = Math.PI / 2;
      return cone;
    
    case 'torus':
      const torusGeometry = new THREE.TorusGeometry(
        data.radius,
        data.tubeRadius || data.radius / 4,
        data.radialSegments || 16,
        data.tubularSegments || 100
      );
      
      const torusMaterial = new THREE.MeshStandardMaterial({
        color: data.color || 0xFF9800,
        wireframe: data.wireframe || false
      });
      
      const torus = new THREE.Mesh(torusGeometry, torusMaterial);
      torus.position.set(
        data.x + originOffset.x,
        data.y + originOffset.y,
        (data.z || 0) + originOffset.z
      );
      
      return torus;
      
    // ======= ADVANCED PRIMITIVES =======
    case 'pyramid':
      // Create pyramid geometry using BufferGeometry
      const pyramidGeometry = new THREE.BufferGeometry();
      
      // Define vertices for a square-based pyramid
      const baseWidth = data.baseWidth || 1;
      const baseDepth = data.baseDepth || 1;
      const pyramidHeight = data.height || 1;
      
      const vertices = new Float32Array([
        // Base
        -baseWidth/2, -pyramidHeight/2, -baseDepth/2,
        baseWidth/2, -pyramidHeight/2, -baseDepth/2,
        baseWidth/2, -pyramidHeight/2, baseDepth/2,
        -baseWidth/2, -pyramidHeight/2, baseDepth/2,
        // Apex
        0, pyramidHeight/2, 0
      ]);
      
      // Define faces using indices
      const indices = [
        // Base
        0, 1, 2,
        0, 2, 3,
        // Sides
        0, 4, 1,
        1, 4, 2,
        2, 4, 3,
        3, 4, 0
      ];
      
      pyramidGeometry.setIndex(indices);
      pyramidGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      pyramidGeometry.computeVertexNormals();
      
      const pyramidMaterial = new THREE.MeshStandardMaterial({
        color: data.color || 0xE91E63,
        wireframe: data.wireframe || false
      });
      
      const pyramid = new THREE.Mesh(pyramidGeometry, pyramidMaterial);
      pyramid.position.set(
        data.x + originOffset.x,
        data.y + originOffset.y,
        (data.z || 0) + originOffset.z
      );
      
      return pyramid;
      
    case 'prism':
      // Create prism geometry (like a cylinder with polygon base)
      const sides = data.sides || 6;
      const prismGeometry = new THREE.CylinderGeometry(
        data.radius,
        data.radius,
        data.height,
        sides
      );
      
      const prismMaterial = new THREE.MeshStandardMaterial({
        color: data.color || 0x3F51B5,
        wireframe: data.wireframe || false
      });
      
      const prism = new THREE.Mesh(prismGeometry, prismMaterial);
      prism.position.set(
        data.x + originOffset.x,
        data.y + originOffset.y,
        (data.z || 0) + originOffset.z
      );
      
      prism.rotation.x = Math.PI / 2;
      return prism;
      
    case 'hemisphere':
      const hemisphereGeometry = new THREE.SphereGeometry(
        data.radius,
        data.segments || 32,
        data.segments || 32,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2
      );
      
      const hemisphereMaterial = new THREE.MeshStandardMaterial({
        color: data.color || 0x00BCD4,
        wireframe: data.wireframe || false
      });
      
      const hemisphere = new THREE.Mesh(hemisphereGeometry, hemisphereMaterial);
      hemisphere.position.set(
        data.x + originOffset.x,
        data.y + originOffset.y,
        (data.z || 0) + originOffset.z
      );
      
      // Rotate based on direction
      if (data.direction === "down") {
        hemisphere.rotation.x = Math.PI;
      }
      
      return hemisphere;
      
    case 'ellipsoid':
      // Create sphere and scale it to make an ellipsoid
      const ellipsoidGeometry = new THREE.SphereGeometry(
        1, // We'll scale it
        data.segments || 32,
        data.segments || 32
      );
      
      const ellipsoidMaterial = new THREE.MeshStandardMaterial({
        color: data.color || 0x8BC34A,
        wireframe: data.wireframe || false
      });
      
      const ellipsoid = new THREE.Mesh(ellipsoidGeometry, ellipsoidMaterial);
      ellipsoid.position.set(
        data.x + originOffset.x,
        data.y + originOffset.y,
        (data.z || 0) + originOffset.z
      );
      
      // Scale to create ellipsoid shape
      ellipsoid.scale.set(
        data.radiusX || 1,
        data.radiusY || 0.75,
        data.radiusZ || 0.5
      );
      
      return ellipsoid;
      
    case 'capsule':
      // Three.js doesn't have a built-in capsule, so use CapsuleGeometry from three/examples
      // Fallback to cylinder with hemisphere caps if not available
      let capsuleGeometry;
      
      try {
        // Try to use CapsuleGeometry if available
        capsuleGeometry = new THREE.CapsuleGeometry(
          data.radius || 0.5,
          data.height || 2,
          data.capSegments || 8,
          data.radialSegments || 16
        );
      } catch (e) {
        // Fallback: Create a group with cylinder and two hemispheres
        const capsuleGroup = new THREE.Group();
        
        const radius = data.radius || 0.5;
        const height = data.height || 2;
        
        // Cylinder for body
        const bodyCylinder = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, height, 32),
          new THREE.MeshStandardMaterial({ color: data.color || 0x673AB7 })
        );
        capsuleGroup.add(bodyCylinder);
        
        // Top hemisphere
        const topHemisphere = new THREE.Mesh(
          new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: data.color || 0x673AB7 })
        );
        topHemisphere.position.y = height / 2;
        topHemisphere.rotation.x = Math.PI;
        capsuleGroup.add(topHemisphere);
        
        // Bottom hemisphere
        const bottomHemisphere = new THREE.Mesh(
          new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: data.color || 0x673AB7 })
        );
        bottomHemisphere.position.y = -height / 2;
        capsuleGroup.add(bottomHemisphere);
        
        capsuleGroup.position.set(
          data.x + originOffset.x,
          data.y + originOffset.y,
          (data.z || 0) + originOffset.z
        );
        
        // Set rotation based on direction
        if (data.direction === "x") {
          capsuleGroup.rotation.z = Math.PI / 2;
        } else if (data.direction === "z") {
          capsuleGroup.rotation.x = Math.PI / 2;
        }
        
        return capsuleGroup;
      }
      
      // If CapsuleGeometry is available
      const capsuleMaterial = new THREE.MeshStandardMaterial({
        color: data.color || 0x673AB7,
        wireframe: data.wireframe || false
      });
      
      const capsule = new THREE.Mesh(capsuleGeometry, capsuleMaterial);
      capsule.position.set(
        data.x + originOffset.x,
        data.y + originOffset.y,
        (data.z || 0) + originOffset.z
      );
      
      // Set rotation based on direction
      if (data.direction === "x") {
        capsule.rotation.z = Math.PI / 2;
      } else if (data.direction === "z") {
        capsule.rotation.x = Math.PI / 2;
      }
      
      return capsule;
    
    // ======= 2D ELEMENTS =======
    case 'circle':
      const circleGeometry = new THREE.CircleGeometry(
        data.radius,
        data.segments || 32  
      );
      
      const circleMaterial = new THREE.MeshBasicMaterial({
        color: data.color || 0x000000,
        wireframe: data.wireframe || true,
        side: THREE.DoubleSide
      });
      
      const circle = new THREE.Mesh(circleGeometry, circleMaterial);
      circle.position.set(
        data.x + originOffset.x,
        data.y + originOffset.y,
        (data.z || 0) + originOffset.z
      );
      
      return circle;
      
    case 'rectangle':
      const rectGeometry = new THREE.PlaneGeometry(
        data.width,
        data.height
      );
      
      const rectMaterial = new THREE.MeshBasicMaterial({
        color: data.color || 0x000000,
        wireframe: data.wireframe || true,
        side: THREE.DoubleSide
      });
      
      const rect = new THREE.Mesh(rectGeometry, rectMaterial);
      rect.position.set(
        data.x + originOffset.x,
        data.y + originOffset.y,
        (data.z || 0) + originOffset.z
      );
      
      if (data.angle) {
        rect.rotation.z = data.angle * Math.PI / 180;
      }
      
      return rect;
      
    case 'triangle':
      const triangleShape = new THREE.Shape();
      
      // If points are provided, use them
      if (data.points && data.points.length >= 3) {
        triangleShape.moveTo(data.points[0].x, data.points[0].y);
        triangleShape.lineTo(data.points[1].x, data.points[1].y);
        triangleShape.lineTo(data.points[2].x, data.points[2].y);
      } else {
        // Otherwise, create an equilateral triangle
        const size = data.size || 1;
        triangleShape.moveTo(0, size);
        triangleShape.lineTo(-size * Math.sqrt(3) / 2, -size / 2);
        triangleShape.lineTo(size * Math.sqrt(3) / 2, -size / 2);
      }
      
      triangleShape.closePath();
      
      const triangleGeometry = new THREE.ShapeGeometry(triangleShape);
      const triangleMaterial = new THREE.MeshBasicMaterial({
        color: data.color || 0x000000,
        wireframe: data.wireframe || true,
        side: THREE.DoubleSide
      });
      
      const triangle = new THREE.Mesh(triangleGeometry, triangleMaterial);
      triangle.position.set(
        data.x + originOffset.x,
        data.y + originOffset.y,
        (data.z || 0) + originOffset.z
      );
      
      return triangle;
      
    case 'polygon':
      const polygonShape = new THREE.Shape();

      if (data.points && data.points.length >= 3) {
        // Use provided points
        polygonShape.moveTo(data.points[0].x, data.points[0].y);

        for (let i = 1; i < data.points.length; i++) {
          polygonShape.lineTo(data.points[i].x, data.points[i].y);
        }
      } else if (data.sides && data.radius) {
        // Create regular polygon
        const sides = data.sides || 6;
        const radius = data.radius || 1;
        
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
      
      const polygonGeometry = new THREE.ShapeGeometry(polygonShape);
      const polygonMaterial = new THREE.MeshBasicMaterial({
        color: data.color || 0x795548,
        wireframe: data.wireframe || true,
        side: THREE.DoubleSide
      });
      
      const polygon = new THREE.Mesh(polygonGeometry, polygonMaterial);
      polygon.position.set(
        (data.x || 0) + originOffset.x,
        (data.y || 0) + originOffset.y,
        (data.z || 0) + originOffset.z
      );
      
      return polygon;
      
    case 'ellipse':
      const ellipseShape = new THREE.Shape();
      const rx = data.radiusX || 1;
      const ry = data.radiusY || 0.5;
      
      // Create ellipse shape
      ellipseShape.ellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
      
      const ellipseGeometry = new THREE.ShapeGeometry(ellipseShape);
      const ellipseMaterial = new THREE.MeshBasicMaterial({
        color: data.color || 0x000000,
        wireframe: data.wireframe || true,
        side: THREE.DoubleSide
      });
      
      const ellipseMesh = new THREE.Mesh(ellipseGeometry, ellipseMaterial);
      ellipseMesh.position.set(
        data.x + originOffset.x,
        data.y + originOffset.y,
        (data.z || 0) + originOffset.z
      );
      
      return ellipseMesh;
      
    case 'arc':
      const arcShape = new THREE.Shape();
      const arcRadius = data.radius || 1;
      const startAngle = data.startAngle || 0;
      const endAngle = data.endAngle || Math.PI;
      
      // Create arc shape
      arcShape.moveTo(0, 0);
      arcShape.lineTo(
        arcRadius * Math.cos(startAngle),
        arcRadius * Math.sin(startAngle)
      );
      arcShape.absarc(0, 0, arcRadius, startAngle, endAngle, false);
      arcShape.lineTo(0, 0);
      
      const arcGeometry = new THREE.ShapeGeometry(arcShape);
      const arcMaterial = new THREE.MeshBasicMaterial({
        color: data.color || 0x000000,
        wireframe: data.wireframe || true,
        side: THREE.DoubleSide
      });
      
      const arc = new THREE.Mesh(arcGeometry, arcMaterial);
      arc.position.set(
        data.x + originOffset.x,
        data.y + originOffset.y,
        (data.z || 0) + originOffset.z
      );
      
      return arc;
    
    // ======= CURVE ELEMENTS =======
    case 'line':
      const lineMaterial = new THREE.LineBasicMaterial({ 
        color: data.color || 0x000000,
        linewidth: data.linewidth || 1
      });
      
      const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(
          data.x1 + originOffset.x,
          data.y1 + originOffset.y,
          (data.z1 || 0) + originOffset.z
        ),
        new THREE.Vector3(
          data.x2 + originOffset.x,
          data.y2 + originOffset.y,
          (data.z2 || 0) + originOffset.z
        )
      ]);
      
      return new THREE.Line(lineGeometry, lineMaterial);
      
    case 'spline':
      if (!data.points || data.points.length < 2) return null;
      
      // Convert points to Vector3 and apply offset
      const splinePoints = data.points.map((point: any) => 
        new THREE.Vector3(
          point.x + originOffset.x,
          point.y + originOffset.y,
          (point.z || 0) + originOffset.z
        )
      );
      
      // Create curve
      const splineCurve = new THREE.CatmullRomCurve3(splinePoints);
      
      // Sample points along the curve for the line geometry
      const splineDivisions = data.divisions || 50;
      const splineGeometry = new THREE.BufferGeometry().setFromPoints(
        splineCurve.getPoints(splineDivisions)
      );

      const splineMaterial = new THREE.LineBasicMaterial({
        color: data.color || 0x000000,
        linewidth: data.linewidth || 1
      });
      
      return new THREE.Line(splineGeometry, splineMaterial);
      
    case 'bezier':
      if (!data.points || data.points.length < 4) return null;
      
      // For a cubic bezier, we need at least 4 points (start, 2 control points, end)
      const bezierPoints = data.points.map((point: any) => 
        new THREE.Vector3(
          point.x + originOffset.x,
          point.y + originOffset.y,
          (point.z || 0) + originOffset.z
        )
      );
      
      // Create cubic bezier curve
      const bezierCurve = new THREE.CubicBezierCurve3(
        bezierPoints[0],
        bezierPoints[1],
        bezierPoints[2],
        bezierPoints[3]
      );
      
      // Sample points along the curve for the line geometry
      const bezierDivisions = data.divisions || 50;
      const bezierGeometry = new THREE.BufferGeometry().setFromPoints(
        bezierCurve.getPoints(bezierDivisions)
      );
      
      const bezierMaterial = new THREE.LineBasicMaterial({
        color: data.color || 0x000000,
        linewidth: data.linewidth || 1
      });
      
      return new THREE.Line(bezierGeometry, bezierMaterial);
      
    case 'nurbs':
      if (!data.points || data.points.length < 4) return null;
      
      // This is a simplified NURBS implementation using SplineCurve3
      // For a full NURBS implementation, you'd need additional libraries
      
      // Convert points to Vector3 and apply offset
      const nurbsPoints = data.points.map((point: any) => 
        new THREE.Vector3(
          point.x + originOffset.x,
          point.y + originOffset.y,
          (point.z || 0) + originOffset.z
        )
      );

      // Create curve
      const nurbsCurve = new THREE.CatmullRomCurve3(nurbsPoints, false, "centripetal");
      
      // Sample points along the curve for the line geometry
      const nurbsDivisions = data.divisions || 100;
      const nurbsGeometry = new THREE.BufferGeometry().setFromPoints(
        nurbsCurve.getPoints(nurbsDivisions)
      );
      
      const nurbsMaterial = new THREE.LineBasicMaterial({
        color: data.color || 0x000000,
        linewidth: data.linewidth || 1
      });
      
      return new THREE.Line(nurbsGeometry, nurbsMaterial);
    
    // ======= TRANSFORMATION OPERATIONS =======
    case 'extrusion':
      if (!data.shape && !data.profile) return null;
      
      const extrudeShape = new THREE.Shape();
      
      if (data.shape === 'rect') {
        const width = data.width || 50;
        const height = data.height || 30;
        extrudeShape.moveTo(-width/2, -height/2);
        extrudeShape.lineTo(width/2, -height/2);
        extrudeShape.lineTo(width/2, height/2);
        extrudeShape.lineTo(-width/2, height/2);
        extrudeShape.closePath();
      } else if (data.shape === 'circle') {
        const radius = data.radius || 25;
        extrudeShape.absarc(0, 0, radius, 0, Math.PI * 2, false);
      } else if (data.profile && data.profile.length >= 3) {
        const firstPoint = data.profile[0];
        extrudeShape.moveTo(firstPoint.x, firstPoint.y);
        
        for (let i = 1; i < data.profile.length; i++) {
          extrudeShape.lineTo(data.profile[i].x, data.profile[i].y);
        }
        
        extrudeShape.closePath(); 
      }
      
      const extrudeSettings = {
        depth: data.depth || 10,
        bevelEnabled: data.bevel || false,
        bevelThickness: data.bevelThickness || 1,
        bevelSize: data.bevelSize || 1,
        bevelSegments: data.bevelSegments || 1
      };
      
      const extrudeGeometry = new THREE.ExtrudeGeometry(extrudeShape, extrudeSettings);
      const extrudeMaterial = new THREE.MeshStandardMaterial({
        color: data.color || 0x4CAF50,
        wireframe: data.wireframe || false
      });
      
      const extrusion = new THREE.Mesh(extrudeGeometry, extrudeMaterial);
      extrusion.position.set(
        (data.x || 0) + originOffset.x,
        (data.y || 0) + originOffset.y,
        (data.z || 0) + originOffset.z
      );
      
      return extrusion;
      
    case 'revolution':
      if (!data.profile || data.profile.length < 2) return null;
      
      // Create a shape from the profile points
      const revolutionPoints = data.profile.map((point: any) => 
        new THREE.Vector2(point.x, point.y)
      );
      
      // LatheGeometry revolves a shape around an axis
      const revolutionGeometry = new THREE.LatheGeometry(
        revolutionPoints,
        data.segments || 32,
        data.phiStart || 0,
        data.angle || Math.PI * 2
      );
      
      const revolutionMaterial = new THREE.MeshStandardMaterial({
        color: data.color || 0xFF5722,
        wireframe: data.wireframe || false
      });
      
      const revolution = new THREE.Mesh(revolutionGeometry, revolutionMaterial);
      revolution.position.set(
        (data.x || 0) + originOffset.x,
        (data.y || 0) + originOffset.y,
        (data.z || 0) + originOffset.z
      );
      
      // Rotate based on the specified axis
      if (data.axis === 'x') {
        revolution.rotation.y = Math.PI / 2;
      } else if (data.axis === 'y') {
        revolution.rotation.x = Math.PI / 2;
      }

      return revolution;
      
    case 'sweep':
      if (!data.profile || !data.path) return null;
      
      // This requires the three-csg library or similar for advanced operations
      // Simplified implementation using TubeGeometry
      
      // Create a shape from the profile
      const sweepShape = new THREE.Shape();
      if (data.profile.length >= 3) {
        sweepShape.moveTo(data.profile[0].x, data.profile[0].y);
        for (let i = 1; i < data.profile.length; i++) {
          sweepShape.lineTo(data.profile[i].x, data.profile[i].y);
        }
        sweepShape.closePath();
      } else {
        // Default to circle if profile not provided properly
        sweepShape.absarc(0, 0, data.radius || 0.5, 0, Math.PI * 2, false);
      }
      
      // Create a path for the sweep
      const pathPoints = data.path.map((point: any) => 
        new THREE.Vector3(point.x, point.y, point.z || 0)
      );
      
      const sweepPath = new THREE.CatmullRomCurve3(pathPoints);
      
      // Create a tube along the path with the shape as cross-section
      // Note: This is a simplification; full sweep would need custom geometry
      const tubeGeometry = new THREE.TubeGeometry(
        sweepPath,
        data.segments || 64,
        data.radius || 0.5,
        data.radialSegments || 8,
        data.closed || false
      );
      
      const sweepMaterial = new THREE.MeshStandardMaterial({
        color: data.color || 0x2196F3,
        wireframe: data.wireframe || false
      });
      
      const sweep = new THREE.Mesh(tubeGeometry, sweepMaterial);
      sweep.position.set(
        originOffset.x,
        originOffset.y,
        originOffset.z
      );
      
      return sweep;
      
      case 'loft':
        if (!data.profiles || !data.positions || data.profiles.length < 2) return null;
        
        // Create a group to hold all sections
        const loftGroup = new THREE.Group();
        loftGroup.position.set(
          (data.x || 0) + originOffset.x,
          (data.y || 0) + originOffset.y,
          (data.z || 0) + originOffset.z
        );
        
        // Create meshes between consecutive profile sections
        for (let i = 0; i < data.profiles.length - 1; i++) {
          const profileA = data.profiles[i];
          const profileB = data.profiles[i + 1];
          
          const posA = data.positions[i];
          const posB = data.positions[i + 1];
          
          // Create simple representation for now (would need custom geometry for proper loft)
          const sectionGeometry = new THREE.CylinderGeometry(
            profileA.radius || 1,
            profileB.radius || 1,
            Math.sqrt(
              Math.pow(posB.x - posA.x, 2) +
              Math.pow(posB.y - posA.y, 2) +
              Math.pow(posB.z - posA.z, 2)
            ),
            32
          );
          
          const sectionMesh = new THREE.Mesh(
            sectionGeometry,
            new THREE.MeshStandardMaterial({
              color: data.color || 0x9C27B0,
              wireframe: data.wireframe || false
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
      case 'boolean-union':
      case 'boolean-subtract':
      case 'boolean-intersect':
        if (!data.operands || data.operands.length < 2) return null;
        
        // This requires the three-csg library for CSG operations
        // For now, we'll just render a placeholder or the first operand
        
        // Create a placeholder for boolean operation result
        const booleanPlaceholder = new THREE.Mesh(
          new THREE.SphereGeometry(1, 16, 16),
          new THREE.MeshStandardMaterial({
            color: data.color || 0x4CAF50,
            wireframe: true,
            opacity: 0.7,
            transparent: true 
          })
        );

        booleanPlaceholder.position.set(
          (data.x || 0) + originOffset.x,
          (data.y || 0) + originOffset.y,
          (data.z || 0) + originOffset.z
        );
        
        booleanPlaceholder.userData.isBooleanOperation = true;
        booleanPlaceholder.userData.operationType = data.type;
        booleanPlaceholder.userData.operandIds = data.operands;
        
        return booleanPlaceholder;
      
      // ======= INDUSTRIAL ELEMENTS =======
      case 'thread':
        // Create a simplified thread representation
        const threadGroup = new THREE.Group();
        
        // Base cylinder
        const threadBase = new THREE.Mesh(
          new THREE.CylinderGeometry(data.diameter / 2, data.diameter / 2, data.length, 32),
          new THREE.MeshStandardMaterial({
            color: data.color || 0xB0BEC5,
            wireframe: data.wireframe || false
          })
        );
        
        // Thread helix (simplified representation)
        const helixSegments = Math.ceil(data.length / data.pitch) * 8;
        const threadCurvePoints = [];
        
        for (let i = 0; i <= helixSegments; i++) {
          const t = i / helixSegments;
          const angle = t * (data.length / data.pitch) * Math.PI * 2;
          const radius = data.diameter / 2 + data.pitch * 0.1; // Slightly larger than base
          const x = radius * Math.cos(angle);
          const y = -data.length / 2 + t * data.length;
          const z = radius * Math.sin(angle);
          
          threadCurvePoints.push(new THREE.Vector3(x, y, z));
        }
        
        const threadCurve = new THREE.CatmullRomCurve3(threadCurvePoints);
        const threadGeometry = new THREE.TubeGeometry(
          threadCurve,
          helixSegments,
          data.pitch * 0.1, // Thread thickness
          8,
          false
        );
        
        const threadMaterial = new THREE.MeshStandardMaterial({
          color: data.color || 0x9E9E9E,
          wireframe: data.wireframe || false
        });
        
        const threadHelix = new THREE.Mesh(threadGeometry, threadMaterial);
        
        threadGroup.add(threadBase);
        threadGroup.add(threadHelix);
        
        // Set handedness rotation
        if (data.handedness === 'left') {
          threadHelix.rotation.y = Math.PI;
        }
        
        threadGroup.position.set(
          data.x + originOffset.x,
          data.y + originOffset.y,
          (data.z || 0) + originOffset.z
        );
        
        // Rotate to standard orientation
        threadGroup.rotation.x = Math.PI / 2;
        
        return threadGroup;
        
      case 'chamfer':
        // Chamfer would normally modify an existing edge
        // For standalone visualization, create a placeholder
        const chamferGroup = new THREE.Group();
        
        // Create a box with chamfered edges (simplified representation)
        const chamferBaseGeometry = new THREE.BoxGeometry(
          data.width || 1,
          data.height || 1, 
          data.depth || 1
        );
        
        const chamferBaseMaterial = new THREE.MeshStandardMaterial({
          color: data.color || 0x607D8B,
          wireframe: data.wireframe || false
        });
        
        const chamferBase = new THREE.Mesh(chamferBaseGeometry, chamferBaseMaterial);
        chamferGroup.add(chamferBase);
        
        // Highlight the chamfered edges
        if (data.edges && data.edges.length > 0) {
          const edgesMaterial = new THREE.LineBasicMaterial({ 
            color: 0xFF5722,
            linewidth: 3
          });
          
          // Here we'd create proper chamfer visualization
          // For now just highlight edges
          const edgesGeometry = new THREE.EdgesGeometry(chamferBaseGeometry);
          const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
          chamferGroup.add(edges);
        }
        
        chamferGroup.position.set(
          data.x + originOffset.x,
          data.y + originOffset.y,
          (data.z || 0) + originOffset.z
        );
        
        return chamferGroup;  
        
      case 'fillet':
        // Similar to chamfer, fillets modify existing edges
        // Create a simplified representation
        const filletGroup = new THREE.Group();
        
        // Create a base geometry
        const filletBaseGeometry = new THREE.BoxGeometry(
          data.width || 1,
          data.height || 1,
          data.depth || 1
        );
        
        const filletBaseMaterial = new THREE.MeshStandardMaterial({
          color: data.color || 0x607D8B,
          wireframe: data.wireframe || false
        });
        
        const filletBase = new THREE.Mesh(filletBaseGeometry, filletBaseMaterial);
        filletGroup.add(filletBase);
        
        // Highlight the filleted edges
        if (data.edges && data.edges.length > 0) {
          const filletedEdgesMaterial = new THREE.LineBasicMaterial({ 
            color: 0x4CAF50,
            linewidth: 3
          });
          
          // Here we'd create proper fillet visualization
          // For now just highlight edges
          const edgesGeometry = new THREE.EdgesGeometry(filletBaseGeometry);
          const edges = new THREE.LineSegments(edgesGeometry, filletedEdgesMaterial);
          filletGroup.add(edges);
        }
        
        filletGroup.position.set(
          data.x + originOffset.x,
          data.y + originOffset.y,
          (data.z || 0) + originOffset.z
        );
        
        return filletGroup;
        
      case 'gear':
        // Create a simplified gear visualization
        const gearGroup = new THREE.Group();
        
        // Basic parameters
        const moduleValue = data.moduleValue || 1; // Module in mm
        const teeth = data.teeth || 20;
        const thickness = data.thickness || 5;
        const pressureAngle = (data.pressureAngle || 20) * Math.PI / 180;
        
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
            color: data.color || 0xB0BEC5,
            wireframe: data.wireframe || false
          })
        );
        gearGroup.add(gearCylinder);
        
        // Create teeth (simplified as cylinders)
        for (let i = 0; i < teeth; i++) {
          const angle = (i / teeth) * Math.PI * 2;
          const x = (outerRadius + moduleValue * 0.25) * Math.cos(angle);
          const z = (outerRadius + moduleValue * 0.25) * Math.sin(angle);
          
          const tooth = new THREE.Mesh(
            new THREE.CylinderGeometry(
              moduleValue * 0.8, 
              moduleValue * 0.8, 
              thickness, 
              8
            ),
            new THREE.MeshStandardMaterial({
              color: data.color || 0xB0BEC5
            })
          );
          
          tooth.position.set(x, 0, z);
          gearGroup.add(tooth);
        }
        
        // Create center hole if specified
        if (data.holeDiameter) {
          const hole = new THREE.Mesh(
            new THREE.CylinderGeometry(data.holeDiameter / 2, data.holeDiameter / 2, thickness + 1, 32),
            new THREE.MeshStandardMaterial({
              color: 0x212121
            })
          );
          gearGroup.add(hole);
        }
        
        gearGroup.position.set(
          data.x + originOffset.x,
          data.y + originOffset.y,
          (data.z || 0) + originOffset.z
        );
        
        // Rotate to standard orientation
        gearGroup.rotation.x = Math.PI / 2;
        
        return gearGroup;
        
      case 'spring':
        // Create a helical spring
        const springRadius = data.radius || 1;
        const wireRadius = data.wireRadius || 0.1;
        const turns = data.turns || 5;
        const height = data.height || 5;
        
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
        const springGeometry = new THREE.TubeGeometry(
          springCurve,
          segments,
          wireRadius,
          8,
          false
        );
        
        const springMaterial = new THREE.MeshStandardMaterial({
          color: data.color || 0x9E9E9E,
          wireframe: data.wireframe || false
        });
        
        const spring = new THREE.Mesh(springGeometry, springMaterial);
        spring.position.set(
          data.x + originOffset.x,
          data.y + originOffset.y,
          (data.z || 0) + originOffset.z
        );
        
        return spring;
      
      // ======= ASSEMBLY ELEMENTS =======
      case 'screw':
      case 'bolt':
        // Create a simplified screw or bolt
        const screwGroup = new THREE.Group();
        
        // Parse size
        let diameter = 5; // Default 5mm
        if (data.size && typeof data.size === 'string') {
          const match = data.size.match(/M(\d+)/i);
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
            color: data.color || 0x9E9E9E,
            wireframe: data.wireframe || false
          })
        );
        screwHead.position.y = (data.length || 20) / 2 - headHeight / 2;
        screwGroup.add(screwHead);
        
        // Create shaft
        const shaftLength2 = (data.length || 20) - headHeight;
        const shaft2 = new THREE.Mesh(
          new THREE.CylinderGeometry(diameter / 2, diameter / 2, shaftLength2, 32),
          new THREE.MeshStandardMaterial({
            color: data.color || 0x9E9E9E,
            wireframe: data.wireframe || false
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
        const threadGeometry2 = new THREE.TubeGeometry(
          threadCurve2,
          threadSegments,
          diameter * 0.05,
          8,
          false 
        );
        
        const threadMaterial2 = new THREE.MeshStandardMaterial({
          color: data.color || 0x9E9E9E,
          wireframe: data.wireframe || false
        });
        
        const thread = new THREE.Mesh(threadGeometry2, threadMaterial2);
        screwGroup.add(thread);
        
        screwGroup.position.set(
          data.x + originOffset.x,
          data.y + originOffset.y,
          (data.z || 0) + originOffset.z
        );
        
        // Apply rotation if specified
        if (data.rotation) {
          screwGroup.rotation.x = THREE.MathUtils.degToRad(data.rotation.x || 0);
          screwGroup.rotation.y = THREE.MathUtils.degToRad(data.rotation.y || 0);
          screwGroup.rotation.z = THREE.MathUtils.degToRad(data.rotation.z || 0);
        } else {
          // Default orientation
          screwGroup.rotation.x = Math.PI;
        }
        
        return screwGroup;
        
      case 'nut':
        // Create a simplified nut
        const nutGroup = new THREE.Group();
        
        // Parse size
        let nutDiameter = 5; // Default 5mm
        if (data.size && typeof data.size === 'string') {
            const match = data.size.match(/M(\d+)/i);
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
          color: data.color || 0x9E9E9E,
          wireframe: data.wireframe || false
        });
        
        const nutBody = new THREE.Mesh(nutGeometry, nutMaterial);
        nutBody.rotation.x = Math.PI / 2;
        nutGroup.add(nutBody);
        
        // Create center hole
        const holeGeometry = new THREE.CylinderGeometry(
          nutDiameter / 2,
          nutDiameter / 2,
          nutThickness + 0.2,
          32
        );
        
        const holeMaterial = new THREE.MeshBasicMaterial({
          color: 0x000000
        });
        
        const hole = new THREE.Mesh(holeGeometry, holeMaterial);
        nutGroup.add(hole);
        
        nutGroup.position.set(
          data.x + originOffset.x,
          data.y + originOffset.y,
          (data.z || 0) + originOffset.z
        );  
        
        // Apply rotation if specified
        if (data.rotation) {
          nutGroup.rotation.x = THREE.MathUtils.degToRad(data.rotation.x || 0);
          nutGroup.rotation.y = THREE.MathUtils.degToRad(data.rotation.y || 0);
          nutGroup.rotation.z = THREE.MathUtils.degToRad(data.rotation.z || 0);
        }
        
        return nutGroup;
        
      case 'washer':
        // Create a washer
        let washerDiameter = 5; // Default 5mm
        if (data.size && typeof data.size === 'string') {
          const match = data.size.match(/M(\d+)/i);
          if (match) {
            washerDiameter = parseInt(match[1], 10);
          }
        }
        
        // Derived dimensions
        const outerDiameter = washerDiameter * 2.2;
        const washerThickness = washerDiameter * 0.2;
        
        // Create washer geometry (toroidal shape)
        const washerGeometry = new THREE.RingGeometry(
          washerDiameter / 2,
          outerDiameter / 2,
          32,
          1
        );
        
        const washerMaterial = new THREE.MeshStandardMaterial({
          color: data.color || 0x9E9E9E,
          wireframe: data.wireframe || false
        });
        
        const washer = new THREE.Mesh(washerGeometry, washerMaterial);
        washer.position.set(
          data.x + originOffset.x,
          data.y + originOffset.y,
          (data.z || 0) + originOffset.z
        );
        
        // Give it thickness
        washer.scale.set(1, 1, washerThickness);
        
        // Apply rotation if specified
        if (data.rotation) {
          washer.rotation.x = THREE.MathUtils.degToRad(data.rotation.x || 0);
          washer.rotation.y = THREE.MathUtils.degToRad(data.rotation.y || 0);
          washer.rotation.z = THREE.MathUtils.degToRad(data.rotation.z || 0);
        }
        
        return washer;
        
      case 'rivet':
        // Create a simplified rivet
        const rivetGroup = new THREE.Group();
        
        const rivetDiameter = data.diameter || 3;
        const rivetLength = data.length || 10;
        
        // Create head
        const rivetHeadDiameter = rivetDiameter * 2;
        const rivetHeadHeight = rivetDiameter * 0.6;
        
        const rivetHead = new THREE.Mesh(
          new THREE.CylinderGeometry(rivetHeadDiameter / 2, rivetHeadDiameter / 2, rivetHeadHeight, 32),
          new THREE.MeshStandardMaterial({
            color: data.color || 0x9E9E9E,
            wireframe: data.wireframe || false
          })
        );
        rivetHead.position.y = rivetLength / 2 - rivetHeadHeight / 2;
        rivetGroup.add(rivetHead);
        
        // Create shaft
        const shaftLength = rivetLength - rivetHeadHeight;
        const shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(rivetDiameter / 2, rivetDiameter / 2, shaftLength, 32),
          new THREE.MeshStandardMaterial({
            color: data.color || 0x9E9E9E,
            wireframe: data.wireframe || false
          })
        );
        shaft.position.y = -shaftLength / 2;
        rivetGroup.add(shaft);
        
        rivetGroup.position.set(
          data.x + originOffset.x,
          data.y + originOffset.y,
          (data.z || 0) + originOffset.z
        );
        
        // Apply rotation if specified
        if (data.rotation) {
          rivetGroup.rotation.x = THREE.MathUtils.degToRad(data.rotation.x || 0);
          rivetGroup.rotation.y = THREE.MathUtils.degToRad(data.rotation.y || 0);
          rivetGroup.rotation.z = THREE.MathUtils.degToRad(data.rotation.z || 0);
        } else {
          // Default orientation
          rivetGroup.rotation.x = Math.PI;
        }
        
        return rivetGroup;
      
      // ======= ARCHITECTURAL ELEMENTS =======
      case 'wall':
        const wallLength = data.length || 100;
        const wallHeight = data.height || 30;
        const wallThickness = data.thickness || 5;
        
        const wallGeometry = new THREE.BoxGeometry(wallLength, wallHeight, wallThickness);
        const wallMaterial = new THREE.MeshStandardMaterial({
          color: data.color || 0xE0E0E0,
          wireframe: data.wireframe || false
        });
        
        const wall = new THREE.Mesh(wallGeometry, wallMaterial);
        
        // Position wall with bottom at y=0 by default
        wall.position.set(
          (data.x || 0) + originOffset.x,
          (data.y || (wallHeight / 2)) + originOffset.y,
          (data.z || 0) + originOffset.z
        );
        
        // Add openings if specified
        if (data.openings && Array.isArray(data.openings)) {
          // This would require CSG operations for proper holes
          // For now, we'll just add visual markers for the openings
          data.openings.forEach((opening: any) => {
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
            
            openingMesh.position.set(
              opening.x || 0,
              opening.y || 0,
              0
            );
            
            wall.add(openingMesh);
          });
        }
        
        return wall;
        
      case 'floor':
        const floorWidth = data.width || 100;
        const floorLength = data.length || 100;
        const floorThickness = data.thickness || 2;
        
        const floorGeometry = new THREE.BoxGeometry(floorWidth, floorThickness, floorLength);
        const floorMaterial = new THREE.MeshStandardMaterial({
          color: data.color || 0xBCAAA4,
          wireframe: data.wireframe || false
        });
        
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.position.set(
          (data.x || 0) + originOffset.x,
          (data.y || 0) + originOffset.y,
          (data.z || 0) + originOffset.z
        );
        
        return floor;
        
      case 'roof':
        const roofWidth = data.width || 100;
        const roofLength = data.length || 100;
        const roofHeight = data.height || 20;
        const roofStyle = data.style || 'pitched';

        const roofGroup = new THREE.Group();
        roofGroup.position.set(
          (data.x || 0) + originOffset.x,
          (data.y || 0) + originOffset.y,
          (data.z || 0) + originOffset.z
        );
        
        if (roofStyle === 'flat') {
          // Flat roof is just a box
          const flatRoofGeometry = new THREE.BoxGeometry(roofWidth, roofHeight / 4, roofLength);
          const flatRoofMaterial = new THREE.MeshStandardMaterial({
            color: data.color || 0x795548,
            wireframe: data.wireframe || false
          });
          
          const flatRoof = new THREE.Mesh(flatRoofGeometry, flatRoofMaterial);
          roofGroup.add(flatRoof);
        } else if (roofStyle === 'pitched') {
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
            color: data.color || 0x795548,
            wireframe: data.wireframe || false
          });
          
          const pitchedRoof = new THREE.Mesh(pitchedRoofGeometry, pitchedRoofMaterial);
          pitchedRoof.rotation.x = -Math.PI / 2;
          pitchedRoof.position.z = -roofLength / 2;
          roofGroup.add(pitchedRoof);
        }
        
        return roofGroup;
        
      case 'window':
        const windowWidth = data.width || 10;
        const windowHeight = data.height || 15;
        const windowThickness = data.thickness || 0.5;
        const windowStyle = data.style || 'simple';
        
        const windowGroup = new THREE.Group();
        
        // Create window frame
        const frameGeometry = new THREE.BoxGeometry(windowWidth, windowHeight, windowThickness);
        const frameMaterial = new THREE.MeshStandardMaterial({
          color: data.frameColor || 0x8D6E63,
          wireframe: data.wireframe || false
        });
        
        const frame = new THREE.Mesh(frameGeometry, frameMaterial);
        windowGroup.add(frame);
        
        // Create glass
        const glassWidth = windowWidth * 0.8;
        const glassHeight = windowHeight * 0.8;
        
        const glassGeometry = new THREE.BoxGeometry(glassWidth, glassHeight, windowThickness * 0.2);
        const glassMaterial = new THREE.MeshStandardMaterial({
          color: 0xB3E5FC,
          transparent: true,
          opacity: 0.6,
          wireframe: data.wireframe || false
        });
        
        const glass = new THREE.Mesh(glassGeometry, glassMaterial);
        glass.position.z = windowThickness * 0.3;
        windowGroup.add(glass);
        
        // Add window details based on style
        if (windowStyle === 'divided') {
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
          data.x + originOffset.x,
          data.y + originOffset.y,
          (data.z || 0) + originOffset.z
        );
        
        return windowGroup;
        
      case 'door':
        const doorWidth = data.width || 10;
        const doorHeight = data.height || 20;
        const doorThickness = data.thickness || 1;
        const doorStyle = data.style || 'simple';
        
        const doorGroup = new THREE.Group();
        
        // Create door panel 
        const doorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, doorThickness);
        const doorMaterial = new THREE.MeshStandardMaterial({
          color: data.color || 0x8D6E63,
          wireframe: data.wireframe || false
        });
        
        const door = new THREE.Mesh(doorGeometry, doorMaterial);
        doorGroup.add(door);
        
        // Add details based on style
        if (doorStyle === 'paneled') {
          // Add panels
          const panelDepth = doorThickness * 0.3;
          const panelWidth = doorWidth * 0.7;
          const panelHeight = doorHeight * 0.25;
          
          const topPanel = new THREE.Mesh(
            new THREE.BoxGeometry(panelWidth, panelHeight, panelDepth),
            doorMaterial
          );
          topPanel.position.y = doorHeight * 0.25;
          topPanel.position.z = -doorThickness * 0.2;
          doorGroup.add(topPanel);
          
          const bottomPanel = new THREE.Mesh(
            new THREE.BoxGeometry(panelWidth, panelHeight, panelDepth),
            doorMaterial
          );
          bottomPanel.position.y = -doorHeight * 0.25;
          bottomPanel.position.z = -doorThickness * 0.2;
          doorGroup.add(bottomPanel);
        }
        
        // Add doorknob
        const doorknob = new THREE.Mesh(
          new THREE.SphereGeometry(doorWidth * 0.08, 16, 16),
          new THREE.MeshStandardMaterial({
            color: 0xFFD700,
            wireframe: data.wireframe || false 
          })
        );
        doorknob.position.x = doorWidth * 0.4;
        doorknob.position.z = doorThickness * 0.6;
        doorGroup.add(doorknob);
        
        doorGroup.position.set(
          data.x + originOffset.x,
          data.y + originOffset.y,
          (data.z || 0) + originOffset.z
        );
        
        return doorGroup;
        
      case 'stair':
        const stairWidth = data.width || 10;
        const stairHeight = data.height || 20;
        const stairDepth = data.depth || 30;
        const stepsCount = data.steps || 10;
        
        const stairGroup = new THREE.Group();
        
        // Create individual steps
        const stepWidth = stairWidth;
        const stepHeight = stairHeight / stepsCount;
        const stepDepth = stairDepth / stepsCount;
        
        for (let i = 0; i < stepsCount; i++) {
          const stepGeometry = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth);
          const stepMaterial = new THREE.MeshStandardMaterial({
            color: data.color || 0xBCAAA4,
            wireframe: data.wireframe || false
          });
          
          const step = new THREE.Mesh(stepGeometry, stepMaterial);
          step.position.y = i * stepHeight + stepHeight / 2;
          step.position.z = i * stepDepth + stepDepth / 2;
          
          stairGroup.add(step);
        }
        
        stairGroup.position.set(
          data.x + originOffset.x, 
          data.y + originOffset.y,
          (data.z || 0) + originOffset.z
        );
        
        return stairGroup;
        
      case 'column':
        const columnRadius = data.radius || 5;
        const columnHeight = data.height || 30;
        const columnStyle = data.style || 'simple';
        
        const columnGroup = new THREE.Group();
        
        // Create base column
        const columnGeometry = new THREE.CylinderGeometry(
          columnRadius,
          columnRadius,
          columnHeight,
          20
        );
        const columnMaterial = new THREE.MeshStandardMaterial({
          color: data.color || 0xE0E0E0,
          wireframe: data.wireframe || false
        });
        
        const column = new THREE.Mesh(columnGeometry, columnMaterial);
        columnGroup.add(column);
        
        // Add details based on style
        if (columnStyle === 'doric' || columnStyle === 'ionic' || columnStyle === 'corinthian') {
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
          if (columnStyle === 'ionic' || columnStyle === 'corinthian') {
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
          data.x + originOffset.x,
          data.y + originOffset.y,
          (data.z || 0) + originOffset.z
        );
        
        return columnGroup;
      
      // ======= SPECIAL ELEMENTS =======
      case 'text3d':
        // Three.js requires loading fonts for proper TextGeometry
        // For a placeholder, we'll create a plane with the text content
        const textWidth = data.text ? data.text.length * data.height * 0.6 : 10;
        const textHeight = data.height || 5;
        const textDepth = data.depth || 2;
        
        const textPlaceholder = new THREE.Mesh(
          new THREE.BoxGeometry(textWidth, textHeight, textDepth),
          new THREE.MeshStandardMaterial({
            color: data.color || 0x4285F4,
            wireframe: data.wireframe || false
          })
        );
        
        textPlaceholder.position.set(
          data.x + originOffset.x,
          data.y + originOffset.y,
          (data.z || 0) + originOffset.z
        );
        
        textPlaceholder.userData.text = data.text;
        textPlaceholder.userData.isTextPlaceholder = true;
        
        return textPlaceholder;
        
      case 'path3d':
        if (!data.points || data.points.length < 2) return null;
        
        // Create a path from the points
       
        const path = new THREE.CatmullRomCurve3(pathPoints);
        
        // Create geometry and material
        const pathGeometry = new THREE.TubeGeometry(
          path,
          data.segments || 64,
          data.radius || 0.5,
          data.radialSegments || 8,
          data.closed || false
        );
        
        const pathMaterial = new THREE.MeshStandardMaterial({
          color: data.color || 0x4285F4,
          wireframe: data.wireframe || false
        });
        
        const pathMesh = new THREE.Mesh(pathGeometry, pathMaterial);
        
        return pathMesh;
        
      case 'point-cloud':
        if (!data.points || !Array.isArray(data.points)) return null;
        
        // Create a point cloud from the points
        const pointPositions = new Float32Array(data.points.length * 3);
        
        data.points.forEach((point: any, i: number) => {
          pointPositions[i * 3] = point.x + originOffset.x;
          pointPositions[i * 3 + 1] = point.y + originOffset.y;
          pointPositions[i * 3 + 2] = (point.z || 0) + originOffset.z;
        });
        
        const pointGeometry = new THREE.BufferGeometry();
        pointGeometry.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3));
        
        // If color data is provided, use it
        if (data.colors && Array.isArray(data.colors)) {
          const colors = new Float32Array(data.colors.length * 3);
          
          data.colors.forEach((color: any, i: number) => {
            colors[i * 3] = color.r || 0.5;
            colors[i * 3 + 1] = color.g || 0.5;
            colors[i * 3 + 2] = color.b || 0.5;
          });
          
          pointGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        }
        
        const pointMaterial = new THREE.PointsMaterial({
          color: data.color || 0x4285F4,
          size: data.pointSize || 0.5,
          sizeAttenuation: true,
          vertexColors: data.colors ? true : false
        });
        
        const pointCloud = new THREE.Points(pointGeometry, pointMaterial);
        
        return pointCloud;
        
      case 'mesh':
        // For a custom mesh, we need vertices and faces data
        if (!data.vertices || !data.faces) return null;
        
        const meshGeometry = new THREE.BufferGeometry();
        
        // Convert vertices to Float32Array
        const vertices2 = new Float32Array(data.vertices.length * 3);
        data.vertices.forEach((vertex: any, i: number) => {
          vertices[i * 3] = vertex.x + originOffset.x;
          vertices[i * 3 + 1] = vertex.y + originOffset.y;
          vertices[i * 3 + 2] = (vertex.z || 0) + originOffset.z;
        });
        
        // Convert faces to indices
        const indices2: number[] = [];
        data.faces.forEach((face: any) => {
          if (Array.isArray(face) && face.length >= 3) {
            // Basic triangles
            indices.push(face[0], face[1], face[2]);
            
            // If more than 3 vertices (quad or n-gon), triangulate
            for (let i = 3; i < face.length; i++) {
              indices.push(face[0], face[i - 1], face[i]);
            }
          }
        });
        
        meshGeometry.setIndex(indices2);
        meshGeometry.setAttribute('position', new THREE.BufferAttribute(vertices2, 3));
        meshGeometry.computeVertexNormals();

        const meshMaterial = new THREE.MeshStandardMaterial({
          color: data.color || 0x4285F4,
          wireframe: data.wireframe || false
        });
        
        const mesh = new THREE.Mesh(meshGeometry, meshMaterial);
        ensureObjectMetadata(mesh, data.id);
        return mesh;
        
        
        
      case 'group': 
        const group = new THREE.Group();
        group.position.set(
          (data.x || 0) + originOffset.x,
          (data.y || 0) + originOffset.y,
          (data.z || 0) + originOffset.z
        );

        // Add child elements if provided
        if (data.elements && Array.isArray(data.elements)) {
          data.elements.forEach((childElement: any) => {
            // Set zero origin offset for children to avoid double-offset

            
            const childThreeObject = createObjectFromComponentData({
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
        
        
      case 'workpiece':
        // Create a transparent cube to represent the raw workpiece
        const workpieceGeometry = new THREE.BoxGeometry(
          data.width,
          data.height,
          data.depth
        );
        
        const workpieceMaterial = new THREE.MeshStandardMaterial({
          color: data.color || 0xaaaaaa,
          wireframe: data.wireframe || false,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide
        });
        
        const workpiece = new THREE.Mesh(workpieceGeometry, workpieceMaterial);
        workpiece.position.set(
          (data.x || 0) + originOffset.x, 
          (data.y || 0) + originOffset.y, 
          (data.z || 0) + originOffset.z
        );
        
        if (!data.wireframe) {
          const edgesGeometry = new THREE.EdgesGeometry(workpieceGeometry);
          const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
          const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
          workpiece.add(edges);
        }
        
        return workpiece;
      
      case 'component':
        const componentThreeGroup = new THREE.Group();
        componentThreeGroup.position.set(
          (data.x || 0) + originOffset.x,
          (data.y || 0) + originOffset.y,
          (data.z || 0) + originOffset.z
        );
        
        // Ensure main group has proper metadata for selection
        componentThreeGroup.userData.isCADElement = true;
        componentThreeGroup.userData.elementId = data.id;
        componentThreeGroup.userData.isComponent = true;
        
        // Add child elements if provided
        if (data.elements && Array.isArray(data.elements)) {
          data.elements.forEach((childElement: any) => {
            // Set zero origin offset for children to avoid double-offset
            const childThreeObject = createObjectFromComponentData({
              ...childElement,
              x: childElement.x || 0,
              y: childElement.y || 0,
              z: childElement.z || 0
            });
            
            if (childThreeObject) {
              // Ensure children have the component's ID for selection
              childThreeObject.userData.isCADElement = true;
              childThreeObject.userData.elementId = data.id;
              childThreeObject.userData.isComponentChild = true;
              childThreeObject.userData.parentComponentId = data.id;
              componentThreeGroup.add(childThreeObject);
            }
          });
        } else {
          // If no elements are provided or array is empty, create a visual placeholder
          const placeholderGeometry = new THREE.BoxGeometry(
            data.width || 1,
            data.height || 1,
            data.depth || 1
          );
          
          const placeholderMaterial = new THREE.MeshBasicMaterial({
            color: data.color || 0x3f51b5,
            wireframe: true,
            opacity: 0.7,
            transparent: true
          });
          
          const placeholder = new THREE.Mesh(placeholderGeometry, placeholderMaterial);
          placeholder.userData.isCADElement = true;
          placeholder.userData.elementId = data.id;
          placeholder.userData.isComponentPlaceholder = true;
          componentThreeGroup.add(placeholder);
        }
        
        return componentThreeGroup;
      
      default:
        console.warn(`Unknown element type: ${data.type}`);
        return null;
    }
};

return <div ref={mountRef} style={{ width: '100%', height: '400px' }} />;
};

// Component Relationships Visualization
const ComponentRelationships = ({ componentId }: { componentId: string }) => {
interface GraphNode {
  id: string;
  label: string;
  color: string;
  size: number;
}

interface GraphLink {
  source: string;
  target: string;
  label: string;
}

const [graphData, setGraphData] = useState<{nodes: GraphNode[], links: GraphLink[]}>({ nodes: [], links: [] });
const [isLoading, setIsLoading] = useState(true);

useEffect(() => {
  const fetchRelationships = async () => {
    if (!componentId) return;
    
    try {
      setIsLoading(true);
      
      const response = await fetch(`/api/components/${componentId}/relationships`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch component relationships');
      }
      
      const data = await response.json();
      
      // Transform to graph format
      const nodes = [
        { id: componentId, color: '#ff5722', size: 800, label: 'This Component' },
        ...data.relatedComponents.map((component: any) => ({
          id: component.id,
          label: component.name,
          color: '#2196f3',
          size: 400
        }))
      ];
      
      const links = data.relationships.map((rel: any) => ({
        source: rel.sourceId,
        target: rel.targetId,
        label: rel.type
      }));
      
      setGraphData({ nodes, links });
    } catch (error) {
      console.error('Error fetching component relationships:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  if (componentId) {
    fetchRelationships();
  }
}, [componentId]);

// Graph configuration
const graphConfig = {
  nodeHighlightBehavior: true,
  directed: true,
  d3: {
    gravity: -300,
    linkLength: 200
  },
  node: {
    color: '#2196f3',
    size: 400,
    highlightStrokeColor: '#ff5722',
    fontSize: 14
  },
  link: {
    highlightColor: '#ff5722',
    strokeWidth: 2
  }
};

if (isLoading) {
  return <Loading/>;
}

return (
  <div className="w-full h-96 bg-white dark:bg-gray-800 rounded-lg p-4">
    {graphData.nodes.length > 1 ? (
      React.createElement(Graph as unknown as React.ElementType, {
        id: "component-relationship-graph",
        data: graphData,
        config: graphConfig,
      })) : (
        <div className="flex flex-col items-center justify-center h-full">
          <Share size={48} className="mb-4 text-gray-300" />
          <p>No component relationships found</p>
          <p className="text-sm mt-2">This component doesnt reference or isnt referenced by other components.</p>
        </div>
    )}
  </div>
);
};

// Definisco le interfacce per i tipi
type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];

interface ComponentVersionType {
  id: string;
  componentId: string;
  data: JsonValue;
  changeMessage: string | null;
  userId: string;
  createdAt: Date;
  user?: {
    name: string;
  };
}

interface Comment {
  id: string;
  content: string;
  createdAt: Date;
  user?: {
    name: string;
  };
}

// Component Versioning
const ComponentVersioning = ({ componentId }: { componentId: string }) => {
const [versions, setVersions] = useState<ComponentVersionType[]>([]);
const [selectedVersionIds, setSelectedVersionIds] = useState<string[]>([]);
const [isLoading, setIsLoading] = useState(true);
const [comparisonData, setComparisonData] = useState(null);
const [isComparing, setIsComparing] = useState(false);

useEffect(() => {
  const fetchVersions = async () => {
    if (!componentId) return;
    
    try {
      setIsLoading(true);
      
      const response = await fetch(`/api/components/${componentId}/versions`);
      if (!response.ok) {
        throw new Error('Failed to fetch component versions');
      }
      
      const data = await response.json();
      setVersions(data);
    } catch (error) {
      console.error('Error fetching versions:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  fetchVersions();
}, [componentId]);

const handleVersionSelect = (versionId: string) => {
  setSelectedVersionIds(prev => {
    if (prev.includes(versionId)) {
      return prev.filter(id => id !== versionId);
    }
    
    // Solo due versioni possono essere selezionate per il confronto
    if (prev.length >= 2) {
      return [...prev.slice(1), versionId];
    }
    
    return [...prev, versionId];
  });
};

const handleRestoreVersion = async (versionId: string) => {
  if (!confirm('Are you sure you want to restore this version?')) return;
  
  try {
    const response = await fetch(`/api/components/${componentId}/versions/restore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id: componentId, versionId })
    });
    
    if (!response.ok) {
      throw new Error('Failed to restore version');
    }
    
    toast.success('Version restored successfully');
    
    // Refresh component data
    window.location.reload();
  } catch (error) {
    console.error('Error restoring version:', error);
    toast.error('Failed to restore version');
  }
};

const handleCompareVersions = async () => {
  if (selectedVersionIds.length !== 2) return;
  
  try {
    const response = await fetch(`/api/components/${componentId}/versions/compare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        versionA: selectedVersionIds[0],
        versionB: selectedVersionIds[1]
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to compare versions');
    }
    
    const diffData = await response.json();
    setComparisonData(diffData);
  } catch (error) {
    console.error('Error comparing versions:', error);
    toast.error('Failed to compare versions');
  }
};



return (
  <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden">
    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
      <h3 className="font-medium text-gray-900 dark:text-white">Version History</h3>
    </div>
    
    <div className="p-6">
      {versions.length === 0 ? (
        <div className="text-center py-12">
          <Activity size={48} className="mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500 dark:text-gray-400">No version history available</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Save changes to this component to create new versions.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex justify-between items-center">
            <div className="text-sm text-gray-500">
              {selectedVersionIds.length}/2 versions selected
            </div>
            
            <button
              onClick={handleCompareVersions}
              disabled={selectedVersionIds.length !== 2}
              className="px-3 py-1 bg-blue-600 text-white rounded-md disabled:opacity-50"
            >
              Compare Versions
            </button>
          </div>
          
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {versions.map((version: ComponentVersionType, index) => (
              <div 
                key={version.id}
                className={`p-3 flex items-center ${
                  index !== versions.length - 1 ? 'border-b border-gray-200 dark:border-gray-700' : ''
                } ${
                  selectedVersionIds.includes(version.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedVersionIds.includes(version.id)}
                  onChange={() => handleVersionSelect(version.id)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mr-3"
                />
                
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    Version {versions.length - index}
                    {index === 0 && (
                      <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 flex items-center">
                    <Calendar size={12} className="mr-1" />
                    {format(new Date(version.createdAt), 'MMM d, yyyy')}
                    <Clock size={12} className="ml-3 mr-1" />
                    {format(new Date(version.createdAt), 'HH:mm')}
                    {version.userId && (
                      <>
                        <span className="mx-2">•</span>
                        <span>{version.userId}</span>
                      </>
                    )}
                  </div>
                  {version.changeMessage && (
                    <div className="text-xs mt-1 text-gray-600 dark:text-gray-400">
                      {version.changeMessage}
                    </div>
                  )}
                </div>
                
                {index !== 0 && (
                  <button
                    onClick={() => handleRestoreVersion(version.id)}
                    className="ml-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm"
                  >
                    Restore
                  </button>
                )}
              </div>
            ))}
          </div>
          
          {comparisonData && (
            <div className="mt-6">
              <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Version Comparison
              </h4>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden p-4">
                {/* Implement diff view here with a library like react-diff-viewer */}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  </div>
);
};

// Component Comments
const ComponentComments = ({ componentId }: { componentId: string }) => {
const [comments, setComments] = useState<Comment[]>([]);
const [isLoading, setIsLoading] = useState(true);
const [newComment, setNewComment] = useState('');

useEffect(() => {
  if (!componentId) return;
  
  const fetchComments = async () => {
    try {
      setIsLoading(true);
      
      const response = await fetch(`/api/components/${componentId}/comments`);
      if (!response.ok) {
        throw new Error('Failed to fetch comments');
      }
      
      const data = await response.json();
      // Handle the response data structure from the API
      setComments(Array.isArray(data.data) ? data.data : []);
    } catch (error) {
      console.error('Error fetching comments:', error);
      setComments([]);
    } finally {
      setIsLoading(false);
    }
  };
  
  fetchComments();
}, [componentId]);

const handleAddComment = async (e: React.FormEvent) => {
  e.preventDefault();
  
  if (!newComment.trim()) return;
  
  try {
    const response = await fetch(`/api/components/${componentId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: newComment
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to add comment');
    }
    
    const data = await response.json();
    // Handle the response data structure from the API
    const addedComment = data.data;
    if (addedComment) {
      setComments(prev => [addedComment, ...prev]);
      setNewComment('');
    } else {
      throw new Error('Invalid comment data received');
    }
  } catch (error) {
    console.error('Error adding comment:', error);
    toast.error('Failed to add comment');
  }
};

return (
  <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden">
    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
      <h3 className="font-medium text-gray-900 dark:text-white">Comments & Collaboration</h3>
    </div>
    
    <div className="p-6">
      <form onSubmit={handleAddComment} className="mb-6">
        <div className="mb-3">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment or feedback..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 resize-none"
            rows={3}
          ></textarea>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!newComment.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            Add Comment
          </button>
        </div>
      </form>
      
      {isLoading ? (
        <div className="flex items-center justify-center h-32"><Loading/></div>
      ) : comments.length === 0 ? (
        <div className="text-center py-12">
          <MessageCircle size={48} className="mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500 dark:text-gray-400">No comments yet</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Be the first to add a comment to this component.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map(comment => (
            <div key={comment.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center mb-2">
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 font-medium text-sm mr-3">
                  {comment.user?.name?.charAt(0) || 'U'}
                </div>
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {comment.user?.name || 'Unknown User'}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {format(new Date(comment.createdAt), 'MMM d, yyyy HH:mm')}
                  </div>
                </div>
              </div>
              <div className="text-gray-700 dark:text-gray-300 ml-11">
                {comment.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);
};

// Component Analysis
interface AnalysisResult {
  complexity: {
    score: number;
    factors: Array<{
      name: string;
      value: any;
      benchmark: number;
    }>;
  };
  performance: {
    score: number;
    metrics: Array<{
      name: string;
      value: number;
      unit: string;
      benchmark: number;
    }>;
  };
  compatibility: {
    score: number;
    platforms: Array<{
      name: string;
      compatible: boolean;
    }>;
  };
  usage: {
    references: number;
    lastUsed: string;
    projects: Array<{
      id: string;
      name: string;
      usageCount: number;
    }>;
  };
}

const ComponentAnalysis = ({ componentData }: { componentData: any }) => {
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [chartInstances, setChartInstances] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!componentData) return;
    
    const analyzeComponent = async () => {
      try {
        setIsLoading(true);
        
        // In a real implementation, this would be an API call
        // For this demo, we'll generate sample data
        const results = await mockComponentAnalysis(componentData);
        setAnalysisResults(results);
      } catch (error) {
        console.error('Error analyzing component:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    analyzeComponent();
    
    return () => {
      // Cleanup chart instances
      Object.values(chartInstances).forEach(chart => {
        if (chart) (chart as any).destroy();
      });
    };
  }, [componentData]);

  useEffect(() => {
    if (!analysisResults) return;
    
    // Create charts once analysis results are available
    createCharts();
  }, [analysisResults]);

  const mockComponentAnalysis = async (data: any): Promise<AnalysisResult> => {
    // This would be a real API call in production
    // For now, we'll generate some sample analysis
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Complexity factors based on actual data structure
    const jsonString = JSON.stringify(data);
    const nestingDepth = calculateNestingDepth(data);
    const propertyCount = countProperties(data);
    const dependencies = (data.references || []).length;
    
    // Calculate complexity score (example algorithm)
    const complexityScore = Math.max(0, 100 - 5 * (
      Math.max(0, nestingDepth - 3) + 
      Math.max(0, (propertyCount - 10) / 5) + 
      Math.max(0, dependencies - 2)
    ));
    
    // Estimate memory usage based on data complexity
    const jsonSize = jsonString.length;
    const memoryUsage = Math.round(jsonSize * 1.2); // Rough estimate, KB
    
    // Estimate render time based on component type and complexity
    let renderTime = 10; // Base render time in ms
    if (data.type === 'mechanical' || data.type === 'structural') {
      renderTime += jsonSize / 100; // More complex mechanical parts take longer
    }
    
    // Estimate load time
    const loadTime = 20 + renderTime / 2;
    
    // Calculate performance score
    const performanceScore = Math.max(0, 100 - (
      (memoryUsage > 300 ? 5 : 0) +
      (renderTime > 20 ? 10 : 0) +
      (loadTime > 50 ? 5 : 0)
    ));
    
    // Check compatibility
    let webCompatible = true;
    let mobileCompatible = true;
    let desktopCompatible = true;
    
    // Very large components might be incompatible with mobile
    if (jsonSize > 100000) {
      mobileCompatible = false;
    }
    
    // Calculate compatibility score
    const compatibleCount = [webCompatible, mobileCompatible, desktopCompatible].filter(Boolean).length;
    const compatibilityScore = Math.round((compatibleCount / 3) * 100);
    
    // Generate mock usage statistics
    const usageReferences = Math.floor(Math.random() * 10);
    const lastUsedDate = new Date();
    lastUsedDate.setDate(lastUsedDate.getDate() - Math.floor(Math.random() * 30));
    
    const projectsCount = Math.min(3, Math.max(1, Math.floor(Math.random() * 4)));
    const projects = [];
    for (let i = 0; i < projectsCount; i++) {
      projects.push({
        id: `proj-${i + 1}`,
        name: `Project ${String.fromCharCode(65 + i)}`,
        usageCount: Math.floor(Math.random() * 5) + 1
      });
    }
    
    return {
      complexity: {
        score: Math.round(complexityScore),
        factors: [
          { name: 'Nesting Depth', value: nestingDepth, benchmark: 3 },
          { name: 'Property Count', value: propertyCount, benchmark: 15 },
          { name: 'Dependencies', value: dependencies, benchmark: 2 }
        ]
      },
      performance: {
        score: Math.round(performanceScore),
        metrics: [
          { name: 'Memory Usage', value: memoryUsage, unit: 'KB', benchmark: 300 },
          { name: 'Render Time', value: Math.round(renderTime), unit: 'ms', benchmark: 20 },
          { name: 'Load Time', value: Math.round(loadTime), unit: 'ms', benchmark: 50 }
        ]
      },
      compatibility: {
        score: compatibilityScore,
        platforms: [
          { name: 'Web', compatible: webCompatible },
          { name: 'Mobile', compatible: mobileCompatible },
          { name: 'Desktop', compatible: desktopCompatible }
        ]
      },
      usage: {
        references: usageReferences,
        lastUsed: lastUsedDate.toISOString().split('T')[0],
        projects
      }
    };
  };

  function calculateNestingDepth(obj: any, currentDepth = 0): number {
    if (!obj || typeof obj !== 'object') return currentDepth;
    
    let maxDepth = currentDepth;
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key) && typeof obj[key] === 'object' && obj[key] !== null) {
        const depth = calculateNestingDepth(obj[key], currentDepth + 1);
        maxDepth = Math.max(maxDepth, depth);
      }
    }
    
    return maxDepth;
  }

  function countProperties(obj: any): number {
    if (!obj || typeof obj !== 'object') return 0;
    
    let count = 0;
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        count++;
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          count += countProperties(obj[key]);
        }
      }
    }
    
    return count;
  }

  const createCharts = () => {
    if (!analysisResults) return;
    
    // Cleanup previous charts
    Object.values(chartInstances).forEach(chart => {
      if (chart) (chart as any).destroy();
    });
    
    // Destroy existing chart instances
    const newChartInstances: Record<string, any> = {};
    
    // Complexity radar chart
    const complexityCtx = document.getElementById('complexity-chart') as HTMLCanvasElement;
    if (complexityCtx && analysisResults) {
      newChartInstances.complexity = new ChartJS(complexityCtx, {
        type: 'radar',
        data: {
          labels: analysisResults.complexity.factors.map(f => f.name),
          datasets: [
            {
              label: 'Component',
              data: analysisResults.complexity.factors.map(f => f.value),
              fill: true,
              backgroundColor: 'rgba(54, 162, 235, 0.2)',
              borderColor: 'rgb(54, 162, 235)',
              pointBackgroundColor: 'rgb(54, 162, 235)',
              pointBorderColor: '#fff',
              pointHoverBackgroundColor: '#fff',
              pointHoverBorderColor: 'rgb(54, 162, 235)'
            },
            {
              label: 'Benchmark',
              data: analysisResults.complexity.factors.map(f => f.benchmark),
              fill: true,
              backgroundColor: 'rgba(255, 99, 132, 0.2)',
              borderColor: 'rgb(255, 99, 132)',
              pointBackgroundColor: 'rgb(255, 99, 132)',
              pointBorderColor: '#fff',
              pointHoverBackgroundColor: '#fff',
              pointHoverBorderColor: 'rgb(255, 99, 132)'
            }
          ]
        },
        options: {
          elements: {
            line: {
              borderWidth: 3
            }
          },
          plugins: {
            legend: {
              position: 'bottom'
            }
          }
        }
      });
    }
    
    // Performance bar chart
    const performanceCtx = document.getElementById('performance-chart');
    if (performanceCtx) {
      newChartInstances.performance = new ChartJS(performanceCtx as HTMLCanvasElement, {
        type: 'bar',
        data: {
          labels: analysisResults.performance.metrics.map(m => m.name),
          datasets: [
            {
              label: 'Component',
              data: analysisResults.performance.metrics.map(m => m.value),
              backgroundColor: 'rgba(54, 162, 235, 0.5)',
              borderColor: 'rgb(54, 162, 235)',
              borderWidth: 1
            },
            {
              label: 'Benchmark',
              data: analysisResults.performance.metrics.map(m => m.benchmark),
              backgroundColor: 'rgba(255, 99, 132, 0.5)',
              borderColor: 'rgb(255, 99, 132)',
              borderWidth: 1
            }
          ]
        },
        options: {
          plugins: {
            legend: {
              position: 'bottom'
            }
          },
          scales: {
            y: {
              beginAtZero: true
            }
          }
        }
      });
    }
    
    setChartInstances(newChartInstances);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!analysisResults) {
    return (
      <div className="text-center text-gray-500 dark:text-gray-400 py-8">
        Unable to analyze component. Please check the component data.
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-medium text-gray-900 dark:text-white">Component Analysis</h3>
      </div>
      
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Complexity Section */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-medium text-gray-900 dark:text-white">Complexity</h4>
              <div className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${
                  analysisResults.complexity.score > 80 ? 'bg-green-500' :
                  analysisResults.complexity.score > 60 ? 'bg-yellow-500' : 'bg-red-500'
                }`}>
                  {analysisResults.complexity.score}
                </div>
              </div>
            </div>
            
            <div className="aspect-square">
              <canvas id="complexity-chart"></canvas>
            </div>
          </div>
          
          {/* Performance Section */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-medium text-gray-900 dark:text-white">Performance</h4>
              <div className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${
                  analysisResults.performance.score > 80 ? 'bg-green-500' :
                  analysisResults.performance.score > 60 ? 'bg-yellow-500' : 'bg-red-500'
                }`}>
                  {analysisResults.performance.score}
                </div>
              </div>
            </div>
            
            <div className="aspect-square">
              <canvas id="performance-chart"></canvas>
            </div>
          </div>
          
          {/* Compatibility Section */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-medium text-gray-900 dark:text-white">Compatibility</h4>
              <div className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${
                  analysisResults.compatibility.score > 80 ? 'bg-green-500' :
                  analysisResults.compatibility.score > 60 ? 'bg-yellow-500' : 'bg-red-500'
                }`}>
                  {analysisResults.compatibility.score}
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              {analysisResults.compatibility.platforms.map(platform => (
                <div key={platform.name} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-md shadow-sm">
                  <span className="text-gray-900 dark:text-white">{platform.name}</span>
                  {platform.compatible ? (
                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300 rounded-full text-xs">
                      Compatible
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300 rounded-full text-xs">
                      Not Compatible
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          {/* Usage Section */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-medium text-gray-900 dark:text-white">Usage Statistics</h4>
              <div className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 rounded-md text-xs">
                {analysisResults.usage.references} References
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="bg-white dark:bg-gray-800 p-3 rounded-md shadow-sm">
                <div className="text-sm text-gray-500 dark:text-gray-400">Last Used</div>
                <div className="text-gray-900 dark:text-white font-medium">
                  {new Date(analysisResults.usage.lastUsed).toLocaleDateString()}
                </div>
              </div>
              
              <div className="bg-white dark:bg-gray-800 p-3 rounded-md shadow-sm">
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Project Usage</div>
                {analysisResults.usage.projects.map(project => (
                  <div key={project.id} className="flex items-center justify-between mb-2 last:mb-0">
                    <span className="text-gray-900 dark:text-white">{project.name}</span>
                    <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full text-xs text-gray-700 dark:text-gray-300">
                      {project.usageCount} uses
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        
        {/* Recommendations Section */}
        <div className="mt-6 bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
          <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Recommendations</h4>
          
          <div className="space-y-3">
            {analysisResults.complexity.score < 70 && (
              <div className="bg-amber-50 dark:bg-amber-900/30 border-l-4 border-amber-500 p-3">
                <div className="text-amber-800 dark:text-amber-300 font-medium">Reduce Complexity</div>
                <div className="text-amber-700 dark:text-amber-400 text-sm">
                  Consider simplifying the component structure to improve maintainability.
                </div>
              </div>
            )}
            
            {analysisResults.performance.metrics.some(m => m.value > m.benchmark) && (
              <div className="bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 p-3">
                <div className="text-red-800 dark:text-red-300 font-medium">Optimize Performance</div>
                <div className="text-red-700 dark:text-red-400 text-sm">
                  The component exceeds performance benchmarks. Consider optimizing resource usage.
                </div>
              </div>
            )}
            
            {analysisResults.compatibility.platforms.some(p => !p.compatible) && (
              <div className="bg-orange-50 dark:bg-orange-900/30 border-l-4 border-orange-500 p-3">
                <div className="text-orange-800 dark:text-orange-300 font-medium">Improve Compatibility</div>
                <div className="text-orange-700 dark:text-orange-400 text-sm">
                  This component is not fully compatible with all platforms. Consider making it more universal.
                </div>
              </div>
            )}
            
            {(analysisResults.complexity.score >= 70 && 
              analysisResults.performance.metrics.every(m => m.value <= m.benchmark) && 
              analysisResults.compatibility.platforms.every(p => p.compatible)) && (
              <div className="bg-green-50 dark:bg-green-900/30 border-l-4 border-green-500 p-3">
                <div className="text-green-800 dark:text-green-300 font-medium">Good Component Health</div>
                <div className="text-green-700 dark:text-green-400 text-sm">
                  This component meets or exceeds all benchmarks. No major issues detected.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function ComponentDetailPage() {
const { data: session, status } = useSession();
const router = useRouter();
const { id } = router.query;

// State for component data and UI
const [component, setComponent] = useState<Component | null>(null);
const [isLoading, setIsLoading] = useState(true);
const [isSaving, setIsSaving] = useState(false);
const [activeTab, setActiveTab] = useState('editor');
const [error, setError] = useState<string | null>(null);
const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

// Enhanced state
const [splitView, setSplitView] = useState(false);
const [autoSave, setAutoSave] = useState(false);
const [saveMessage, setSaveMessage] = useState('');


// Local library store
const { addComponent } = useLocalComponentsLibraryStore();

// Form state
const [formData, setFormData] = useState({
  name: '',
  description: '',
  data: '',
  type: '',
  isPublic: false,
  thumbnail: ''
});
const debouncedFormData = useDebounce(formData, 2000);
// Initialize activeTab from query param if available
useEffect(() => {
  if (router.query.tab) {
    setActiveTab(router.query.tab as string);
  } else if (router.query.preview === 'true') {
    setActiveTab('preview');
  }
}, [router.query]);

// Auto-save effect
useEffect(() => {
  if (autoSave && component && JSON.stringify(debouncedFormData) !== JSON.stringify(formData)) {
    handleSave();
  }
}, [autoSave, component, formData, debouncedFormData]);

// Fetch component data when component mounts or id changes
useEffect(() => {
  if (id && typeof id === 'string') {
    fetchComponent(id);
  }
}, [status, id]);

const fetchComponent = async (componentId: string) => {
  setIsLoading(true);
  setError(null);
  
  try {
    const data = await fetchComponentById(componentId);
    setComponent(data as Component);
    setFormData({
      name: data.name,
      description: data.description || '',
      data: JSON.stringify(data.data, null, 2),
      type: data.type || '',
      isPublic: data.isPublic || false,
      thumbnail: data.thumbnail || ''
    });
  } catch (err) {
    console.error('Error fetching component:', err);
    setError(err instanceof Error ? err.message : 'An unknown error occurred');
    
    // If component not found, redirect to components list
    if (err instanceof Error && err.message.includes('not found')) {
      router.push('/components');
    }
  } finally {
    setIsLoading(false);
  }
};

const handleSave = async (createNewVersion = true) => {
  if (!component || !component.id) {
    toast.error('Cannot save: Component not found or ID is missing');
    setIsSaving(false);
    return;
  }
  
  setIsSaving(true);
  setSaveMessage('');
  
  try {
    // Validate JSON
    const validation = validateJSON(formData.data);
    
    if (!validation.valid) {
      toast.error(
        <div>
          <div className="font-bold">Invalid JSON:</div>
          <ul className="list-disc pl-4">
            {validation.errors?.map((error, index) => (
              <li key={index}>{error as string}</li>
            ))}
          </ul>
        </div>
      );
      setIsSaving(false);
      return;
    }
    
    // Log the data being sent for debugging
    console.log('Saving component data:', {
      id: component.id,
      name: formData.name,
      description: formData.description,
      type: formData.type,
      isPublic: formData.isPublic,
      data: validation.parsedData
    });
    
    // Safely format URL with component ID check
    const componentId = component.id.toString();
    
    // Update component with direct API call
    const response = await fetch(`/api/components/${componentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: formData.name,
        description: formData.description,
        type: formData.type,
        isPublic: formData.isPublic,
        data: validation.parsedData
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to update component');
    }
    
    // Get updated component data
    const updatedComponent = await response.json();
    setComponent(updatedComponent);
    
    // Create version history entry if enabled
    if (createNewVersion) {
      try {
        await fetch(`/api/components/${componentId}/versions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            data: validation.parsedData,
            changeMessage: 'Updated component'
          })
        });
      } catch (versionError) {
        console.error('Error creating version history:', versionError);
        // Non-critical error, don't fail the save operation
      }
    }
    
    toast.success('Component saved successfully');
    setSaveMessage('Saved ' + new Date().toLocaleTimeString());
  } catch (err) {
    console.error('Error updating component:', err);
    toast.error(err instanceof Error ? err.message : 'Failed to update component');
  } finally {
    setIsSaving(false);
  }
};

const handleDelete = async () => {
  if (!component || !confirm('Are you sure you want to delete this component?')) return;
  
  setIsLoading(true);
  
  try {
    await deleteComponent(component.id);
    toast.success('Component deleted successfully');
    
    // Redirect to components list after a short delay
    setTimeout(() => {
      router.push('/components');
    }, 1000);
  } catch (err) {
    console.error('Error deleting component:', err);
    toast.error(err instanceof Error ? err.message : 'Failed to delete component');
    setIsLoading(false);
  }
};

const handleSaveToLocalLibrary = () => {
  if (!component) return;
  
  try {
    // Convert the component to local library format
    const localComponent = {
      name: component.name,
      description: component.description || '',
      type: component.type || 'mechanical',
      data: typeof component.data === 'object' ? component.data : { type: component.type || 'mechanical', version: "1.0" },
      tags: []
    };
    
    // Save to local library
    addComponent(localComponent);
    
    // Show success message
    toast.success('Component saved to local library successfully');
  } catch (err) {
    console.error('Failed to save to local library:', err);
    toast.error(err instanceof Error ? err.message : 'Failed to save to local library');
  }
};
const { 
  drawings, 
  
  refreshDrawings, 
  addDrawing 
} = useProjectDrawings(component?.projectId as string);
const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
  const { name, value, type } = e.target;
  
  if (type === 'checkbox') {
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => ({ ...prev, [name]: checked }));
  } else {
    setFormData(prev => ({ ...prev, [name]: value }));
  }
};

const handleEditorChange = (value: string) => {
  setFormData(prev => ({ ...prev, data: value }));
};

const handleBack = () => {
  router.push('/components');
};

const handleSendToCAD = useCallback(() => {
  if (!component) return;
  
  try {
    const success = ComponentCadBridge.sendComponentToCAD(component as Component, {
      validateBeforeSend: true
    });
    
    if (success) {
      router.push({
        pathname: '/cad',
        query: { 
          loadComponent: component.id,
          ts: Date.now() // Add timestamp to force reload
        }
      });
      
      toast.success(`${component.name} opening in CAD editor`);
    } else {
      toast.error('Unable to send component to CAD editor');
    }
  } catch (err) {
    console.error('Error sending component to CAD:', err);
    toast.error('Unable to send component to CAD: ' + (err instanceof Error ? err.message : 'Unknown error'));
  }
}, [component, router]);

const handleDuplicateComponent = async () => {
  if (!component || !component.id) {
    toast.error('Cannot duplicate: Component not found or ID is missing');
    return;
  }
  
  try {
    setIsLoading(true);
    
    // Create a duplicate with the same data but a new name
    const duplicateData = {
      id: component.id,
      name: `${component.name} (Copy)`,
      description: component.description,
      type: component.type,
      isPublic: false, // Default to private for the copy
      thumbnail: component.thumbnail,
      projectId: component.projectId,
      data: component.data
    };
    
    // Create the component
    const response = await fetch('/api/components', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(duplicateData)
    });
    
    if (!response.ok) {
      throw new Error('Failed to duplicate component');
    }
    
    const duplicatedComponent = await response.json();
    
    // Show success message
    toast.success('Component duplicated successfully');
    
    // Navigate to the new component
    router.push(`/components/${duplicatedComponent.id}`);
  } catch (err) {
    console.error('Error duplicating component:', err);
    toast.error(err instanceof Error ? err.message : 'Failed to duplicate component');
    setIsLoading(false);
  }
};

const generatePreview = () => {
  if (!component || !component.data) {
    toast.error('Cannot generate preview: Component data is missing');
    return;
  }
  
  setIsGeneratingPreview(true);
  
  // Simulate preview generation (in a real app, this would call a service)
  setTimeout(() => {
    // Generate a placeholder preview (this would be a real rendering in production)
    const previewUrl = `data:image/svg+xml;base64,${btoa(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
        <rect width="400" height="300" fill="#f0f0f0" />
        <text x="200" y="150" font-family="Arial" font-size="20" text-anchor="middle">
          ${component.name} Preview
        </text>
        <text x="200" y="180" font-family="Arial" font-size="12" text-anchor="middle">
          Type: ${component.type || 'Custom'}
        </text>
      </svg>`
    )}`;
    
    // Update form data with the new thumbnail
    setFormData(prev => ({
      ...prev,
      thumbnail: previewUrl
    }));
    
    setIsGeneratingPreview(false);
    toast.success('Preview generated successfully');
  }, 1500);
};

const exportComponent = () => {
  if (!component || !component.id) {
    toast.error('Cannot export: Component not found or ID is missing');
    return;
  }
  
  try {
    // Create a full export with all metadata
    const exportData = {
      id: component.id,
      name: component.name,
      description: component.description,
      type: component.type,
      data: component.data,
      thumbnail: component.thumbnail,
      createdAt: component.createdAt,
      updatedAt: component.updatedAt,
      isPublic: component.isPublic,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };
    
    // Convert to JSON string
    const jsonString = JSON.stringify(exportData, null, 2);
    
    // Create a download link
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create a download link and trigger it
    const a = document.createElement('a');
    a.href = url;
    a.download = `${component.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    
    toast.success('Component exported successfully');
  } catch (err) {
    console.error('Error exporting component:', err);
    toast.error('Failed to export component');
  }
};

if (status === 'loading' || (isLoading && !error)) {
  return (
    <div className="flex h-screen items-center justify-center">
      <Loading />
    </div>
  );
}

if (status === 'unauthenticated') {
  router.push('/auth/signin');
  return null;
}

return (
  <MotionConfig reducedMotion="user">
    <Metatags title={component ? `${component.name} | Component Editor` : 'Component Editor'} 
    description={component?.description || ''}
    ogImage={`/api/og-image/component/${component?.id}?title=${encodeURIComponent(component?.name || '')}`}/>
    <Layout>
      <div className="flex flex-col rounded-xl h-full">
        {/* Header */}
        <motion.div 
          className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-4 md:px-6"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
            <div className="flex items-center">
              <motion.button
                onClick={handleBack}
                className="mr-4 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                whileHover={{ scale: 1.1, backgroundColor: "rgba(0,0,0,0.05)" }}
                whileTap={{ scale: 0.95 }}
              >
                <ArrowLeft size={20} />
              </motion.button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
                  {component ? component.name : 'Component not found'}
                  {component?.isPublic && (
                    <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300">
                      Public
                    </span>
                  )}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center flex-wrap">
                  <span className="flex items-center mr-3">
                    <span className="mr-1">ID:</span>
                    <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs font-mono">
                      {component?.id}
                    </code>
                  </span>
                  <span className="mr-3">•</span>
                  <span className="text-gray-500 dark:text-gray-400 mr-3">
                    {component?.type || 'Custom'} Component
                  </span>
                  {saveMessage && (
                    <>
                      <span className="mr-3">•</span>
                      <span className="text-green-600 dark:text-green-400 text-xs">
                        {saveMessage}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>
            
            {component && (
              <div className="flex flex-col gap-2">
                <motion.button
                  onClick={handleSendToCAD}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 flex items-center shadow-sm"
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Cpu size={18} className="mr-2" />
                  Open in CAD
                </motion.button>
                <motion.button
                  onClick={handleDuplicateComponent}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center shadow-sm"
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Copy size={18} className="mr-2" />
                  Duplicate
                </motion.button>
                <motion.button
                  onClick={handleSaveToLocalLibrary}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center shadow-sm"
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Save size={18} className="mr-2" />
                  Save to Library
                </motion.button>
                <motion.button
                  onClick={exportComponent}
                  className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 flex items-center shadow-sm"
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Download size={18} className="mr-2" />
                  Export
                </motion.button>
                <motion.button
                  onClick={handleDelete}
                  className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-red-600 dark:text-red-400 px-4 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-red-500 flex items-center"
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={isSaving || isLoading}
                >
                  <Trash2 size={18} className="mr-2" />
                  Delete
                </motion.button>
                <motion.button
                  onClick={() => handleSave(true)}
                  disabled={isSaving || isLoading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center shadow-sm"
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Save size={18} className="mr-2" />
                  {isSaving ? 'Saving...' : 'Save'}
                </motion.button>
              </div>
            )}
          </div>
        </motion.div>
        
        {/* Display error */}
        {error && !component && (
          <motion.div 
            className="flex-1 flex items-center justify-center p-6"
            variants={fadeIn}
            initial="hidden"
            animate="visible"
          >
            <div className="text-center max-w-md">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={28} className="text-red-500 dark:text-red-400" />
              </div>
              <div className="text-red-600 dark:text-red-400 text-lg mb-4">{error}</div>
              <motion.button
                onClick={handleBack}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 shadow-sm"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Return to Component List
              </motion.button>
            </div>
          </motion.div>
        )}
        
        {component && (
          <>
            {/* Tabs */}
            <motion.div 
              className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
            >
              <div className="flex flex-col-2 px-4 md:px-6 overflow-x-auto justify-between">
                  <div className=" overflow-x-auto">
                    <motion.button
                      className={cn(
                        "px-4 py-3 font-medium text-sm focus:outline-none relative whitespace-nowrap",
                        activeTab === 'editor'
                          ? 'text-blue-600 dark:text-blue-400' 
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                      )}
                      onClick={() => setActiveTab('editor')}
                      whileHover={{ y: -1 }}
                      whileTap={{ y: 1 }}
                    >
                      <div className="flex items-center">
                        <Code size={16} className="mr-2" />
                        Component Data
                      </div>
                      {activeTab === 'editor' && (
                        <motion.div 
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" 
                          layoutId="activeTabIndicator"
                        />
                      )}
                    </motion.button>
                    <motion.button
                      className={cn(
                        "px-4 py-3 font-medium text-sm focus:outline-none relative whitespace-nowrap",
                        activeTab === 'preview'
                          ? 'text-blue-600 dark:text-blue-400' 
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                      )}
                      onClick={() => setActiveTab('preview')}
                      whileHover={{ y: -1 }}
                      whileTap={{ y: 1 }}
                    >
                      <div className="flex items-center">
                        <Eye size={16} className="mr-2" />
                        Preview
                      </div>
                      {activeTab === 'preview' && (
                        <motion.div 
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" 
                          layoutId="activeTabIndicator"
                        />
                      )}
                    </motion.button>
                    <motion.button
                      className={cn(
                        "px-4 py-3 font-medium text-sm focus:outline-none relative whitespace-nowrap",
                        activeTab === 'structure'
                          ? 'text-blue-600 dark:text-blue-400' 
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                      )}
                      onClick={() => setActiveTab('structure')}
                      whileHover={{ y: -1 }}
                      whileTap={{ y: 1 }}
                    >
                      <div className="flex items-center">
                        <Layers size={16} className="mr-2" />
                        Structure
                      </div>
                      {activeTab === 'structure' && (
                        <motion.div 
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" 
                          layoutId="activeTabIndicator"
                        />
                      )}
                    </motion.button>
                    <motion.button
                      className={cn(
                        "px-4 py-3 font-medium text-sm focus:outline-none relative whitespace-nowrap",
                        activeTab === 'properties'
                          ? 'text-blue-600 dark:text-blue-400' 
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                      )}
                      onClick={() => setActiveTab('properties')}
                      whileHover={{ y: -1 }}
                      whileTap={{ y: 1 }}
                    >
                      <div className="flex items-center">
                        <Info size={16} className="mr-2" />
                        Properties
                      </div>
                      {activeTab === 'properties' && (
                        <motion.div 
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" 
                          layoutId="activeTabIndicator"
                        />
                      )}
                    </motion.button>
                    <motion.button
                      className={cn(
                        "px-4 py-3 font-medium text-sm focus:outline-none relative whitespace-nowrap",
                        activeTab === 'relationships'
                          ? 'text-blue-600 dark:text-blue-400' 
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                      )}
                      onClick={() => setActiveTab('relationships')}
                      whileHover={{ y: -1 }}
                      whileTap={{ y: 1 }}
                    >
                      <div className="flex items-center">
                        <Share size={16} className="mr-2" />
                        Relationships
                      </div>
                      {activeTab === 'relationships' && (
                        <motion.div 
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" 
                          layoutId="activeTabIndicator"
                        />
                      )}
                    </motion.button>
                    <motion.button
                      className={cn(
                        "px-4 py-3 font-medium text-sm focus:outline-none relative whitespace-nowrap",
                        activeTab === 'versions'
                          ? 'text-blue-600 dark:text-blue-400' 
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                      )}
                      onClick={() => setActiveTab('versions')}
                      whileHover={{ y: -1 }}
                      whileTap={{ y: 1 }}
                    >
                      <div className="flex items-center">
                        <Activity size={16} className="mr-2" />
                        Versions
                      </div>
                      {activeTab === 'versions' && (
                        <motion.div 
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" 
                          layoutId="activeTabIndicator"
                        />
                      )}
                    </motion.button>
                    <motion.button
                      className={cn(
                        "px-4 py-3 font-medium text-sm focus:outline-none relative whitespace-nowrap",
                        activeTab === 'collaboration'
                          ? 'text-blue-600 dark:text-blue-400' 
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                      )}
                      onClick={() => setActiveTab('collaboration')}
                      whileHover={{ y: -1 }}
                      whileTap={{ y: 1 }}
                    >
                      <div className="flex items-center">
                        <MessageCircle size={16} className="mr-2" />
                        Collaboration
                      </div>
                      {activeTab === 'collaboration' && (
                        <motion.div 
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" 
                          layoutId="activeTabIndicator"
                        />
                      )}
                    </motion.button>
                    <motion.button
                      className={cn(
                        "px-4 py-3 font-medium text-sm focus:outline-none relative whitespace-nowrap",
                        activeTab === 'analysis'
                          ? 'text-blue-600 dark:text-blue-400' 
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                      )}
                      onClick={() => setActiveTab('analysis')}
                      whileHover={{ y: -1 }}
                      whileTap={{ y: 1 }}
                    >
                      <div className="flex items-center">
                        <BarChart2 size={16} className="mr-2" />
                        Analysis
                      </div>
                      {activeTab === 'analysis' && (
                        <motion.div 
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" 
                          layoutId="activeTabIndicator"
                        />
                      )}
                    </motion.button>
                  </div>
                  
                  <div className="flex items-center ml-4 space-x-3">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="autoSave"
                        checked={autoSave}
                        onChange={(e) => setAutoSave(e.target.checked)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label htmlFor="autoSave" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                        Autosave
                      </label>
                    </div>
                    
                    <button
                      onClick={() => setSplitView(!splitView)}
                      className="text-sm bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-md flex items-center"
                    >
                      {splitView ? (
                        <>
                          <Minimize2 size={14} className="mr-1" />
                          Single View
                        </>
                      ) : (
                        <>
                          <Maximize2 size={14} className="mr-1" />
                          Split View
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
              
              {/* Main content */}
              <div className="flex-1 overflow-auto p-4 md:p-6">
                <AnimatePresence mode="wait">
                  {splitView ? (
                    <motion.div
                      key="split-view"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="h-[calc(100vh-240px)]"
                    >
                      <Split
                        className="flex h-full"
                        sizes={[50, 50]}
                        minSize={200}
                        gutterSize={10}
                        gutterAlign="center"
                        snapOffset={30}
                      >
                        <div className="overflow-auto pr-2 h-full">
                          {/* Editor */}
                          <div className="h-full border border-gray-300 dark:border-gray-700 rounded-lg">
                            <MonacoEditor
                              height="100%"
                              language="json"
                              theme="vs-dark"
                              value={formData.data}
                              onChange={(value) => handleEditorChange(value ?? '')}
                              options={{
                                minimap: { enabled: true },
                                formatOnPaste: true,
                                formatOnType: true,
                                automaticLayout: true,
                              }}
                            />
                          </div>
                        </div>
                        <div className="overflow-auto pl-2 h-full">
                          {/* Preview and Info */}
                          <div className="h-full bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
                            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                              <h3 className="font-medium text-gray-900 dark:text-white">Component Preview</h3>
                            </div>
                            <div className="flex-1 overflow-auto p-4">
                              <ThreeDPreview componentData={component.data} />
                            </div>
                          </div>
                        </div>
                      </Split>
                    </motion.div>
                  ) : (
                    // Tab-based content
                    <>
                      {activeTab === 'editor' && (
                        <motion.div 
                          key="editor"
                          className="h-full"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          transition={{ duration: 0.3 }}
                        >
                          <div className="h-[calc(100vh-240px)] border border-gray-300 dark:border-gray-700 rounded-lg">
                            <MonacoEditor
                              height="100%"
                              language="json"
                              theme="vs-dark"
                              value={formData.data}
                              onChange={(value) => handleEditorChange(value ?? '')}
                              options={{
                                minimap: { enabled: true },
                                formatOnPaste: true,
                                formatOnType: true,
                                automaticLayout: true,
                              }}
                            />
                          </div>
                        </motion.div>
                      )}
                      
                      {activeTab === 'preview' && (
                        <motion.div 
                          key="preview"
                          className="h-full bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          transition={{ duration: 0.3 }}
                        >
                          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                            <h3 className="font-medium text-gray-900 dark:text-white">Component Preview</h3>
                            <motion.button
                              onClick={generatePreview}
                              disabled={isGeneratingPreview}
                              className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center"
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              {isGeneratingPreview ? (
                                <>
                                  <motion.div 
                                    className="w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"
                                    animate={{ rotate: 360 }}
                                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                  />
                                  Generating...
                                </>
                              ) : (
                                <>
                                  <Image size={16} className="mr-2" />
                                  Generate Thumbnail
                                </>
                              )}
                            </motion.button>
                          </div>
                          
                          <div className="p-6 flex flex-col space-y-6">
                            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">3D Preview</h4>
                              <ThreeDPreview componentData={component.data} />
                            </div>
                            
                            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Thumbnail</h4>
                              {formData.thumbnail ? (
                                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 max-w-md mx-auto">
                                  <img 
                                    src={formData.thumbnail} 
                                    alt={formData.name} 
                                    className="max-w-full h-auto max-h-[300px] object-contain mx-auto"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJmZWF0aGVyIGZlYXRoZXItaW1hZ2UiPjxyZWN0IHg9IjMiIHk9IjMiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgcng9IjIiIHJ5PSIyIj48L3JlY3Q+PGNpcmNsZSBjeD0iOC41IiBjeT0iOC41IiByPSIxLjUiPjwvY2lyY2xlPjxwb2x5bGluZSBwb2ludHM9IjIxIDE1IDE2IDEwIDUgMjEiPjwvcG9seWxpbmU+PC9zdmc+';
                                    }}
                                  />
                                  <div className="mt-4 flex justify-between items-center">
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                      Thumbnail URL:
                                    </p>
                                    <div className="flex items-center">
                                      <input
                                        type="text"
                                        name="thumbnail"
                                        value={formData.thumbnail}
                                        onChange={handleChange}
                                        className="text-xs border border-gray-300 dark:border-gray-700 rounded px-2 py-1 w-64 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                      />
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-center p-8">
                                  <motion.div 
                                    className="mx-auto w-32 h-32 bg-gray-200 dark:bg-gray-900 rounded-full flex items-center justify-center mb-4"
                                    animate={{ 
                                      rotate: [0, 5, 0, -5, 0],
                                      scale: [1, 1.02, 1, 1.02, 1]
                                    }}
                                    transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                                  >
                                    <Image size={48} className="text-gray-400 dark:text-gray-500" />
                                  </motion.div>
                                  <p className="text-gray-500 dark:text-gray-400 mb-4">No preview available</p>
                                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                                    Generate a preview of this component or add a thumbnail URL below
                                  </p>
                                  <div className="flex items-center justify-center">
                                    <input
                                      type="text"
                                      name="thumbnail"
                                      value={formData.thumbnail}
                                      onChange={handleChange}
                                      placeholder="Enter thumbnail URL..."
                                      className="border border-gray-300 dark:border-gray-700 rounded-l-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                    />
                                    <button
                                      onClick={() => setFormData(prev => ({ ...prev, thumbnail: prev.thumbnail }))}
                                      className="bg-blue-600 text-white px-3 py-2 rounded-r-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                      Set
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                      
                      {activeTab === 'structure' && (
                        <motion.div 
                          key="structure"
                          className="h-full"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          transition={{ duration: 0.3 }}
                        >
                          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                              <h3 className="font-medium text-gray-900 dark:text-white">Component Structure</h3>
                            </div>
                            
                            <div className="p-6">
                              {component.data && typeof component.data === 'object' ? (
                                <div className="grid md:grid-cols-2 gap-6">
                                  <div>
                                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Component Metadata</h4>
                                    <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md border border-gray-200 dark:border-gray-700">
                                      <div className="space-y-2">
                                        <div className="flex justify-between">
                                          <span className="text-sm text-gray-500 dark:text-gray-400">Type:</span>
                                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                                            {(component.data as any).type || 'Unknown'}
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-sm text-gray-500 dark:text-gray-400">Version:</span>
                                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                                            {(component.data as any).version || 'Unknown'}
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-sm text-gray-500 dark:text-gray-400">Element Count:</span>
                                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                                            {(component.data as any).elements?.length || 
                                            (component.data as any).geometry?.elements?.length || 
                                            'N/A'}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div>
                                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Properties</h4>
                                    <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md border border-gray-200 dark:border-gray-700">
                                      {(component.data as any).properties && 
                                      Object.keys((component.data as any).properties).length > 0 ? (
                                        <div className="space-y-2">
                                          {Object.entries((component.data as any).properties).map(([key, value]) => (
                                            <div key={key} className="flex justify-between">
                                              <span className="text-sm text-gray-500 dark:text-gray-400">{key}:</span>
                                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                                {String(value)}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                          No properties defined
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-gray-500 dark:text-gray-400">
                                  Unable to display component structure. The data may be in an invalid format.
                                </p>
                              )}
                              
                              {/* Usage section */}
                              <div className="mt-6">
                                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Using This Component</h4>
                                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md border border-gray-200 dark:border-gray-700">
                                  <div className="flex items-center mb-3">
                                    <Cpu size={16} className="text-purple-600 dark:text-purple-400 mr-2" />
                                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                                      Integration Options
                                    </span>
                                  </div>
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <button
                                      onClick={handleSendToCAD}
                                      className="flex items-center justify-between px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
                                    >
                                      <span className="text-sm text-gray-700 dark:text-gray-300">Open in CAD Editor</span>
                                      <ExternalLink size={14} className="text-gray-500 dark:text-gray-400" />
                                    </button>
                                    
                                    <button
                                      onClick={handleSaveToLocalLibrary}
                                      className="flex items-center justify-between px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
                                    >
                                      <span className="text-sm text-gray-700 dark:text-gray-300">Add to Local Library</span>
                                      <Save size={14} className="text-gray-500 dark:text-gray-400" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                      
                      {activeTab === 'properties' && (
                        <motion.div 
                          key="properties"
                          className="max-w-3xl mx-auto"
                          variants={slideUp}
                          initial="hidden"
                          animate="visible"
                        >
                          <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                            <div className="p-6">
                              <div className="mb-4">
                                <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Component Name
                                </label>
                                <input
                                  type="text"
                                  id="name"
                                  name="name"
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                                  value={formData.name}
                                  onChange={handleChange}
                                  required
                                />
                              </div>
                              
                              <div className="mb-4">
                                <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Description
                                </label>
                                <textarea
                                  id="description"
                                  name="description"
                                  rows={3}
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                                  value={formData.description}
                                  onChange={handleChange}
                                ></textarea>
                              </div>
                              
                              <div className="mb-4">
                                <label htmlFor="type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Component Type
                                </label>
                                <select
                                  id="type"
                                  name="type"
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                                  value={formData.type}
                                  onChange={handleChange}
                                >
                                  <option value="mechanical">Mechanical</option>
                                  <option value="electronic">Electronic</option>
                                  <option value="fixture">Fixture</option>
                                  <option value="tool">Tool</option>
                                  <option value="structural">Structural</option>
                                  <option value="enclosure">Enclosure</option>
                                  <option value="custom">Custom</option>
                                </select>
                              </div>
                              
                              <div className="flex items-center mb-6">
                                <input
                                  type="checkbox"
                                  id="isPublic"
                                  name="isPublic"
                                  checked={formData.isPublic}
                                  onChange={(e) => setFormData(prev => ({...prev, isPublic: e.target.checked}))}
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-700 rounded"
                                />
                                <label htmlFor="isPublic" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                                  Make component public (visible to all users)
                                </label>
                              </div>
                              
                              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Component Info</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                  <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
                                    <span className="block text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider mb-1">Component ID</span>
                                    <span className="font-mono text-gray-900 dark:text-gray-200 break-all">{component.id}</span>
                                  </div>
                                  <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
                                    <span className="block text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider mb-1">Project ID</span>
                                    <span className="text-gray-900 dark:text-gray-200 break-all">{component.projectId}</span>
                                  </div>
                                  <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
                                    <span className="block text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider mb-1">Created</span>
                                    <span className="text-gray-900 dark:text-gray-200">{new Date(component.createdAt).toLocaleString()}</span>
                                  </div>
                                  <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
                                    <span className="block text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider mb-1">Updated</span>
                                    <span className="text-gray-900 dark:text-gray-200">{new Date(component.updatedAt).toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                      
                      {activeTab === 'relationships' && (
                        <motion.div 
                          key="relationships"
                          className="h-full"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          transition={{ duration: 0.3 }}
                        >
                          <ComponentRelationships componentId={component?.id} />
                        </motion.div>
                      )}
                      
                      {activeTab === 'versions' && (
                        <motion.div 
                          key="versions"
                          className="h-full"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          transition={{ duration: 0.3 }}
                        >
                          <ComponentVersioning componentId={component.id} />
                        </motion.div>
                      )}
                      
                      {activeTab === 'collaboration' && (
                        <motion.div 
                          key="collaboration"
                          className="h-full"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          transition={{ duration: 0.3 }}
                        >
                          <ComponentComments componentId={component.id} />
                        </motion.div>
                      )}
                      
                      {activeTab === 'analysis' && (
                        <motion.div 
                          key="analysis"
                          className="h-full"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          transition={{ duration: 0.3 }}
                        >
                          <ComponentAnalysis componentData={component?.data} />
                        </motion.div>
                      )}
                    </>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}
        </div>
      </Layout>
    </MotionConfig>
  );
}