/**
 * AdvancedPostProcessorPanel.tsx
 * Pannello avanzato per il post-processing del G-code
 * Supporta controller Fanuc e Heidenhain con numerose opzioni di ottimizzazione
 */

import React, { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Info,
  Cpu,
  Check,
  X,
  AlertTriangle,
  Download,
  Settings,
  Sliders,
  Loader,
  Save,
  Eye
} from 'react-feather';
import { ControllerType, OptimizationOptions, OptimizationResult, AdvancedPostProcessor } from 'src/lib/advanced-post-processor';

interface AdvancedPostProcessorPanelProps {
  initialGcode: string;
  controllerType: ControllerType;
  onProcessedGcode: (gcode: string, stats?: any) => void;
}

const AdvancedPostProcessorPanel: React.FC<AdvancedPostProcessorPanelProps> = ({
  initialGcode,
  controllerType,
  onProcessedGcode
}) => {
  // Stato G-code e risultati
  const [inputGcode, setInputGcode] = useState(initialGcode);
  const [outputGcode, setOutputGcode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [selectedController, setSelectedController] = useState<ControllerType>(controllerType);
  
  // Stato delle opzioni
  const [options, setOptions] = useState<OptimizationOptions>({
    removeRedundantMoves: true,
    removeRedundantCodes: true,
    optimizeRapidMoves: true,
    optimizeToolpaths: true,
    optimizeFeedrates: true,
    useHighSpeedMode: false,
    useLookAhead: true,
    useTCPMode: false,
    useArcOptimization: true,
    consolidateGCodes: true,
    removeEmptyLines: true,
    removeComments: false,
    minimizeAxisMovement: true,
    safetyChecks: true,
    
    controllerSpecific: {
      fanuc: {
        useDecimalFormat: true,
        useModalGCodes: true,
        useAI: false,
        useNanoSmoothing: false,
        useCornerRounding: false,
        useHighPrecisionMode: false,
        useCompactGCode: true
      },
      heidenhain: {
        useConversationalFormat: true,
        useFunctionBlocks: true,
        useCycleDefine: true,
        useParameterProgramming: false,
        useTCP: false,
        useRadiusCompensation3D: false,
        useSmartTurning: true
      }
    }
  });
  
  // Gestione pannelli aperti
  const [expanded, setExpanded] = useState({
    generalOptions: true,
    controllerOptions: true,
    results: true,
    preview: false
  });
  
  // Inizializzazione e aggiornamento
  useEffect(() => {
    if (initialGcode !== inputGcode) {
      setInputGcode(initialGcode);
      setOutputGcode('');
      setResult(null);
    }
  }, [initialGcode]);
  
  useEffect(() => {
    setSelectedController(controllerType);
  }, [controllerType]);
  
  // Toggle pannelli
  const toggleSection = (section: keyof typeof expanded) => {
    setExpanded(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };
  
  // Aggiorna opzioni
  const updateOption = <K extends keyof OptimizationOptions>(
    key: K, 
    value: OptimizationOptions[K]
  ) => {
    setOptions(prev => ({
      ...prev,
      [key]: value
    }));
  };
  
  // Aggiorna opzioni specifiche per controller
  const updateControllerOption = <
    C extends keyof OptimizationOptions['controllerSpecific'],
    K extends keyof NonNullable<OptimizationOptions['controllerSpecific'][C]>
  >(
    controller: C,
    key: K,
    value: any
  ) => {
    setOptions(prev => ({
      ...prev,
      controllerSpecific: {
        ...prev.controllerSpecific,
        [controller]: {
          ...prev.controllerSpecific[controller],
          [key]: value
        }
      }
    }));
  };
  
  // Processa G-code
  const processGcode = async () => {
    if (!inputGcode) return;
    
    setIsProcessing(true);
    setResult(null);
    
    try {
      // Crea il post-processor
      const postProcessor = new AdvancedPostProcessor(selectedController, options);
      
      // Processa il codice
      const result = await postProcessor.processGCode(inputGcode);
      
      // Aggiorna stato
      setOutputGcode(result.code);
      setResult(result);
      
      // Invia il risultato al componente padre
      onProcessedGcode(result.code, result.stats);
    } catch (error) {
      console.error('Errore nel post-processing:', error);
      // Mostra errore
    } finally {
      setIsProcessing(false);
      // Apri il pannello risultati
      setExpanded(prev => ({
        ...prev,
        results: true
      }));
    }
  };
  
  // Salva G-code
  const saveGcode = () => {
    if (!outputGcode) return;
    
    const blob = new Blob([outputGcode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Nome del file con data e tipo di controller
    const date = new Date().toISOString().slice(0, 10);
    const extension = selectedController === 'heidenhain' ? '.h' : '.nc';
    a.download = `optimized_${selectedController}_${date}${extension}`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  // Applicare preset di ottimizzazione
  const applyOptimizationPreset = (preset: 'basic' | 'speed' | 'quality' | 'advanced') => {
    switch (preset) {
      case 'basic':
        setOptions({
          ...options,
          removeRedundantMoves: true,
          removeRedundantCodes: true,
          optimizeRapidMoves: true,
          optimizeToolpaths: false,
          optimizeFeedrates: true,
          useHighSpeedMode: false,
          useLookAhead: false,
          useTCPMode: false,
          useArcOptimization: true,
          consolidateGCodes: true,
          removeEmptyLines: true,
          removeComments: false,
          minimizeAxisMovement: false,
          safetyChecks: true,
          controllerSpecific: {
            ...options.controllerSpecific,
            fanuc: {
              ...options.controllerSpecific.fanuc,
              useDecimalFormat: true,
              useModalGCodes: true,
              useAI: false,
              useNanoSmoothing: false,
              useCornerRounding: false,
              useHighPrecisionMode: false,
              useCompactGCode: true
            },
            heidenhain: {
              ...options.controllerSpecific.heidenhain,
              useConversationalFormat: true,
              useFunctionBlocks: false,
              useCycleDefine: true,
              useParameterProgramming: false,
              useTCP: false,
              useRadiusCompensation3D: false,
              useSmartTurning: false
            }
          }
        });
        break;
      case 'speed':
        setOptions({
          ...options,
          removeRedundantMoves: true,
          removeRedundantCodes: true,
          optimizeRapidMoves: true,
          optimizeToolpaths: true,
          optimizeFeedrates: true,
          useHighSpeedMode: true,
          useLookAhead: true,
          useTCPMode: false,
          useArcOptimization: true,
          consolidateGCodes: true,
          removeEmptyLines: true,
          removeComments: true,
          minimizeAxisMovement: true,
          safetyChecks: true,
          controllerSpecific: {
            ...options.controllerSpecific,
            fanuc: {
              ...options.controllerSpecific.fanuc,
              useDecimalFormat: true,
              useModalGCodes: true,
              useAI: true,
              useNanoSmoothing: true,
              useCornerRounding: true,
              useHighPrecisionMode: false,
              useCompactGCode: true
            },
            heidenhain: {
              ...options.controllerSpecific.heidenhain,
              useConversationalFormat: true,
              useFunctionBlocks: true,
              useCycleDefine: true,
              useParameterProgramming: false,
              useTCP: true,
              useRadiusCompensation3D: false,
              useSmartTurning: true
            }
          }
        });
        break;
      case 'quality':
        setOptions({
          ...options,
          removeRedundantMoves: true,
          removeRedundantCodes: true,
          optimizeRapidMoves: true,
          optimizeToolpaths: true,
          optimizeFeedrates: true,
          useHighSpeedMode: false,
          useLookAhead: true,
          useTCPMode: true,
          useArcOptimization: true,
          consolidateGCodes: true,
          removeEmptyLines: true,
          removeComments: false,
          minimizeAxisMovement: false,
          safetyChecks: true,
          controllerSpecific: {
            ...options.controllerSpecific,
            fanuc: {
              ...options.controllerSpecific.fanuc,
              useDecimalFormat: true,
              useModalGCodes: true,
              useAI: false,
              useNanoSmoothing: false,
              useCornerRounding: false,
              useHighPrecisionMode: true,
              useCompactGCode: false
            },
            heidenhain: {
              ...options.controllerSpecific.heidenhain,
              useConversationalFormat: true,
              useFunctionBlocks: true,
              useCycleDefine: true,
              useParameterProgramming: true,
              useTCP: true,
              useRadiusCompensation3D: true,
              useSmartTurning: true
            }
          }
        });
        break;
      case 'advanced':
        setOptions({
          ...options,
          removeRedundantMoves: true,
          removeRedundantCodes: true,
          optimizeRapidMoves: true,
          optimizeToolpaths: true,
          optimizeFeedrates: true,
          useHighSpeedMode: true,
          useLookAhead: true,
          useTCPMode: true,
          useArcOptimization: true,
          consolidateGCodes: true,
          removeEmptyLines: true,
          removeComments: false,
          minimizeAxisMovement: true,
          safetyChecks: true,
          controllerSpecific: {
            ...options.controllerSpecific,
            fanuc: {
              ...options.controllerSpecific.fanuc,
              useDecimalFormat: true,
              useModalGCodes: true,
              useAI: true,
              useNanoSmoothing: true,
              useCornerRounding: true,
              useHighPrecisionMode: true,
              useCompactGCode: true
            },
            heidenhain: {
              ...options.controllerSpecific.heidenhain,
              useConversationalFormat: true,
              useFunctionBlocks: true,
              useCycleDefine: true,
              useParameterProgramming: true,
              useTCP: true,
              useRadiusCompensation3D: true,
              useSmartTurning: true
            }
          }
        });
        break;
    }
  };
  
  // Ottieni la descrizione delle ottimizzazioni specifiche per controller
  const getControllerSpecificDescription = (): string => {
    switch (selectedController) {
      case 'fanuc':
        return 'Ottimizzazioni specifiche per controller Fanuc includono supporto per modalità High-Speed, AICC (AI Contour Control), Nano Smoothing e arrotondamento angoli per percorsi più fluidi.';
      case 'heidenhain':
        return 'Ottimizzazioni specifiche per controller Heidenhain includono formato conversazionale, blocchi funzione, cicli avanzati, programmazione parametrica e supporto TCPM.';
      case 'siemens':
        return 'Ottimizzazioni specifiche per controller Siemens/Sinumerik includono compattazione codice, ottimizzazione look-ahead e supporto per cicli avanzati.';
      case 'haas':
        return 'Ottimizzazioni specifiche per controller Haas includono supporto per macro e cicli speciali Haas.';
      case 'mazak':
        return 'Ottimizzazioni specifiche per controller Mazak includono modalità SMOOTH e supporto per cicli avanzati.';
      case 'okuma':
        return 'Ottimizzazioni specifiche per controller Okuma includono sintassi OSP e cicli avanzati.';
      default:
        return 'Ottimizzazioni generiche compatibili con la maggior parte dei controller CNC.';
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-md">
      <div className="p-4 border-b">
        <h2 className="text-xl font-bold text-gray-800 flex items-center mb-2">
          <Cpu size={20} className="mr-2 text-blue-600" />
          Post-Processor Avanzato
        </h2>
        
        <p className="text-sm text-gray-600 mb-4">
          Ottimizza e converte il G-code per controller {selectedController.charAt(0).toUpperCase() + selectedController.slice(1)}.
          Configura le opzioni per adattare il codice alle specifiche del tuo CNC.
        </p>
        
        {/* Controller selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tipo di Controller
          </label>
          <div className="flex space-x-2">
            <select
              className="flex-grow p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={selectedController}
              onChange={(e) => setSelectedController(e.target.value as ControllerType)}
            >
              <option value="fanuc">Fanuc</option>
              <option value="heidenhain">Heidenhain</option>
              <option value="siemens">Siemens</option>
              <option value="haas">Haas</option>
              <option value="mazak">Mazak</option>
              <option value="okuma">Okuma</option>
              <option value="generic">Generico</option>
            </select>
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center"
              onClick={processGcode}
              disabled={isProcessing || !inputGcode}
            >
              {isProcessing ? (
                <Loader size={18} className="mr-2 animate-spin" />
              ) : (
                <Settings size={18} className="mr-2" />
              )}
              {isProcessing ? 'Elaborazione...' : 'Processa G-code'}
            </button>
          </div>
        </div>
        
        {/* Preset buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-sm font-medium text-gray-700 self-center mr-2">Preset:</span>
          <button
            type="button"
            className="px-3 py-1 bg-gray-100 text-gray-800 text-sm rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400"
            onClick={() => applyOptimizationPreset('basic')}
          >
            Base
          </button>
          <button
            type="button"
            className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400"
            onClick={() => applyOptimizationPreset('speed')}
          >
            Velocità
          </button>
          <button
            type="button"
            className="px-3 py-1 bg-green-100 text-green-800 text-sm rounded hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-400"
            onClick={() => applyOptimizationPreset('quality')}
          >
            Qualità
          </button>
          <button
            type="button"
            className="px-3 py-1 bg-purple-100 text-purple-800 text-sm rounded hover:bg-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
            onClick={() => applyOptimizationPreset('advanced')}
          >
            Avanzato
          </button>
        </div>
        
        {/* Controller specific info */}
        <div className="p-3 bg-blue-50 rounded-md mb-4 text-sm text-blue-800">
          <div className="flex items-start">
            <Info size={16} className="mt-0.5 mr-2 flex-shrink-0 text-blue-600" />
            <p>{getControllerSpecificDescription()}</p>
          </div>
        </div>
      </div>
      
      {/* General options */}
      <div className="border-b">
        <div
          className="flex items-center justify-between p-4 cursor-pointer"
          onClick={() => toggleSection('generalOptions')}
        >
          <h3 className="text-lg font-medium text-gray-800 flex items-center">
            <Sliders size={18} className="mr-2 text-blue-600" />
            Opzioni Generali
          </h3>
          {expanded.generalOptions ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
        
        {expanded.generalOptions && (
          <div className="p-4 pt-0 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Ottimizzazione Percorso</h4>
              
              <div className="space-y-2">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="removeRedundantMoves"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.removeRedundantMoves}
                    onChange={(e) => updateOption('removeRedundantMoves', e.target.checked)}
                  />
                  <label htmlFor="removeRedundantMoves" className="ml-2 block text-sm text-gray-700">
                    Rimuovi movimenti ridondanti
                  </label>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="optimizeRapidMoves"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.optimizeRapidMoves}
                    onChange={(e) => updateOption('optimizeRapidMoves', e.target.checked)}
                  />
                  <label htmlFor="optimizeRapidMoves" className="ml-2 block text-sm text-gray-700">
                    Ottimizza movimenti rapidi
                  </label>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="optimizeToolpaths"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.optimizeToolpaths}
                    onChange={(e) => updateOption('optimizeToolpaths', e.target.checked)}
                  />
                  <label htmlFor="optimizeToolpaths" className="ml-2 block text-sm text-gray-700">
                    Ottimizza percorsi utensile
                  </label>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="minimizeAxisMovement"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.minimizeAxisMovement}
                    onChange={(e) => updateOption('minimizeAxisMovement', e.target.checked)}
                  />
                  <label htmlFor="minimizeAxisMovement" className="ml-2 block text-sm text-gray-700">
                    Minimizza movimento assi
                  </label>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="useArcOptimization"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.useArcOptimization}
                    onChange={(e) => updateOption('useArcOptimization', e.target.checked)}
                  />
                  <label htmlFor="useArcOptimization" className="ml-2 block text-sm text-gray-700">
                    Ottimizza archi e cerchi
                  </label>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Ottimizzazione Codice</h4>
              
              <div className="space-y-2">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="removeRedundantCodes"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.removeRedundantCodes}
                    onChange={(e) => updateOption('removeRedundantCodes', e.target.checked)}
                  />
                  <label htmlFor="removeRedundantCodes" className="ml-2 block text-sm text-gray-700">
                    Rimuovi codici ridondanti
                  </label>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="optimizeFeedrates"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.optimizeFeedrates}
                    onChange={(e) => updateOption('optimizeFeedrates', e.target.checked)}
                  />
                  <label htmlFor="optimizeFeedrates" className="ml-2 block text-sm text-gray-700">
                    Ottimizza velocità di avanzamento
                  </label>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="consolidateGCodes"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.consolidateGCodes}
                    onChange={(e) => updateOption('consolidateGCodes', e.target.checked)}
                  />
                  <label htmlFor="consolidateGCodes" className="ml-2 block text-sm text-gray-700">
                    Consolida G-code modali
                  </label>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="removeEmptyLines"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.removeEmptyLines}
                    onChange={(e) => updateOption('removeEmptyLines', e.target.checked)}
                  />
                  <label htmlFor="removeEmptyLines" className="ml-2 block text-sm text-gray-700">
                    Rimuovi righe vuote in eccesso
                  </label>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="removeComments"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.removeComments}
                    onChange={(e) => updateOption('removeComments', e.target.checked)}
                  />
                  <label htmlFor="removeComments" className="ml-2 block text-sm text-gray-700">
                    Rimuovi commenti
                  </label>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Funzionalità Avanzate</h4>
              
              <div className="space-y-2">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="useHighSpeedMode"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.useHighSpeedMode}
                    onChange={(e) => updateOption('useHighSpeedMode', e.target.checked)}
                  />
                  <label htmlFor="useHighSpeedMode" className="ml-2 block text-sm text-gray-700">
                    Abilita modalità alta velocità
                  </label>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="useLookAhead"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.useLookAhead}
                    onChange={(e) => updateOption('useLookAhead', e.target.checked)}
                  />
                  <label htmlFor="useLookAhead" className="ml-2 block text-sm text-gray-700">
                    Abilita look-ahead
                  </label>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="useTCPMode"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.useTCPMode}
                    onChange={(e) => updateOption('useTCPMode', e.target.checked)}
                  />
                  <label htmlFor="useTCPMode" className="ml-2 block text-sm text-gray-700">
                    Abilita TCP/TCPM (5 assi)
                  </label>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="safetyChecks"
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    checked={options.safetyChecks}
                    onChange={(e) => updateOption('safetyChecks', e.target.checked)}
                  />
                  <label htmlFor="safetyChecks" className="ml-2 block text-sm text-gray-700">
                    Esegui controlli di sicurezza
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Controller Specific Options */}
      <div className="border-b">
        <div
          className="flex items-center justify-between p-4 cursor-pointer"
          onClick={() => toggleSection('controllerOptions')}
        >
          <h3 className="text-lg font-medium text-gray-800 flex items-center">
            <Settings size={18} className="mr-2 text-blue-600" />
            Opzioni Specifiche {selectedController.charAt(0).toUpperCase() + selectedController.slice(1)}
          </h3>
          {expanded.controllerOptions ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
        
        {expanded.controllerOptions && (
          <div className="p-4 pt-0">
            {/* Fanuc Specific Options */}
            {selectedController === 'fanuc' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Ottimizzazione Formato</h4>
                  
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="fanucUseDecimalFormat"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.fanuc?.useDecimalFormat}
                        onChange={(e) => updateControllerOption('fanuc', 'useDecimalFormat', e.target.checked)}
                      />
                      <label htmlFor="fanucUseDecimalFormat" className="ml-2 block text-sm text-gray-700">
                        Usa formato decimale
                      </label>
                    </div>
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="fanucUseModalGCodes"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.fanuc?.useModalGCodes}
                        onChange={(e) => updateControllerOption('fanuc', 'useModalGCodes', e.target.checked)}
                      />
                      <label htmlFor="fanucUseModalGCodes" className="ml-2 block text-sm text-gray-700">
                        Usa G-code modali
                      </label>
                    </div>
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="fanucUseCompactGCode"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.fanuc?.useCompactGCode}
                        onChange={(e) => updateControllerOption('fanuc', 'useCompactGCode', e.target.checked)}
                      />
                      <label htmlFor="fanucUseCompactGCode" className="ml-2 block text-sm text-gray-700">
                        Genera G-code compatto
                      </label>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Funzionalità Avanzate</h4>
                  
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="fanucUseAI"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.fanuc?.useAI}
                        onChange={(e) => updateControllerOption('fanuc', 'useAI', e.target.checked)}
                      />
                      <label htmlFor="fanucUseAI" className="ml-2 block text-sm text-gray-700">
                        Abilita AI Contour Control
                      </label>
                    </div>
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="fanucUseNanoSmoothing"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.fanuc?.useNanoSmoothing}
                        onChange={(e) => updateControllerOption('fanuc', 'useNanoSmoothing', e.target.checked)}
                      />
                      <label htmlFor="fanucUseNanoSmoothing" className="ml-2 block text-sm text-gray-700">
                        Abilita Nano Smoothing
                      </label>
                    </div>
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="fanucUseCornerRounding"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.fanuc?.useCornerRounding}
                        onChange={(e) => updateControllerOption('fanuc', 'useCornerRounding', e.target.checked)}
                      />
                      <label htmlFor="fanucUseCornerRounding" className="ml-2 block text-sm text-gray-700">
                        Abilita arrotondamento angoli
                      </label>
                    </div>
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="fanucUseHighPrecisionMode"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.fanuc?.useHighPrecisionMode}
                        onChange={(e) => updateControllerOption('fanuc', 'useHighPrecisionMode', e.target.checked)}
                      />
                      <label htmlFor="fanucUseHighPrecisionMode" className="ml-2 block text-sm text-gray-700">
                        Abilita modalità alta precisione
                      </label>
                    </div>
                  </div>
                </div>
                
                <div className="md:col-span-2">
                  <div className="p-3 bg-yellow-50 rounded-md mt-2">
                    <div className="flex items-start">
                      <Info size={16} className="mt-0.5 mr-2 flex-shrink-0 text-yellow-600" />
                      <p className="text-sm text-yellow-800">
                        Le opzioni avanzate Fanuc come AI Contour Control e Nano Smoothing richiedono che il controller CNC supporti queste funzionalità.
                        Verifica che il tuo controller supporti queste funzioni prima di utilizzarle.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Heidenhain Specific Options */}
            {selectedController === 'heidenhain' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Formato Programma</h4>
                  
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="heidenhainUseConversationalFormat"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.heidenhain?.useConversationalFormat}
                        onChange={(e) => updateControllerOption('heidenhain', 'useConversationalFormat', e.target.checked)}
                      />
                      <label htmlFor="heidenhainUseConversationalFormat" className="ml-2 block text-sm text-gray-700">
                        Usa formato conversazionale
                      </label>
                    </div>
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="heidenhainUseFunctionBlocks"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.heidenhain?.useFunctionBlocks}
                        onChange={(e) => updateControllerOption('heidenhain', 'useFunctionBlocks', e.target.checked)}
                      />
                      <label htmlFor="heidenhainUseFunctionBlocks" className="ml-2 block text-sm text-gray-700">
                        Usa blocchi funzione (LBL)
                      </label>
                    </div>
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="heidenhainUseCycleDefine"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.heidenhain?.useCycleDefine}
                        onChange={(e) => updateControllerOption('heidenhain', 'useCycleDefine', e.target.checked)}
                      />
                      <label htmlFor="heidenhainUseCycleDefine" className="ml-2 block text-sm text-gray-700">
                        Usa cicli definiti (CYCL DEF)
                      </label>
                    </div>
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="heidenhainUseParameterProgramming"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.heidenhain?.useParameterProgramming}
                        onChange={(e) => updateControllerOption('heidenhain', 'useParameterProgramming', e.target.checked)}
                      />
                      <label htmlFor="heidenhainUseParameterProgramming" className="ml-2 block text-sm text-gray-700">
                        Usa programmazione parametrica
                      </label>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Funzionalità Avanzate</h4>
                  
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="heidenhainUseTCP"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.heidenhain?.useTCP}
                        onChange={(e) => updateControllerOption('heidenhain', 'useTCP', e.target.checked)}
                      />
                      <label htmlFor="heidenhainUseTCP" className="ml-2 block text-sm text-gray-700">
                        Abilita TCPM (5 assi)
                      </label>
                    </div>
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="heidenhainUseRadiusCompensation3D"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.heidenhain?.useRadiusCompensation3D}
                        onChange={(e) => updateControllerOption('heidenhain', 'useRadiusCompensation3D', e.target.checked)}
                      />
                      <label htmlFor="heidenhainUseRadiusCompensation3D" className="ml-2 block text-sm text-gray-700">
                        Compensazione raggio 3D
                      </label>
                    </div>
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="heidenhainUseSmartTurning"
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        checked={options.controllerSpecific.heidenhain?.useSmartTurning}
                        onChange={(e) => updateControllerOption('heidenhain', 'useSmartTurning', e.target.checked)}
                      />
                      <label htmlFor="heidenhainUseSmartTurning" className="ml-2 block text-sm text-gray-700">
                        Abilita Smart Turning
                      </label>
                    </div>
                  </div>
                </div>
                
                <div className="md:col-span-2">
                  <div className="p-3 bg-yellow-50 rounded-md mt-2">
                    <div className="flex items-start">
                      <Info size={16} className="mt-0.5 mr-2 flex-shrink-0 text-yellow-600" />
                      <p className="text-sm text-yellow-800">
                        La conversione da G-code standard a formato conversazionale Heidenhain potrebbe richiedere
                        ulteriori aggiustamenti manuali per operazioni complesse. Verifica sempre il risultato
                        prima di utilizzarlo sulla macchina.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Other controllers */}
            {['siemens', 'haas', 'mazak', 'okuma', 'generic'].includes(selectedController) && (
              <div className="p-3 bg-blue-50 rounded-md">
                <div className="flex items-start">
                  <Info size={16} className="mt-0.5 mr-2 flex-shrink-0 text-blue-600" />
                  <p className="text-sm text-blue-800">
                    Le ottimizzazioni per il controller {selectedController.charAt(0).toUpperCase() + selectedController.slice(1)} 
                    utilizzano le opzioni generali di ottimizzazione configurate nella sezione precedente.
                    Sono disponibili opzioni estese solo per controller Fanuc e Heidenhain.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Results */}
      {result && (
        <div className="border-b">
          <div
            className="flex items-center justify-between p-4 cursor-pointer"
            onClick={() => toggleSection('results')}
          >
            <h3 className="text-lg font-medium text-gray-800 flex items-center">
              <Check size={18} className="mr-2 text-green-600" />
              Risultati Ottimizzazione
            </h3>
            {expanded.results ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
          
          {expanded.results && (
            <div className="p-4 pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Statistiche</h4>
                  
                  <div className="bg-gray-50 p-3 rounded-md">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Linee originali:</span>
                        <span className="font-medium">{result.stats.originalLines}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Linee ottimizzate:</span>
                        <span className="font-medium">{result.stats.optimizedLines}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Riduzione:</span>
                        <span className="font-medium">{result.stats.reductionPercent.toFixed(2)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Tempo stimato:</span>
                        <span className="font-medium">-{result.stats.estimatedTimeReduction.toFixed(2)} min</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Controlli di Sicurezza</h4>
                  
                  {result.validation.isValid ? (
                    <div className="bg-green-50 p-3 rounded-md flex items-start">
                      <Check size={16} className="mt-0.5 mr-2 flex-shrink-0 text-green-600" />
                      <p className="text-sm text-green-800">
                        Il G-code ottimizzato ha superato tutti i controlli di sicurezza.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-red-50 p-3 rounded-md flex items-start">
                      <AlertTriangle size={16} className="mt-0.5 mr-2 flex-shrink-0 text-red-600" />
                      <div>
                        <p className="text-sm font-medium text-red-800 mb-1">
                          Attenzione: Sono stati rilevati problemi nel G-code
                        </p>
                        <ul className="text-sm text-red-800 list-disc list-inside">
                          {result.validation.errors.map((error, index) => (
                            <li key={`error-${index}`}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                  
                  {result.validation.warnings.length > 0 && (
                    <div className="bg-yellow-50 p-3 rounded-md flex items-start mt-2">
                      <AlertTriangle size={16} className="mt-0.5 mr-2 flex-shrink-0 text-yellow-600" />
                      <div>
                        <p className="text-sm font-medium text-yellow-800 mb-1">
                          Avvertenze:
                        </p>
                        <ul className="text-sm text-yellow-800 list-disc list-inside">
                          {result.validation.warnings.map((warning, index) => (
                            <li key={`warning-${index}`}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="mb-4">
                <h4 className="font-medium text-gray-700 mb-2">Ottimizzazioni Applicate</h4>
                
                <div className="bg-blue-50 p-3 rounded-md">
                  <ul className="text-sm text-blue-800 grid grid-cols-1 md:grid-cols-2 gap-2">
                    {result.improvements.map((improvement, index) => (
                      <li key={`improvement-${index}`} className="flex items-start">
                        <Check size={14} className="mt-0.5 mr-2 flex-shrink-0 text-blue-600" />
                        <span>{improvement}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  className="flex items-center px-4 py-2 text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onClick={() => toggleSection('preview')}
                >
                  <Eye size={16} className="mr-2" />
                  {expanded.preview ? 'Nascondi Anteprima' : 'Mostra Anteprima'}
                </button>
                
                <button
                  type="button"
                  className="flex items-center px-4 py-2 text-green-700 bg-green-100 rounded-md hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-500"
                  onClick={saveGcode}
                >
                  <Save size={16} className="mr-2" />
                  Salva G-code
                </button>
                
                <button
                  type="button"
                  className="flex items-center px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onClick={processGcode}
                >
                  <Settings size={16} className="mr-2" />
                  Riprocessa
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* G-code Preview */}
      {result && expanded.preview && (
        <div className="p-4">
          <h3 className="text-lg font-medium text-gray-800 mb-2">Anteprima G-code Ottimizzato</h3>
          
          <div className="bg-gray-100 p-3 rounded-md overflow-auto max-h-96">
            <pre className="text-sm font-mono whitespace-pre-wrap">{outputGcode}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdvancedPostProcessorPanel;