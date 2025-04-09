// src/components/ai/TextToCADPanel.tsx
import React, { useState, useEffect } from 'react';
import { PenTool, Loader, Check, AlertTriangle, ThumbsUp, ThumbsDown, RefreshCw, File } from 'react-feather';
import { useAI } from './AIContextProvider';
import { useElementsStore } from 'src/store/elementsStore';
import { useContextStore } from 'src/store/contextStore';
import AIProcessingIndicator from './AIProcessingIndicator';
import AIFeedbackCollector from './AIFeedbackCollector';
import ContextPanel from './ContextPanel';
import AIProviderBadge from './AIProviderBadge';

// Preset di vincoli predefiniti per scenari comuni
const CONSTRAINT_PRESETS = [
  {
    id: 'mechanical',
    name: 'Componenti Meccanici',
    description: 'Vincoli ottimizzati per la produzione di componenti meccanici',
    constraints: {
      preferredTypes: ['cube', 'cylinder', 'cone', 'torus'],
      maxDimensions: { width: 200, height: 200, depth: 200 },
      minWallThickness: 2.5,
      maxElements: 20
    }
  },
  {
    id: 'architectural',
    name: 'Modelli Architettonici',
    description: 'Impostazioni per design architettonici e strutturali',
    constraints: {
      preferredTypes: ['cube', 'extrusion', 'cylinder'],
      maxDimensions: { width: 500, height: 300, depth: 500 },
      minWallThickness: 3,
      maxElements: 50
    }
  },
  {
    id: 'organic',
    name: 'Forme Organiche',
    description: 'Impostazioni per design organici e scultorei',
    constraints: {
      preferredTypes: ['sphere', 'torus', 'cylinder', 'cone'],
      smoothTransitions: true,
      organicDeformation: true,
      maxElements: 30
    }
  },
  {
    id: 'precision',
    name: 'Ingegneria di Precisione',
    description: 'Vincoli di ingegneria ad alta precisione',
    constraints: {
      preferredTypes: ['cube', 'cylinder', 'line', 'rectangle'],
      maxDimensions: { width: 150, height: 150, depth: 150 },
      precision: 'high',
      useStandardDimensions: true,
      maxElements: 25
    }
  }
];

interface TextToCADPanelProps {
  onSuccess?: (elements: any[]) => void;
  className?: string;
}

/**
 * Pannello per la conversione da testo a elementi CAD
 */
const TextToCADPanel: React.FC<TextToCADPanelProps> = ({
  onSuccess,
  className = ''
}) => {
  // Stato del componente
  const [description, setDescription] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<'idle' | 'generating' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [generatedElements, setGeneratedElements] = useState<any[]>([]);
  const [generationHistory, setGenerationHistory] = useState<Array<{
    id: string;
    description: string;
    timestamp: number;
    elements: any[];
  }>>([]);
  const [isContextPanelExpanded, setIsContextPanelExpanded] = useState(false);
  
  // Hook per lo stato AI e elements
  const { textToCAD, state } = useAI();
  const { addElements } = useElementsStore();
  const { activeContextIds } = useContextStore();
  
  // Carica la cronologia dal localStorage all'avvio
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('textToCadHistory');
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed)) {
          setGenerationHistory(parsed);
        }
      }
    } catch (error) {
      console.error('Failed to load generation history:', error);
    }
  }, []);
  
  // Simula l'avanzamento durante la generazione
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (generationStatus === 'generating') {
      setProgress(0);
      interval = setInterval(() => {
        setProgress(prev => {
          // Aumenta più velocemente all'inizio, poi rallenta verso il 90%
          const increment = prev < 30 ? 5 : prev < 60 ? 3 : prev < 80 ? 1 : 0.5;
          return Math.min(prev + increment, 90);
        });
      }, 300);
    } else if (generationStatus === 'success') {
      setProgress(100);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [generationStatus]);
  
  // Aggiorna la cronologia nel localStorage quando cambia
  useEffect(() => {
    if (generationHistory.length > 0) {
      try {
        localStorage.setItem('textToCadHistory', JSON.stringify(generationHistory.slice(0, 10)));
      } catch (error) {
        console.error('Failed to save generation history:', error);
      }
    }
  }, [generationHistory]);
  
  // Genera elementi CAD dalla descrizione
  const handleGenerate = async () => {
    if (!description.trim() || generationStatus === 'generating') {
      return;
    }
    
    setGenerationStatus('generating');
    setErrorMessage(null);
    setRequestId(`text_to_cad_${Date.now()}`);
    
    try {
      // Ottieni il preset di vincoli selezionato
      const constraints = selectedPreset 
        ? CONSTRAINT_PRESETS.find(preset => preset.id === selectedPreset)?.constraints 
        : undefined;
      
      // Chiama il servizio AI
      const result = await textToCAD(description, constraints);
      
      if (result.success && result.data) {
        setGeneratedElements(result.data);
        setGenerationStatus('success');
        
        // Aggiorna la cronologia
        const newHistoryItem = {
          id: `gen_${Date.now()}`,
          description,
          timestamp: Date.now(),
          elements: result.data
        };
        
        setGenerationHistory(prev => [newHistoryItem, ...prev.slice(0, 9)]);
        
        // Esegui il callback di successo se fornito
        if (onSuccess) {
          onSuccess(result.data);
        }
      } else {
        setErrorMessage(result.error || 'Si è verificato un errore durante la generazione. Riprova.');
        setGenerationStatus('error');
      }
    } catch (error) {
      console.error('Error generating CAD elements:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Si è verificato un errore imprevisto.');
      setGenerationStatus('error');
    }
  };
  
  // Aggiunge gli elementi generati al canvas
  const handleAddToCanvas = () => {
    if (generatedElements.length > 0) {
      addElements(generatedElements);
    }
  };
  
  // Aggiunge elementi dalla cronologia al canvas
  const handleAddFromHistory = (historyItem: {id: string, elements: any[]}) => {
    addElements(historyItem.elements);
  };
  
  // Ripristina lo stato per una nuova generazione
  const handleReset = () => {
    setGenerationStatus('idle');
    setErrorMessage(null);
    setGeneratedElements([]);
  };
  
  // Toggle del pannello di contesto
  const toggleContextPanel = () => {
    setIsContextPanelExpanded(!isContextPanelExpanded);
  };
  
  const isGenerateDisabled = !description.trim() || generationStatus === 'generating';
  
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow p-4 ${className}`}>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center mb-4">
        <PenTool className="mr-2" size={20} />
        Text to CAD
      </h2>
      <AIProviderBadge />
      <div className="space-y-4">
        {/* Pannello del contesto */}
        {isContextPanelExpanded ? (
          <ContextPanel 
            isExpanded={isContextPanelExpanded}
            onToggle={toggleContextPanel}
          />
        ) : (
          <div className="flex justify-end mb-2">
            <button
              onClick={toggleContextPanel}
              className="flex items-center justify-center p-2 bg-blue-100 hover:bg-blue-200 dark:bg-blue-800/30 dark:hover:bg-blue-800/50 text-blue-700 dark:text-blue-300 rounded-md transition-colors"
            >
              <File size={16} className="mr-2" />
              <span className="text-sm font-medium">Context</span>
              {activeContextIds.length > 0 && (
                <span className="ml-1 bg-blue-600 text-white dark:bg-blue-500 text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {activeContextIds.length}
                </span>
              )}
            </button>
          </div>
        )}
        
        {/* Input descrizione */}
        <div>
          <label htmlFor="cad-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Describe what you want to create
          </label>
          <textarea
            id="cad-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
            placeholder="Describe the 3D model you want to create..."
            rows={4}
            disabled={generationStatus === 'generating'}
          />
          
          {/* Prompt di esempio */}
          <div className="mt-2 flex flex-wrap gap-2">
            <button 
              className="text-xs px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800/40 rounded"
              onClick={() => setDescription("Un assemblaggio meccanico con una piastra base, quattro fori di montaggio e un cilindro centrale con un albero")}
            >
              Mechanical assembly
            </button>
            <button 
              className="text-xs px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800/40 rounded"
              onClick={() => setDescription("Una semplice sedia con quattro gambe, una seduta e uno schienale")}
            >
              Furniture
            </button>
            <button 
              className="text-xs px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800/40 rounded"
              onClick={() => setDescription("Un braccio robotico con tre giunti e una pinza all'estremità")}
            >
              Robotics
            </button>
          </div>
        </div>
        
        {/* Preset di vincoli */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Constraints preset
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CONSTRAINT_PRESETS.map((preset) => (
              <div
                key={preset.id}
                onClick={() => setSelectedPreset(selectedPreset === preset.id ? null : preset.id)}
                className={`p-2 border rounded-md cursor-pointer transition-colors ${
                  selectedPreset === preset.id 
                    ? 'bg-blue-50 border-blue-300 dark:bg-blue-800/30 dark:border-blue-700' 
                    : 'bg-white border-gray-200 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600'
                }`}
              >
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200">{preset.name}</h4>
                  {selectedPreset === preset.id && <Check size={14} className="text-blue-600 dark:text-blue-400" />}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{preset.description}</p>
              </div>
            ))}
          </div>
        </div>
        
        {/* Sezione contesto attivo */}
        {activeContextIds.length > 0 && !isContextPanelExpanded && (
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md">
            <p className="text-sm text-blue-700 dark:text-blue-300 flex items-center">
              <File size={14} className="mr-1" />
              {activeContextIds.length} {activeContextIds.length === 1 ? 'active context file' : 'active context files'}
              <button 
                onClick={toggleContextPanel} 
                className="ml-2 text-xs underline"
              >
                Manage
              </button>
            </p>
          </div>
        )}
        
        {/* Pulsante di generazione */}
        <div className="flex justify-end space-x-3">
          {generationStatus === 'success' && (
            <button
              onClick={handleAddToCanvas}
              className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 flex items-center"
            >
              <Check size={16} className="mr-2" />
              Add to Canvas
            </button>
          )}
          
          {generationStatus === 'success' ? (
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 flex items-center"
            >
              <RefreshCw size={16} className="mr-2" />
              New Generation
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={isGenerateDisabled}
              className={`px-4 py-2 rounded-md text-sm font-medium flex items-center ${
                isGenerateDisabled
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-800 dark:text-gray-400'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {generationStatus === 'generating' ? (
                <>
                  <Loader size={16} className="mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <PenTool size={16} className="mr-2" />
                  Generate Model
                </>
              )}
            </button>
          )}
        </div>
        
        {/* Indicatore di stato */}
        {generationStatus === 'generating' && (
          <AIProcessingIndicator 
            status="processing" 
            progress={progress}
            message="The AI is generating your 3D model..." 
          />
        )}
        
        {generationStatus === 'error' && errorMessage && (
          <AIProcessingIndicator 
            status="error" 
            message={errorMessage}
            onRetry={handleGenerate}
          />
        )}
        
        {generationStatus === 'success' && (
          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-md flex items-start">
            <Check size={18} className="text-green-500 dark:text-green-400 mr-2 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-green-800 dark:text-green-200">
                Generati {generatedElements.length} elementi CAD con successo!
              </p>
              {requestId && (
                <div className="mt-2">
                  <AIFeedbackCollector requestId={requestId}  />
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Cronologia di generazione */}
        {generationHistory.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
              Recent Generations
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {generationHistory.map((item) => (
                <div 
                  key={item.id}
                  className="p-2 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                    {item.description}
                  </p>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {item.elements.length} elementi • {new Date(item.timestamp).toLocaleString()}
                    </span>
                    <button
                      onClick={() => handleAddFromHistory(item)}
                      className="px-2 py-1 bg-blue-50 dark:bg-blue-800/30 text-blue-600 dark:text-blue-300 rounded text-xs hover:bg-blue-100 dark:hover:bg-blue-800/50"
                    >
                      Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TextToCADPanel;