import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import ToolpathVisualizer from './ToolpathVisualizer2';
import { useFixedCyclesProcessor } from 'src/hooks/useFixedCyclesProcessor';
import { 
  EnhancedToolpathVisualizerProps, 
  DetectedCycle, 
  ToolpathPoint,
  ToolpathVisualizerRef
} from './visualizer/types';
import { 
  generateCyclePoints, 
  createCycleVisualization 
} from './visualizer/cycleUtils';
import { CyclesList, CycleDetailsPanel, CycleAnimationControls } from './visualizer/CycleUIComponents';
import { DynamicToolpathVisualizer } from '../dynamic-imports';

const EnhancedToolpathVisualizer: React.FC<EnhancedToolpathVisualizerProps> = ({
  width,
  height,
  gcode,
  isSimulating,
  selectedTool = null,
  showWorkpiece = true,
  onSimulationComplete,
  onSimulationProgress,
  onToolChange,

}) => {
  // State for fixed cycle visualization
  const [currentGCode, setCurrentGCode] = useState<string[]>([]);
  const [detectedCycles, setDetectedCycles] = useState<DetectedCycle[]>([]);
  const [selectedCycleIndex, setSelectedCycleIndex] = useState<number>(-1);
  const [showCycleDetails, setShowCycleDetails] = useState<boolean>(false);
  const [showAllCycles, setShowAllCycles] = useState<boolean>(true);
  const [cyclesTooltips, setCyclesTooltips] = useState<boolean>(true);
  const [cycleAnimationSpeed, setCycleAnimationSpeed] = useState<number>(1);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  
  // References
  const visualizerRef = useRef<ToolpathVisualizerRef>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cycleGroupRef = useRef<THREE.Group | null>(null);
  
  // Use the fixed cycles processor hook
  const { 
    processedToolpath, 
    detectedCycles: parsedCycles, 
    isProcessing: isCycleProcessing 
  } = useFixedCyclesProcessor({
    gcode: currentGCode,
    enabled: true,
    onToolpathUpdate: useCallback((toolpath: ToolpathPoint[]) => {
      // Handle the updated toolpath
      console.log('Processed toolpath with cycles:', toolpath.length, 'points');
    }, [])
  });
  
  // Update processing state
  useEffect(() => {
    setIsProcessing(isCycleProcessing);
  }, [isCycleProcessing]);
  
  // Parse the G-code when it changes
  useEffect(() => {
    if (gcode) {
      const lines = gcode.split('\n').map(line => line.trim());
      setCurrentGCode(lines);
    }
  }, [gcode]);
  
  // Process detected cycles
  useEffect(() => {
    if (parsedCycles && parsedCycles.length > 0) {
      const fixedCycles: DetectedCycle[] = parsedCycles.map(cycle => ({
        ...cycle,
        // Ensure the required properties are present; adjust default values as needed
        startLine: (cycle as any).startLine ?? 0,
        endLine: (cycle as any).endLine ?? 0,
      }));
      setDetectedCycles(fixedCycles);
      console.log('Fixed cycles detected:', fixedCycles.length);
    }
  }, [parsedCycles]);
  // Create visualization for all fixed cycles
  const visualizeAllCycles = useCallback(() => {
    if (!sceneRef.current) return;
    
    // Remove existing cycle visualizations
    if (cycleGroupRef.current) {
      sceneRef.current.remove(cycleGroupRef.current);
    }
    
    // Create a new group for all cycles
    const newCycleGroup = new THREE.Group();
    newCycleGroup.name = "FixedCyclesGroup";
    
    // Create visualizations for each cycle
    detectedCycles.forEach((cycle, index) => {
      const cycleViz = createCycleVisualization(cycle);
      
      // Only make selected cycle or all cycles visible based on settings
      cycleViz.visible = showAllCycles || index === selectedCycleIndex;
      
      // Add to the main group
      newCycleGroup.add(cycleViz);
    });
    
    // Add to the scene
    sceneRef.current.add(newCycleGroup);
    cycleGroupRef.current = newCycleGroup;
  }, [detectedCycles, selectedCycleIndex, showAllCycles]);
  
  // Update visualizations when selection or showAll setting changes
  useEffect(() => {
    visualizeAllCycles();
  }, [visualizeAllCycles]);
  
  // Get scene reference from child component
  const handleSceneRef = (scene: THREE.Scene) => {
    sceneRef.current = scene;
    // Create initial visualizations
    visualizeAllCycles();
  };
  
  // Cycle animation control
  const animateSelectedCycle = useCallback(() => {
    if (selectedCycleIndex < 0 || !detectedCycles[selectedCycleIndex]) return;
    
    const cycle = detectedCycles[selectedCycleIndex];
    
    // Generate animation points for the cycle
    const cyclePoints = generateCyclePoints(cycle);
    
    // If there's an existing animation, cancel it
    if (visualizerRef.current) {
      visualizerRef.current.stopAnimation();
      
      // Start a new animation focused on the cycle points
      visualizerRef.current.animateCustomPath(cyclePoints, cycleAnimationSpeed, () => {
        console.log('Cycle animation complete');
      });
      
      // Focus camera on cycle position
      if (cycle.params.x !== undefined && cycle.params.y !== undefined) {
        visualizerRef.current.focusCamera(cycle.params.x, cycle.params.y, cycle.params.r || 0);
      }
    }
  }, [selectedCycleIndex, detectedCycles, cycleAnimationSpeed]);
  
  return (
    <div className="relative" style={{ width, height }}>
      {/* Main toolpath visualizer with forwarded props */}
      <DynamicToolpathVisualizer 
      width="100%" 
      height="100%" 
      gcode={gcode}
      isSimulating={isSimulating}
      selectedTool={selectedTool}
      showWorkpiece={showWorkpiece}
      onSimulationComplete={onSimulationComplete}
      onSimulationProgress={onSimulationProgress}
      onToolChange={onToolChange}
      
    />
      
      {/* Fixed cycle visualization overlays */}
      {detectedCycles.length > 0 && (
        <CyclesList 
          cycles={detectedCycles}
          selectedIndex={selectedCycleIndex}
          setSelectedIndex={setSelectedCycleIndex}
          showAllCycles={showAllCycles}
          setShowAllCycles={setShowAllCycles}
          cyclesTooltips={cyclesTooltips}
          setCyclesTooltips={setCyclesTooltips}
          onViewDetails={() => setShowCycleDetails(true)}
          onAnimateCycle={animateSelectedCycle}
          onFocusCycle={(x, y, z) => {
            if (visualizerRef.current) {
              visualizerRef.current.focusCamera(x, y, z);
            }
          }}
        />
      )}
      
      {showCycleDetails && selectedCycleIndex >= 0 && (
        <CycleDetailsPanel 
          cycle={detectedCycles[selectedCycleIndex]}
          animationSpeed={cycleAnimationSpeed}
          setAnimationSpeed={setCycleAnimationSpeed}
          onClose={() => setShowCycleDetails(false)}
          onAnimateCycle={animateSelectedCycle}
        />
      )}
      
      {/* Animation controls */}
      {selectedCycleIndex >= 0 && !showCycleDetails && (
        <CycleAnimationControls 
          selectedIndex={selectedCycleIndex}
          cyclesCount={detectedCycles.length}
          setSelectedIndex={setSelectedCycleIndex}
          onAnimate={animateSelectedCycle}
          onViewDetails={() => setShowCycleDetails(true)}
        />
      )}
      
      {/* Processing indicator */}
      {isProcessing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 z-20">
          <div className="bg-white p-4 rounded-md shadow-lg">
            <div className="flex items-center space-x-3">
              <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              <span>Processing G-code...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedToolpathVisualizer;