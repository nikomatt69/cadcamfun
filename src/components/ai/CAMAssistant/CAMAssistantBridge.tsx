// src/components/ai/CAMAssistant/CAMAssistantBridge.tsx
import React, { useContext, useEffect, useState, useCallback } from "react";
import {
  Toolpath,
  Tool,
  Material,
  MachiningOperation,
  ToolpathAnalysis,
  GCodeAnalysis,
  CostEstimation,
  CAMAssistantState
} from "../../../types/CAMTypes";
import { v4 as uuidv4 } from "uuid";
// Import toast directly from a library or use a custom implementation
import toast from "react-hot-toast";
import { useAI } from "../ai-new/AIContextProvider";
import { camActionHandler } from "../../../lib/ai/camActionHandler";
import { unifiedAIService } from "../../../lib/ai/unifiedAIServiceCAM";

// Create a context for CAM Assistant
export const CAMAssistantContext = React.createContext<{
  state: CAMAssistantState;
  analyzeToolpath: (toolpath: Toolpath, tool?: Tool, material?: Material) => Promise<ToolpathAnalysis | null>;
  optimizeToolpath: (
    toolpath: Toolpath,
    goals: ("time" | "quality" | "tool_life" | "cost")[],
    tool?: Tool,
    material?: Material
  ) => Promise<Toolpath | null>;
  analyzeTool: (tool: Tool, material?: Material, operation?: MachiningOperation) => Promise<any>;
  optimizeTool: (toolpath: Toolpath, currentTool: Tool, availableTools?: Tool[]) => Promise<any>;
  analyzeMaterial: (material: Material, tools?: Tool[], operation?: MachiningOperation) => Promise<any>;
  calculateCost: (
    toolpath: Toolpath,
    tool: Tool,
    material?: Material,
    rates?: { machine: number; labor: number }
  ) => Promise<CostEstimation | null>;
  analyzeGCode: (gcode: string, tool?: Tool, material?: Material) => Promise<GCodeAnalysis | null>;
  optimizeGCode: (
    gcode: string,
    goals: ("time" | "quality" | "tool_life" | "cost")[],
    tool?: Tool,
    material?: Material
  ) => Promise<string | null>;
  simulateMachining: (toolpath: Toolpath, tool: Tool, material?: Material) => Promise<any>;
  generateReport: (
    analyses: (ToolpathAnalysis | GCodeAnalysis | CostEstimation)[],
    format?: "json" | "markdown" | "html"
  ) => Promise<any>;
  setActiveTool: (tool: Tool | undefined) => void;
  setActiveMaterial: (material: Material | undefined) => void;
  setActiveToolpath: (toolpath: Toolpath | undefined) => void;
  setActiveOperation: (operation: MachiningOperation | undefined) => void;
  setCurrentGCode: (gcode: string | undefined) => void;
  addToolpath: (toolpath: Toolpath) => void;
  addTool: (tool: Tool) => void;
  addMaterial: (material: Material) => void;
  addOperation: (operation: MachiningOperation) => void;
  isProcessing: boolean;
  lastError: string | null;
  clearError: () => void;
}>({
  state: {
    toolpaths: [],
    tools: [],
    materials: [],
    operations: [],
    analyses: {
      toolpath: [],
      gcode: [],
      cost: []
    }
  },
  analyzeToolpath: async () => null,
  optimizeToolpath: async () => null,
  analyzeTool: async () => null,
  optimizeTool: async () => null,
  analyzeMaterial: async () => null,
  calculateCost: async () => null,
  analyzeGCode: async () => null,
  optimizeGCode: async () => null,
  simulateMachining: async () => null,
  generateReport: async () => null,
  setActiveTool: () => {},
  setActiveMaterial: () => {},
  setActiveToolpath: () => {},
  setActiveOperation: () => {},
  setCurrentGCode: () => {},
  addToolpath: () => {},
  addTool: () => {},
  addMaterial: () => {},
  addOperation: () => {},
  isProcessing: false,
  lastError: null,
  clearError: () => {}
});

/**
 * Proprietà del componente CAMAssistantBridge
 */
interface CAMAssistantBridgeProps {
  children: React.ReactNode;
  initialState?: Partial<CAMAssistantState>;
}

/**
 * Componente che fa da ponte tra l'interfaccia utente e i servizi CAM
 */
