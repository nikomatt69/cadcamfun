import React, { useState } from 'react';
import { 
   Droplet, Edit3, Type, MousePointer, 
  ChevronDown, ChevronUp, Circle, ArrowRight, Compass,
  Square, Flag, CornerDownRight, Hash, X,
  PenTool,
  Upload,
  Grid,
  Camera  // Aggiungo l'icona Camera per lo screenshot
} from 'react-feather';
import { motion, AnimatePresence } from 'framer-motion';

export type DrawingToolType = 
  | 'pen'           // Drawing pen
  | 'eraser'        // Eraser
  | 'colorPicker'   // Color picker
  | 'highlighter'   // Highlighter
  | 'dimension'     // Dimensioning tool
  | 'text'          // Text insertion tool
  | 'select'        // Default selection tool
  | 'screenshot';   // Screenshot tool

interface DrawingToolbarProps {
  onSelectTool: (tool: DrawingToolType) => void;
  activeTool: DrawingToolType;
  color: string;
  onColorChange: (color: string) => void;
  penSize: number;
  onPenSizeChange: (size: number) => void;
  eraserSize: number;
  onEraserSizeChange: (size: number) => void;
  highlighterSize: number;
  onHighlighterSizeChange: (size: number) => void;
  textSize: number;
  onTextSizeChange: (size: number) => void;
  dimensionStyle: 'linear' | 'angular' | 'radius' | 'diameter';
  onDimensionStyleChange: (style: 'linear' | 'angular' | 'radius' | 'diameter') => void;
  onTakeScreenshot?: (type: 'full' | 'selection' | 'viewport') => void;
}

