// src/components/cad/ToolPanel.tsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Square, Circle, Box, Scissors, Type, 
  Move, RotateCcw, ZoomIn, Grid, Crosshair,
  Minus, Plus, Triangle, ArrowUpCircle, 
  Disc, Layout, Layers, Home, Maximize2, Octagon,
  Aperture, CornerUpRight, Airplay, GitMerge, Cpu,
  Tool, Anchor, Box as BoxIcon, Globe, Columns, 
  FileText, Server, Dribbble, Sliders, Compass, Clock, BarChart2,
  Edit3,  Type as TypeIcon, Camera
} from 'react-feather';

import { useCADStore } from 'src/store/cadStore';
import { useElementsStore } from 'src/store/elementsStore';
import { useLayerStore } from 'src/store/layerStore';

// ElementForm component stays the same

interface ElementFormProps {
  onAdd: (element: any) => void;
  onCancel: () => void;
  type: string;
}


const ElementForm: React.FC<ElementFormProps> = ({ onAdd, onCancel, type }) => {
  const [formData, setFormData] = useState<any>(() => {
    // Default values based on element type
    switch (type) {
      // Primitive di base
      case 'cube':
        return { x: 0, y: 0, z: 0, width: 100, height: 100, depth: 100, color: '#1e88e5', wireframe: false };
      case 'sphere':
        return { x: 0, y: 0, z: 0, radius: 50, color: '#1e88e5', wireframe: false };
      case 'cylinder':
        return { x: 0, y: 0, z: 0, radius: 25, height: 60, segments: 32, color: '#FFC107', wireframe: false };
      case 'cone':
        return { x: 0, y: 0, z: 0, radius: 25, height: 50, segments: 32, color: '#9C27B0', wireframe: false };
      case 'torus':
        return { x: 0, y: 0, z: 0, radius: 30, tube: 10, radialSegments: 16, tubularSegments: 100, color: '#FF9800', wireframe: false };
      
      // Primitive avanzate
      case 'pyramid':
        return { x: 0, y: 0, z: 0, baseWidth: 100, baseDepth: 100, height: 150, color: '#E91E63', wireframe: false };
      case 'prism':
        return { x: 0, y: 0, z: 0, radius: 50, height: 100, sides: 6, color: '#3F51B5', wireframe: false };
      case 'hemisphere':
        return { x: 0, y: 0, z: 0, radius: 50, segments: 32, direction: 'up', color: '#00BCD4', wireframe: false };
      case 'ellipsoid':
        return { x: 0, y: 0, z: 0, radiusX: 50, radiusY: 35, radiusZ: 25, segments: 32, color: '#8BC34A', wireframe: false };
      case 'capsule':
        return { x: 0, y: 0, z: 0, radius: 25, height: 100, direction: 'y', color: '#673AB7', wireframe: false };
      
      // Elementi 2D
      case 'circle':
        return { x: 0, y: 0, z: 0, radius: 50, segments: 32, color: '#000000', linewidth: 1 };
      case 'rectangle':
        return { x: 0, y: 0, z: 0, width: 100, height: 100, color: '#000000', linewidth: 1 };
      case 'triangle':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          points: [
            {x: 0, y: 50}, 
            {x: -50, y: -25}, 
            {x: 50, y: -25}
          ], 
          color: '#000000', 
          linewidth: 1 
        };
      case 'polygon':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          sides: 6,
          radius: 50,
          points: [
            {x: 0, y: 0}, 
            {x: 50, y: 0}, 
            {x: 25, y: 50}
          ], 
          color: '#795548', 
          wireframe: true 
        };
      case 'ellipse':
        return { x: 0, y: 0, z: 0, radiusX: 50, radiusY: 25, segments: 32, color: '#000000', linewidth: 1 };
      case 'arc':
        return { x: 0, y: 0, z: 0, radius: 50, startAngle: 0, endAngle: 3.14, segments: 32, color: '#000000', linewidth: 1 };
      
      // Curve
      case 'line':
        return { x1: 0, y1: 0, z1: 0, x2: 100, y2: 0, z2: 0, color: '#000000', linewidth: 1 };
      case 'spline':
        return { 
          points: [
            {x: 0, y: 0, z: 0}, 
            {x: 30, y: 50, z: 0}, 
            {x: 70, y: -20, z: 0},
            {x: 100, y: 0, z: 0}
          ],
          divisions: 50,
          color: '#000000',
          linewidth: 1 
        };
      case 'bezier':
        return { 
          points: [
            {x: 0, y: 0, z: 0}, 
            {x: 30, y: 100, z: 0}, 
            {x: 70, y: 100, z: 0},
            {x: 100, y: 0, z: 0}
          ],
          divisions: 50,
          color: '#000000',
          linewidth: 1 
        };
      case 'nurbs':
        return { 
          points: [
            {x: 0, y: 0, z: 0}, 
            {x: 30, y: 50, z: 0}, 
            {x: 60, y: -20, z: 0},
            {x: 100, y: 0, z: 0}
          ],
          degree: 3,
          divisions: 100,
          color: '#000000',
          linewidth: 1 
        };
      
      // Operazioni booleane
      case 'boolean-union':
        return { 
          operands: [],
          x: 0, 
          y: 0, 
          z: 0, 
          color: '#4CAF50', 
          wireframe: false 
        };
      case 'boolean-subtract':
        return { 
          operands: [],
          x: 0, 
          y: 0, 
          z: 0, 
          color: '#F44336', 
          wireframe: false 
        };
      case 'boolean-intersect':
        return { 
          operands: [],
          x: 0, 
          y: 0, 
          z: 0, 
          color: '#2196F3', 
          wireframe: false 
        };
      
      // Operazioni di trasformazione
      case 'extrusion':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          shape: 'rect', 
          width: 50, 
          height: 30, 
          depth: 20, 
          bevel: false, 
          color: '#4CAF50', 
          wireframe: false 
        };
      case 'revolution':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          profile: [
            {x: 0, y: 0}, 
            {x: 20, y: 0}, 
            {x: 25, y: 30}, 
            {x: 10, y: 50}
          ], 
          segments: 32, 
          angle: 6.28, 
          axis: 'y',
          color: '#FF5722', 
          wireframe: false 
        };
      case 'sweep':
        return { 
          profile: [
            {x: -10, y: -10},
            {x: 10, y: -10},
            {x: 10, y: 10},
            {x: -10, y: 10}
          ],
          path: [
            {x: 0, y: 0, z: 0},
            {x: 50, y: 50, z: 50},
            {x: 100, y: 0, z: 0}
          ],
          radius: 10,
          segments: 64,
          color: '#2196F3',
          wireframe: false 
        };
      case 'loft':
        return { 
          profiles: [
            {radius: 20},
            {radius: 40},
            {radius: 10}
          ],
          positions: [
            {x: 0, y: 0, z: 0},
            {x: 0, y: 0, z: 50},
            {x: 0, y: 0, z: 100}
          ],
          closed: false,
          color: '#9C27B0',
          wireframe: false 
        };
      
      // Elementi industriali
      case 'thread':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          diameter: 20, 
          pitch: 2, 
          length: 50, 
          handedness: 'right', 
          standard: 'metric',
          color: '#B0BEC5', 
          wireframe: false 
        };
      case 'chamfer':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          width: 100, 
          height: 100, 
          depth: 100, 
          distance: 10, 
          edges: [], 
          color: '#607D8B', 
          wireframe: false 
        };
      case 'fillet':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          width: 100, 
          height: 100, 
          depth: 100, 
          radius: 10, 
          edges: [], 
          color: '#607D8B', 
          wireframe: false 
        };
      case 'gear':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          moduleValue: 2, 
          teeth: 20, 
          thickness: 10, 
          pressureAngle: 20, 
          holeDiameter: 10, 
          color: '#B0BEC5', 
          wireframe: false 
        };
      case 'spring':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          radius: 30, 
          wireRadius: 5, 
          turns: 5, 
          height: 100, 
          color: '#9E9E9E', 
          wireframe: false 
        };
      
      // Elementi di assemblaggio
      case 'screw':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          size: 'M8', 
          length: 40, 
          thread: 'M8x1.25', 
          grade: '8.8', 
          color: '#9E9E9E', 
          wireframe: false 
        };
      case 'nut':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          size: 'M8', 
          thread: 'M8x1.25', 
          type: 'hex', 
          color: '#9E9E9E', 
          wireframe: false 
        };
      case 'bolt':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          size: 'M8', 
          length: 50, 
          thread: 'M8x1.25', 
          grade: '8.8', 
          color: '#9E9E9E', 
          wireframe: false 
        };
      case 'washer':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          size: 'M8', 
          outerDiameter: 16, 
          thickness: 1.5, 
          color: '#9E9E9E', 
          wireframe: false 
        };
      case 'rivet':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          diameter: 8, 
          length: 20, 
          color: '#9E9E9E', 
          wireframe: false 
        };
      
      // Elementi architettonici
      case 'wall':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          length: 300, 
          height: 100, 
          thickness: 20, 
          openings: [], 
          color: '#E0E0E0', 
          wireframe: false 
        };
      case 'floor':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          width: 400, 
          length: 400, 
          thickness: 10, 
          color: '#BCAAA4', 
          wireframe: false 
        };
      case 'roof':
        return { 
          x: 0, 
          y: 100, 
          z: 0, 
          width: 400, 
          length: 400, 
          height: 50, 
          style: 'pitched', 
          color: '#795548', 
          wireframe: false 
        };
      case 'window':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          width: 50, 
          height: 80, 
          thickness: 5, 
          style: 'simple', 
          frameColor: '#8D6E63', 
          color: '#B3E5FC', 
          wireframe: false 
        };
      case 'door':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          width: 36, 
          height: 80, 
          thickness: 2, 
          style: 'simple', 
          color: '#8D6E63', 
          wireframe: false 
        };
      case 'stair':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          width: 100, 
          height: 150, 
          depth: 200, 
          steps: 10, 
          color: '#BCAAA4', 
          wireframe: false 
        };
      case 'column':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          radius: 20, 
          height: 200, 
          style: 'simple', 
          color: '#E0E0E0', 
          wireframe: false 
        };
      
      // Elementi speciali
      case 'text3d':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          text: 'Hello', 
          height: 10, 
          depth: 2, 
          font: 'Arial', 
          color: '#4285F4', 
          wireframe: false 
        };
      case 'path3d':
        return { 
          points: [
            {x: 0, y: 0, z: 0},
            {x: 50, y: 50, z: 20},
            {x: 100, y: 0, z: 40}
          ],
          radius: 5,
          segments: 64,
          color: '#4285F4',
          wireframe: false 
        };
      case 'point-cloud':
        return { 
          points: [
            {x: 0, y: 0, z: 0},
            {x: 50, y: 10, z: 20},
            {x: 20, y: 50, z: 30},
            {x: 80, y: 30, z: 10},
            {x: 40, y: 70, z: 50}
          ],
          pointSize: 5,
          colors: [],
          color: '#4285F4'
        };
      case 'mesh':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          vertices: [
            {x: 0, y: 0, z: 0},
            {x: 100, y: 0, z: 0},
            {x: 100, y: 100, z: 0},
            {x: 0, y: 100, z: 0},
            {x: 50, y: 50, z: 50}
          ],
          faces: [
            [0, 1, 2],
            [0, 2, 3],
            [0, 1, 4],
            [1, 2, 4],
            [2, 3, 4],
            [3, 0, 4]
          ],
          color: '#4285F4',
          wireframe: false 
        };
      case 'group':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          elements: [] 
        };
        
      case 'tube':
        return { 
          path: [
            {x: 0, y: 0, z: 0}, 
            {x: 50, y: 20, z: 0}, 
            {x: 100, y: 0, z: 0}
          ], 
          radius: 5, 
          tubularSegments: 64, 
          radialSegments: 8, 
          closed: false, 
          color: '#2196F3', 
          wireframe: false 
        };
      case 'lathe':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          points: [
            {x: 0, y: 0}, 
            {x: 20, y: 0}, 
            {x: 20, y: 20}, 
            {x: 10, y: 40}
          ], 
          segments: 12, 
          phiLength: 6.28, 
          color: '#607D8B', 
          wireframe: false 
        };
      case 'grid':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          size: 100, 
          divisions: 10, 
          colorCenterLine: '#444444', 
          colorGrid: '#888888', 
          plane: 'xy' 
        };
      case 'text':
        return { 
          x: 0, 
          y: 0, 
          z: 0, 
          text: 'Text', 
          size: 10, 
          depth: 2, 
          color: '#000000', 
          bevel: false 
        };

        case 'linear-dimension':
  return {
    startPoint: { x: 0, y: 0, z: 0 },
    endPoint: { x: 100, y: 0, z: 0 },
    offsetDirection: 'y',
    offsetAmount: 20,
    unit: 'mm',
    precision: 2,
    color: '#FF0000',
    linewidth: 1
  };
