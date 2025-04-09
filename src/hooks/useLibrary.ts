/* eslint-disable react-hooks/exhaustive-deps */
// src/hooks/useLibrary.ts
import { useState, useEffect } from 'react';
import { libraryService, LibraryItem } from '../components/cam/LibraryManagerUI';
import { useSession } from 'next-auth/react';

interface UseLibraryReturn {
  // CAD Components
  cadComponents: LibraryItem[];
  isLoadingCadComponents: boolean;
  errorCadComponents: Error | null;
  
  // User Components
  userComponents: LibraryItem[];
  isLoadingUserComponents: boolean;
  errorUserComponents: Error | null;
  
  // Predefined Components
  predefinedComponents: LibraryItem[];
  isLoadingPredefinedComponents: boolean;
  errorPredefinedComponents: Error | null;
  
  // Materials
  materials: LibraryItem[];
  isLoadingMaterials: boolean;
  errorMaterials: Error | null;
  
  // Tools
  tools: LibraryItem[];
  isLoadingTools: boolean;
  errorTools: Error | null;

  // Machine Configs
  machineConfigs: LibraryItem[];
  isLoadingMachineConfigs: boolean;
  errorMachineConfigs: Error | null;
  
  // Search Functions
  searchCadComponents: (query: string) => LibraryItem[];
  searchUserComponents: (query: string) => LibraryItem[];
  searchMaterials: (query: string) => LibraryItem[];
  searchTools: (query: string) => LibraryItem[];
  searchMachineConfigs: (query: string) => LibraryItem[];
  
  // Add to CAD
  addComponentToCAD: (item: LibraryItem) => string | null;
  
  // Refresh Functions
  refreshUserComponents: () => Promise<void>;
  refreshMaterials: () => Promise<void>;
  refreshTools: () => Promise<void>;
  refreshMachineConfigs: () => Promise<void>;
}

