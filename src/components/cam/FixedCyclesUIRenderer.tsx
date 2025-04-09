// src/components/FixedCyclesUIRenderer.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { FixedCycleType, FixedCycleParams, parseFixedCycleFromGCode } from 'src/components/cam/toolpathUtils/fixedCycles/fixedCyclesParser';
import { MillingOperationType } from 'src/types/GCode';

// Interfaccia per le proprietà del componente
interface FixedCyclesUIRendererProps {
  gCodeLine: string;  // Linea di G-code da analizzare
  onParametersChange?: (params: FixedCycleParams) => void; // Callback per quando i parametri vengono modificati
  onApply?: (generatedGCode: string) => void; // Callback per applicare il ciclo modificato
  className?: string; // Classe CSS opzionale
}

// Interfaccia per i campi dei parametri (per l'UI)
interface ParameterField {
  name: string;
  label: string;
  description: string;
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  required?: boolean;
}

/**
 * Ottiene la configurazione dei campi per un tipo di ciclo fisso
 * @param cycleType Tipo di ciclo fisso
 * @returns Array di oggetti che definiscono i campi dei parametri
 */
function getCycleParameterFields(cycleType: FixedCycleType): ParameterField[] {
  // Campi comuni a tutti i cicli
  const commonFields: ParameterField[] = [
    { name: 'x', label: 'X', description: 'Posizione X', defaultValue: 0 },
    { name: 'y', label: 'Y', description: 'Posizione Y', defaultValue: 0 },
    { name: 'z', label: 'Z', description: 'Profondità finale', defaultValue: -10, unit: 'mm', required: true },
    { name: 'r', label: 'R', description: 'Piano di riferimento', defaultValue: 2, unit: 'mm', required: true },
    { name: 'f', label: 'F', description: 'Avanzamento', defaultValue: 100, unit: 'mm/min', required: true }
  ];
  
  // Campi specifici per ciascun tipo di ciclo
  switch (cycleType) {
    case FixedCycleType.DRILLING:
      return commonFields;
      
    case FixedCycleType.DRILLING_DWELL:
      return [
        ...commonFields,
        { name: 'p', label: 'P', description: 'Tempo di sosta', defaultValue: 0.5, min: 0, step: 0.1, unit: 's', required: true }
      ];
      
    case FixedCycleType.PECK_DRILLING:
      return [
        ...commonFields,
        { name: 'q', label: 'Q', description: 'Profondità di incremento', defaultValue: 2, min: 0.1, step: 0.1, unit: 'mm', required: true },
        { name: 'p', label: 'P', description: 'Tempo di sosta', defaultValue: 0, min: 0, step: 0.1, unit: 's' }
      ];
      
    case FixedCycleType.RIGHT_TAPPING:
      return [
        ...commonFields,
        { name: 'p', label: 'P', description: 'Tempo di sosta', defaultValue: 0, min: 0, step: 0.1, unit: 's' },
        { name: 's', label: 'S', description: 'Velocità mandrino', defaultValue: 500, min: 1, unit: 'rpm', required: true }
      ];
      
    case FixedCycleType.BORING:
      return commonFields;
      
    case FixedCycleType.BORING_DWELL:
      return [
        ...commonFields,
        { name: 'p', label: 'P', description: 'Tempo di sosta', defaultValue: 0.5, min: 0, step: 0.1, unit: 's', required: true }
      ];
      
    case FixedCycleType.BACK_BORING:
      return [
        ...commonFields,
        { name: 'i', label: 'I', description: 'Spostamento X', defaultValue: 0, unit: 'mm' },
        { name: 'j', label: 'J', description: 'Spostamento Y', defaultValue: 0, unit: 'mm' },
        { name: 'k', label: 'K', description: 'Distanza di sicurezza', defaultValue: 2, unit: 'mm', required: true }
      ];
      
    case FixedCycleType.LEFT_TAPPING:
      return [
        ...commonFields,
        { name: 'p', label: 'P', description: 'Tempo di sosta', defaultValue: 0, min: 0, step: 0.1, unit: 's' },
        { name: 's', label: 'S', description: 'Velocità mandrino', defaultValue: 500, min: 1, unit: 'rpm', required: true }
      ];
      
    case FixedCycleType.BORING_WITH_RETRACT:
      return [
        ...commonFields,
        { name: 'p', label: 'P', description: 'Tempo di sosta', defaultValue: 0.5, min: 0, step: 0.1, unit: 's', required: true }
      ];
      
    default:
      return commonFields;
  }
}

/**
 * Mappa un tipo di ciclo fisso al tipo di operazione di fresatura corrispondente
 */
