import React, { useRef, useEffect, useState, useCallback } from 'react';
import { DynamicCADCanvas } from '@/src/components/dynamic-imports';
import DrawingToolbar from './DrawingToolbar';
import { useDrawingTools } from '../../hooks/useDrawingTools';
import { 
  updateCursorForTool, 
  createDrawingElement, 
  createDrawingLine,
  createHighlighter,
  createDimension,
  createTextElement,
  DrawingElement
} from '../../lib/drawingToolsUtils';
import * as THREE from 'three';
import { useElementsStore } from '../../store/elementsStore';
import { useCADStore } from '../../store/cadStore';
import { useLayerStore } from '../../store/layerStore';
import CADCanvas from '../cad/CADCanvas';

interface DrawingEnabledCADCanvasProps {
  width?: string | number;
  height?: string | number;
  previewComponent?: string | null;
  onComponentPlaced?: (component: string, position: {x: number, y: number, z: number}) => void;
  allowDragDrop?: boolean;
}

const DrawingEnabledCADCanvas: React.FC<DrawingEnabledCADCanvasProps> = (props) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasContentRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const tempDrawingRef = useRef<THREE.Object3D | null>(null);
  const drawingLayerRef = useRef<THREE.Group | null>(null);
  
  const [drawingElements, setDrawingElements] = useState<DrawingElement[]>([]);
  const [isDimensioning, setIsDimensioning] = useState(false);
  const [dimensionStart, setDimensionStart] = useState<{x: number, y: number, z: number} | null>(null);
  const [isTextMode, setIsTextMode] = useState(false);
  const [textPosition, setTextPosition] = useState<{x: number, y: number, z: number} | null>(null);
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  
  const { toolState, setActiveTool, setPenSize, setEraserSize, setHighlighterSize, 
    setColor, setTextSize, setDimensionStyle, startDrawing, addDrawingPoint, 
    finishDrawing, resetDrawing } = useDrawingTools();
    
  const { activeLayer, layers } = useLayerStore();
  const { addElement } = useElementsStore();
  const { originOffset } = useCADStore();
  
  // Connect to the Three.js scene from CADCanvas
  useEffect(() => {
    const connectToThreeScene = () => {
      if (!window.cadCanvasScene) {
        // If not available yet, try again in 100ms
        setTimeout(connectToThreeScene, 100);
        return;
      }
      
      sceneRef.current = window.cadCanvasScene;
      
      // Create a group for all drawing elements
      if (drawingLayerRef.current) {
        sceneRef.current.remove(drawingLayerRef.current);
      }
      
      drawingLayerRef.current = new THREE.Group();
      drawingLayerRef.current.name = 'DrawingLayer';
      sceneRef.current.add(drawingLayerRef.current);
    };
    
    connectToThreeScene();
    
    return () => {
      // Clean up drawing layer on unmount
      if (sceneRef.current && drawingLayerRef.current) {
        sceneRef.current.remove(drawingLayerRef.current);
      }
    };
  }, []);
  
  // Update cursor based on active tool
  useEffect(() => {
    updateCursorForTool(toolState.activeTool, canvasContentRef.current);
  }, [toolState.activeTool]);
  
  // Handle mouse down for drawing
  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    if (!canvasContentRef.current || !sceneRef.current) return;
    
    const rect = canvasContentRef.current.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Convert 2D screen coordinates to 3D world coordinates
    // This is a simplified version; in reality, we would use raycasting with a plane
    const normalizedX = (mouseX / rect.width) * 2 - 1;
    const normalizedY = -(mouseY / rect.height) * 2 + 1;
    
    // This assumes we have access to the camera
    if (!window.cadCanvasCamera) return;
    
    const camera = window.cadCanvasCamera;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(normalizedX, normalizedY), camera);
    
    // Intersect with XY plane at Z=0
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersection);
    
    // Adjust for originOffset
    const worldX = intersection.x - originOffset.x;
    const worldY = intersection.y - originOffset.y;
    const worldZ = intersection.z - originOffset.z;
    
    // Handle different tools
    switch (toolState.activeTool) {
      case 'pen':
      case 'highlighter':
        startDrawing(worldX, worldY, worldZ);
        
        // Create temporary visual element
        if (tempDrawingRef.current && drawingLayerRef.current) {
          drawingLayerRef.current.remove(tempDrawingRef.current);
        }
        
        tempDrawingRef.current = toolState.activeTool === 'pen' 
          ? createDrawingLine([{x: worldX, y: worldY, z: worldZ}], toolState.color, toolState.penSize)
          : createHighlighter([{x: worldX, y: worldY, z: worldZ}], toolState.color, toolState.highlighterSize, 0.5);
          
        if (drawingLayerRef.current && tempDrawingRef.current) {
          drawingLayerRef.current.add(tempDrawingRef.current);
        }
        break;
        
      case 'dimension':
        if (!isDimensioning) {
          // Start dimensioning
          setIsDimensioning(true);
          setDimensionStart({ x: worldX, y: worldY, z: worldZ });
        } else {
          // Finish dimensioning
          if (dimensionStart) {
            // Calculate the dimension value (distance)
            const dx = worldX - dimensionStart.x;
            const dy = worldY - dimensionStart.y;
            const dz = worldZ - dimensionStart.z;
            const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            // Create dimension element
            const dimensionElement = createDrawingElement(
              [dimensionStart, { x: worldX, y: worldY, z: worldZ }],
              'dimension',
              toolState.color,
              1,
              {
                dimensionValue: distance,
                dimensionUnit: 'mm',
                dimensionStyle: toolState.dimensionStyle
              }
            );
            
            setDrawingElements(prev => [...prev, dimensionElement]);
            
            // Add visual representation
            if (drawingLayerRef.current) {
              const dimensionObject = createDimension(
                dimensionStart,
                { x: worldX, y: worldY, z: worldZ },
                distance,
                'mm',
                toolState.dimensionStyle,
                toolState.color
              );
              
              drawingLayerRef.current.add(dimensionObject);
            }
            
            // Reset dimensioning state
            setIsDimensioning(false);
            setDimensionStart(null);
          }
        }
        break;
        
      case 'text':
        setIsTextMode(true);
        setTextPosition({ x: worldX, y: worldY, z: worldZ });
        setShowTextInput(true);
        break;
        
      case 'colorPicker':
        // Color picking would require getting the color from the object under the cursor
        // This would need integration with the renderer's readRenderTargetPixels or similar
        break;
        
      case 'eraser':
        // Erasing would require finding the closest drawing element and removing it
        // This would need detecting which drawing element is under the cursor
        break;
        
      default:
        break;
    }
  }, [toolState, startDrawing, isDimensioning, dimensionStart, originOffset]);
  
  // Handle mouse move for drawing
  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (!canvasContentRef.current || !sceneRef.current) return;
    if (!(toolState.activeTool === 'pen' || toolState.activeTool === 'highlighter') || !toolState.isDrawing) return;
    
    const rect = canvasContentRef.current.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Convert to world coordinates (simplified)
    const normalizedX = (mouseX / rect.width) * 2 - 1;
    const normalizedY = -(mouseY / rect.height) * 2 + 1;
    
    if (!window.cadCanvasCamera) return;
    
    const camera = window.cadCanvasCamera;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(normalizedX, normalizedY), camera);
    
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersection);
    
    // Adjust for originOffset
    const worldX = intersection.x - originOffset.x;
    const worldY = intersection.y - originOffset.y;
    const worldZ = intersection.z - originOffset.z;
    
    // Add point to current drawing
    addDrawingPoint(worldX, worldY, worldZ);
    
    // Update visual representation
    if (toolState.isDrawing && drawingLayerRef.current && tempDrawingRef.current) {
      drawingLayerRef.current.remove(tempDrawingRef.current);
      
      const points = [...toolState.drawingPoints, { x: worldX, y: worldY, z: worldZ }];
      
      tempDrawingRef.current = toolState.activeTool === 'pen'
        ? createDrawingLine(points, toolState.color, toolState.penSize)
        : createHighlighter(points, toolState.color, toolState.highlighterSize, 0.5);
        
      drawingLayerRef.current.add(tempDrawingRef.current);
    }
  }, [toolState, addDrawingPoint, originOffset]);
  
  // Handle mouse up for drawing
  const handleMouseUp = useCallback(() => {
    if (!(toolState.activeTool === 'pen' || toolState.activeTool === 'highlighter') || !toolState.isDrawing) return;
    
    // Finish drawing
    const points = finishDrawing();
    
    if (points && points.length > 1) {
      // Create permanent drawing element
      const drawingElement = createDrawingElement(
        points,
        toolState.activeTool,
        toolState.color,
        toolState.activeTool === 'pen' ? toolState.penSize : toolState.highlighterSize,
        { opacity: toolState.activeTool === 'highlighter' ? 0.5 : 1 }
      );
      
      setDrawingElements(prev => [...prev, drawingElement]);
      
      // The visual representation is already in the scene via tempDrawingRef
      // Just clear the reference so it won't be removed
      tempDrawingRef.current = null;
    } else {
      // Clean up temporary drawing if it was too short
      if (drawingLayerRef.current && tempDrawingRef.current) {
        drawingLayerRef.current.remove(tempDrawingRef.current);
        tempDrawingRef.current = null;
      }
    }
    
    resetDrawing();
  }, [toolState.activeTool, toolState.isDrawing, toolState.color, toolState.penSize, toolState.highlighterSize, finishDrawing, resetDrawing]);
  
  // Handle text input submission
  const handleTextSubmit = useCallback(() => {
    if (!textPosition || !textInput.trim()) {
      setShowTextInput(false);
      setIsTextMode(false);
      setTextInput('');
      return;
    }
    
    // Create text element
    const textElement = createDrawingElement(
      [textPosition],
      'text',
      toolState.color,
      toolState.textSize,
      { text: textInput }
    );
    
    setDrawingElements(prev => [...prev, textElement]);
    
    // Add visual representation
    if (drawingLayerRef.current) {
      const textObject = createTextElement(
        textPosition,
        textInput,
        toolState.textSize,
        toolState.color
      );
      
      drawingLayerRef.current.add(textObject);
    }
    
    // Reset text mode
    setShowTextInput(false);
    setIsTextMode(false);
    setTextInput('');
    setTextPosition(null);
  }, [textPosition, textInput, toolState.color, toolState.textSize]);
  
  // Export drawing elements to CAD elements
  const exportToCADElements = useCallback(() => {
    drawingElements.forEach(element => {
      // Convert drawing element to CAD element format
      let cadElement;
      
      switch(element.type) {
        case 'drawing':
          if (element.tool === 'pen') {
            cadElement = {
              type: 'line',
              x1: element.points[0].x,
              y1: element.points[0].y,
              z1: element.points[0].z,
              x2: element.points[element.points.length - 1].x,
              y2: element.points[element.points.length - 1].y,
              z2: element.points[element.points.length - 1].z,
              color: element.color,
              linewidth: element.size,
              layerId: activeLayer
            };
          } else if (element.tool === 'highlighter') {
            // Simplified - highlighter becomes a semi-transparent filled polygon
            cadElement = {
              type: 'polygon',
              points: element.points,
              x: element.points[0].x,
              y: element.points[0].y,
              z: element.points[0].z,
              color: element.color,
              opacity: 0.5,
              layerId: activeLayer
            };
          }
          break;
          
        case 'dimension':
          cadElement = {
            type: 'dimension',
            x1: element.points[0].x,
            y1: element.points[0].y,
            z1: element.points[0].z,
            x2: element.points[1].x,
            y2: element.points[1].y,
            z2: element.points[1].z,
            value: element.dimensionValue,
            unit: element.dimensionUnit,
            style: element.dimensionStyle,
            color: element.color,
            layerId: activeLayer
          };
          break;
          
        case 'text':
          cadElement = {
            type: 'text',
            x: element.points[0].x,
            y: element.points[0].y,
            z: element.points[0].z,
            text: element.text || '',
            size: element.size,
            color: element.color,
            layerId: activeLayer
          };
          break;
      }
      
      if (cadElement) {
        addElement(cadElement);
      }
    });
    
    // Clear drawing elements after export
    setDrawingElements([]);
    
    // Clear visual elements
    if (drawingLayerRef.current) {
      while (drawingLayerRef.current.children.length > 0) {
        drawingLayerRef.current.remove(drawingLayerRef.current.children[0]);
      }
    }
  }, [drawingElements, activeLayer, addElement]);
  
  useEffect(() => {
    // Make sure the CAD Canvas exposes its scene and camera for us to use
    window.exposeCADCanvasAPI = true;
    
    return () => {
      window.exposeCADCanvasAPI = false;
    };
  }, []);
  
  return (
    <div className="flex flex-col h-full w-full" ref={canvasRef}>
      {/* Drawing Toolbar */}
      <DrawingToolbar
        onSelectTool={setActiveTool}
        activeTool={toolState.activeTool}
        color={toolState.color}
        onColorChange={setColor}
        penSize={toolState.penSize}
        onPenSizeChange={setPenSize}
        eraserSize={toolState.eraserSize}
        onEraserSizeChange={setEraserSize}
        highlighterSize={toolState.highlighterSize}
        onHighlighterSizeChange={setHighlighterSize}
        textSize={toolState.textSize}
        onTextSizeChange={setTextSize}
        dimensionStyle={toolState.dimensionStyle}
        onDimensionStyleChange={setDimensionStyle}
      />
      
      {/* CAD Canvas with event handlers */}
      <div 
        className="flex-1 relative"
        ref={canvasContentRef}
        style={{ 
            width: '100%',
            height: '100%'
          }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp} // Treat mouse leave as mouse up to end drawing
      >
        <CADCanvas {...props} />
        
        {/* Text input overlay */}
        {showTextInput && (
          <div 
            className="absolute bg-white p-2 shadow-lg rounded-md"
            style={{ 
              left: textPosition ? `${textPosition.x}px` : '50%',
              top: textPosition ? `${textPosition.y}px` : '50%',
              transform: 'translate(-50%, -50%)'
            }}
          >
            <input
              type="text"
              className="border rounded px-2 py-1 w-64"
              placeholder="Enter text..."
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleTextSubmit();
                } else if (e.key === 'Escape') {
                  setShowTextInput(false);
                  setIsTextMode(false);
                  setTextInput('');
                }
              }}
              autoFocus
            />
            <div className="flex justify-end mt-2">
              <button 
                className="bg-gray-200 text-gray-800 px-2 py-1 rounded text-sm mr-2"
                onClick={() => {
                  setShowTextInput(false);
                  setIsTextMode(false);
                  setTextInput('');
                }}
              >
                Cancel
              </button>
              <button 
                className="bg-blue-500 text-white px-2 py-1 rounded text-sm"
                onClick={handleTextSubmit}
              >
                Add
              </button>
            </div>
          </div>
        )}
        
        {/* Drawing status indicators */}
        {isDimensioning && dimensionStart && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-md shadow-lg">
            Click to set the second point for dimensioning
          </div>
        )}
        
        {/* Export button for drawing elements */}
        {drawingElements.length > 0 && (
          <button
            className="absolute bottom-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-md shadow-lg"
            onClick={exportToCADElements}
          >
            Save Drawings to CAD
          </button>
        )}
      </div>
    </div>
  );
};

// Declare global window type extension for our shared API
declare global {
  interface Window {
    cadCanvasScene?: THREE.Scene;
    cadCanvasCamera?: THREE.Camera;
    exposeCADCanvasAPI?: boolean;
  }
}

export default DrawingEnabledCADCanvas;