case 'angular-dimension':
  return {
    vertex: { x: 0, y: 0, z: 0 },
    startPoint: { x: 100, y: 0, z: 0 },
    endPoint: { x: 0, y: 100, z: 0 },
    radius: 30,
    precision: 1,
    color: '#FF0000',
    linewidth: 1
  };
case 'radius-dimension':
  return {
    center: { x: 0, y: 0, z: 0 },
    pointOnCircle: { x: 50, y: 0, z: 0 },
    precision: 2,
    color: '#FF0000',
    linewidth: 1
  };
case 'diameter-dimension':
  return {
    center: { x: 0, y: 0, z: 0 },
    pointOnCircle: { x: 50, y: 0, z: 0 },
    precision: 2,
    color: '#FF0000',
    linewidth: 1
  };

// Drawing elements
case 'drawing-pen':
  return {
    points: [
      {x: 0, y: 0, z: 0},
      {x: 50, y: 50, z: 0},
      {x: 100, y: 0, z: 0}
    ],
    penSize: 2,
    color: '#000000'
  };
case 'drawing-highlighter':
  return {
    points: [
      {x: 0, y: 0, z: 0},
      {x: 50, y: 50, z: 0},
      {x: 100, y: 0, z: 0}
    ],
    highlighterSize: 8,
    color: '#FFFF00',
    opacity: 0.5
  };