function mapCycleTypeToOperationType(cycleType: FixedCycleType): MillingOperationType {
  switch (cycleType) {
    case FixedCycleType.DRILLING:
    case FixedCycleType.DRILLING_DWELL:
    case FixedCycleType.PECK_DRILLING:
      return MillingOperationType.DRILL;
      
    case FixedCycleType.RIGHT_TAPPING:
    case FixedCycleType.LEFT_TAPPING:
      return MillingOperationType.THREAD_MILL;
      
    case FixedCycleType.BORING:
    case FixedCycleType.BORING_DWELL:
    case FixedCycleType.BACK_BORING:
    case FixedCycleType.BORING_WITH_RETRACT:
      return MillingOperationType.POCKET;
      
    default:
      return MillingOperationType.DRILL;
  }
}

/**
 * Ottiene il titolo leggibile per un tipo di ciclo fisso
 */
function getCycleTitle(cycleType: FixedCycleType): string {
  switch (cycleType) {
    case FixedCycleType.DRILLING: return 'Foratura';
    case FixedCycleType.DRILLING_DWELL: return 'Foratura con Sosta';
    case FixedCycleType.PECK_DRILLING: return 'Foratura a Rompitruciolo';
    case FixedCycleType.RIGHT_TAPPING: return 'Maschiatura Destra';
    case FixedCycleType.BORING: return 'Alesatura';
    case FixedCycleType.BORING_DWELL: return 'Alesatura con Sosta';
    case FixedCycleType.BACK_BORING: return 'Alesatura Posteriore';
    case FixedCycleType.LEFT_TAPPING: return 'Maschiatura Sinistra';
    case FixedCycleType.BORING_WITH_RETRACT: return 'Alesatura con Ritrazione';
    default: return 'Ciclo Personalizzato';
  }
}

/**
 * Genera una linea di G-code per un ciclo fisso
 */
function generateFixedCycleGCode(
  cycleType: FixedCycleType,
  params: FixedCycleParams
): string {
  let gcode = '';
  
  // Mappa il tipo di ciclo al comando G
  switch (cycleType) {
    case FixedCycleType.DRILLING: gcode = 'G81'; break;
    case FixedCycleType.DRILLING_DWELL: gcode = 'G82'; break;
    case FixedCycleType.PECK_DRILLING: gcode = 'G83'; break;
    case FixedCycleType.RIGHT_TAPPING: gcode = 'G84'; break;
    case FixedCycleType.BORING: gcode = 'G85'; break;
    case FixedCycleType.BORING_DWELL: gcode = 'G86'; break;
    case FixedCycleType.BACK_BORING: gcode = 'G87'; break;
    case FixedCycleType.LEFT_TAPPING: gcode = 'G74'; break;
    case FixedCycleType.BORING_WITH_RETRACT: gcode = 'G89'; break;
    default: gcode = 'G81'; // Default a foratura semplice
  }
  
  // Aggiungi le coordinate
  if (params.x !== undefined) gcode += ` X${params.x.toFixed(3)}`;
  if (params.y !== undefined) gcode += ` Y${params.y.toFixed(3)}`;
  if (params.z !== undefined) gcode += ` Z${params.z.toFixed(3)}`;
  if (params.r !== undefined) gcode += ` R${params.r.toFixed(3)}`;
  
  // Aggiungi parametri specifici del ciclo
  if (params.q !== undefined && params.q > 0) gcode += ` Q${params.q.toFixed(3)}`;
  if (params.p !== undefined && params.p > 0) gcode += ` P${params.p.toFixed(3)}`;
  if (params.f !== undefined) gcode += ` F${params.f.toFixed(0)}`;
  
  // Parametri per tapping
  if ((cycleType === FixedCycleType.RIGHT_TAPPING || cycleType === FixedCycleType.LEFT_TAPPING) && 
      's' in params && params.s !== undefined) {
    gcode += ` S${params.s.toFixed(0)}`;
  }
  
  // Parametri per boring con offset
  if (cycleType === FixedCycleType.BACK_BORING) {
    if ('i' in params && params.i !== undefined && params.i !== 0) gcode += ` I${params.i.toFixed(3)}`;
    if ('j' in params && params.j !== undefined && params.j !== 0) gcode += ` J${params.j.toFixed(3)}`;
    if ('k' in params && params.k !== undefined) gcode += ` K${params.k.toFixed(3)}`;
  }
  
  return gcode;
}

/**
 * Componente che verifica se una linea di G-code è un ciclo fisso e mostra un'UI per modificarlo
 */
