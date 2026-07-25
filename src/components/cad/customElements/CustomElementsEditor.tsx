// CustomElementsEditor.tsx - Editor principale per Custom Elements
// Componente completo e indipendente

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  X, 
  Play, 
  Save, 
  Download, 
  Upload, 
  Copy, 
  RefreshCcw, 
  AlertTriangle,
  CheckCircle,
  Code,
  Eye,
  Settings,
  Layers,
  FileText
} from 'react-feather';
import * as THREE from 'three';
import { useCustomElementsStore } from './store';
import { CustomElementDefinition } from './types';
import { CustomElementPreview } from './CustomElementPreview';
import { ParameterControls } from './ParameterControls';
import { JsonEditor } from './JsonEditor';

interface CustomElementsEditorProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CustomElementsEditor: React.FC<CustomElementsEditorProps> = ({
  isOpen,
  onClose
}) => {
  const {
    activeDefinition,
    editorMode,
    previewParameters,
    previewObject,
    validationErrors,
    isGeneratingPreview,
    previewError,
    updateDefinition,
    createDefinition,
    validateDefinition,
    setValidationErrors,
    updatePreviewParameters,
    setPreviewObject,
    setGeneratingPreview,
    setPreviewError,
    exportDefinition,
    importDefinition
  } = useCustomElementsStore();

  const [activeTab, setActiveTab] = useState<'code' | 'parameters' | 'preview' | 'settings'>('code');
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validate definition when it changes
  useEffect(() => {
    if (activeDefinition) {
      const validation = validateDefinition(activeDefinition);
      setValidationErrors(validation.errors);
    }
  }, [activeDefinition, validateDefinition, setValidationErrors]);

  // Generate preview when parameters or code changes
  const generatePreview = useCallback(async () => {
    if (!activeDefinition || validationErrors.length > 0) {
      setPreviewObject(null);
      return;
    }

    setGeneratingPreview(true);
    setPreviewError(null);

    try {
      // Create a function from the geometry code
      const geometryFunction = new Function('THREE', 'parameters', activeDefinition.geometryCode);
      
      // Execute the function with current parameters
      const result = geometryFunction(THREE, previewParameters);
      
      if (!result) {
        throw new Error('Geometry function returned null or undefined');
      }

      let finalObject: THREE.Object3D;

      if (result instanceof THREE.Object3D) {
        // If function returns a complete Object3D (like Group), use it directly
        finalObject = result;
      } else if (result instanceof THREE.BufferGeometry) {
        // If function returns geometry, create material and mesh
        let material: THREE.Material;
        
        if (activeDefinition.materialConfig?.type === 'custom' && activeDefinition.materialConfig.customCode) {
          // Custom material code
          const materialFunction = new Function('THREE', 'parameters', activeDefinition.materialConfig.customCode);
          material = materialFunction(THREE, previewParameters);
        } else {
          // Standard material with parameter interpolation
          const materialProps = { ...activeDefinition.materialConfig?.properties };
          
          // Interpolate parameter references like 'parameters.color'
          Object.keys(materialProps).forEach(key => {
            const value = materialProps[key];
            if (typeof value === 'string' && value.startsWith('parameters.')) {
              const paramName = value.substring('parameters.'.length);
              materialProps[key] = previewParameters[paramName];
            }
          });

          switch (activeDefinition.materialConfig?.type) {
            case 'basic':
              material = new THREE.MeshBasicMaterial(materialProps);
              break;
            case 'physical':
              material = new THREE.MeshPhysicalMaterial(materialProps);
              break;
            default:
              material = new THREE.MeshStandardMaterial(materialProps);
          }
        }

        finalObject = new THREE.Mesh(result, material);
      } else {
        throw new Error('Geometry function must return THREE.BufferGeometry or THREE.Object3D');
      }

      // Add metadata
      finalObject.userData.isCustomElement = true;
      finalObject.userData.customElementId = activeDefinition.id;
      finalObject.userData.customElementName = activeDefinition.name;
      finalObject.userData.customParameters = previewParameters;

      setPreviewObject(finalObject);
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Preview generation error:', error);
      setPreviewError(`Preview Error: ${message}`);
      setPreviewObject(null);
    } finally {
      setGeneratingPreview(false);
    }
  }, [activeDefinition, previewParameters, validationErrors, setPreviewObject, setGeneratingPreview, setPreviewError]);

  // Auto-generate preview when parameters change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      generatePreview();
    }, 500); // Debounce

    return () => clearTimeout(timeoutId);
  }, [generatePreview]);

  const handleSave = () => {
    if (!activeDefinition || validationErrors.length > 0) return;

    if (editorMode === 'create') {
      createDefinition(activeDefinition);
    } else {
      updateDefinition(activeDefinition.id, activeDefinition);
    }
    
    setUnsavedChanges(false);
  };

  const handleExport = () => {
    if (!activeDefinition) return;
    
    const jsonString = JSON.stringify(activeDefinition, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDefinition.name.replace(/\s+/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      try {
        const imported = JSON.parse(content) as CustomElementDefinition;
        // Set as active definition for editing
        useCustomElementsStore.getState().setActiveDefinition(imported);
        setUnsavedChanges(true);
      } catch (error) {
        alert('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  };

  const handleParameterChange = (paramName: string, value: any) => {
    updatePreviewParameters({ ...previewParameters, [paramName]: value });
  };

  const handleDefinitionChange = (updates: Partial<CustomElementDefinition>) => {
    if (!activeDefinition) return;
    
    const updated = { ...activeDefinition, ...updates };
    useCustomElementsStore.getState().setActiveDefinition(updated);
    setUnsavedChanges(true);
  };

  if (!isOpen || !activeDefinition) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[95vw] h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {editorMode === 'create' ? 'Create Custom Element' : 'Edit Custom Element'}
            </h2>
            {unsavedChanges && (
              <div className="flex items-center space-x-1 text-orange-600">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">Unsaved changes</span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {validationErrors.length === 0 ? (
              <div className="flex items-center space-x-1 text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm">Valid</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1 text-red-600">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">{validationErrors.length} errors</span>
              </div>
            )}

            <button
              onClick={generatePreview}
              disabled={isGeneratingPreview || validationErrors.length > 0}
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-1"
            >
              {isGeneratingPreview ? (
                <RefreshCcw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span>Preview</span>
            </button>

            <button
              onClick={handleSave}
              disabled={validationErrors.length > 0}
              className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center space-x-1"
            >
              <Save className="w-4 h-4" />
              <span>Save</span>
            </button>

            <button
              onClick={handleExport}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              title="Export JSON"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              title="Import JSON"
            >
              <Upload className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {[
            { id: 'code', label: 'Code', icon: Code },
            { id: 'parameters', label: 'Parameters', icon: Settings },
            { id: 'preview', label: 'Preview', icon: Eye },
            { id: 'settings', label: 'Settings', icon: Layers }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-2 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex">
          {/* Left Panel */}
          <div className="w-1/2 flex flex-col border-r border-gray-200 dark:border-gray-700">
            {activeTab === 'code' && (
              <JsonEditor
                definition={activeDefinition}
                onChange={handleDefinitionChange}
                errors={validationErrors}
              />
            )}

            {activeTab === 'parameters' && (
              <ParameterControls
                definition={activeDefinition}
                values={previewParameters}
                onChange={handleParameterChange}
                onDefinitionChange={handleDefinitionChange}
              />
            )}

            {activeTab === 'settings' && (
              <div className="p-4 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={activeDefinition.name}
                    onChange={(e) => handleDefinitionChange({ name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <textarea
                    value={activeDefinition.description || ''}
                    onChange={(e) => handleDefinitionChange({ description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={activeDefinition.category || ''}
                    onChange={(e) => handleDefinitionChange({ category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Tags (comma separated)
                  </label>
                  <input
                    type="text"
                    value={activeDefinition.tags?.join(', ') || ''}
                    onChange={(e) => handleDefinitionChange({ 
                      tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                    })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Preview */}
          <div className="w-1/2 flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Live Preview</h3>
              {previewError && (
                <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">
                  {previewError}
                </div>
              )}
            </div>

            <div className="flex-1">
              <CustomElementPreview
                object={previewObject}
                definition={activeDefinition}
                isLoading={isGeneratingPreview}
              />
            </div>
          </div>
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-red-800 dark:text-red-300">Validation Errors:</h4>
                <ul className="mt-1 text-sm text-red-700 dark:text-red-300 list-disc list-inside">
                  {validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          className="hidden"
        />
      </div>
    </div>
  );
};