const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
  onSelectTool,
  activeTool,
  color,
  onColorChange,
  penSize,
  onPenSizeChange,
  eraserSize,
  onEraserSizeChange,
  highlighterSize,
  onHighlighterSizeChange,
  textSize,
  onTextSizeChange,
  dimensionStyle,
  onDimensionStyleChange,
  onTakeScreenshot = () => {}
}) => {
  const [expandedTool, setExpandedTool] = useState<DrawingToolType | null>(null);
  
  const toggleExpandTool = (tool: DrawingToolType) => {
    if (expandedTool === tool) {
      setExpandedTool(null);
    } else {
      setExpandedTool(tool);
    }
  };
  
  // Create a tool button component
  const ToolButton = ({ 
    tool, 
   
    label 
  }: { 
    tool: DrawingToolType; 
  
    label: string;
  }) => (
    <div className="relative">
      <button
        className={`p-1 rounded-md flex items-center justify-center ${
          activeTool === tool ? 'bg-blue-500 text-white' : 'bg-white text-gray-800 hover:bg-gray-100'
        }`}
        onClick={() => {
          onSelectTool(tool);
          toggleExpandTool(tool);
        }}
        title={label}
      >
        <div className="flex flex-col items-center">
         
          <span className="text-xs mt-1">{label}</span>
          {(tool === 'pen' || tool === 'eraser' || tool === 'highlighter' || 
            tool === 'text' || tool === 'dimension' || tool === 'colorPicker' ||
            tool === 'screenshot') && (
            <ChevronDown size={12} className="ml-1" />
          )}
        </div>
      </button>
      
      {/* Tool Options Panel */}
      <AnimatePresence>
        {expandedTool === tool && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute left-0 top-full mt-1 bg-white rounded-md shadow-lg p-2 z-50 min-w-[200px]"
          >
            {tool === 'pen' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Pen Size</label>
                <div className="flex items-center">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={penSize}
                    onChange={(e) => onPenSizeChange(Number(e.target.value))}
                    className="w-full"
                  />
                  <span className="ml-2 text-sm">{penSize}px</span>
                </div>
                <div className="mt-1">
                  <label className="block text-sm font-medium text-gray-700">Color</label>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => onColorChange(e.target.value)}
                    className="mt-1 w-full h-8"
                  />
                </div>
                <div className="mt-1">
                  <label className="block text-sm font-medium text-gray-700">Line Style</label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    <button className="h-7 border rounded flex items-center justify-center bg-gray-50">
                      <div className="w-10 h-px bg-black"></div>
                    </button>
                    <button className="h-7 border rounded flex items-center justify-center bg-gray-50">
                      <div className="w-10 h-px bg-black" style={{borderTop: '1px dashed black'}}></div>
                    </button>
                    <button className="h-7 border rounded flex items-center justify-center bg-gray-50">
                      <div className="w-10 h-px bg-black" style={{borderTop: '1px dotted black'}}></div>
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {tool === 'eraser' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Eraser Size</label>
                <div className="flex items-center">
                  <input
                    type="range"
                    min="5"
                    max="50"
                    value={eraserSize}
                    onChange={(e) => onEraserSizeChange(Number(e.target.value))}
                    className="w-full"
                  />
                  <span className="ml-2 text-sm">{eraserSize}px</span>
                </div>
                <div className="mt-1">
                  <label className="block text-sm font-medium text-gray-700">Eraser Type</label>
                  <div className="mt-1 space-y-1">
                    <button className="w-full py-1 px-2 text-left text-sm rounded hover:bg-gray-100 flex items-center">
                      <X size={14} className="mr-2" />
                      <span>Object Eraser</span>
                    </button>
                    <button className="w-full py-1 px-2 text-left text-sm rounded hover:bg-gray-100 flex items-center">
                      <Square size={14} className="mr-2" />
                      <span>Area Eraser</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {tool === 'highlighter' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Highlighter Size</label>
                <div className="flex items-center">
                  <input
                    type="range"
                    min="5"
                    max="30"
                    value={highlighterSize}
                    onChange={(e) => onHighlighterSizeChange(Number(e.target.value))}
                    className="w-full"
                  />
                  <span className="ml-2 text-sm">{highlighterSize}px</span>
                </div>
                <div className="mt-1">
                  <label className="block text-sm font-medium text-gray-700">Color</label>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => onColorChange(e.target.value)}
                    className="mt-1 w-full h-8"
                  />
                </div>
                <div className="mt-1">
                  <label className="block text-sm font-medium text-gray-700">Opacity</label>
                  <div className="flex items-center">
                    <input
                      type="range"
                      min="10"
                      max="100"
                      step="10"
                      defaultValue="50"
                      className="w-full"
                    />
                    <span className="ml-2 text-sm">50%</span>
                  </div>
                </div>
              </div>
            )}
            
            {tool === 'colorPicker' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Selected Color</label>
                <div className="flex items-center space-x-2">
                  <div
                    className="w-8 h-8 rounded-md border border-gray-300"
                    style={{ backgroundColor: color }}
                  />
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => onColorChange(e.target.value)}
                    className="px-2 py-1 border rounded text-sm"
                  />
                </div>
                <div className="grid grid-cols-5 gap-1 mt-2">
                  {['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', 
                    '#00FFFF', '#FF00FF', '#C0C0C0', '#FFFFFF', '#808080'].map((c) => (
                    <button
                      key={c}
                      className="w-6 h-6 rounded-sm border border-gray-300"
                      style={{ backgroundColor: c }}
                      onClick={() => onColorChange(c)}
                    />
                  ))}
                </div>
              </div>
            )}
            
            {tool === 'text' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Text Size</label>
                <div className="flex items-center">
                  <input
                    type="range"
                    min="8"
                    max="36"
                    value={textSize}
                    onChange={(e) => onTextSizeChange(Number(e.target.value))}
                    className="w-full"
                  />
                  <span className="ml-2 text-sm">{textSize}px</span>
                </div>
                    <div className="mt-1">
                  <label className="block text-sm font-medium text-gray-700">Font</label>
                  <select className="mt-1 w-full px-2 py-1 border rounded text-sm">
                    <option>Arial</option>
                    <option>Helvetica</option>
                    <option>Times New Roman</option>
                    <option>Courier New</option>
                  </select>
                </div>
                <div className="mt-1">
                  <label className="block text-sm font-medium text-gray-700">Color</label>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => onColorChange(e.target.value)}
                    className="mt-1 w-full h-8"
                  />
                </div>
                <div className="mt-1 flex space-x-2">
                  <button className="p-1 border rounded hover:bg-gray-100" title="Bold">
                    <span className="font-bold">B</span>
                  </button>
                  <button className="p-1 border rounded hover:bg-gray-100" title="Italic">
                    <span className="italic">I</span>
                  </button>
                  <button className="p-1 border rounded hover:bg-gray-100" title="Underline">
                    <span className="underline">U</span>
                  </button>
                </div>
              </div>
            )}
            
            {tool === 'dimension' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Dimension Style</label>
                <div className="flex flex-col space-y-1">
                  <button
                    className={`flex items-center px-2 py-1 rounded text-sm ${
                      dimensionStyle === 'linear' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
                    }`}
                    onClick={() => onDimensionStyleChange('linear')}
                  >
                    <ArrowRight size={14} className="mr-2" />
                    <span>Linear</span>
                  </button>
                  <button
                    className={`flex items-center px-2 py-1 rounded text-sm ${
                      dimensionStyle === 'angular' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
                    }`}
                    onClick={() => onDimensionStyleChange('angular')}
                  >
                    <Compass size={14} className="mr-2" />
                    <span>Angular</span>
                  </button>
                  <button
                    className={`flex items-center px-2 py-1 rounded text-sm ${
                      dimensionStyle === 'radius' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
                    }`}
                    onClick={() => onDimensionStyleChange('radius')}
                  >
                    <Circle size={14} className="mr-2" />
                    <span>Radius</span>
                  </button>
                  <button
                    className={`flex items-center px-2 py-1 rounded text-sm ${
                      dimensionStyle === 'diameter' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
                    }`}
                    onClick={() => onDimensionStyleChange('diameter')}
                  >
                    <Hash size={14} className="mr-2" />
                    <span>Diameter</span>
                  </button>
                </div>
                <div className="mt-1">
                  <label className="block text-sm font-medium text-gray-700">Units</label>
                  <select className="mt-1 w-full px-2 py-1 border rounded text-sm">
                    <option>mm</option>
                    <option>cm</option>
                    <option>inch</option>
                  </select>
                </div>
                <div className="mt-1">
                  <label className="block text-sm font-medium text-gray-700">Precision</label>
                  <select className="mt-1 w-full px-2 py-1 border rounded text-sm">
                    <option>0</option>
                    <option>0.0</option>
                    <option>0.00</option>
                    <option>0.000</option>
                  </select>
                </div>
              </div>
            )}
            
            {/* Screenshot Tool Options */}
            {tool === 'screenshot' && (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">Screenshot Options</label>
                <div className="flex flex-col space-y-2">
                  <button
                    className="flex items-center px-3 py-2 border rounded-md hover:bg-gray-50 transition-colors"
                    onClick={() => onTakeScreenshot('full')}
                  >
                    <div className="mr-2 text-blue-500">
                      <Camera size={18} />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium">Full Canvas</div>
                      <div className="text-xs text-gray-500">Capture entire drawing</div>
                    </div>
                  </button>
                  
                  <button
                    className="flex items-center px-3 py-2 border rounded-md hover:bg-gray-50 transition-colors"
                    onClick={() => onTakeScreenshot('selection')}
                  >
                    <div className="mr-2 text-green-500">
                      <Square size={18} />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium">Selection</div>
                      <div className="text-xs text-gray-500">Drag to select an area</div>
                    </div>
                  </button>
                  
                  <button
                    className="flex items-center px-3 py-2 border rounded-md hover:bg-gray-50 transition-colors"
                    onClick={() => onTakeScreenshot('viewport')}
                  >
                    <div className="mr-2 text-purple-500">
                      <Grid size={18} />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium">Viewport</div>
                      <div className="text-xs text-gray-500">Current visible area</div>
                    </div>
                  </button>
                </div>
                
                  <div className="mt-2 border-t pt-2">
                  <div className="text-sm text-gray-700">Image Format</div>
                  <div className="mt-1 flex space-x-2">
                    <button className="px-2 py-1 text-sm border rounded-md bg-blue-50 text-blue-700">PNG</button>
                    <button className="px-2 py-1 text-sm border rounded-md hover:bg-gray-50">JPG</button>
                    <button className="px-2 py-1 text-sm border rounded-md hover:bg-gray-50">SVG</button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
  
  return (
    <div className="bg-white shadow-md rounded-md p-2 flex  flex-wrap items-center gap-2">
      <ToolButton tool="select"  label="Select" />
      <ToolButton tool="pen" label="Pen" />
      <ToolButton tool="eraser"  label="Eraser" />
      <ToolButton tool="colorPicker" label="Color" />
      <ToolButton tool="highlighter"  label="Highlight" />
      <ToolButton tool="dimension"  label="Dimension" />
      <ToolButton tool="text"  label="Text" />
      {/* Nuovo strumento Screenshot */}
      <ToolButton tool="screenshot"  label="Screenshot" />
      
      {/* Current Color Indicator */}
      <div className="ml-auto flex items-center space-x-2">
        <div className="w-5 h-5 rounded-full border border-gray-300" style={{ backgroundColor: color }} />
        <span className="text-xs text-gray-600 font-mono">{color.toUpperCase()}</span>
      </div>
    </div>
  );
};

export default DrawingToolbar;