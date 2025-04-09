// Enhanced ViewCube Component with proper camera transitions
import React, { useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

interface ViewCubeProps {
  currentView: string;
  onViewChange: (view: string) => void;
  size?: number;
  camera?: THREE.PerspectiveCamera | null;
  controls?: OrbitControls | null;
}

export const ViewCube: React.FC<ViewCubeProps> = ({ 
  currentView, 
  onViewChange, 
  size = 70,
  camera,
  controls
}) => {
  const cubeRef = useRef<HTMLDivElement>(null);
  const [hoveredFace, setHoveredFace] = useState<string | null>(null);
  
  // Function to animate camera transition to the selected view
  const animateToView = (view: string) => {
    if (!camera || !controls) {
      onViewChange(view);
      return;
    }
    
    // Define target positions for each view
    const targetPositions: Record<string, { position: THREE.Vector3, target: THREE.Vector3 }> = {
      'perspective': {
        position: new THREE.Vector3(200, 200, 200),
        target: new THREE.Vector3(0, 0, 0)
      },
      'top': {
        position: new THREE.Vector3(0, 200, 0),
        target: new THREE.Vector3(0, 0, 0)
      },
      'bottom': {
        position: new THREE.Vector3(0, -200, 0),
        target: new THREE.Vector3(0, 0, 0)
      },
      'front': {
        position: new THREE.Vector3(0, 0, 200),
        target: new THREE.Vector3(0, 0, 0)
      },
      'back': {
        position: new THREE.Vector3(0, 0, -200),
        target: new THREE.Vector3(0, 0, 0)
      },
      'left': {
        position: new THREE.Vector3(-200, 0, 0),
        target: new THREE.Vector3(0, 0, 0)
      },
      'right': {
        position: new THREE.Vector3(200, 0, 0),
        target: new THREE.Vector3(0, 0, 0)
      },
      'isometric': {
        position: new THREE.Vector3(150, 150, 150),
        target: new THREE.Vector3(0, 0, 0)
      }
    };
    
    // Get target position
    const target = targetPositions[view];
    if (!target) {
      onViewChange(view);
      return;
    }
    
    // Store initial position and target
    const startPosition = camera.position.clone();
    const startTarget = controls.target.clone();
    
    // Animate transition
    const duration = 500; // ms
    const startTime = Date.now();
    
    const animate = () => {
      const elapsedTime = Date.now() - startTime;
      const progress = Math.min(elapsedTime / duration, 1);
      
      // Ease in-out
      const eased = progress < 0.5 
        ? 2 * progress * progress 
        : -1 + (4 - 2 * progress) * progress;
      
      // Update camera position
      camera.position.lerpVectors(startPosition, target.position, eased);
      
      // Update controls target
      controls.target.lerpVectors(startTarget, target.target, eased);
      controls.update();
      
      // Continue animation if not complete
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Animation complete, update state
        onViewChange(view);
      }
    };
    
    // Start animation
    animate();
  };
  
  return (
    <div 
      ref={cubeRef}
      className="relative cursor-pointer bg-gray-800 bg-opacity-50 rounded-md overflow-hidden"
      style={{ width: size, height: size }}
    >
      <div className="absolute inset-0 flex flex-col">
        {/* Top face */}
        <div 
          className={`h-1/3 flex justify-center items-center border border-gray-700 ${
            currentView === 'top' ? 'bg-blue-500' : hoveredFace === 'top' ? 'bg-gray-600' : ''
          }`}
          onMouseEnter={() => setHoveredFace('top')}
          onMouseLeave={() => setHoveredFace(null)}
          onClick={() => animateToView('top')}
        >
          <span className="text-xs text-white font-bold">Top</span>
        </div>
        
        {/* Middle section with Front/Right/Back/Left */}
        <div className="h-1/3 flex">
          <div 
            className={`w-1/4 flex justify-center items-center border border-gray-700 ${
              currentView === 'left' ? 'bg-blue-500' : hoveredFace === 'left' ? 'bg-gray-600' : ''
            }`}
            onMouseEnter={() => setHoveredFace('left')}
            onMouseLeave={() => setHoveredFace(null)}
            onClick={() => animateToView('left')}
          >
            <span className="text-xs text-white font-bold">L</span>
          </div>
          
          <div 
            className={`w-1/4 flex justify-center items-center border border-gray-700 ${
              currentView === 'front' ? 'bg-blue-500' : hoveredFace === 'front' ? 'bg-gray-600' : ''
            }`}
            onMouseEnter={() => setHoveredFace('front')}
            onMouseLeave={() => setHoveredFace(null)}
            onClick={() => animateToView('front')}
          >
            <span className="text-xs text-white font-bold">F</span>
          </div>
          
          <div 
            className={`w-1/4 flex justify-center items-center border border-gray-700 ${
              currentView === 'right' ? 'bg-blue-500' : hoveredFace === 'right' ? 'bg-gray-600' : ''
            }`}
            onMouseEnter={() => setHoveredFace('right')}
            onMouseLeave={() => setHoveredFace(null)}
            onClick={() => animateToView('right')}
          >
            <span className="text-xs text-white font-bold">R</span>
          </div>
          
          <div 
            className={`w-1/4 flex justify-center items-center border border-gray-700 ${
              currentView === 'back' ? 'bg-blue-500' : hoveredFace === 'back' ? 'bg-gray-600' : ''
            }`}
            onMouseEnter={() => setHoveredFace('back')}
            onMouseLeave={() => setHoveredFace(null)}
            onClick={() => animateToView('back')}
          >
            <span className="text-xs text-white font-bold">B</span>
          </div>
        </div>
        
        {/* Bottom face */}
        <div 
          className={`h-1/3 flex justify-center items-center border border-gray-700 ${
            currentView === 'bottom' ? 'bg-blue-500' : hoveredFace === 'bottom' ? 'bg-gray-600' : ''
          }`}
          onMouseEnter={() => setHoveredFace('bottom')}
          onMouseLeave={() => setHoveredFace(null)}
          onClick={() => animateToView('bottom')}
        >
          <span className="text-xs text-white font-bold">Bottom</span>
        </div>
      </div>
      
      {/* Center ISO button */}
      <div 
        className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
                    w-1/2 h-1/2 flex justify-center items-center rounded-full
                    ${currentView === 'perspective' || currentView === 'isometric' 
                      ? 'bg-blue-500' 
                      : 'bg-gray-700 bg-opacity-80'}`}
        onClick={() => animateToView('isometric')}
      >
        <span className="text-xs text-white font-bold">ISO</span>
      </div>
    </div>
  );
};

export default ViewCube;