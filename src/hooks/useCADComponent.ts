
// src/hooks/useCADComponent.ts
import { useState } from 'react';
import { useSession } from 'next-auth/react';

import { useElementsStore } from '../store/elementsStore';
import libraryService from '../components/cam/LibraryManagerUI';

interface UseCADComponentReturn {
  isLoading: boolean;
  error: Error | null;
  
  // Add component from library to CAD
  addComponentToCad: (componentId: string) => string | null;
  
  // Create and add custom component
  createCustomComponent: (component: any) => string | null;
  
  // Save current selection as component
  saveSelectionAsComponent: (name: string, description?: string, projectId?: string) => Promise<string | null>;
}

export function useCADComponent(): UseCADComponentReturn {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const { addElement, selectedElement, elements, selectedElements } = useElementsStore();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  // Add component from library to CAD
  const addComponentToCad = (componentId: string): string | null => {
    try {
      const cadElement = libraryService.createCADElementFromLibrary(componentId);
      return addElement(cadElement);
    } catch (error) {
      setError(error as Error);
      return null;
    }
  };
  
  // Create and add custom component
  const createCustomComponent = (component: any): string | null => {
    try {
      return addElement(component);
    } catch (error) {
      setError(error as Error);
      return null;
    }
  };
  
  // Save current selection as component
  const saveSelectionAsComponent = async (
    name: string,
    description?: string,
    projectId?: string
  ): Promise<string | null> => {
    if (!userId) {
      setError(new Error('User not authenticated'));
      return null;
    }
    
    if (!projectId) {
      setError(new Error('Project ID is required'));
      return null;
    }
    
    // Get selected elements
    const elementsToSave = selectedElements.length > 0
      ? elements.filter(el => selectedElements.includes(el.id))
      : selectedElement
        ? [selectedElement]
        : [];
    
    if (elementsToSave.length === 0) {
      setError(new Error('No elements selected'));
      return null;
    }
    
    setIsLoading(true);
    try {
      const component = {
        name,
        description,
        category: 'component',
        type: 'custom',
        properties: {
          elements: elementsToSave
        }
      };
      const componentId = await libraryService.saveComponent(
        {
          ...component,
          category: component.category as "component" | "tool" | "material" | "machine"
        },
        projectId,
        userId
      );
      return componentId;
    } catch (error) {
      setError(error as Error);
      return null;
    } finally {
      setIsLoading(false);
    }
  };
  
  return {
    isLoading,
    error,
    addComponentToCad,
    createCustomComponent,
    saveSelectionAsComponent
  };
}