case 'drawing-text':
  return {
    position: { x: 0, y: 0, z: 0 },
    text: 'Annotation',
    textSize: 12,
    font: 'Arial',
    color: '#000000'
  };
case 'drawing-eraser':
  return {
    points: [],
    eraserSize: 20,
    showEraserPath: false
  };
case 'drawing-screenshot-area':
  return {
    startPoint: { x: 0, y: 0, z: 0 },
    endPoint: { x: 200, y: 200, z: 0 },
    format: 'png'
  };
        
      default:
        return {
          x: 0,
          y: 0,
          z: 0,
          color: '#1e88e5'
        };
    }
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : type === 'number' ? parseFloat(value) : value
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({ ...formData, type });
  };

  const renderFormFields = () => {
    // Base position fields that many elements need
    const renderPositionFields = () => (
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-gray-500">X</label>
          <input
            type="number"
            name="x"
            value={formData.x}
            onChange={handleChange}
            className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500">Y</label>
          <input
            type="number"
            name="y"
            value={formData.y}
            onChange={handleChange}
            className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500">Z</label>
          <input
            type="number"
            name="z"
            value={formData.z}
            onChange={handleChange}
            className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
          />
        </div>
      </div>
    );

    const renderWireframeOption = () => (
      <div className="mt-2">
        <label className="flex items-center text-xs text-gray-500">
          <input
            type="checkbox"
            name="wireframe"
            checked={formData.wireframe}
            onChange={handleChange}
            className="mr-2"
          />
          Wireframe
        </label>
      </div>
    );

    // Simplified switch to render appropriate fields
    switch (type) {
      // Basic primitive and 2D forms we already had
      case 'line':
        return (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-gray-500">X1</label>
                <input
                  type="number"
                  name="x1"
                  value={formData.x1}
                  onChange={handleChange}
                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Y1</label>
                <input
                  type="number"
                  name="y1"
                  value={formData.y1}
                  onChange={handleChange}
                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Z1</label>
                <input
                  type="number"
                  name="z1"
                  value={formData.z1}
                  onChange={handleChange}
                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div>
                <label className="block text-xs text-gray-500">X2</label>
                <input
                  type="number"
                  name="x2"
                  value={formData.x2}
                  onChange={handleChange}
                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Y2</label>
                <input
                  type="number"
                  name="y2"
                  value={formData.y2}
                  onChange={handleChange}
                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Z2</label>
                <input
                  type="number"
                  name="z2"
                  value={formData.z2}
                  onChange={handleChange}
                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>
          </>
        );
        
      case 'circle':
      case 'sphere':
        return (
          <>
            {renderPositionFields()}
            <div className="mt-2">
              <label className="block text-xs text-gray-500">Radius</label>
              <input
                type="number"
                name="radius"
                value={formData.radius}
                onChange={handleChange}
                className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
              />
            </div>
            {type === 'sphere' && renderWireframeOption()}
          </>
        );
        
      case 'rectangle':
        return (
          <>
            {renderPositionFields()}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="block text-xs text-gray-500">Width</label>
                <input
                  type="number"
                  name="width"
                  value={formData.width}
                  onChange={handleChange}
                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Height</label>
                <input
                  type="number"
                  name="height"
                  value={formData.height}
                  onChange={handleChange}
                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>
          </>
        );
        
      case 'cube':
        return (
          <>
            {renderPositionFields()}
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div>
                <label className="block text-xs text-gray-500">Width</label>
                <input
                  type="number"
                  name="width"
                  value={formData.width}
                  onChange={handleChange}
                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Height</label>
                <input
                  type="number"
                  name="height"
                  value={formData.height}
                  onChange={handleChange}
                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Depth</label>
                <input
                  type="number"
                  name="depth"
                  value={formData.depth}
                  onChange={handleChange}
                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>
            {renderWireframeOption()}
          </>
        );
        
      case 'cylinder':
      case 'cone':
        return (
          <>
            {renderPositionFields()}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="block text-xs text-gray-500">Radius</label>
                <input
                  type="number"
                  name="radius"
                  value={formData.radius}
                  onChange={handleChange}
                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Height</label>
                <input
                  type="number"
                  name="height"
                  value={formData.height}
                  onChange={handleChange}
                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>
            {renderWireframeOption()}
          </>
        );
        
      case 'torus':
        return (
          <>
            {renderPositionFields()}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="block text-xs text-gray-500">Radius</label>
                <input
                  type="number"
                  name="radius"
                  value={formData.radius}
                  onChange={handleChange}
                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Tube</label>
                <input
                  type="number"
                  name="tube"
                  value={formData.tube}
                  onChange={handleChange}
                  className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>
            {renderWireframeOption()}
          </>
        );
        
      // For all other element types, provide a simplified form
      // showing only position and color
      default:
        return (
          <>
            {renderPositionFields()}
            <div className="mt-3">
              <p className="text-xs text-gray-500 mb-2">
                This element type ({type}) has additional properties available in advanced mode.
              </p>
              {type.includes('boolean') && (
                <div className="text-xs text-gray-500 mb-2">
                  <p>To use boolean operations:</p>
                  <ol className="list-decimal list-inside">
                    <li>Create and position objects</li>
                    <li>Select the objects to be combined</li>
                    <li>Apply the boolean operation</li>
                  </ol>
                </div>
              )}
            </div>
            {formData.wireframe !== undefined && renderWireframeOption()}
          </>
        );
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow-sm rounded-md p-4 mt-4"
    >
      <h4 className="text-sm font-medium text-gray-900 mb-2">
        Add {type.charAt(0).toUpperCase() + type.slice(1)}
      </h4>
      <form onSubmit={handleSubmit}>
        {renderFormFields()}
        
        <div className="mt-3">
          <label className="block text-xs text-gray-500">Color</label>
          <input
            type="color"
            name="color"
            value={formData.color}
            onChange={handleChange}
            className="w-full h-8"
          />
        </div>
        
        {(type === 'line' || type === 'circle' || type === 'rectangle') && (
          <div className="mt-2">
            <label className="block text-xs text-gray-500">Line Width</label>
            <input
              type="number"
              name="linewidth"
              value={formData.linewidth}
              onChange={handleChange}
              min={1}
              max={10}
              className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm"
            />
          </div>
        )}
        
        <div className="mt-4 flex justify-end space-x-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Add Element
          </button>
        </div>
      </form>
    </motion.div>
  );
};
const ToolPanel: React.FC = () => {
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const { addElement } = useElementsStore();
  const { layers, activeLayer } = useLayerStore();

  // Icone personalizzate per vari elementi
  const CylinderIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <line x1="4" y1="6" x2="4" y2="18" />
      <line x1="20" y1="6" x2="20" y2="18" />
      <ellipse cx="12" cy="18" rx="8" ry="3" />
    </svg>
  );

  const TorusIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );

  const PyramidIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="12,2 22,20 2,20" />
    </svg>
  );

  const PrismIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="12,2 20,7 20,17 12,22 4,17 4,7" />
    </svg>
  );

  const HemisphereIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12,12 C16.4183,12 20,8.41828 20,4 C20,-0.418278 16.4183,-4 12,-4 C7.58172,-4 4,-0.418278 4,4 C4,8.41828 7.58172,12 12,12 Z" />
      <line x1="4" y1="4" x2="20" y2="4" />
    </svg>
  );

  const EllipsoidIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="12" rx="8" ry="5" />
    </svg>
  );

  const CapsuleIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12,20 L12,4" />
      <path d="M7,4 A5,5 0 0 1 17,4" />
      <path d="M7,20 A5,5 0 0 0 17,20" />
    </svg>
  );

  const EllipseIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="12" rx="10" ry="6" />
    </svg>
  );

  const ArcIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5,19 C9,9 15,9 19,19" />
    </svg>
  );

  const SplineIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3,17 C7,21 10,5 17,10 C20,12 21,17 21,17" />
    </svg>
  );

  const BezierIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4,19 C8,10 16,14 20,5" />
      <circle cx="4" cy="19" r="1.5" />
      <circle cx="20" cy="5" r="1.5" />
    </svg>
  );

  const BoolUnionIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="9" r="6" />
      <circle cx="15" cy="15" r="6" />
    </svg>
  );

  const BoolSubtractIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="9" r="6" />
      <circle cx="15" cy="15" r="6" fill="white" strokeWidth="0" />
    </svg>
  );

  const BoolIntersectIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="9" r="6" />
      <circle cx="15" cy="15" r="6" />
      <path d="M12,12 m-3,0 a3,3 0 1,0 6,0 a3,3 0 1,0 -6,0" fill="currentColor" />
    </svg>
  );

  const ExtrudeIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="12,5 19,12 12,19 5,12" />
      <line x1="12" y1="5" x2="12" y2="2" />
    </svg>
  );

  const RevolutionIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12,2 L12,22" />
      <path d="M12,6 C16,6 20,8 20,12 C20,16 16,18 12,18" />
    </svg>
  );

  const SweepIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3,17 C8,12 16,12 21,17" />
      <circle cx="3" cy="17" r="2" />
      <circle cx="21" cy="17" r="2" />
    </svg>
  );

  const LoftIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="4" r="3" />
      <circle cx="12" cy="20" r="3" />
      <line x1="9" y1="4" x2="9" y2="20" />
      <line x1="15" y1="4" x2="15" y2="20" />
    </svg>
  );

  // Dopo le icone esistenti, aggiungi queste nuove icone personalizzate
const LinearDimensionIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="6" x2="4" y2="18" />
    <line x1="20" y1="6" x2="20" y2="18" />
    <line x1="10" y1="6" x2="10" y2="4" />
    <line x1="14" y1="6" x2="14" y2="4" />
  </svg>
);

const AngularDimensionIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12,12 L20,12" />
    <path d="M12,12 L12,4" />
    <path d="M12,12 L5,5" strokeDasharray="2,2" />
    <path d="M12,10 A2,2 0 0 1 14,12" />
  </svg>
);

const RadiusDimensionIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="8" />
    <line x1="12" y1="12" x2="18" y2="12" />
    <text x="15" y="10" fontSize="6" fill="currentColor">R</text>
  </svg>
);

const DiameterDimensionIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="8" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <text x="10" y="9" fontSize="6" fill="currentColor">Ø</text>
  </svg>
);

const DrawingPenIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4,20 C6,14 12,8 20,4" />
  </svg>
);

const DrawingHighlighterIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9,6 l9,9 l-6,2 l-5,-5 z" strokeWidth="3" strokeOpacity="0.5" />
  </svg>
);

const DrawingTextIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
    <text x="6" y="16" fontSize="14" fontWeight="bold" fill="currentColor">A</text>
  </svg>
);

const DrawingEraserIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18,14 l-8,8 l-6,-6 l8,-8 z" />
  </svg>
);

const ScreenshotIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <circle cx="12" cy="12" r="3" />
    <path d="M4,12 L7,12 M12,4 L12,7 M20,12 L17,12 M12,20 L12,17" />
  </svg>
);

  const ThreadIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12,3 v18" />
      <path d="M8,4 C13,7 13,13 8,16" />
      <path d="M16,4 C11,7 11,13 16,16" />
    </svg>
  );

  const ChamferIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4,4 L12,4 L20,12 L20,20 L12,20 L4,12 Z" />
    </svg>
  );

  const FilletIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4,4 h8 a8,8 0 0 1 8,8 v8" />
    </svg>
  );

  const GearIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <path d="M12,2 L12,4 M22,12 L20,12 M12,22 L12,20 M2,12 L4,12" />
      <path d="M17,7 L16,8 M17,17 L16,16 M7,17 L8,16 M7,7 L8,8" />
    </svg>
  );

  const SpringIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8,4 C14,5 10,9 16,10 C10,11 14,15 8,16 C14,17 10,21 16,22" />
    </svg>
  );

  const ScrewIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="2" x2="12" y2="22" />
      <path d="M9,4 H15" />
      <path d="M10,8 H14" />
      <path d="M10,12 H14" />
      <path d="M10,16 H14" />
      <path d="M10,20 H14" />
    </svg>
  );

  const NutIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="12,3 20,8 20,16 12,21 4,16 4,8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );

  const WasherIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );

  const RivetIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <circle cx="12" cy="5" r="3" />
      <circle cx="12" cy="19" r="3" />
    </svg>
  );

  const WallIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" />
      <line x1="3" y1="8" x2="21" y2="8" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="16" x2="21" y2="16" />
    </svg>
  );

  const FloorIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="2" />
      <line x1="7" y1="9" x2="7" y2="15" />
      <line x1="11" y1="9" x2="11" y2="15" />
      <line x1="15" y1="9" x2="15" y2="15" />
      <line x1="19" y1="9" x2="19" y2="15" />
    </svg>
  );

  const RoofIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="2,14 12,4 22,14" />
      <line x1="4" y1="14" x2="20" y2="14" />
    </svg>
  );

  const WindowIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="5" width="14" height="14" />
      <line x1="5" y1="12" x2="19" y2="12" />
      <line x1="12" y1="5" x2="12" y2="19" />
    </svg>
  );

  const DoorIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="3" width="14" height="18" />
      <circle cx="16" cy="12" r="1" />
    </svg>
  );

  const StairIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4,20 H8 V16 H12 V12 H16 V8 H20 V4" />
    </svg>
  );

  const ColumnIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="3" width="6" height="18" />
      <path d="M7,3 H17" />
      <path d="M7,21 H17" />
    </svg>
  );

  const Text3DIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <text x="6" y="16" fontSize="14" fontWeight="bold">T</text>
      <line x1="6" y1="18" x2="18" y2="18" />
      <path d="M7,13 L7,18" stroke-dasharray="2,2" />
    </svg>
  );

  const Path3DIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3,12 C7,8 12,16 21,12" />
      <circle cx="3" cy="12" r="1" />
      <circle cx="21" cy="12" r="1" />
    </svg>
  );

  const PointCloudIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="1" />
      <circle cx="8" cy="9" r="1" />
      <circle cx="16" cy="9" r="1" />
      <circle cx="6" cy="14" r="1" />
      <circle cx="18" cy="14" r="1" />
      <circle cx="14" cy="18" r="1" />
      <circle cx="10" cy="18" r="1" />
    </svg>
  );

  const MeshIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3,6 L21,6 L12,20 Z" />
      <line x1="3" y1="6" x2="12" y2="20" />
      <line x1="21" y1="6" x2="12" y2="20" />
    </svg>
  );

  const GroupIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="8" width="6" height="6" />
      <rect x="15" y="8" width="6" height="6" />
      <rect x="9" y="14" width="6" height="6" />
    </svg>
  );

  const PolygonIcon = () => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="12,4 20,10 17,19 7,19 4,10" />
    </svg>
  );

  const activeLayerInfo = layers.find(layer => layer.id === activeLayer);

  // Array completo di tutti gli strumenti
  const tools = [
    // Primitive di base
    { name: 'Cube', icon: <Box size={16} />, action: 'cube' },
    { name: 'Sphere', icon: <Circle size={16} />, action: 'sphere' },
    { name: 'Cylinder', icon: <CylinderIcon />, action: 'cylinder' },
    { name: 'Cone', icon: <Triangle size={16} />, action: 'cone' },
    { name: 'Torus', icon: <TorusIcon />, action: 'torus' },
    
    // Primitive avanzate
    { name: 'Pyramid', icon: <PyramidIcon />, action: 'pyramid' },
    { name: 'Prism', icon: <PrismIcon />, action: 'prism' },
    { name: 'Hemisphere', icon: <HemisphereIcon />, action: 'hemisphere' },
    { name: 'Ellipsoid', icon: <EllipsoidIcon />, action: 'ellipsoid' },
    { name: 'Capsule', icon: <CapsuleIcon />, action: 'capsule' },
    
    // Elementi 2D
    { name: 'Circle', icon: <Circle size={16} />, action: 'circle' },
    { name: 'Rectangle', icon: <Square size={16} />, action: 'rectangle' },
    { name: 'Triangle', icon: <Triangle size={16} />, action: 'triangle' },
    { name: 'Polygon', icon: <PolygonIcon />, action: 'polygon' },
    { name: 'Ellipse', icon: <EllipseIcon />, action: 'ellipse' },
    { name: 'Arc', icon: <ArcIcon />, action: 'arc' },
    
    // Curve
    { name: 'Line', icon: <Minus size={16} />, action: 'line' },
    { name: 'Spline', icon: <SplineIcon />, action: 'spline' },
    { name: 'Bezier', icon: <BezierIcon />, action: 'bezier' },
    { name: 'NURBS', icon: <SplineIcon />, action: 'nurbs' },
    
    // Operazioni booleane
    { name: 'Union', icon: <BoolUnionIcon />, action: 'boolean-union' },
    { name: 'Subtract', icon: <BoolSubtractIcon />, action: 'boolean-subtract' },
    { name: 'Intersect', icon: <BoolIntersectIcon />, action: 'boolean-intersect' },
    
    // Operazioni di trasformazione
    { name: 'Extrude', icon: <ExtrudeIcon />, action: 'extrusion' },
    { name: 'Revolve', icon: <RevolutionIcon />, action: 'revolution' },
    { name: 'Sweep', icon: <SweepIcon />, action: 'sweep' },
    { name: 'Loft', icon: <LoftIcon />, action: 'loft' },
    
    // Elementi industriali
    { name: 'Thread', icon: <ThreadIcon />, action: 'thread' },
    { name: 'Chamfer', icon: <ChamferIcon />, action: 'chamfer' },
    { name: 'Fillet', icon: <FilletIcon />, action: 'fillet' },
    { name: 'Gear', icon: <GearIcon />, action: 'gear' },
    { name: 'Spring', icon: <SpringIcon />, action: 'spring' },
    
    // Elementi di assemblaggio
    { name: 'Screw', icon: <ScrewIcon />, action: 'screw' },
    { name: 'Nut', icon: <NutIcon />, action: 'nut' },
    { name: 'Bolt', icon: <Anchor size={16} />, action: 'bolt' },
    { name: 'Washer', icon: <WasherIcon />, action: 'washer' },
    { name: 'Rivet', icon: <RivetIcon />, action: 'rivet' },
    
    // Elementi architettonici

    { name: 'Linear Dimension', icon: <LinearDimensionIcon />, action: 'linear-dimension' },
{ name: 'Angular Dimension', icon: <AngularDimensionIcon />, action: 'angular-dimension' },
{ name: 'Radius Dimension', icon: <RadiusDimensionIcon />, action: 'radius-dimension' },
{ name: 'Diameter Dimension', icon: <DiameterDimensionIcon />, action: 'diameter-dimension' },

// Elementi di disegno
{ name: 'Pen', icon: <DrawingPenIcon />, action: 'drawing-pen' },
{ name: 'Highlighter', icon: <DrawingHighlighterIcon />, action: 'drawing-highlighter' },
{ name: 'Text', icon: <DrawingTextIcon />, action: 'drawing-text' },
{ name: 'Eraser', icon: <DrawingEraserIcon />, action: 'drawing-eraser' },
{ name: 'Screenshot', icon: <ScreenshotIcon />, action: 'drawing-screenshot-area' },
    { name: 'Wall', icon: <WallIcon />, action: 'wall' },
    { name: 'Floor', icon: <FloorIcon />, action: 'floor' },
    { name: 'Roof', icon: <RoofIcon />, action: 'roof' },
    { name: 'Window', icon: <WindowIcon />, action: 'window' },
    { name: 'Door', icon: <DoorIcon />, action: 'door' },
    { name: 'Stair', icon: <StairIcon />, action: 'stair' },
    { name: 'Column', icon: <ColumnIcon />, action: 'column' },
    
    // Elementi speciali
    { name: 'Text 3D', icon: <Text3DIcon />, action: 'text3d' },
    { name: 'Path 3D', icon: <Path3DIcon />, action: 'path3d' },
    { name: 'Points', icon: <PointCloudIcon />, action: 'point-cloud' },
    { name: 'Mesh', icon: <MeshIcon />, action: 'mesh' },
    { name: 'Group', icon: <GroupIcon />, action: 'group' }
  ];

  const handleSelectTool = (action: string) => {
    setSelectedTool(selectedTool === action ? null : action);
  };

  const handleAddElement = (element: any) => {
    addElement(element);
    setSelectedTool(null);
  };

  return (
    <div className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow-md rounded-md p-4">
      <h3 className="text-md font-medium text-gray-900 mb-3">Add Elements</h3>
      
      {!activeLayerInfo && (
        <div className="bg-yellow-50 text-yellow-800 p-3 rounded-md mb-3 text-xs">
          Please select a layer first to add elements.
        </div>
      )}
      
      <div className="grid grid-cols-4 gap-1.5">
        {tools.map((tool) => (
          <motion.button
            key={tool.action}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleSelectTool(tool.action)}
            className={`p-1.5 rounded-md flex flex-col items-center justify-center text-xs ${
              selectedTool === tool.action
                ? 'bg-blue-500 text-white'
                : 'bg-[#F8FBFF] dark:bg-gray-800 dark:text-white text-gray-700 hover:bg-gray-100'
            } ${!activeLayerInfo ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={!activeLayerInfo}
            title={tool.name}
          >
            <div className="mb-0.5">{tool.icon}</div>
            <span className="text-[10px] truncate w-full text-center">{tool.name}</span>
          </motion.button>
        ))}
      </div>
      
      <AnimatePresence>
        {selectedTool && activeLayerInfo && (
          <ElementForm 
            type={selectedTool} 
            onAdd={handleAddElement} 
            onCancel={() => setSelectedTool(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default ToolPanel;