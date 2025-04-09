// src/components/ai/ContextPanel.tsx
import React, { useState, useRef } from 'react';
import { File, Trash2, Check, Upload, Info, X } from 'react-feather';
import { useContextStore, ContextFile } from '@/src/store/contextStore';

interface ContextPanelProps {
  className?: string;
  onToggle?: () => void;
  isExpanded: boolean;
}

const ContextPanel: React.FC<ContextPanelProps> = ({
  className = '',
  onToggle,
  isExpanded
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  const { 
    contextFiles, 
    activeContextIds, 
    addContextFile, 
    removeContextFile, 
    toggleContextActive,
    clearAllContexts
  } = useContextStore();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    setUploadError(null);
    
    try {
      for (let i = 0; i < files.length; i++) {
        await addContextFile(files[i]);
      }
      // Reset the input value to allow uploading the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error adding context file:', error);
      setUploadError('Si è verificato un errore durante il caricamento del file.');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setUploadError(null);
    
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    
    try {
      for (let i = 0; i < files.length; i++) {
        await addContextFile(files[i]);
      }
    } catch (error) {
      console.error('Error adding context file:', error);
      setUploadError('Si è verificato un errore durante il caricamento del file.');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };

  if (!isExpanded) {
    return (
      <button
        onClick={onToggle}
        className="flex items-center justify-center p-2 bg-blue-100 hover:bg-blue-200 dark:bg-blue-800/30 dark:hover:bg-blue-800/50 text-blue-700 dark:text-blue-300 rounded-md transition-colors"
      >
        <File size={16} className="mr-2" />
        <span className="text-sm font-medium">Mostra Contesto</span>
        {activeContextIds.length > 0 && (
          <span className="ml-1 bg-blue-600 text-white dark:bg-blue-500 text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {activeContextIds.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow p-4 ${className}`}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
          <File className="mr-2" size={20} />
          Contesto AI
        </h2>
        <button
          onClick={onToggle}
          className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          aria-label="Chiudi pannello contesto"
        >
          <X size={20} />
        </button>
      </div>

      <div className="space-y-4">
        {/* Informazioni sul contesto */}
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
          <div className="flex">
            <Info size={18} className="text-blue-500 flex-shrink-0 mt-0.5 mr-2" />
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Aggiungi documenti o file di testo per fornire contesto aggiuntivo all IA per migliorare la generazione dei modelli CAD.
            </p>
          </div>
        </div>

        {/* Upload area */}
        <div
          className={`border-2 border-dashed rounded-md p-4 text-center transition-colors ${
            dragActive
              ? 'border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20'
              : 'border-gray-300 dark:border-gray-600'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload size={24} className="mx-auto text-gray-400 dark:text-gray-500 mb-2" />
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Trascina qui i file o
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileChange}
            className="hidden"
            id="context-file-input"
            accept=".txt,.pdf,.doc,.docx,.md,.json"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
          >
            Seleziona File
          </button>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Formati supportati: TXT, PDF, DOC, DOCX, MD, JSON
          </p>
        </div>

        {uploadError && (
          <div className="p-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm rounded-md">
            {uploadError}
          </div>
        )}

        {/* Lista file */}
        {contextFiles.length > 0 ? (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                File di contesto ({contextFiles.length})
              </h3>
              <button
                onClick={clearAllContexts}
                className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
              >
                Rimuovi tutto
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto pr-1 space-y-2">
              {contextFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex justify-between items-center p-2 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => toggleContextActive(file.id)}
                      className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                        activeContextIds.includes(file.id)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                      aria-label={activeContextIds.includes(file.id) ? 'Disattiva file' : 'Attiva file'}
                    >
                      {activeContextIds.includes(file.id) && <Check size={14} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatFileSize(file.size)} • {new Date(file.dateAdded).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => removeContextFile(file.id)}
                    className="p-1 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                    aria-label="Rimuovi file"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ContextPanel;