import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { Trash2, Eye, EyeOff, Move, RotateCcw } from "react-feather";

interface Force {
  id: string;
  position: THREE.Vector3;
  direction: THREE.Vector3;
  magnitude: number;
  color: string;
}

interface Constraint {
  id: string;
  position: THREE.Vector3;
  type: "fixed" | "pin" | "roller";
  normal: THREE.Vector3;
  color: string;
}

interface HeatSource {
  id: string;
  position: THREE.Vector3;
  power: number;
  radius: number;
  color: string;
}

interface ThermalBoundary {
  id: string;
  position: THREE.Vector3;
  temperature: number;
  type: "temperature" | "convection" | "radiation";
  color: string;
}

interface LoadsAndConstraintsProps {
  meshes: THREE.Mesh[];
  simulationType: "stress" | "thermal" | "coupled";
  onForceAdd: (force: Omit<Force, "id">) => void;
  onConstraintAdd: (constraint: Omit<Constraint, "id">) => void;
  onHeatSourceAdd: (heatSource: Omit<HeatSource, "id">) => void;
  onThermalBoundaryAdd: (boundary: Omit<ThermalBoundary, "id">) => void;
}

const LoadsAndConstraints: React.FC<LoadsAndConstraintsProps> = ({
  meshes,
  simulationType,
  onForceAdd,
  onConstraintAdd,
  onHeatSourceAdd,
  onThermalBoundaryAdd,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const frameRef = useRef<number>();

  const [forces, setForces] = useState<Force[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [heatSources, setHeatSources] = useState<HeatSource[]>([]);
  const [thermalBoundaries, setThermalBoundaries] = useState<ThermalBoundary[]>([]);

  const [selectedTool, setSelectedTool] = useState<"force" | "constraint" | "heat" | "thermal" | null>(null);
  const [isAddingLoad, setIsAddingLoad] = useState(false);
  const [showForces, setShowForces] = useState(true);
  const [showConstraints, setShowConstraints] = useState(true);
  const [showHeatSources, setShowHeatSources] = useState(true);
  const [showThermalBoundaries, setShowThermalBoundaries] = useState(true);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(renderer.domElement);

    // Setup camera
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);

    // Setup lights
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Add CAD meshes to scene
    meshes.forEach(mesh => {
      const clonedMesh = mesh.clone();
      clonedMesh.material = new THREE.MeshLambertMaterial({
        color: 0x888888,
        transparent: true,
        opacity: 0.7
      });
      scene.add(clonedMesh);
    });

    sceneRef.current = scene;
    rendererRef.current = renderer;
    cameraRef.current = camera;

    // Animation loop
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);

      // Simple camera rotation for demo
      if (camera) {
        const time = Date.now() * 0.0005;
        camera.position.x = Math.cos(time) * 10;
        camera.position.z = Math.sin(time) * 10;
        camera.lookAt(0, 0, 0);
      }

      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!camera || !renderer || !container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      window.removeEventListener('resize', handleResize);
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [meshes]);

  // Update forces visualization
  useEffect(() => {
    if (!sceneRef.current) return;

    // Remove existing arrows
    const arrowsToRemove = sceneRef.current.children.filter(child =>
      child.userData.type === 'force'
    );
    arrowsToRemove.forEach(arrow => sceneRef.current!.remove(arrow));

    if (!showForces) return;

    // Add new arrows for forces
    forces.forEach(force => {
      const arrowHelper = new THREE.ArrowHelper(
        force.direction.normalize(),
        force.position,
        force.magnitude / 100,
        force.color,
        force.magnitude / 200,
        force.magnitude / 400
      );
      arrowHelper.userData = { type: 'force', id: force.id };
      sceneRef.current!.add(arrowHelper);
    });
  }, [forces, showForces]);

  // Update constraints visualization
  useEffect(() => {
    if (!sceneRef.current) return;

    // Remove existing constraints
    const constraintsToRemove = sceneRef.current.children.filter(child =>
      child.userData.type === 'constraint'
    );
    constraintsToRemove.forEach(constraint => sceneRef.current!.remove(constraint));

    if (!showConstraints) return;

    // Add new constraints
    constraints.forEach(constraint => {
      let constraintGeometry: THREE.BufferGeometry;

      switch (constraint.type) {
        case "fixed":
          constraintGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
          break;
        case "pin":
          constraintGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.2);
          break;
        case "roller":
          constraintGeometry = new THREE.SphereGeometry(0.1);
          break;
        default:
          constraintGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
      }

      const constraintMaterial = new THREE.MeshBasicMaterial({ color: constraint.color });
      const constraintMesh = new THREE.Mesh(constraintGeometry, constraintMaterial);
      constraintMesh.position.copy(constraint.position);
      constraintMesh.userData = { type: 'constraint', id: constraint.id };
      sceneRef.current!.add(constraintMesh);
    });
  }, [constraints, showConstraints]);

  // Click handler for adding loads
  const handleCanvasClick = (event: React.MouseEvent) => {
    if (!selectedTool || !sceneRef.current || !cameraRef.current || !rendererRef.current) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    const meshObjects = sceneRef.current.children.filter(child =>
      child instanceof THREE.Mesh && !child.userData.type
    );
    const intersects = raycaster.intersectObjects(meshObjects);

    if (intersects.length > 0) {
      const point = intersects[0].point;
      const normal = intersects[0].face?.normal || new THREE.Vector3(0, 1, 0);

      switch (selectedTool) {
        case "force":
          const newForce = {
            position: point,
            direction: normal,
            magnitude: 1000,
            color: "#ff0000"
          };
          setForces(prev => [...prev, { ...newForce, id: Date.now().toString() }]);
          onForceAdd(newForce);
          break;

        case "constraint":
          const newConstraint = {
            position: point,
            type: "fixed" as const,
            normal: normal,
            color: "#00ff00"
          };
          setConstraints(prev => [...prev, { ...newConstraint, id: Date.now().toString() }]);
          onConstraintAdd(newConstraint);
          break;

        case "heat":
          if (simulationType === "thermal" || simulationType === "coupled") {
            const newHeatSource = {
              position: point,
              power: 100,
              radius: 0.5,
              color: "#ff8800"
            };
            setHeatSources(prev => [...prev, { ...newHeatSource, id: Date.now().toString() }]);
            onHeatSourceAdd(newHeatSource);
          }
          break;

        case "thermal":
          if (simulationType === "thermal" || simulationType === "coupled") {
            const newThermalBoundary = {
              position: point,
              temperature: 20,
              type: "temperature" as const,
              color: "#0088ff"
            };
            setThermalBoundaries(prev => [...prev, { ...newThermalBoundary, id: Date.now().toString() }]);
            onThermalBoundaryAdd(newThermalBoundary);
          }
          break;
      }
    }
  };

  const clearAll = () => {
    setForces([]);
    setConstraints([]);
    setHeatSources([]);
    setThermalBoundaries([]);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="bg-white border-b p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Loads and Constraints</h3>
          <button
            onClick={clearAll}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Clear all"
          >
            <Trash2 size={18} />
          </button>
        </div>

        {/* Tool selection */}
        <div className="flex space-x-2">
          <button
            onClick={() => setSelectedTool(selectedTool === "force" ? null : "force")}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${selectedTool === "force"
              ? "bg-red-100 text-red-700 border border-red-300"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
          >
            Forces
          </button>

          <button
            onClick={() => setSelectedTool(selectedTool === "constraint" ? null : "constraint")}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${selectedTool === "constraint"
              ? "bg-green-100 text-green-700 border border-green-300"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
          >
            Constraints
          </button>

          {(simulationType === "thermal" || simulationType === "coupled") && (
            <>
              <button
                onClick={() => setSelectedTool(selectedTool === "heat" ? null : "heat")}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${selectedTool === "heat"
                  ? "bg-orange-100 text-orange-700 border border-orange-300"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
              >
                Heat Sources
              </button>

              <button
                onClick={() => setSelectedTool(selectedTool === "thermal" ? null : "thermal")}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${selectedTool === "thermal"
                  ? "bg-blue-100 text-blue-700 border border-blue-300"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
              >
                Thermal Conditions
              </button>
            </>
          )}
        </div>

        {/* Visibility toggles */}
        <div className="flex space-x-4">
          <button
            onClick={() => setShowForces(!showForces)}
            className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-800"
          >
            {showForces ? <Eye size={16} /> : <EyeOff size={16} />}
            <span>Forces ({forces.length})</span>
          </button>

          <button
            onClick={() => setShowConstraints(!showConstraints)}
            className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-800"
          >
            {showConstraints ? <Eye size={16} /> : <EyeOff size={16} />}
            <span>Constraints ({constraints.length})</span>
          </button>

          {(simulationType === "thermal" || simulationType === "coupled") && (
            <>
              <button
                onClick={() => setShowHeatSources(!showHeatSources)}
                className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-800"
              >
                {showHeatSources ? <Eye size={16} /> : <EyeOff size={16} />}
                <span>Heat ({heatSources.length})</span>
              </button>

              <button
                onClick={() => setShowThermalBoundaries(!showThermalBoundaries)}
                className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-800"
              >
                {showThermalBoundaries ? <Eye size={16} /> : <EyeOff size={16} />}
                <span>Thermal ({thermalBoundaries.length})</span>
              </button>
            </>
          )}
        </div>

        {selectedTool && (
          <div className="bg-blue-50 p-3 rounded-lg">
            <p className="text-sm text-blue-700">
              {selectedTool === "force" && "Click on a point on the model to add a force"}
              {selectedTool === "constraint" && "Click on a point on the model to add a constraint"}
              {selectedTool === "heat" && "Click on a point on the model to add a heat source"}
              {selectedTool === "thermal" && "Click on a point on the model to add a thermal condition"}
            </p>
          </div>
        )}
      </div>

      {/* 3D Viewer */}
      <div className="flex-1 relative">
        <div
          ref={containerRef}
          className="w-full h-full cursor-crosshair"
          onClick={handleCanvasClick}
        />

        {/* Loading overlay */}
        {!sceneRef.current && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">Loading 3D viewer...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoadsAndConstraints;
