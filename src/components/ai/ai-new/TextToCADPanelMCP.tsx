import React, { useState, useEffect, useMemo } from 'react';
import { PenTool, Loader, Check, AlertTriangle, ThumbsUp, ThumbsDown, RefreshCw } from 'react-feather';
import { useAI } from './AIContextProvider';
import { useElementsStore } from 'src/store/elementsStore';
import AIProcessingIndicator from './AIProcessingIndicator';
import AIFeedbackCollector from './AIFeedbackCollector';
import { createClient } from '@/src/lib/modelcontextprotocol';

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
 * Pannello per la conversione da testo a elementi CAD utilizzando Model Context Protocol
 * per un'interazione strutturata con l'AI
 */
const TextToCADPanelMCP: React.FC<TextToCADPanelProps> = ({
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
  
  // Hook per lo stato AI e elements
  const { textToCAD, state } = useAI();
  const { addElements } = useElementsStore();
  
  // Client MCP per interazioni strutturate con l'AI
  const mcpClient = useMemo(() => {
    return createClient({
      endpoint: '/api/mcp',
      onError: (error) => {
        console.error('MCP client error:', error);
        setErrorMessage('Errore di comunicazione con il servizio AI');
      }
    });
  }, []);
  
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
  
  // Genera elementi CAD dalla descrizione usando MCP
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
      
      // Crea una sessione MCP
      const session = await mcpClient.createSession();
      let result;
      
      try {
        // Recupera informazioni sui tipi di elementi disponibili
        await session.getResource('element-types');
        
        // Genera il componente usando MCP
        result = await session.useTool('generate-component', {
          description,
          constraints: {
            ...constraints,
            // Passa eventuali vincoli aggiuntivi basati sul preset
            maxElements: constraints?.maxElements || 30,
            dimensions: constraints?.maxDimensions || { width: 200, height: 200, depth: 200 },
          }
        });
      } finally {
        // Assicurati che la sessione venga chiusa correttamente
        await session.close();
      }
      
      // Processa il risultato
      if (result.success && result.elements && result.elements.length > 0) {
        setGeneratedElements(result.elements);
        setGenerationStatus('success');
        
        // Aggiorna la cronologia
        const newHistoryItem = {
          id: `gen_${Date.now()}`,
          description,
          timestamp: Date.now(),
          elements: result.elements
        };
        
        setGenerationHistory(prev => [newHistoryItem, ...prev.slice(0, 9)]);
        
        // Esegui il callback di successo se fornito
        if (onSuccess) {
          onSuccess(result.elements);
        }
      } else {
        // Se MCP fallisce, usa il metodo tradizionale come fallback
        console.log('MCP generation failed, falling back to traditional method');
        const fallbackResult = await textToCAD(description, constraints);
        
        if (fallbackResult.success && fallbackResult.data) {
          setGeneratedElements(fallbackResult.data);
          setGenerationStatus('success');
          
          const newHistoryItem = {
            id: `gen_${Date.now()}`,
            description,
            timestamp: Date.now(),
            elements: fallbackResult.data
          };
          
          setGenerationHistory(prev => [newHistoryItem, ...prev.slice(0, 9)]);
          
          if (onSuccess) {
            onSuccess(fallbackResult.data);
          }
        } else {
          setErrorMessage(result.error || fallbackResult.error || 'Si è verificato un errore durante la generazione. Riprova.');
          setGenerationStatus('error');
        }
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
  
  const isGenerateDisabled = !description.trim() || generationStatus === 'generating';
  
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow p-4 ${className}`}>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center mb-4">
        <PenTool className="mr-2" size={20} />
        Text to CAD (MCP)
      </h2>
      
      <div className="space-y-4">
        {/* Input descrizione */}
        <div>
          <label htmlFor="cad-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Descrivi cosa vuoi creare
          </label>
          <textarea
            id="cad-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
            placeholder="Descrivi il modello 3D che vuoi creare..."
            rows={4}
            disabled={generationStatus === 'generating'}
          />
          
          {/* Prompt di esempio */}
          <div className="mt-2 flex flex-wrap gap-2">
            <button 
              className="text-xs px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800/40 rounded"
              onClick={() => setDescription("Un assemblaggio meccanico con una piastra base, quattro fori di montaggio e un cilindro centrale con un albero")}
            >
              Assemblaggio meccanico
            </button>
            <button 
              className="text-xs px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800/40 rounded"
              onClick={() => setDescription("Una semplice sedia con quattro gambe, una seduta e uno schienale")}
            >
              Arredamento
            </button>
            <button 
              className="text-xs px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800/40 rounded"
              onClick={() => setDescription("Un braccio robotico con tre giunti e una pinza all'estremità")}
            >
              Robotica
            </button>
          </div>
        </div>
        
        {/* Preset di vincoli */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Preset di vincoli
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
        
        {/* Pulsante di generazione */}
        <div className="flex justify-end space-x-3">
          {generationStatus === 'success' && (
            <button
              onClick={handleAddToCanvas}
              className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 flex items-center"
            >
              <Check size={16} className="mr-2" />
              Aggiungi al Canvas
            </button>
          )}
          
          {generationStatus === 'success' ? (
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 flex items-center"
            >
              <RefreshCw size={16} className="mr-2" />
              Nuova Generazione
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
                  Generazione in corso...
                </>
              ) : (
                <>
                  <PenTool size={16} className="mr-2" />
                  Genera Modello
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
            message="L'IA sta generando il tuo modello 3D utilizzando MCP..." 
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
                  <AIFeedbackCollector requestId={requestId} compact />
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Cronologia di generazione */}
        {generationHistory.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
              Generazioni Recenti
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
                      Aggiungi
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

export default TextToCADPanelMCP;