export const CAMAssistantBridge: React.FC<CAMAssistantBridgeProps> = ({ children, initialState = {} }) => {
  // Stato CAM
  const [state, setState] = useState<CAMAssistantState>({
    toolpaths: [],
    tools: [],
    materials: [],
    operations: [],
    analyses: {
      toolpath: [],
      gcode: [],
      cost: []
    },
    ...initialState
  });

  // Stato di elaborazione e errori
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Hooks
  const aiContext = useAI();

  // Cancella gli errori
  const clearError = useCallback(() => {
    setLastError(null);
  }, []);

  // Gestisce gli errori
  const handleError = useCallback((error: any, action: string) => {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    setLastError(errorMessage);
    toast.error(`Error during ${action}: ${errorMessage}`);
    console.error(`Error during ${action}:`, error);
  }, []);

  /**
   * Analizza un percorso utensile
   */
  const analyzeToolpath = useCallback(
    async (toolpath: Toolpath, tool?: Tool, material?: Material): Promise<ToolpathAnalysis | null> => {
      setIsProcessing(true);
      try {
        // Se è stato selezionato uno strumento o materiale attivo, usalo se non specificato
        const activeTool = tool || state.activeTool;
        const activeMaterial = material || state.activeMaterial;

        // Richiedi l'analisi del percorso
        const response = await (unifiedAIService as any).analyzeToolpath(toolpath, activeTool, activeMaterial);

        if (response.success && response.data) {
          // Aggiorna lo stato con la nuova analisi
          setState(prevState => ({
            ...prevState,
            analyses: {
              ...prevState.analyses,
              toolpath: [...prevState.analyses.toolpath, response.data]
            }
          }));

          return response.data;
        } else {
          throw new Error(response.error || "Failed to analyze toolpath");
        }
      } catch (error) {
        handleError(error, "toolpath analysis");
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    [state.activeTool, state.activeMaterial, handleError]
  );

  /**
   * Ottimizza un percorso utensile
   */
  const optimizeToolpath = useCallback(
    async (
      toolpath: Toolpath,
      goals: ("time" | "quality" | "tool_life" | "cost")[],
      tool?: Tool,
      material?: Material
    ): Promise<Toolpath | null> => {
      setIsProcessing(true);
      try {
        // Se è stato selezionato uno strumento o materiale attivo, usalo se non specificato
        const activeTool = tool || state.activeTool;
        const activeMaterial = material || state.activeMaterial;

        // Richiedi l'ottimizzazione del percorso
        const response = await (unifiedAIService as any).optimizeToolpath(toolpath, goals, activeTool, activeMaterial);

        if (response.success && response.data) {
          // Aggiorna lo stato con il nuovo percorso
          setState(prevState => ({
            ...prevState,
            toolpaths: [...prevState.toolpaths, response.data]
          }));

          return response.data;
        } else {
          throw new Error(response.error || "Failed to optimize toolpath");
        }
      } catch (error) {
        handleError(error, "toolpath optimization");
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    [state.activeTool, state.activeMaterial, handleError]
  );

  /**
   * Analizza un utensile
   */
  const analyzeTool = useCallback(
    async (tool: Tool, material?: Material, operation?: MachiningOperation): Promise<any> => {
      setIsProcessing(true);
      try {
        // Se è stato selezionato un materiale o operazione attiva, usali se non specificati
        const activeMaterial = material || state.activeMaterial;
        const activeOperation = operation || state.activeOperation;

        // Richiedi l'analisi dell'utensile
        const response = await (unifiedAIService as any).analyzeTool(tool, activeMaterial, activeOperation);

        if (response.success && response.data) {
          return response.data;
        } else {
          throw new Error(response.error || "Failed to analyze tool");
        }
      } catch (error) {
        handleError(error, "tool analysis");
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    [state.activeMaterial, state.activeOperation, handleError]
  );

  /**
   * Suggerisce l'utensile migliore per un percorso utensile
   */
  const optimizeTool = useCallback(
    async (toolpath: Toolpath, currentTool: Tool, availableTools?: Tool[]): Promise<any> => {
      setIsProcessing(true);
      try {
        // Se non sono specificati utensili disponibili, usa quelli nello stato
        const tools = availableTools || state.tools;

        // Richiedi l'ottimizzazione dell'utensile
        const response = await (unifiedAIService as any).optimizeTool(toolpath, currentTool, tools);

        if (response.success && response.data) {
          return response.data;
        } else {
          throw new Error(response.error || "Failed to optimize tool");
        }
      } catch (error) {
        handleError(error, "tool optimization");
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    [state.tools, handleError]
  );

  /**
   * Analizza un materiale
   */
  const analyzeMaterial = useCallback(
    async (material: Material, tools?: Tool[], operation?: MachiningOperation): Promise<any> => {
      setIsProcessing(true);
      try {
        // Se non sono specificati utensili, usa quelli nello stato
        const availableTools = tools || state.tools;
        const activeOperation = operation || state.activeOperation;

        // Richiedi l'analisi del materiale
        const response = await (unifiedAIService as any).analyzeMaterial(material, availableTools, activeOperation);

        if (response.success && response.data) {
          return response.data;
        } else {
          throw new Error(response.error || "Failed to analyze material");
        }
      } catch (error) {
        handleError(error, "material analysis");
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    [state.tools, state.activeOperation, handleError]
  );

  /**
   * Calcola i costi di lavorazione
   */
  const calculateCost = useCallback(
    async (
      toolpath: Toolpath,
      tool: Tool,
      material?: Material,
      rates?: { machine: number; labor: number }
    ): Promise<CostEstimation | null> => {
      setIsProcessing(true);
      try {
        // Se è stato selezionato un materiale attivo, usalo se non specificato
        const activeMaterial = material || state.activeMaterial;

        // Richiedi la stima dei costi
        const response = await (unifiedAIService as any).calculateMachiningCost(toolpath, tool, activeMaterial, rates);

        if (response.success && response.data) {
          // Aggiorna lo stato con la nuova stima
          setState(prevState => ({
            ...prevState,
            analyses: {
              ...prevState.analyses,
              cost: [...prevState.analyses.cost, response.data]
            }
          }));

          return response.data;
        } else {
          throw new Error(response.error || "Failed to calculate costs");
        }
      } catch (error) {
        handleError(error, "cost calculation");
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    [state.activeMaterial, handleError]
  );

  /**
   * Analizza G-code
   */
  const analyzeGCode = useCallback(
    async (gcode: string, tool?: Tool, material?: Material): Promise<GCodeAnalysis | null> => {
      setIsProcessing(true);
      try {
        // Se è stato selezionato uno strumento o materiale attivo, usalo se non specificato
        const activeTool = tool || state.activeTool;
        const activeMaterial = material || state.activeMaterial;

        // Richiedi l'analisi del G-code
        const response = await (unifiedAIService as any).analyzeGCode(gcode, activeTool, activeMaterial);

        if (response.success && response.data) {
          // Aggiorna lo stato con la nuova analisi
          setState(prevState => ({
            ...prevState,
            analyses: {
              ...prevState.analyses,
              gcode: [...prevState.analyses.gcode, response.data]
            }
          }));

          return response.data;
        } else {
          throw new Error(response.error || "Failed to analyze G-code");
        }
      } catch (error) {
        handleError(error, "G-code analysis");
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    [state.activeTool, state.activeMaterial, handleError]
  );

  /**
   * Ottimizza G-code
   */
  const optimizeGCode = useCallback(
    async (
      gcode: string,
      goals: ("time" | "quality" | "tool_life" | "cost")[],
      tool?: Tool,
      material?: Material
    ): Promise<string | null> => {
      setIsProcessing(true);
      try {
        // Analizza prima il G-code per ottenere informazioni utili
        const analysisResponse = await (unifiedAIService as any).analyzeGCode(gcode, tool, material);

        if (!analysisResponse.success) {
          throw new Error(analysisResponse.error || "Failed to analyze G-code before optimization");
        }

        // Usa lo strumento e materiale attivi se non specificati
        const activeTool = tool || state.activeTool;
        const activeMaterial = material || state.activeMaterial;

        // Specifica il tipo di macchina e passa il gcode all'ottimizzatore
        const enhancedContext = JSON.stringify({
          goals,
          analysis: analysisResponse.data
        });

        // Richiedi l'ottimizzazione del G-code
        const response = await (unifiedAIService as any).optimizeGCode(
          gcode,
          "Generic CNC",
          enhancedContext,
          undefined,
          activeMaterial?.name
        );

        if (response.success && response.data) {
          return response.data;
        } else {
          throw new Error(response.error || "Failed to optimize G-code");
        }
      } catch (error) {
        handleError(error, "G-code optimization");
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    [state.activeTool, state.activeMaterial, handleError]
  );

  /**
   * Simula la lavorazione
   */
  const simulateMachining = useCallback(
    async (toolpath: Toolpath, tool: Tool, material?: Material): Promise<any> => {
      setIsProcessing(true);
      try {
        // Se è stato selezionato un materiale attivo, usalo se non specificato
        const activeMaterial = material || state.activeMaterial;

        // Richiedi la simulazione
        const response = await (unifiedAIService as any).simulateMachining(toolpath, tool, activeMaterial);

        if (response.success && response.data) {
          // Aggiorna lo stato con i dati di simulazione
          setState(prevState => ({
            ...prevState,
            simulationData: response.data
          }));

          return response.data;
        } else {
          throw new Error(response.error || "Failed to simulate machining");
        }
      } catch (error) {
        handleError(error, "machining simulation");
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    [state.activeMaterial, handleError]
  );

  /**
   * Genera report basati su analisi
   */
  const generateReport = useCallback(
    async (
      analyses: (ToolpathAnalysis | GCodeAnalysis | CostEstimation)[],
      format: "json" | "markdown" | "html" = "json"
    ): Promise<any> => {
      setIsProcessing(true);
      try {
        // Richiedi la generazione del report
        const response = await (unifiedAIService as any).generateCAMReport(analyses, format);

        if (response.success && response.data) {
          return response.data;
        } else {
          throw new Error(response.error || "Failed to generate report");
        }
      } catch (error) {
        handleError(error, "report generation");
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    [handleError]
  );

  /**
   * Imposta lo strumento attivo
   */
  const setActiveTool = useCallback((tool: Tool | undefined) => {
    setState(prevState => ({
      ...prevState,
      activeTool: tool
    }));
  }, []);

  /**
   * Imposta il materiale attivo
   */
  const setActiveMaterial = useCallback((material: Material | undefined) => {
    setState(prevState => ({
      ...prevState,
      activeMaterial: material
    }));
  }, []);

  /**
   * Imposta il percorso utensile attivo
   */
  const setActiveToolpath = useCallback((toolpath: Toolpath | undefined) => {
    setState(prevState => ({
      ...prevState,
      activeToolpath: toolpath
    }));
  }, []);

  /**
   * Imposta l'operazione attiva
   */
  const setActiveOperation = useCallback((operation: MachiningOperation | undefined) => {
    setState(prevState => ({
      ...prevState,
      activeOperation: operation
    }));
  }, []);

  /**
   * Imposta il G-code corrente
   */
  const setCurrentGCode = useCallback((gcode: string | undefined) => {
    setState(prevState => ({
      ...prevState,
      currentGCode: gcode
    }));
  }, []);

  /**
   * Aggiunge un percorso utensile alla collezione
   */
  const addToolpath = useCallback((toolpath: Toolpath) => {
    // Assicura che abbia un ID
    const toolpathWithId = {
      ...toolpath,
      id: toolpath.id || uuidv4()
    };

    setState(prevState => ({
      ...prevState,
      toolpaths: [...prevState.toolpaths, toolpathWithId]
    }));
  }, []);

  /**
   * Aggiunge uno strumento alla collezione
   */
  const addTool = useCallback((tool: Tool) => {
    // Assicura che abbia un ID
    const toolWithId = {
      ...tool,
      id: tool.id || uuidv4()
    };

    setState(prevState => ({
      ...prevState,
      tools: [...prevState.tools, toolWithId]
    }));
  }, []);

  /**
   * Aggiunge un materiale alla collezione
   */
  const addMaterial = useCallback((material: Material) => {
    // Assicura che abbia un ID
    const materialWithId = {
      ...material,
      id: material.id || uuidv4()
    };

    setState(prevState => ({
      ...prevState,
      materials: [...prevState.materials, materialWithId]
    }));
  }, []);

  /**
   * Aggiunge un'operazione alla collezione
   */
  const addOperation = useCallback((operation: MachiningOperation) => {
    // Assicura che abbia un ID
    const operationWithId = {
      ...operation,
      id: operation.id || uuidv4()
    };

    setState(prevState => ({
      ...prevState,
      operations: [...prevState.operations, operationWithId]
    }));
  }, []);

  /**
   * Valore del contesto
   */
  const contextValue = {
    state,
    analyzeToolpath,
    optimizeToolpath,
    analyzeTool,
    optimizeTool,
    analyzeMaterial,
    calculateCost,
    analyzeGCode,
    optimizeGCode,
    simulateMachining,
    generateReport,
    setActiveTool,
    setActiveMaterial,
    setActiveToolpath,
    setActiveOperation,
    setCurrentGCode,
    addToolpath,
    addTool,
    addMaterial,
    addOperation,
    isProcessing,
    lastError,
    clearError
  };

  return <CAMAssistantContext.Provider value={contextValue}>{children}</CAMAssistantContext.Provider>;
};

/**
 * Hook per utilizzare il contesto CAM Assistant
 */
export const useCAMAssistant = () => useContext(CAMAssistantContext);

export default CAMAssistantBridge;
