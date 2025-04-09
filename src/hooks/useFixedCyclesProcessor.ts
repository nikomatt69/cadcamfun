// src/hooks/useFixedCyclesProcessor.ts
import { useEffect, useState, useCallback } from 'react';
import { ToolpathPoint } from '../types/GCode';
import { generateFixedCycleToolpaths, fixedCyclesParser, FixedCycleResult } from 'src/components/cam/toolpathUtils/fixedCycles/fixedCyclesParser';
import { parseFixedCycleFromGCode } from 'src/components/cam/toolpathUtils/fixedCycles/fixedCyclesParser';

interface UseFixedCyclesProcessorProps {
  gcode: string[];
  onToolpathUpdate?: (toolpath: ToolpathPoint[]) => void;
  enabled?: boolean;
}

interface UseFixedCyclesProcessorReturn {
  processedToolpath: ToolpathPoint[];
  detectedCycles: FixedCycleResult[];
  isProcessing: boolean;
  reprocess: () => void;
}

/**
 * Hook per il riconoscimento e la gestione dei cicli fissi nel G-code
 * 
 * Questo hook analizza il G-code alla ricerca di cicli fissi e genera
 * i percorsi utensile corrispondenti da visualizzare nella simulazione.
 */
export function useFixedCyclesProcessor({
  gcode,
  onToolpathUpdate,
  enabled = true
}: UseFixedCyclesProcessorProps): UseFixedCyclesProcessorReturn {
  const [processedToolpath, setProcessedToolpath] = useState<ToolpathPoint[]>([]);
  const [detectedCycles, setDetectedCycles] = useState<FixedCycleResult[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  
  /**
   * Funzione per elaborare il G-code e riconoscere i cicli fissi
   */
  const processGCode = useCallback(() => {
    if (!enabled || !gcode || gcode.length === 0) {
      setProcessedToolpath([]);
      setDetectedCycles([]);
      return;
    }
    
    setIsProcessing(true);
    
    try {
      // Resetta il parser
      fixedCyclesParser.reset();
      
      // Array per raccogliere tutti i cicli fissi rilevati
      const cycles: FixedCycleResult[] = [];
      
      // Analizza ogni linea di G-code
      for (const line of gcode) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('(') || trimmedLine.startsWith(';')) {
          continue; // Salta linee vuote e commenti
        }
        
        const result = parseFixedCycleFromGCode(trimmedLine);
        if (result && result.isValid) {
          cycles.push(result);
        }
      }
      
      // Genera il percorso completo
      const toolpath = generateFixedCycleToolpaths(gcode);
      
      // Aggiorna lo stato
      setProcessedToolpath(toolpath);
      setDetectedCycles(cycles);
      
      // Notifica il componente padre se richiesto
      if (onToolpathUpdate) {
        onToolpathUpdate(toolpath);
      }
    } catch (error) {
      console.error('Errore durante l\'elaborazione dei cicli fissi:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [gcode, enabled, onToolpathUpdate]);
  
  // Avvia l'elaborazione quando cambia il G-code o lo stato enabled
  useEffect(() => {
    processGCode();
  }, [gcode, enabled, processGCode]);
  
  return {
    processedToolpath,
    detectedCycles,
    isProcessing,
    reprocess: processGCode
  };
}

/**
 * Funzione per il parsing di una singola riga di G-code
 * (importata dal modulo fixedCyclesParser)
 */
export { parseFixedCycleFromGCode } from 'src/components/cam/toolpathUtils/fixedCycles/fixedCyclesParser';