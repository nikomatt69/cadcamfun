// src/components/ai/mcp/MCPInsightsPanel.tsx
import React, { useState, useEffect } from 'react';
import { Server, Database, Users, Zap, Cpu, RefreshCw } from 'react-feather';
import { useAI } from '@/src/components/ai/ai-new/AIContextProvider';
import mcpCadService from '@/src/lib/ai/mcpCadService';

interface MCPInsightsPanelProps {
  className?: string;
}

const MCPInsightsPanel: React.FC<MCPInsightsPanelProps> = ({ className = '' }) => {
  const { state } = useAI();
  const [insights, setInsights] = useState<any>({
    sessionId: '',
    contextSize: 0,
    designCount: 0,
    materialPreferences: [],
    domainContext: 'general',
    mostRecentIntent: null
  });
  
  const [refreshCounter, setRefreshCounter] = useState(0);
  
  // Refresh insights
  const refreshInsights = () => {
    setRefreshCounter(prev => prev + 1);
  };
  
  // Fetch insights from MCP
  useEffect(() => {
    if (!state.settings.mcpEnabled) return;
    
    // This would normally be an API call to get MCP insights
    // For now, we'll simulate it by getting data from localStorage
    const sessionId = mcpCadService.getSessionId();
    try {
      const contextData = localStorage.getItem(`mcp_context_${sessionId}`);
      if (contextData) {
        const parsedContext = JSON.parse(contextData);
        setInsights({
          sessionId,
          contextSize: JSON.stringify(parsedContext).length,
          designCount: parsedContext.designHistory?.length || 0,
          materialPreferences: parsedContext.preferredMaterials || [],
          domainContext: parsedContext.domainContext || 'general',
          mostRecentIntent: parsedContext.userIntents?.[0] || null
        });
      } else {
        // No data yet
        setInsights({
          sessionId,
          contextSize: 0,
          designCount: 0,
          materialPreferences: [],
          domainContext: 'general',
          mostRecentIntent: null
        });
      }
    } catch (error) {
      console.error('Error fetching MCP insights:', error);
    }
  }, [state.settings.mcpEnabled, refreshCounter]);
  
  if (!state.settings.mcpEnabled) {
    return (
      <div className={`p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
        <div className="flex items-center">
          <Server className="text-gray-400 mr-2" size={18} />
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">MCP is currently disabled</h3>
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Enable Model Context Protocol in settings to see insights about your design context.
        </p>
      </div>
    );
  }
  
  return (
    <div className={`p-4 bg-white dark:bg-gray-800 rounded-lg border border-blue-100 dark:border-blue-900 ${className}`}>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
          <Server className="text-blue-500 mr-2" size={18} />
          <h3 className="text-sm font-medium">Model Context Protocol Insights</h3>
        </div>
        <button 
          onClick={refreshInsights}
          className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 rounded-full"
        >
          <RefreshCw size={14} />
        </button>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
          <div className="flex items-center text-xs text-blue-700 dark:text-blue-300 font-medium mb-1">
            <Database size={12} className="mr-1" />
            Context Size
          </div>
          <p className="text-lg font-semibold text-blue-800 dark:text-blue-200">
            {(insights.contextSize / 1024).toFixed(2)} KB
          </p>
        </div>
        
        <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
          <div className="flex items-center text-xs text-green-700 dark:text-green-300 font-medium mb-1">
            <Cpu size={12} className="mr-1" />
            Design History
          </div>
          <p className="text-lg font-semibold text-green-800 dark:text-green-200">
            {insights.designCount} designs
          </p>
        </div>
      </div>
      
      <div className="space-y-3">
        <div>
          <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center">
            <Users size={12} className="mr-1" />
            Material Preferences
          </h4>
          <div className="flex flex-wrap gap-1">
            {insights.materialPreferences.length > 0 ? (
              insights.materialPreferences.map((material: string, index: number) => (
                <span 
                  key={index}
                  className="px-2 py-0.5 bg-blue-100 dark:bg-blue-800/30 text-blue-800 dark:text-blue-300 rounded text-xs"
                >
                  {material}
                </span>
              ))
            ) : (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                No material preferences learned yet
              </span>
            )}
          </div>
        </div>
        
        <div>
          <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center">
            <Zap size={12} className="mr-1" />
            Domain Context
          </h4>
          <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 rounded text-xs">
            {insights.domainContext}
          </span>
        </div>
        
        <div>
          <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Session ID</h4>
          <span className="text-xs text-gray-600 dark:text-gray-400 font-mono">
            {insights.sessionId}
          </span>
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
        <button 
          onClick={() => mcpCadService.createNewSession()}
          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
        >
          Create New Session
        </button>
      </div>
    </div>
  );
};

export default MCPInsightsPanel;