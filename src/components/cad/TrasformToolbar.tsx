import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Move, RotateCcw, Maximize2, Copy, Clipboard, 
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  Plus, Minus, RefreshCw, Save
} from 'react-feather';
import { useElementsStore } from 'src/store/elementsStore';
import { useLayerStore } from 'src/store/layerStore';

const TransformToolbar: React.FC = () => {
  const { 
    selectedElement,
    moveElement,
    rotateElement,
    scaleElement,
    copySelectedElement,
    pasteElement,
    undo,
    redo,
    updateElement
  } = useElementsStore();
  
  const { layers } = useLayerStore();
  const [activeTransform, setActiveTransform] = useState<'move' | 'rotate' | 'scale' | 'precise' | null>(null);
  const [rotationAxis, setRotationAxis] = useState<'x' | 'y' | 'z'>('z');
  const [transformParams, setTransformParams] = useState({
    moveDelta: 10,
    rotateAngle: 15,
    scalePercent: 10,
    // Precise transformation parameters
    posX: 0,
    posY: 0,
    posZ: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scaleX: 100,
    scaleY: 100,
    scaleZ: 100
  });

  // Check if the layer of the selected element is locked
  const isLayerLocked = selectedElement ? 
    layers.find(l => l.id === selectedElement.layerId)?.locked || false : 
    false;

  // Load current element values into precise form when switching to precise mode
  useEffect(() => {
    if (activeTransform === 'precise' && selectedElement) {
      setTransformParams(prev => ({
        ...prev,
        posX: selectedElement.x || 0,
        posY: selectedElement.y || 0,
        posZ: selectedElement.z || 0,
        rotX: selectedElement.angleX || 0,
        rotY: selectedElement.angleY || 0,
        rotZ: selectedElement.angleZ || selectedElement.angle || 0,
        scaleX: 100,
        scaleY: 100,
        scaleZ: 100
      }));
    }
  }, [activeTransform, selectedElement]);

  // Toggle transform mode or turn it off if already active
  const toggleTransform = (mode: 'move' | 'rotate' | 'scale' | 'precise') => {
    if (activeTransform === mode) {
      setActiveTransform(null);
    } else {
      setActiveTransform(mode);
    }
  };

  // Handle move operations
  const handleMove = (dx = 0, dy = 0, dz = 0) => {
    if (!selectedElement || isLayerLocked) return;
    moveElement(selectedElement.id, dx, dy, dz);
  };

  // Handle axis-specific rotation
  const handleRotate = (angle: number) => {
    if (!selectedElement || isLayerLocked) return;
    
    // Apply rotation based on the selected axis
    if (rotationAxis === 'x') {
      updateElement(selectedElement.id, {
        angleX: (selectedElement.angleX || 0) + angle
      });
    } else if (rotationAxis === 'y') {
      updateElement(selectedElement.id, {
        angleY: (selectedElement.angleY || 0) + angle
      });
    } else { // z-axis
      updateElement(selectedElement.id, {
        angleZ: (selectedElement.angleZ || 0) + angle,
        angle: (selectedElement.angle || 0) + angle // For backward compatibility
      });
    }
  };

  // Handle scaling
  const handleScale = (sx = 1, sy = 1, sz = 1) => {
    if (!selectedElement || isLayerLocked) return;
    const scaleFactor = 1 + (transformParams.scalePercent / 100);
    
    // Apply scaling selectively based on parameters
    scaleElement(
      selectedElement.id, 
      sx ? scaleFactor : 1, 
      sy ? scaleFactor : 1, 
      sz ? scaleFactor : 1
    );
  };

  // Handle uniform scaling
  const handleUniformScale = (scale: number) => {
    if (!selectedElement || isLayerLocked) return;
    const scaleFactor = 1 + (scale / 100);
    scaleElement(selectedElement.id, scaleFactor, scaleFactor, scaleFactor);
  };

  // Handle parameter change
  const handleParamChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTransformParams({
      ...transformParams,
      [name]: parseFloat(value)
    });
  };

  // Reset element rotation
  const handleResetRotation = () => {
    if (!selectedElement || isLayerLocked) return;
    
    updateElement(selectedElement.id, {
      angle: 0,
      angleX: 0,
      angleY: 0,
      angleZ: 0
    });
  };

  // Apply precise transformation
  const applyPreciseTransform = () => {
    if (!selectedElement || isLayerLocked) return;
    
    const updates: any = {
      x: transformParams.posX,
      y: transformParams.posY,
      z: transformParams.posZ,
      angleX: transformParams.rotX,
      angleY: transformParams.rotY,
      angleZ: transformParams.rotZ,
      angle: transformParams.rotZ // For backward compatibility
    };
    
    // Apply scaling based on element type
    if (selectedElement.type === 'circle' || selectedElement.type === 'sphere') {
      // For elements with radius, apply average scale
      const avgScale = (transformParams.scaleX + transformParams.scaleY + transformParams.scaleZ) / 300;
      const originalRadius = selectedElement.originalRadius || selectedElement.radius;
      updates.radius = originalRadius * avgScale;
    } else {
      // For elements with width/height/depth
      if (selectedElement.width !== undefined) {
        const originalWidth = selectedElement.originalWidth || selectedElement.width;
        updates.width = originalWidth * (transformParams.scaleX / 100);
      }
      
      if (selectedElement.height !== undefined) {
        const originalHeight = selectedElement.originalHeight || selectedElement.height;
        updates.height = originalHeight * (transformParams.scaleY / 100);
      }
      
      if (selectedElement.depth !== undefined) {
        const originalDepth = selectedElement.originalDepth || selectedElement.depth;
        updates.depth = originalDepth * (transformParams.scaleZ / 100);
      }
    }
    
    updateElement(selectedElement.id, updates);
  };

  // Render transform controls based on active mode
  const renderTransformControls = () => {
    switch (activeTransform) {
      case 'move':
        return (
          <motion.div 
            className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-md p-3 mt-2"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="mb-2">
              <label className="block text-xs text-gray-500 mb-1">Step Size</label>
              <input
                type="range"
                name="moveDelta"
                min="0.1"
                max="50"
                step="0.1"
                value={transformParams.moveDelta}
                onChange={handleParamChange}
                className="w-full h-2 bg-gray-200 rounded-lg"
              />
              <div className="text-center text-xs text-gray-500 mt-1">
                {transformParams.moveDelta} units
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-1 mt-2">
              <div></div>
              <button
                onClick={() => handleMove(0, transformParams.moveDelta, 0)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center"
                disabled={isLayerLocked}
              >
                <ArrowUp size={16} />
              </button>
              <div></div>
              
              <button
                onClick={() => handleMove(-transformParams.moveDelta, 0, 0)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center"
                disabled={isLayerLocked}
              >
                <ArrowLeft size={16} />
              </button>
              <div className="p-2 text-center flex items-center justify-center">
                <Move size={12} />
              </div>
              <button
                onClick={() => handleMove(transformParams.moveDelta, 0, 0)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center"
                disabled={isLayerLocked}
              >
                <ArrowRight size={16} />
              </button>
              
              <div></div>
              <button
                onClick={() => handleMove(0, -transformParams.moveDelta, 0)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center"
                disabled={isLayerLocked}
              >
                <ArrowDown size={16} />
              </button>
              <div></div>
            </div>
            
            <div className="grid grid-cols-2 gap-1 mt-1">
              <button
                onClick={() => handleMove(0, 0, transformParams.moveDelta)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center"
                disabled={isLayerLocked}
              >
                <span className="text-xs font-semibold mr-1">Z</span>
                <Plus size={14} />
              </button>
              <button
                onClick={() => handleMove(0, 0, -transformParams.moveDelta)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center"
                disabled={isLayerLocked}
              >
                <span className="text-xs font-semibold mr-1">Z</span>
                <Minus size={14} />
              </button>
            </div>
          </motion.div>
        );
      
      case 'rotate':
        return (
          <motion.div 
            className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-md p-3 mt-2"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="mb-2">
              <label className="block text-xs text-gray-500 mb-1">Rotation Axis</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setRotationAxis('x')}
                  className={`p-2 rounded flex items-center justify-center ${
                    rotationAxis === 'x' ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  <span className="font-medium">X</span>
                </button>
                <button
                  onClick={() => setRotationAxis('y')}
                  className={`p-2 rounded flex items-center justify-center ${
                    rotationAxis === 'y' ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  <span className="font-medium">Y</span>
                </button>
                <button
                  onClick={() => setRotationAxis('z')}
                  className={`p-2 rounded flex items-center justify-center ${
                    rotationAxis === 'z' ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  <span className="font-medium">Z</span>
                </button>
              </div>
            </div>
            
            <div className="mb-2">
              <label className="block text-xs text-gray-500 mb-1">Angle (degrees)</label>
              <input
                type="range"
                name="rotateAngle"
                min="1"
                max="90"
                step="1"
                value={transformParams.rotateAngle}
                onChange={handleParamChange}
                className="w-full h-2 bg-gray-200 rounded-lg"
              />
              <div className="text-center text-xs text-gray-500 mt-1">
                {transformParams.rotateAngle}°
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                onClick={() => handleRotate(-transformParams.rotateAngle)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center"
                disabled={isLayerLocked}
              >
                <RotateCcw size={16} />
                <span className="ml-1">CCW</span>
              </button>
              <button
                onClick={() => handleRotate(transformParams.rotateAngle)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center"
                disabled={isLayerLocked}
              >
                <RotateCcw size={16} className="transform -scale-x-100" />
                <span className="ml-1">CW</span>
              </button>
            </div>
            
            <button
              onClick={handleResetRotation}
              className="w-full mt-2 p-2 bg-gray-200 hover:bg-gray-300 rounded flex items-center justify-center"
              disabled={isLayerLocked}
            >
              <RefreshCw size={14} className="mr-1" />
              <span>Reset Rotation</span>
            </button>
          </motion.div>
        );
      
      case 'scale':
        return (
          <motion.div 
            className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-md p-3 mt-2"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="mb-2">
              <label className="block text-xs text-gray-500 mb-1">Scale (%)</label>
              <input
                type="range"
                name="scalePercent"
                min="1"
                max="50"
                step="1"
                value={transformParams.scalePercent}
                onChange={handleParamChange}
                className="w-full h-2 bg-gray-200 rounded-lg"
              />
              <div className="text-center text-xs text-gray-500 mt-1">
                {transformParams.scalePercent}%
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                onClick={() => handleUniformScale(transformParams.scalePercent)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center"
                disabled={isLayerLocked}
              >
                <Maximize2 size={16} />
                <span className="ml-1">Grow</span>
              </button>
              <button
                onClick={() => handleUniformScale(-transformParams.scalePercent)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded flex items-center justify-center"
                disabled={isLayerLocked}
              >
                <Maximize2 size={16} className="transform rotate-180" />
                <span className="ml-1">Shrink</span>
              </button>
            </div>
            
            <div className="grid grid-cols-3 gap-2 mt-3">
              <button
                onClick={() => handleScale(1, 0, 0)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded flex flex-col items-center justify-center"
                disabled={isLayerLocked}
              >
                <span className="font-medium">X</span>
                <span className="text-xs">X only</span>
              </button>
              <button
                onClick={() => handleScale(0, 1, 0)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded flex flex-col items-center justify-center"
                disabled={isLayerLocked}
              >
                <span className="font-medium">Y</span>
                <span className="text-xs">Y only</span>
              </button>
              <button
                onClick={() => handleScale(0, 0, 1)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded flex flex-col items-center justify-center"
                disabled={isLayerLocked}
              >
                <span className="font-medium">Z</span>
                <span className="text-xs">Z only</span>
              </button>
            </div>
          </motion.div>
        );
      
      case 'precise':
        return (
          <motion.div 
            className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-md p-3 mt-2"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <h4 className="text-xs font-medium mb-2">Precise Transformation</h4>
            
            {/* Position inputs */}
            <div className="mb-3">
              <h5 className="text-xs font-medium text-gray-600 mb-1">Position</h5>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-gray-500">X</label>
                  <input
                    type="number"
                    value={transformParams.posX}
                    onChange={(e) => setTransformParams(prev => ({
                      ...prev, posX: parseFloat(e.target.value)
                    }))}
                    className="w-full p-1 text-xs border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Y</label>
                  <input
                    type="number"
                    value={transformParams.posY}
                    onChange={(e) => setTransformParams(prev => ({
                      ...prev, posY: parseFloat(e.target.value)
                    }))}
                    className="w-full p-1 text-xs border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Z</label>
                  <input
                    type="number"
                    value={transformParams.posZ}
                    onChange={(e) => setTransformParams(prev => ({
                      ...prev, posZ: parseFloat(e.target.value)
                    }))}
                    className="w-full p-1 text-xs border rounded"
                  />
                </div>
              </div>
            </div>
            
            {/* Rotation inputs */}
            <div className="mb-3">
              <h5 className="text-xs font-medium text-gray-600 mb-1">Rotation (degrees)</h5>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-gray-500">X</label>
                  <input
                    type="number"
                    value={transformParams.rotX}
                    onChange={(e) => setTransformParams(prev => ({
                      ...prev, rotX: parseFloat(e.target.value)
                    }))}
                    className="w-full p-1 text-xs border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Y</label>
                  <input
                    type="number"
                    value={transformParams.rotY}
                    onChange={(e) => setTransformParams(prev => ({
                      ...prev, rotY: parseFloat(e.target.value)
                    }))}
                    className="w-full p-1 text-xs border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Z</label>
                  <input
                    type="number"
                    value={transformParams.rotZ}
                    onChange={(e) => setTransformParams(prev => ({
                      ...prev, rotZ: parseFloat(e.target.value)
                    }))}
                    className="w-full p-1 text-xs border rounded"
                  />
                </div>
              </div>
            </div>
            
            {/* Scale inputs */}
            <div className="mb-3">
              <h5 className="text-xs font-medium text-gray-600 mb-1">Scale (%)</h5>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-gray-500">X</label>
                  <input
                    type="number"
                    value={transformParams.scaleX}
                    onChange={(e) => setTransformParams(prev => ({
                      ...prev, scaleX: parseFloat(e.target.value)
                    }))}
                    className="w-full p-1 text-xs border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Y</label>
                  <input
                    type="number"
                    value={transformParams.scaleY}
                    onChange={(e) => setTransformParams(prev => ({
                      ...prev, scaleY: parseFloat(e.target.value)
                    }))}
                    className="w-full p-1 text-xs border rounded"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500">Z</label>
                  <input
                    type="number"
                    value={transformParams.scaleZ}
                    onChange={(e) => setTransformParams(prev => ({
                      ...prev, scaleZ: parseFloat(e.target.value)
                    }))}
                    className="w-full p-1 text-xs border rounded"
                  />
                </div>
              </div>
            </div>
            
            <button
              onClick={applyPreciseTransform}
              className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center justify-center"
              disabled={isLayerLocked}
            >
              <Save size={14} className="mr-1" />
              Apply Transformation
            </button>
          </motion.div>
        );
      
      default:
        return null;
    }
  };

  return (
    <motion.div 
      className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-md p-4 mb-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <h3 className="text-md font-medium text-gray-900 mb-3">Element Transformations</h3>
      
      {!selectedElement ? (
        <div className="text-gray-500 text-sm p-2 bg-gray-50 rounded-md">
          Select an element to transform it
        </div>
      ) : isLayerLocked ? (
        <div className="text-yellow-600 text-sm p-2 bg-yellow-50 rounded-md mb-3">
          Layer is locked. Unlock to transform elements.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 mb-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => toggleTransform('move')}
              className={`p-2 rounded flex flex-col items-center justify-center text-xs ${
                activeTransform === 'move' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              disabled={isLayerLocked}
            >
              <Move size={16} className="mb-1" />
              <span>Move</span>
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => toggleTransform('rotate')}
              className={`p-2 rounded flex flex-col items-center justify-center text-xs ${
                activeTransform === 'rotate' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              disabled={isLayerLocked}
            >
              <RotateCcw size={16} className="mb-1" />
              <span>Rotate</span>
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => toggleTransform('scale')}
              className={`p-2 rounded flex flex-col items-center justify-center text-xs ${
                activeTransform === 'scale' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              disabled={isLayerLocked}
            >
              <Maximize2 size={16} className="mb-1" />
              <span>Scale</span>
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => toggleTransform('precise')}
              className={`p-2 rounded flex flex-col items-center justify-center text-xs ${
                activeTransform === 'precise' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              disabled={isLayerLocked}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" className="mb-1 mx-auto">
                <rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"/>
                <line x1="4" y1="10" x2="20" y2="10" stroke="currentColor" strokeWidth="1"/>
                <line x1="4" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1"/>
                <line x1="10" y1="4" x2="10" y2="20" stroke="currentColor" strokeWidth="1"/>
                <line x1="16" y1="4" x2="16" y2="20" stroke="currentColor" strokeWidth="1"/>
              </svg>
              <span>Precise</span>
            </motion.button>
          </div>
          
          <div className="grid grid-cols-2 gap-2 mb-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => copySelectedElement()}
              className="p-2 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center justify-center text-xs"
              disabled={isLayerLocked}
            >
              <Copy size={16} className="mr-1" />
              <span>Copy</span>
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => pasteElement()}
              className="p-2 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center justify-center text-xs"
            >
              <Clipboard size={16} className="mr-1" />
              <span>Paste</span>
            </motion.button>
          </div>
          
          <AnimatePresence>
            {renderTransformControls()}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
};

export default TransformToolbar;