export const FixedCyclesUIRenderer: React.FC<FixedCyclesUIRendererProps> = ({ 
  gCodeLine, 
  onParametersChange, 
  onApply,
  className 
}) => {
  // Analizza la linea di G-code
  const cycleResult = useMemo(() => {
    if (!gCodeLine) return null;
    return parseFixedCycleFromGCode(gCodeLine);
  }, [gCodeLine]);
  
  // Se non è un ciclo fisso, non mostrare nulla
  if (!cycleResult || !cycleResult.isValid) {
    return null;
  }
  
  // Stato per i parametri
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [parameters, setParameters] = useState<FixedCycleParams>(cycleResult.params);
  
  // Campi dei parametri per questo tipo di ciclo
  const parameterFields = getCycleParameterFields(cycleResult.type);
  
  // Quando cambiano i parametri esterni
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (cycleResult && cycleResult.isValid) {
      setParameters(cycleResult.params);
    }
  }, [cycleResult]);
  
  // Gestione del cambio di parametri
  const handleParameterChange = (name: string, value: number) => {
    const newParams = { ...parameters, [name]: value };
    setParameters(newParams);
    
    if (onParametersChange) {
      onParametersChange(newParams);
    }
  };
  
  // Applica i cambiamenti
  const handleApply = () => {
    if (onApply && cycleResult) {
      const newGCode = generateFixedCycleGCode(cycleResult.type, parameters);
      onApply(newGCode);
    }
  };
  
  return (
    <div className={`fixed-cycle-editor ${className || ''}`}>
      <div className="fixed-cycle-header">
        <h3>{getCycleTitle(cycleResult.type)}</h3>
        <div className="fixed-cycle-gcode">{cycleResult.gCode}</div>
      </div>
      
      <div className="fixed-cycle-params">
        {parameterFields.map((field) => (
          <div key={field.name} className="param-field">
            <label htmlFor={`param-${field.name}`}>
              {field.label}
              {field.required && <span className="required">*</span>}
            </label>
            <div className="param-input-group">
              <input
                id={`param-${field.name}`}
                type="number"
                min={field.min}
                max={field.max}
                step={field.step || 1}
                value={parameters[field.name as keyof FixedCycleParams] as number || field.defaultValue}
                onChange={(e) => handleParameterChange(field.name, parseFloat(e.target.value))}
              />
              {field.unit && <span className="unit">{field.unit}</span>}
            </div>
            <div className="param-description">{field.description}</div>
          </div>
        ))}
      </div>
      
      <div className="fixed-cycle-actions">
        <button className="apply-button" onClick={handleApply}>
          Applica Modifiche
        </button>
      </div>
    </div>
  );
};

/**
 * Hook per verificare se una linea di G-code contiene un ciclo fisso
 * @param gCodeLine Linea di G-code da analizzare
 * @returns Risultato dell'analisi o null se non è un ciclo fisso
 */
export function useFixedCycleDetection(gCodeLine: string) {
  return useMemo(() => {
    if (!gCodeLine) return null;
    return parseFixedCycleFromGCode(gCodeLine);
  }, [gCodeLine]);
}

/**
 * Componente di pannello informativo per i cicli fissi - da utilizzare nel generatore di percorsi
 */
export const FixedCycleInfoPanel: React.FC<{
  detectedCycles: FixedCycleParams[];
  onSelect?: (index: number) => void;
}> = ({ detectedCycles, onSelect }) => {
  if (!detectedCycles || detectedCycles.length === 0) {
    return null;
  }
  
  return (
    <div className="fixed-cycles-info-panel">
      <h3>Cicli Fissi Rilevati ({detectedCycles.length})</h3>
      <div className="cycles-list">
        {detectedCycles.map((cycle, index) => (
          <div 
            key={`cycle-${index}`} 
            className="cycle-item"
            onClick={() => onSelect && onSelect(index)}
          >
            <div className="cycle-position">
              X: {cycle.x?.toFixed(2)}, Y: {cycle.y?.toFixed(2)}
            </div>
            <div className="cycle-depth">
              Z: {cycle.z?.toFixed(2)} (R: {cycle.r?.toFixed(2)})
            </div>
            {cycle.q && <div className="cycle-increment">Inc: {cycle.q.toFixed(2)}mm</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Funzione per verificare se un comando G-code rappresenta un ciclo fisso
 * @param gCode Comando G-code da verificare
 * @returns True se è un ciclo fisso, altrimenti false
 */
export function isFixedCycle(gCode: string): boolean {
  const result = parseFixedCycleFromGCode(gCode);
  return !!(result && result.isValid);
}

/**
 * Funzione per generare un'UI per un tipo specifico di ciclo fisso
 * @param cycleType Tipo di ciclo fisso
 * @param initialParams Parametri iniziali
 * @param onParamsChange Callback per quando i parametri cambiano
 * @returns Componente React con l'UI per il ciclo fisso
 */
export function renderFixedCycleUI(
  cycleType: FixedCycleType,
  initialParams: FixedCycleParams,
  onParamsChange?: (params: FixedCycleParams) => void
) {
  // Crea un G-code fittizio per il ciclo
  const gCode = generateFixedCycleGCode(cycleType, initialParams);
  
  return (
    <FixedCyclesUIRenderer
      gCodeLine={gCode}
      onParametersChange={onParamsChange}
    />
  );
}

export default FixedCyclesUIRenderer;