export function useLibrary(): UseLibraryReturn {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  
  // Library states
  const [cadComponents, setCadComponents] = useState<LibraryItem[]>([]);
  const [userComponents, setUserComponents] = useState<LibraryItem[]>([]);
  const [predefinedComponents, setPredefinedComponents] = useState<LibraryItem[]>([]);
  const [materials, setMaterials] = useState<LibraryItem[]>([]);
  const [tools, setTools] = useState<LibraryItem[]>([]);
  const [machineConfigs, setMachineConfigs] = useState<LibraryItem[]>([]);
  
  // Loading states
  const [isLoadingCadComponents, setIsLoadingCadComponents] = useState(true);
  const [isLoadingUserComponents, setIsLoadingUserComponents] = useState(true);
  const [isLoadingPredefinedComponents, setIsLoadingPredefinedComponents] = useState(true);
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(true);
  const [isLoadingTools, setIsLoadingTools] = useState(true);
  const [isLoadingMachineConfigs, setIsLoadingMachineConfigs] = useState(true);
  
  // Error states
  const [errorCadComponents, setErrorCadComponents] = useState<Error | null>(null);
  const [errorUserComponents, setErrorUserComponents] = useState<Error | null>(null);
  const [errorPredefinedComponents, setErrorPredefinedComponents] = useState<Error | null>(null);
  const [errorMaterials, setErrorMaterials] = useState<Error | null>(null);
  const [errorTools, setErrorTools] = useState<Error | null>(null);
  const [errorMachineConfigs, setErrorMachineConfigs] = useState<Error | null>(null);
  
  // Initialize the library
  useEffect(() => {
    async function initLibrary() {
      try {
        await libraryService.initialize(userId);
        
        // Load built-in CAD components
        setIsLoadingCadComponents(true);
        try {
          const components = libraryService.getCadComponents();
          setCadComponents(components);
        } catch (error) {
          setErrorCadComponents(error as Error);
        } finally {
          setIsLoadingCadComponents(false);
        }
        
        // Load predefined components
        setIsLoadingPredefinedComponents(true);
        try {
          const components = libraryService.getPredefinedComponents();
          setPredefinedComponents(components);
        } catch (error) {
          setErrorPredefinedComponents(error as Error);
        } finally {
          setIsLoadingPredefinedComponents(false);
        }
        
        // If user is authenticated, load user data
        if (userId) {
          // Load user components
          await refreshUserComponents();
          
          // Load materials
          await refreshMaterials();
          
          // Load tools
          await refreshTools();

          // Load machine configs
          await refreshMachineConfigs();
        } else {
          setIsLoadingUserComponents(false);
          setIsLoadingMaterials(false);
          setIsLoadingTools(false);
          setIsLoadingMachineConfigs(false);
        }
      } catch (error) {
        console.error('Failed to initialize library service:', error);
      }
    }
    
    initLibrary();
  }, [userId]);
  
  // Refresh functions
  const refreshUserComponents = async () => {
    if (!userId) return;
    
    setIsLoadingUserComponents(true);
    try {
      const components = libraryService.getUserComponents(userId);
      setUserComponents(components);
    } catch (error) {
      setErrorUserComponents(error as Error);
    } finally {
      setIsLoadingUserComponents(false);
    }
  };
  
  const refreshMaterials = async () => {
    if (!userId) return;
    
    setIsLoadingMaterials(true);
    try {
      const userMaterials = libraryService.getUserMaterials(userId);
      const predefinedMaterials = libraryService.getPredefinedMaterials();
      setMaterials([...userMaterials, ...predefinedMaterials]);
    } catch (error) {
      setErrorMaterials(error as Error);
    } finally {
      setIsLoadingMaterials(false);
    }
  };
  
  const refreshTools = async () => {
    if (!userId) return;
    
    setIsLoadingTools(true);
    try {
      const userTools = libraryService.getUserTools(userId);
      const predefinedTools = libraryService.getPredefinedTools();
      setTools([...userTools, ...predefinedTools]);
    } catch (error) {
      setErrorTools(error as Error);
    } finally {
      setIsLoadingTools(false);
    }
  };

  const refreshMachineConfigs = async () => {
    if (!userId) return;
    
    setIsLoadingMachineConfigs(true);
    try {
      const configs = libraryService.getUserMachineConfigs(userId);
      setMachineConfigs(Array.isArray(configs) ? configs : []);
    } catch (error) {
      console.error('Error loading machine configurations:', error);
      setErrorMachineConfigs(error as Error);
      setMachineConfigs([]);
    } finally {
      setIsLoadingMachineConfigs(false);
    }
  };
  
  // Search functions
  const searchCadComponents = (query: string): LibraryItem[] => {
    return libraryService.getCadComponents(query);
  };
  
  const searchUserComponents = (query: string): LibraryItem[] => {
    if (!userId) return [];
    return libraryService.getUserComponents(userId, query);
  };
  
  const searchMaterials = (query: string): LibraryItem[] => {
    if (!userId) return [];
    const userMaterials = libraryService.getUserMaterials(userId, query);
    const predefinedMaterials = libraryService.getPredefinedMaterials().filter(
      item => item.name.toLowerCase().includes(query.toLowerCase()) ||
             item.description?.toLowerCase().includes(query.toLowerCase()) ||
             item.tags?.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
    );
    return [...userMaterials, ...predefinedMaterials];
  };
  
  const searchTools = (query: string): LibraryItem[] => {
    if (!userId) return [];
    const userTools = libraryService.getUserTools(userId, query);
    const predefinedTools = libraryService.getPredefinedTools().filter(
      item => item.name.toLowerCase().includes(query.toLowerCase()) ||
             item.description?.toLowerCase().includes(query.toLowerCase()) ||
             item.type.toLowerCase().includes(query.toLowerCase()) ||
             item.tags?.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
    );
    return [...userTools, ...predefinedTools];
  };

  const searchMachineConfigs = (query: string): LibraryItem[] => {
    if (!userId) return [];
    return libraryService.getUserMachineConfigs(userId, query);
  };
  
  // Add component to CAD function
  const addComponentToCAD = (item: LibraryItem): string | null => {
    return libraryService.addComponentToCAD(item);
  };
  
  return {
    cadComponents,
    isLoadingCadComponents,
    errorCadComponents,
    
    userComponents,
    isLoadingUserComponents,
    errorUserComponents,
    
    predefinedComponents,
    isLoadingPredefinedComponents,
    errorPredefinedComponents,
    
    materials,
    isLoadingMaterials,
    errorMaterials,
    
    tools,
    isLoadingTools,
    errorTools,

    machineConfigs,
    isLoadingMachineConfigs,
    errorMachineConfigs,
    
    searchCadComponents,
    searchUserComponents,
    searchMaterials,
    searchTools,
    searchMachineConfigs,
    
    addComponentToCAD,
    
    refreshUserComponents,
    refreshMaterials,
    refreshTools,
    refreshMachineConfigs
  };
}
