// src/components/ToolpathGeneratorIntegration.tsx
import React, { useState, useEffect } from 'react';
import { FixedCycleType, FixedCycleParams } from 'src/components/cam/toolpathUtils/fixedCycles/fixedCyclesParser';
import { FixedCyclesUIRenderer, isFixedCycle, FixedCycleInfoPanel } from 'src/components/cam/FixedCyclesUIRenderer';
import { useElementsStore } from 'src/store/elementsStore';
import { useSelectionStore } from 'src/store/selectorStore';
import { getDrillingPoints } from 'src/components/cam/toolpathUtils/elementMeasurements';

interface ToolpathGeneratorIntegrationProps {
  // Callback per quando viene generato un nuovo G-code di ciclo fisso
  onGCodeGenerated?: (gcode: string) => void;
  // Opzioni per il generatore di percorsi
  options?: {
    defaultCycleType?: FixedCycleType;
    includeFixedCycles?: boolean;
    showFixedCyclesPanel?: boolean;
  };
  // Riferimento al G-code corrente
  currentGCode?: string;
  // Classe CSS personalizzata
  className?: string;
}

/**
 * Componente per integrare i cicli fissi nel generatore di percorsi utensili
 */
const ToolpathGeneratorIntegration: React.FC<ToolpathGeneratorIntegrationProps> = ({
  onGCodeGenerated,
  options = {},
  currentGCode = '',
  className
}) => {
  // Opzioni predefinite
  const {
    defaultCycleType = FixedCycleType.DRILLING,
    includeFixedCycles = true,
    showFixedCyclesPanel = true
  } = options;
  
  // Stato per i cicli fissi rilevati nel G-code corrente
  const [detectedCycles, setDetectedCycles] = useState<FixedCycleParams[]>([]);
  
  // Stato per il ciclo fisso selezionato
  const [selectedCycleIndex, setSelectedCycleIndex] = useState<number>(-1);
  
  // Stato per il G-code del ciclo fisso corrente
  const [cycleLine, setCycleLine] = useState<string>('');
  
  // Accesso agli store
  const elements = useElementsStore(state => state.elements);
  const selectedElementIds = useSelectionStore(state => state.selectedElementIds);
  
  // Filtra gli elementi selezionati
  const selectedElements = elements.filter(el => selectedElementIds.includes(el.id));
  
  // Verifica se il G-code corrente contiene un ciclo fisso
  useEffect(() => {
    if (!currentGCode || !includeFixedCycles) {
      setDetectedCycles([]);
      return;
    }
    
    // Divide il G-code in righe
    const lines = currentGCode.split('\n').map(line => line.trim());
    
    // Filtra le righe che contengono cicli fissi
    const cycleLines = lines.filter(line => isFixedCycle(line));
    
    // Estrai i parametri dei cicli fissi
    const cycles: FixedCycleParams[] = [];
    
    cycleLines.forEach(line => {
      // Qui dovresti usare parseFixedCycleFromGCode da fixedCyclesParser.ts
      // Per semplicità, uso un approccio generico
      if (line.includes('G81')) {
        // Esempio di estrazione per G81
        const xMatch = line.match(/X([+-]?\d*\.?\d+)/);
        const yMatch = line.match(/Y([+-]?\d*\.?\d+)/);
        const zMatch = line.match(/Z([+-]?\d*\.?\d+)/);
        const rMatch = line.match(/R([+-]?\d*\.?\d+)/);
        const fMatch = line.match(/F([+-]?\d*\.?\d+)/);
        
        const cycle: FixedCycleParams = {};
        if (xMatch) cycle.x = parseFloat(xMatch[1]);
        if (yMatch) cycle.y = parseFloat(yMatch[1]);
        if (zMatch) cycle.z = parseFloat(zMatch[1]);
        if (rMatch) cycle.r = parseFloat(rMatch[1]);
        if (fMatch) cycle.f = parseFloat(fMatch[1]);
        
        cycles.push(cycle);
      }
      // Aggiungi altri cicli fissi secondo necessità
    });
    
    setDetectedCycles(cycles);
  }, [currentGCode, includeFixedCycles]);
  
  // Genera un ciclo fisso dagli elementi selezionati
  const generateFixedCycleFromSelection = () => {
    if (selectedElements.length === 0) {
      alert('Seleziona almeno un elemento per generare un ciclo fisso');
      return;
    }
    
    // Ottieni i punti di foratura dagli elementi selezionati
    const drillingPointsArrays = selectedElements.map(element => getDrillingPoints(element));
    
    // Appiattisci l'array di punti
    const drillingPoints = drillingPointsArrays.flat();
    
    if (drillingPoints.length === 0) {
      alert('Nessun punto di foratura trovato negli elementi selezionati');
      return;
    }
    
    // Crea un G-code per ogni punto
    const gCodeLines = drillingPoints.map(point => {
      // Parametri predefiniti per il ciclo
      const params: FixedCycleParams = {
        x: point.x,
        y: point.y,
        z: -10,  // Profondità predefinita
        r: 2,    // Piano di riferimento predefinito
        f: 100   // Avanzamento predefinito
      };
      
      // Per G83 (foratura a rompitruciolo), aggiungi il parametro Q
      if (defaultCycleType === FixedCycleType.PECK_DRILLING) {
        params.q = 2;  // Profondità di incremento predefinita
      }
      
      // Per G82 (foratura con sosta), aggiungi il parametro P
      if (defaultCycleType === FixedCycleType.DRILLING_DWELL) {
        params.p = 0.5;  // Tempo di sosta predefinito
      }
      
      // Genera il G-code per il ciclo fisso
      let gCode = '';
      
      switch (defaultCycleType) {
        case FixedCycleType.DRILLING:
          gCode = `G81 X${params?.x?.toFixed(3)} Y${params?.y?.toFixed(3)} Z${params?.z?.toFixed(3)} R${params?.r?.toFixed(3)} F${params?.f}`;
          break;
        case FixedCycleType.DRILLING_DWELL:
          gCode = `G82 X${params?.x?.toFixed(3)} Y${params?.y?.toFixed(3)} Z${params?.z?.toFixed(3)} R${params?.r?.toFixed(3)} P${params?.p} F${params?.f}`;
          break;
        case FixedCycleType.PECK_DRILLING:
          gCode = `G83 X${params?.x?.toFixed(3)} Y${params?.y?.toFixed(3)} Z${params?.z?.toFixed(3)} R${params?.r?.toFixed(3)} Q${params?.q} F${params?.f}`;
          break;
        default:
          gCode = `G81 X${params?.x?.toFixed(3)} Y${params?.y?.toFixed(3)} Z${params?.z?.toFixed(3)} R${params?.r?.toFixed(3)} F${params?.f}`;
      }
      
      return gCode;
    });
    
    // Imposta il ciclo fisso selezionato (primo punto)
    if (gCodeLines.length > 0) {
      setCycleLine(gCodeLines[0]);
    }
    
    // Notifica il G-code generato
    if (onGCodeGenerated && gCodeLines.length > 0) {
      onGCodeGenerated(gCodeLines.join('\n'));
    }
  };
  
  // Gestisce la modifica dei parametri del ciclo fisso
  const handleCycleParametersChange = (params: FixedCycleParams) => {
    // Aggiorna lo stato se necessario
    console.log('Parametri ciclo modificati:', params);
  };
  
  // Gestisce l'applicazione delle modifiche al ciclo fisso
  const handleApplyCycle = (newGCode: string) => {
    // Notifica il G-code aggiornato
    if (onGCodeGenerated) {
      onGCodeGenerated(newGCode);
    }
  };
  
  // Gestisce la selezione di un ciclo fisso dal pannello
  const handleCycleSelect = (index: number) => {
    setSelectedCycleIndex(index);
    
    // Ricostruisci il G-code dal ciclo selezionato
    if (index >= 0 && index < detectedCycles.length) {
      const cycle = detectedCycles[index];
      let gCode = '';
      
      // Semplificato, dovresti usare generateFixedCycleGCode da fixedCyclesParser.ts
      gCode = `G81 X${cycle.x?.toFixed(3) || '0'} Y${cycle.y?.toFixed(3) || '0'} Z${cycle.z?.toFixed(3) || '0'} R${cycle.r?.toFixed(3) || '0'} F${cycle.f || '100'}`;
      
      setCycleLine(gCode);
    }
  };
  
  return (
    <div className={`toolpath-generator-integration ${className || ''}`}>
      {/* Pulsanti per generare cicli fissi */}
      <div className="fixed-cycles-actions">
        <h3>Cicli Fissi</h3>
        <div className="cycle-buttons">
          <button 
            onClick={generateFixedCycleFromSelection}
            disabled={selectedElements.length === 0}
          >
            Genera Ciclo Fisso dagli Elementi Selezionati
          </button>
        </div>
      </div>
      
      {/* Pannello informativo dei cicli fissi */}
      {showFixedCyclesPanel && detectedCycles.length > 0 && (
        <FixedCycleInfoPanel
          detectedCycles={detectedCycles}
          onSelect={handleCycleSelect}
        />
      )}
      
      {/* Editor del ciclo fisso selezionato */}
      {cycleLine && (
        <FixedCyclesUIRenderer
          gCodeLine={cycleLine}
          onParametersChange={handleCycleParametersChange}
          onApply={handleApplyCycle}
          className="cycle-editor"
        />
      )}
    </div>
  );
};

export default ToolpathGeneratorIntegration;