import { useState, useCallback } from 'react';
import { DrawingToolType } from 'src/components/cam/DrawingToolbar';

export interface DrawingToolState {
  activeTool: DrawingToolType;
  penSize: number;
  eraserSize: number;
  highlighterSize: number;
  color: string;
  textSize: number;
  dimensionStyle: 'linear' | 'angular' | 'radius' | 'diameter';
  isDrawing: boolean;
  drawingPoints: { x: number; y: number; z: number }[];
}

export const useDrawingTools = () => {
  const [toolState, setToolState] = useState<DrawingToolState>({
    activeTool: 'select',
    penSize: 2,
    eraserSize: 10,
    highlighterSize: 5,
    color: '#000000',
    textSize: 12,
    dimensionStyle: 'linear',
    isDrawing: false,
    drawingPoints: []
  });

  const setActiveTool = useCallback((tool: DrawingToolType) => {
    setToolState(prev => ({ ...prev, activeTool: tool }));
  }, []);

  const setPenSize = useCallback((size: number) => {
    setToolState(prev => ({ ...prev, penSize: size }));
  }, []);

  const setEraserSize = useCallback((size: number) => {
    setToolState(prev => ({ ...prev, eraserSize: size }));
  }, []);

  const setHighlighterSize = useCallback((size: number) => {
    setToolState(prev => ({ ...prev, highlighterSize: size }));
  }, []);

  const setColor = useCallback((color: string) => {
    setToolState(prev => ({ ...prev, color }));
  }, []);

  const setTextSize = useCallback((size: number) => {
    setToolState(prev => ({ ...prev, textSize: size }));
  }, []);

  const setDimensionStyle = useCallback((style: 'linear' | 'angular' | 'radius' | 'diameter') => {
    setToolState(prev => ({ ...prev, dimensionStyle: style }));
  }, []);

  const startDrawing = useCallback((x: number, y: number, z: number) => {
    setToolState(prev => ({
      ...prev,
      isDrawing: true,
      drawingPoints: [{ x, y, z }]
    }));
  }, []);

  const addDrawingPoint = useCallback((x: number, y: number, z: number) => {
    setToolState(prev => {
      if (!prev.isDrawing) return prev;
      
      return {
        ...prev,
        drawingPoints: [...prev.drawingPoints, { x, y, z }]
      };
    });
  }, []);

  const finishDrawing = useCallback(() => {
    setToolState(prev => {
      if (!prev.isDrawing) return prev;
      
      // Keep the drawing points for later use but set isDrawing to false
      return {
        ...prev,
        isDrawing: false
      };
    });
    
    // Return the drawing points for processing
    return toolState.drawingPoints;
  }, [toolState.drawingPoints]);

  const resetDrawing = useCallback(() => {
    setToolState(prev => ({
      ...prev,
      isDrawing: false,
      drawingPoints: []
    }));
  }, []);

  return {
    toolState,
    setActiveTool,
    setPenSize,
    setEraserSize,
    setHighlighterSize,
    setColor,
    setTextSize,
    setDimensionStyle,
    startDrawing,
    addDrawingPoint,
    finishDrawing,
    resetDrawing
  };
};

export default useDrawingTools;