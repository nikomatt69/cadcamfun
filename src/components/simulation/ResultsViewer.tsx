import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { Download, Maximize2, RotateCcw, Eye, EyeOff, Settings } from "react-feather";

interface SimulationResults {
  displacements: Float32Array;
  stresses: Float32Array;
  temperatures?: Float32Array;
  maxStress: number;
  maxDisplacement: number;
  maxTemperature?: number;
  nodeCount: number;
  elementCount: number;
}

interface ResultsViewerProps {
  results: SimulationResults;
  meshes: THREE.Mesh[];
  simulationType: "stress" | "thermal" | "coupled";
  onExport: (format: "png" | "csv" | "vtk") => void;
}

const ResultsViewer: React.FC<ResultsViewerProps> = ({
  results,
  meshes,
  simulationType,
  onExport,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const frameRef = useRef<number>();

  const [viewMode, setViewMode] = useState<"displacement" | "stress" | "temperature">("stress");
  const [showDeformed, setShowDeformed] = useState(true);
  const [showWireframe, setShowWireframe] = useState(false);
  const [deformationScale, setDeformationScale] = useState(1.0);
  const [colorMapRange, setColorMapRange] = useState({ min: 0, max: 100 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [animationTime, setAnimationTime] = useState(0);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });

    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0xf0f0f0);
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

    sceneRef.current = scene;
    rendererRef.current = renderer;
    cameraRef.current = camera;

    // Animation loop
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      
      // Camera controls (simple orbit)
      if (camera && !isPlaying) {
        const time = Date.now() * 0.0005;
        camera.position.x = Math.cos(time) * 8;
        camera.position.z = Math.sin(time) * 8;
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
  }, [isPlaying]);

  // Update results visualization
  useEffect(() => {
    if (!sceneRef.current || !results) return;

    // Clear scene
    while (sceneRef.current.children.length > 2) { // Keep lights
      sceneRef.current.remove(sceneRef.current.children[2]);
    }

    // Create color map
    const createColorMap = (value: number, min: number, max: number): THREE.Color => {
      const normalized = (value - min) / (max - min);
      const hue = (1 - normalized) * 240 / 360; // Blue to Red
      return new THREE.Color().setHSL(hue, 1, 0.5);
    };

    // Add meshes with results
    meshes.forEach((originalMesh, meshIndex) => {
      const geometry = originalMesh.geometry.clone();
      const positions = geometry.attributes.position;
      const colors: number[] = [];

      // Apply deformations if requested
      if (showDeformed && results.displacements) {
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i);
          const y = positions.getY(i);
          const z = positions.getZ(i);

          const dispIndex = i * 3;
          const dispX = results.displacements[dispIndex] * deformationScale;
          const dispY = results.displacements[dispIndex + 1] * deformationScale;
          const dispZ = results.displacements[dispIndex + 2] * deformationScale;

          positions.setXYZ(i, x + dispX, y + dispY, z + dispZ);
        }
        positions.needsUpdate = true;
      }

      // Apply color map based on result type
      let resultData: Float32Array;
      let maxValue: number;
      
      switch (viewMode) {
        case "displacement":
          resultData = results.displacements;
          maxValue = results.maxDisplacement;
          break;
        case "stress":
          resultData = results.stresses;
          maxValue = results.maxStress;
          break;
        case "temperature":
          resultData = results.temperatures || new Float32Array();
          maxValue = results.maxTemperature || 100;
          break;
        default:
          resultData = results.stresses;
          maxValue = results.maxStress;
      }

      for (let i = 0; i < positions.count; i++) {
        let value: number;
        
        if (viewMode === "displacement" && results.displacements) {
          // Calculate displacement magnitude
          const dispIndex = i * 3;
          const dx = results.displacements[dispIndex];
          const dy = results.displacements[dispIndex + 1];
          const dz = results.displacements[dispIndex + 2];
          value = Math.sqrt(dx * dx + dy * dy + dz * dz);
        } else {
          value = resultData[i] || 0;
        }

        const color = createColorMap(value, colorMapRange.min, colorMapRange.max);
        colors.push(color.r, color.g, color.b);
      }

      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

      // Create material
      const material = new THREE.MeshLambertMaterial({
        vertexColors: true,
        wireframe: showWireframe,
        transparent: true,
        opacity: 0.9
      });

      const resultMesh = new THREE.Mesh(geometry, material);
      resultMesh.position.copy(originalMesh.position);
      resultMesh.rotation.copy(originalMesh.rotation);
      resultMesh.scale.copy(originalMesh.scale);
      
      sceneRef.current!.add(resultMesh);
    });

  }, [results, viewMode, showDeformed, showWireframe, deformationScale, colorMapRange, meshes]);

  // Animation for results
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setAnimationTime(prev => (prev + 0.1) % (Math.PI * 2));
      setDeformationScale(1 + Math.sin(animationTime) * 0.5);
    }, 50);

    return () => clearInterval(interval);
  }, [isPlaying, animationTime]);

  const handleExportScreenshot = () => {
    if (!rendererRef.current) return;
    
    const canvas = rendererRef.current.domElement;
    const link = document.createElement('a');
    link.download = `simulation_results_${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  const resetView = () => {
    if (!cameraRef.current) return;
    cameraRef.current.position.set(5, 5, 5);
    cameraRef.current.lookAt(0, 0, 0);
    setDeformationScale(1.0);
    setAnimationTime(0);
    setIsPlaying(false);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header with controls */}
      <div className="bg-white border-b p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Simulation Results</h3>
          <div className="flex space-x-2">
            <button
              onClick={handleExportScreenshot}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Export screenshot"
            >
              <Download size={18} />
            </button>
            <button
              onClick={resetView}
              className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
              title="Reset view"
            >
              <RotateCcw size={18} />
            </button>
          </div>
        </div>

        {/* Visualization controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* View mode */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Mode</label>
            <div className="flex space-x-1">
              <button
                onClick={() => setViewMode("stress")}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  viewMode === "stress"
                    ? "bg-red-100 text-red-700 border border-red-300"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                Stress
              </button>
              <button
                onClick={() => setViewMode("displacement")}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  viewMode === "displacement"
                    ? "bg-blue-100 text-blue-700 border border-blue-300"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                Displacement
              </button>
              {(simulationType === "thermal" || simulationType === "coupled") && (
                <button
                  onClick={() => setViewMode("temperature")}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    viewMode === "temperature"
                      ? "bg-orange-100 text-orange-700 border border-orange-300"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  Temperature
                </button>
              )}
            </div>
          </div>

          {/* Display options */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Options</label>
            <div className="flex flex-col space-y-1">
              <label className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={showDeformed}
                  onChange={(e) => setShowDeformed(e.target.checked)}
                  className="rounded"
                />
                <span>Show deformed</span>
              </label>
              <label className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={showWireframe}
                  onChange={(e) => setShowWireframe(e.target.checked)}
                  className="rounded"
                />
                <span>Wireframe</span>
              </label>
            </div>
          </div>

          {/* Animation controls */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Animation</label>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  isPlaying
                    ? "bg-green-100 text-green-700 border border-green-300"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {isPlaying ? "Pause" : "Play"}
              </button>
              <input
                type="range"
                min="0.1"
                max="3.0"
                step="0.1"
                value={deformationScale}
                onChange={(e) => setDeformationScale(parseFloat(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs text-gray-600">{deformationScale.toFixed(1)}x</span>
            </div>
          </div>
        </div>

        {/* Results statistics */}
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Max Stress:</span>
              <span className="ml-1 font-mono font-medium">{results.maxStress.toFixed(2)} MPa</span>
            </div>
            <div>
              <span className="text-gray-600">Max Displacement:</span>
              <span className="ml-1 font-mono font-medium">{results.maxDisplacement.toFixed(3)} mm</span>
            </div>
            {results.maxTemperature && (
              <div>
                <span className="text-gray-600">Max Temperature:</span>
                <span className="ml-1 font-mono font-medium">{results.maxTemperature.toFixed(1)} °C</span>
              </div>
            )}
            <div>
              <span className="text-gray-600">Elements:</span>
              <span className="ml-1 font-mono font-medium">{results.elementCount.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3D Viewer */}
      <div className="flex-1 relative">
        <div ref={containerRef} className="w-full h-full" />
        
        {/* Color scale legend */}
        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-lg">
          <div className="text-xs font-medium mb-2">
            {viewMode === "stress" && "Stress (MPa)"}
            {viewMode === "displacement" && "Displacement (mm)"}
            {viewMode === "temperature" && "Temperature (°C)"}
          </div>
          <div className="w-4 h-32 bg-gradient-to-t from-blue-500 via-green-500 via-yellow-500 to-red-500 rounded"></div>
          <div className="text-xs mt-1">
            <div className="flex justify-between">
              <span>{colorMapRange.min}</span>
              <span>{colorMapRange.max}</span>
            </div>
          </div>
        </div>

        {/* Loading overlay */}
        {!sceneRef.current && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">Loading results...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultsViewer;
