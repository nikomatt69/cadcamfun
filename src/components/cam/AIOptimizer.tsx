import fanucOptimizer from '@/src/lib/fanucOptimizer';
import React, { useState } from 'react';

import { Check, AlertCircle, Code, RefreshCw, ChevronDown, ChevronUp, Info } from 'react-feather';

interface AIOptimizerProps {
  gcode: string;
  onApplyOptimized: (optimizedCode: string) => void;
}

const AIOptimizer: React.FC<AIOptimizerProps> = ({ gcode, onApplyOptimized }) => {
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [optimizationResult, setOptimizationResult] = useState<any>(null);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  
  const handleOptimize = async () => {
    if (!gcode.trim()) {
      return;
    }
    
    setIsOptimizing(true);
    try {
      const result = await fanucOptimizer.optimizeCode(gcode);
      setOptimizationResult(result);
    } catch (error) {
      console.error('Optimization failed:', error);
    } finally {
      setIsOptimizing(false);
    }
  };
  
  const handleApplyOptimized = () => {
    if (optimizationResult && optimizationResult.code) {
      onApplyOptimized(optimizationResult.code);
      // Reset state after applying
      setOptimizationResult(null);
    }
  };
  
  const toggleDetails = () => {
    setShowDetails(!showDetails);
  };
  
  return (
    <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-md p-4 mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Ottimizzazione AI per Fanuc</h2>
        
        <div className="flex space-x-2">
          <button
            onClick={handleOptimize}
            disabled={isOptimizing || !gcode.trim()}
            className={`flex items-center px-4 py-2 rounded-md text-sm font-medium ${
              isOptimizing ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isOptimizing ? (
              <>
                <RefreshCw size={16} className="mr-2 animate-spin" />
                Ottimizzazione...
              </>
            ) : (
              <>
                <Code size={16} className="mr-2" />
                Ottimizza G-Code
              </>
            )}
          </button>
          
          {optimizationResult && (
            <button
              onClick={handleApplyOptimized}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700"
            >
              <Check size={16} className="mr-2" />
              Applica
            </button>
          )}
        </div>
      </div>
      
      {!optimizationResult && !isOptimizing && (
        <div className="mt-4 p-3 bg-blue-50 rounded-md flex items-start">
          <Info size={18} className="text-blue-500 mr-2 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-blue-800">
              L&apos;ottimizzazione AI per Fanuc analizza il codice G-code e applica tecniche avanzate per:
            </p>
            <ul className="mt-2 text-xs text-blue-700 list-disc pl-5 space-y-1">
              <li>Rimuovere comandi ridondanti</li>
              <li>Consolidare movimenti consecutivi</li>
              <li>Ottimizzare parametri di velocità e avanzamento</li>
              <li>Ridurre il tempo di esecuzione complessivo</li>
              <li>Rispettare le specifiche Fanuc</li>
            </ul>
          </div>
        </div>
      )}
      
      {optimizationResult && (
        <div className="mt-4">
          <div className="mb-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-3 bg-green-50 rounded-md">
              <p className="text-sm font-medium text-gray-700">Riduzione Linee</p>
              <p className="text-2xl font-bold text-green-600">
                {optimizationResult.stats.reductionPercent}%
              </p>
            </div>
            
            <div className="p-3 bg-blue-50 rounded-md">
              <p className="text-sm font-medium text-gray-700">Linee Originali</p>
              <p className="text-2xl font-bold text-blue-600">
                {optimizationResult.stats.originalLines}
              </p>
            </div>
            
            <div className="p-3 bg-blue-50 rounded-md">
              <p className="text-sm font-medium text-gray-700">Linee Ottimizzate</p>
              <p className="text-2xl font-bold text-blue-600">
                {optimizationResult.stats.optimizedLines}
              </p>
            </div>
            
            <div className="p-3 bg-green-50 rounded-md">
              <p className="text-sm font-medium text-gray-700">Risparmio Tempo</p>
              <p className="text-2xl font-bold text-green-600">
                ~{optimizationResult.stats.estimatedTimeReduction.toFixed(2)} min
              </p>
            </div>
          </div>
          
          <div className="mb-4 p-3 bg-gray-50 rounded-md">
            <div 
              className="flex items-center justify-between cursor-pointer" 
              onClick={toggleDetails}
            >
              <h3 className="text-sm font-medium text-gray-700">Miglioramenti Applicati</h3>
              {showDetails ? (
                <ChevronUp size={16} className="text-gray-500" />
              ) : (
                <ChevronDown size={16} className="text-gray-500" />
              )}
            </div>
            
            {showDetails && (
              <ul className="mt-2 space-y-1 pl-5 list-disc text-sm text-gray-600">
                {optimizationResult.improvements.map((improvement: string, idx: number) => (
                  <li key={idx}>{improvement}</li>
                ))}
              </ul>
            )}
          </div>
          
          {optimizationResult.stats.reductionPercent === 0 && (
            <div className="p-3 bg-yellow-50 rounded-md flex items-start">
              <AlertCircle size={18} className="text-yellow-500 mr-2 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-800">
                Il codice è già ben ottimizzato. Non sono necessarie ulteriori modifiche.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AIOptimizer;