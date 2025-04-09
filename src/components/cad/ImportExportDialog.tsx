import React, { useState, useEffect } from 'react';
import { Save, Upload, X, FileText, Database, FolderPlus } from 'react-feather';
import { useElementsStore } from 'src/store/elementsStore';
import SaveCADAsProjectModal from './SaveCADAsProjectModal';

interface ImportExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'import' | 'export';
}

export default function ImportExportDialog({
  isOpen,
  onClose,
  mode
}: ImportExportDialogProps) {
  const [fileName, setFileName] = useState('cad-drawing');
  const [fileFormat, setFileFormat] = useState('json');
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string }>>([]);
  
  const { elements, selectedElement } = useElementsStore();
  
  // Get user organizations when dialog opens
  useEffect(() => {
    if (isOpen && mode === 'export') {
      fetchOrganizations();
    }
  }, [isOpen, mode]);
  
  // Function to fetch user organizations
  const fetchOrganizations = async () => {
    try {
      const response = await fetch('/api/organizations');
      if (response.ok) {
        const data = await response.json();
        setOrganizations(data);
      }
    } catch (error) {
      console.error('Failed to fetch organizations:', error);
    }
  };
  
  // Handle file export
  const handleExport = () => {
    // Create the data to export
    const exportData = {
      elements,
      selectedElementId: selectedElement?.id,
      metadata: {
        created: new Date().toISOString(),
        version: '1.0',
        application: 'CAD/CAM FUN'
      }
    };
    
    // Convert to JSON
    const jsonData = JSON.stringify(exportData, null, 2);
    
    // Create a Blob and download
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.${fileFormat}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    onClose();
  };
  
  // Handle file import
  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const jsonData = JSON.parse(event.target?.result as string);
        
        // Update elements store with imported data
        if (jsonData.elements && Array.isArray(jsonData.elements)) {
          useElementsStore.getState().addElements(jsonData.elements);
          
          // Select the previously selected element if it exists in the imported data
          if (jsonData.selectedElementId) {
            useElementsStore.getState().selectElement(jsonData.selectedElementId);
          }
          
          onClose();
        } else {
          alert('Invalid file format. Could not find elements array.');
        }
      } catch (error) {
        console.error('Error parsing file:', error);
        alert('Failed to parse file. Make sure it is a valid JSON file.');
      }
    };
    
    reader.readAsText(file);
  };
  
  if (!isOpen) return null;
  
  return (
    <>
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
          <div className="px-6 py-4 border-b flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900">
              {mode === 'export' ? 'Export Drawing' : 'Import Drawing'}
            </h3>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="px-6 py-4">
            {mode === 'export' ? (
              <>
                <div className="mb-4">
                  <label htmlFor="fileName" className="block text-sm font-medium text-gray-700 mb-1">
                    File Name
                  </label>
                  <input
                    type="text"
                    id="fileName"
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div className="mb-4">
                  <label htmlFor="fileFormat" className="block text-sm font-medium text-gray-700 mb-1">
                    File Format
                  </label>
                  <select
                    id="fileFormat"
                    value={fileFormat}
                    onChange={(e) => setFileFormat(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="json">JSON (.json)</option>
                    <option value="cad">CAD/CAM FUN Format (.cad)</option>
                  </select>
                </div>
                
                <div className="bg-blue-50 rounded-md p-4 flex items-start mb-4">
                  <div className="flex-shrink-0">
                    <FolderPlus className="h-5 w-5 text-blue-400" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-blue-800">Save as Project</h3>
                    <div className="mt-2 text-sm text-blue-700">
                      <p>
                        You can also save this drawing as a new project to organize it better 
                        and collaborate with others.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowProjectModal(true)}
                        className="mt-1 text-blue-600 hover:text-blue-500 font-medium"
                      >
                        Save as Project
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select File
                  </label>
                  <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                    <div className="space-y-1 text-center">
                      <Upload className="mx-auto h-12 w-12 text-gray-400" />
                      <div className="flex text-sm text-gray-600">
                        <label
                          htmlFor="file-upload"
                          className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                        >
                          <span>Upload a file</span>
                          <input
                            id="file-upload"
                            name="file-upload"
                            type="file"
                            accept=".json,.cad"
                            className="sr-only"
                            onChange={handleFileSelection}
                          />
                        </label>
                        <p className="pl-1">or drag and drop</p>
                      </div>
                      <p className="text-xs text-gray-500">
                        JSON or CAD/CAM FUN files
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-yellow-50 rounded-md p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-yellow-800">
                        Attention
                      </h3>
                      <div className="mt-2 text-sm text-yellow-700">
                        <p>
                          Importing a file will replace your current drawing. 
                          Make sure to save your work before importing.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          
          <div className="px-6 py-4 bg-gray-50 flex justify-end space-x-3 rounded-b-lg">
            <button
              type="button"
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              onClick={onClose}
            >
              Cancel
            </button>
            
            {mode === 'export' && (
              <button
                type="button"
                onClick={handleExport}
                className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <span className="flex items-center">
                  <Save size={18} className="mr-1.5" />
                  Export File
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Save As Project Modal */}
      {showProjectModal && (
        <SaveCADAsProjectModal
          isOpen={showProjectModal}
          onClose={() => setShowProjectModal(false)}
          organizations={organizations}
        />
      )}
    </>
  );
}