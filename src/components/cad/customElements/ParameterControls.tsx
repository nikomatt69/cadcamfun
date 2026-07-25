// ParameterControls.tsx - Controlli per parametri Custom Elements
// Permette la modifica di parametri esistenti e l'aggiunta di nuovi

import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'react-feather';
import { CustomElementDefinition, CustomElementParameter } from './types';

interface ParameterControlsProps {
  definition: CustomElementDefinition;
  values: Record<string, any>;
  onChange: (paramName: string, value: any) => void;
  onDefinitionChange: (updates: Partial<CustomElementDefinition>) => void;
}

export const ParameterControls: React.FC<ParameterControlsProps> = ({
  definition,
  values,
  onChange,
  onDefinitionChange
}) => {
  const [expandedParams, setExpandedParams] = useState<Set<string>>(new Set());
  const [newParamName, setNewParamName] = useState('');
  const [showAddParam, setShowAddParam] = useState(false);

  const toggleParamExpansion = (paramName: string) => {
    const newExpanded = new Set(expandedParams);
    if (newExpanded.has(paramName)) {
      newExpanded.delete(paramName);
    } else {
      newExpanded.add(paramName);
    }
    setExpandedParams(newExpanded);
  };

  const handleParameterDefChange = (paramName: string, updates: Partial<CustomElementParameter>) => {
    const newParameters = {
      ...definition.parameters,
      [paramName]: { ...definition.parameters[paramName], ...updates }
    };
    onDefinitionChange({ parameters: newParameters });
  };

  const addParameter = () => {
    if (!newParamName.trim() || definition.parameters[newParamName]) return;
    
    const newParameters = {
      ...definition.parameters,
      [newParamName]: {
        type: 'number' as const,
        default: 1,
        description: `Parameter ${newParamName}`,
        label: newParamName
      }
    };
    onDefinitionChange({ parameters: newParameters });
    
    // Auto-expand the new parameter
    setExpandedParams(prev => new Set(Array.from(prev).concat(newParamName)));
    
    setNewParamName('');
    setShowAddParam(false);
  };

  const removeParameter = (paramName: string) => {
    const { [paramName]: removed, ...remaining } = definition.parameters;
    onDefinitionChange({ parameters: remaining });
    
    // Remove from expanded set
    setExpandedParams(prev => {
      const newSet = new Set(prev);
      newSet.delete(paramName);
      return newSet;
    });
  };

  const renderParameterControl = (paramName: string, param: CustomElementParameter) => {
    const currentValue = values[paramName] !== undefined ? values[paramName] : param.default;

    switch (param.type) {
      case 'number':
        return (
          <input
            type="number"
            value={currentValue || 0}
            onChange={(e) => onChange(paramName, parseFloat(e.target.value) || 0)}
            min={param.min}
            max={param.max}
            step={param.step || 0.1}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        );

      case 'string':
        return (
          <input
            type="text"
            value={currentValue || ''}
            onChange={(e) => onChange(paramName, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        );

      case 'boolean':
        return (
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={currentValue || false}
              onChange={(e) => onChange(paramName, e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {param.label || paramName}
            </span>
          </label>
        );

      case 'color':
        return (
          <div className="flex space-x-2">
            <input
              type="color"
              value={currentValue || '#000000'}
              onChange={(e) => onChange(paramName, e.target.value)}
              className="w-12 h-10 border border-gray-300 dark:border-gray-600 rounded"
            />
            <input
              type="text"
              value={currentValue || '#000000'}
              onChange={(e) => onChange(paramName, e.target.value)}
              placeholder="#000000"
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        );

      case 'select':
        return (
          <select
            value={currentValue || param.default}
            onChange={(e) => onChange(paramName, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            {param.options?.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        );

      default:
        return (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Unsupported parameter type: {param.type}
          </div>
        );
    }
  };

  return (
    <div className="p-4 h-full overflow-y-auto bg-white dark:bg-gray-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Parameters</h3>
        <button
          onClick={() => setShowAddParam(!showAddParam)}
          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 flex items-center space-x-1"
        >
          <Plus className="w-4 h-4" />
          <span>Add</span>
        </button>
      </div>

      {/* Add new parameter form */}
      {showAddParam && (
        <div className="mb-4 p-3 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-900/20">
          <div className="flex space-x-2">
            <input
              type="text"
              placeholder="Parameter name"
              value={newParamName}
              onChange={(e) => setNewParamName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addParameter()}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <button
              onClick={addParameter}
              disabled={!newParamName.trim() || !!definition.parameters[newParamName]}
              className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
          {definition.parameters[newParamName] && (
            <div className="mt-2 text-sm text-red-600 dark:text-red-400">
              Parameter with this name already exists
            </div>
          )}
        </div>
      )}

      {/* Parameters list */}
      <div className="space-y-3">
        {Object.entries(definition.parameters).map(([paramName, param]) => {
          const isExpanded = expandedParams.has(paramName);
          
          return (
            <div key={paramName} className="border border-gray-200 dark:border-gray-700 rounded-lg">
              {/* Parameter header */}
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-t-lg">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => toggleParamExpansion(paramName)}
                    className="flex items-center space-x-2 text-left flex-1"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                    <span className="font-medium text-gray-900 dark:text-white">
                      {param.label || paramName}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      ({param.type})
                    </span>
                  </button>
                  
                  <button
                    onClick={() => removeParameter(paramName)}
                    className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                    title="Remove parameter"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Current value control */}
                <div className="mt-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Current Value
                  </label>
                  {renderParameterControl(paramName, param)}
                </div>
              </div>

              {/* Parameter configuration (expanded) */}
              {isExpanded && (
                <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Label
                    </label>
                    <input
                      type="text"
                      value={param.label || ''}
                      onChange={(e) => handleParameterDefChange(paramName, { label: e.target.value })}
                      placeholder={paramName}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Type
                    </label>
                    <select
                      value={param.type}
                      onChange={(e) => handleParameterDefChange(paramName, { type: e.target.value as any })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="number">Number</option>
                      <option value="string">String</option>
                      <option value="boolean">Boolean</option>
                      <option value="color">Color</option>
                      <option value="select">Select</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Default Value
                    </label>
                    <input
                      type="text"
                      value={JSON.stringify(param.default)}
                      onChange={(e) => {
                        try {
                          const value = JSON.parse(e.target.value);
                          handleParameterDefChange(paramName, { default: value });
                        } catch {
                          // Invalid JSON, don't update
                        }
                      }}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  {param.type === 'number' && (
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Min
                        </label>
                        <input
                          type="number"
                          value={param.min || ''}
                          onChange={(e) => handleParameterDefChange(paramName, { 
                            min: e.target.value ? parseFloat(e.target.value) : undefined 
                          })}
                          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Max
                        </label>
                        <input
                          type="number"
                          value={param.max || ''}
                          onChange={(e) => handleParameterDefChange(paramName, { 
                            max: e.target.value ? parseFloat(e.target.value) : undefined 
                          })}
                          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Step
                        </label>
                        <input
                          type="number"
                          value={param.step || ''}
                          onChange={(e) => handleParameterDefChange(paramName, { 
                            step: e.target.value ? parseFloat(e.target.value) : undefined 
                          })}
                          className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>
                    </div>
                  )}

                  {param.type === 'select' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Options (one per line)
                      </label>
                      <textarea
                        value={param.options?.join('\n') || ''}
                        onChange={(e) => handleParameterDefChange(paramName, { 
                          options: e.target.value.split('\n').filter(Boolean) 
                        })}
                        rows={3}
                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={param.description || ''}
                      onChange={(e) => handleParameterDefChange(paramName, { description: e.target.value })}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`required-${paramName}`}
                      checked={param.required || false}
                      onChange={(e) => handleParameterDefChange(paramName, { required: e.target.checked })}
                      className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor={`required-${paramName}`} className="text-xs text-gray-600 dark:text-gray-400">
                      Required parameter
                    </label>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {Object.keys(definition.parameters).length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <div className="text-2xl mb-2">⚙️</div>
          <div>No parameters defined</div>
          <div className="text-sm">Click &quot;Add&quot; to create your first parameter</div>
        </div>
      )}
    </div>
  );
};
