// src/components/ai/ai-new/OpenAISetupPanel.tsx
import React, { useState } from 'react';
import { AlertTriangle, Server, Key, Shield, RefreshCw, CheckCircle, X } from 'react-feather';
import { useAI } from './AIContextProvider';
import { openaiService } from '@/src/lib/ai/openaiService';


interface OpenAISetupPanelProps {
  className?: string;
}

/**
 * Pannello per la configurazione delle credenziali OpenAI
 */
const OpenAISetupPanel: React.FC<OpenAISetupPanelProps> = ({ className = '' }) => {
  const { state, dispatch } = useAI();
  
  const [apiKey, setApiKey] = useState<string>(state.settings.openaiApiKey || '');
  const [orgId, setOrgId] = useState<string>(state.settings.openaiOrgId || '');
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  
  // Salva le impostazioni OpenAI
  const saveSettings = () => {
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: {
        openaiApiKey: apiKey,
        openaiOrgId: orgId
      }
    });
    
    // Aggiorna anche il servizio OpenAI
    openaiService.setApiKey(apiKey);
    if (orgId) {
      openaiService.setOrganizationId(orgId);
    }
    
    if (testResult?.success) {
      setTestResult({
        success: true,
        message: 'Impostazioni OpenAI salvate con successo!'
      });
    } else {
      testConnection();
    }
  };
  
  // Testa la connessione OpenAI
  const testConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    
    try {
      // Set keys temporarily for testing
      openaiService.setApiKey(apiKey);
      if (orgId) {
        openaiService.setOrganizationId(orgId);
      }
      
      // Attempt a simple API call
      const response = await openaiService.processRequest({
        prompt: 'This is a test message. Please respond with "OK" if you can read this.',
        model: 'gpt-3.5-turbo',
        maxTokens: 10
      });
      
      if (response.success) {
        setTestResult({
          success: true,
          message: 'Connessione a OpenAI riuscita!'
        });
      } else {
        setTestResult({
          success: false,
          message: `Errore: ${response.error || 'Risposta non valida da OpenAI'}`
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: `Errore di connessione: ${error instanceof Error ? error.message : String(error)}`
      });
    } finally {
      setIsTesting(false);
    }
  };
  
  return (
    <div className={`p-4 bg-white dark:bg-gray-800 rounded-lg border border-green-100 dark:border-green-900 ${className}`}>
      <div className="flex items-center mb-4">
        <Server className="text-green-500 mr-2" size={18} />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          Configurazione OpenAI
        </h3>
      </div>
      
      <div className="space-y-4">
        <div>
          <label htmlFor="openai-api-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            API Key OpenAI
          </label>
          <div className="relative rounded-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Key className="h-4 w-4 text-gray-400" aria-hidden="true" />
            </div>
            <input
              type="password"
              id="openai-api-key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="block w-full pl-10 pr-12 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            La tua API key OpenAI. Inizia con sk-.
          </p>
        </div>
        
        <div>
          <label htmlFor="openai-org-id" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            ID Organizzazione (opzionale)
          </label>
          <div className="relative rounded-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Shield className="h-4 w-4 text-gray-400" aria-hidden="true" />
            </div>
            <input
              type="text"
              id="openai-org-id"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              placeholder="org-..."
              className="block w-full pl-10 pr-12 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 sm:text-sm dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Necessario solo se il tuo account ha accesso a più organizzazioni.
          </p>
        </div>
        
        <div className="flex space-x-3 pt-2">
          <button
            onClick={testConnection}
            disabled={isTesting || !apiKey}
            className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
              isTesting || !apiKey
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'
                : 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-300 dark:hover:bg-green-900/30'
            }`}
          >
            {isTesting ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Server className="mr-2 h-4 w-4" />
            )}
            Testa Connessione
          </button>
          
          <button
            onClick={saveSettings}
            disabled={isTesting || !apiKey}
            className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
              isTesting || !apiKey
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'
                : 'bg-green-600 text-white hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600'
            }`}
          >
            Salva Impostazioni
          </button>
        </div>
        
        {testResult && (
          <div className={`mt-3 p-3 rounded-md flex items-start ${
            testResult.success
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
          }`}>
            {testResult.success ? (
              <CheckCircle className="h-5 w-5 mr-2 flex-shrink-0" />
            ) : (
              <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0" />
            )}
            <div>
              <p className="text-sm">{testResult.message}</p>
              {!testResult.success && (
                <p className="text-xs mt-1">
                  Verifica la tua API key e assicurati che il tuo account abbia credito disponibile.
                </p>
              )}
            </div>
            <button
              onClick={() => setTestResult(null)}
              className="ml-auto flex-shrink-0 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        
        <div className="p-3 mt-2 bg-gray-50 dark:bg-gray-700 rounded-md">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center">
            <AlertTriangle className="h-4 w-4 mr-1 text-amber-500" />
            Note Importanti
          </h4>
          <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 ml-5 list-disc">
            <li>La tua API key viene salvata in modo sicuro solo sul tuo dispositivo</li>
            <li>OpenAI ha un sistema di crediti e limiti di rate diverso da Anthropic</li>
            <li>L utilizzo di OpenAI comporta costi che saranno addebitati sul tuo account OpenAI</li>
            <li>Consulta la <a href="https://openai.com/pricing" target="_blank" rel="noopener noreferrer" className="text-green-600 dark:text-green-400 hover:underline">pagina dei prezzi OpenAI</a> per maggiori informazioni</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default OpenAISetupPanel;