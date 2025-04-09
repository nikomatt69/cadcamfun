// src/hooks/useToolLibrary.ts
import { useState, useEffect } from 'react';
import { 
  fetchTools, 
  createTool as apiCreateTool, 
  updateTool as apiUpdateTool, 
  deleteTool as apiDeleteTool,
  CreateToolInput,
  UpdateToolInput 
} from '../lib/api/tools';
import { Tool } from '@prisma/client';

interface UseToolLibraryReturn {
  tools: Tool[];
  isLoading: boolean;
  error: Error | null;
  createTool: (toolData: CreateToolInput) => Promise<Tool>;
  updateTool: (id: string, toolData: Partial<CreateToolInput>) => Promise<Tool>;
  deleteTool: (id: string) => Promise<void>;
  refreshTools: () => Promise<void>;
}

export function useToolLibrary(filters?: {
  type?: string;
  material?: string;
  search?: string;
}): UseToolLibraryReturn {
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  // Load tools from API
  const loadTools = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await fetchTools(filters);
      setTools(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch tools'));
      console.error('Error fetching tools:', err);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Fetch tools on mount and when filters change
  useEffect(() => {
    loadTools();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);
  
  // Create a new tool
  const createNewTool = async (toolData: CreateToolInput) => {
    try {
      const newTool = await apiCreateTool(toolData);
      setTools(prevTools => [...prevTools, newTool]);
      return newTool;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create tool');
      console.error('Error creating tool:', err);
      throw error;
    }
  };
  
  // Update a tool
  const updateExistingTool = async (id: string, toolData: Partial<CreateToolInput>) => {
    try {
      const updatedTool = await apiUpdateTool({ id, ...toolData });
      setTools(prevTools => 
        prevTools.map(tool => tool.id === id ? updatedTool : tool)
      );
      return updatedTool;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to update tool');
      console.error('Error updating tool:', err);
      throw error;
    }
  };
  
  // Delete a tool
  const deleteExistingTool = async (id: string) => {
    try {
      await apiDeleteTool(id);
      setTools(prevTools => prevTools.filter(tool => tool.id !== id));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to delete tool');
      console.error('Error deleting tool:', err);
      throw error;
    }
  };
  
  return {
    tools,
    isLoading,
    error,
    createTool: createNewTool,
    updateTool: updateExistingTool,
    deleteTool: deleteExistingTool,
    refreshTools: loadTools
  };
}