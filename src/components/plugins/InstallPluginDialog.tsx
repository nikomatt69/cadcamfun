// src/components/plugins/InstallPluginDialog.tsx
import React, { useState, useRef } from 'react';
import { usePluginRegistry } from '../../hooks/usePluginRegistry';
import  Dialog  from '../../components/ui/Dialog';
import { Loader, Upload, AlertCircle, CheckCircle } from 'react-feather';

interface InstallPluginDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const InstallPluginDialog: React.FC<InstallPluginDialogProps> = ({ isOpen, onClose }) => {
  const { installPlugin } = usePluginRegistry();
  const [activeTab, setActiveTab] = useState<'upload' | 'url'>('upload');
  const [url, setUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = () => {
    setIsDragging(false);
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSetFile(droppedFile);
    }
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };
  
  const validateAndSetFile = (file: File) => {
    setError(null);
    
    // Check file extension
    const validExtensions = ['.zip', '.vsix'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validExtensions.includes(fileExtension)) {
      setError(`Invalid file type. Please upload a plugin package (${validExtensions.join(' or ')})`);
      return;
    }
    
    // Check file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setError(`File too large. Maximum size is ${maxSize / (1024 * 1024)}MB`);
      return;
    }
    
    setFile(file);
  };
  
  const handleInstall = async () => {
    setError(null);
    setLoading(true);
    setSuccess(false);
    
    try {
      if (activeTab === 'upload' && file) {
        // Install from file - pass File object and type
        await installPlugin(file, 'file'); 
      } else if (activeTab === 'url' && url) {
        // Install from URL - pass URL string and type
        await installPlugin(url, 'url'); 
      } else {
        throw new Error('Please provide a plugin package file or URL');
      }
      
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };
  
  const handleClickUploadArea = () => {
    fileInputRef.current?.click();
  };
  
  // Reset state when dialog opens
  React.useEffect(() => {
    if (isOpen) {
      setActiveTab('upload');
      setFile(null);
      setUrl('');
      setError(null);
      setSuccess(false);
    }
  }, [isOpen]);
  
  return (
    <Dialog 
      isOpen={isOpen} 
      onClose={onClose}
      title="Install Plugin"
      size="md"
    >
      {/* Tab navigation */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
        <button
          className={`px-4 py-2 font-medium text-sm ${
            activeTab === 'upload'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
          onClick={() => setActiveTab('upload')}
        >
          Upload File
        </button>
        <button
          className={`px-4 py-2 font-medium text-sm ${
            activeTab === 'url'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
          onClick={() => setActiveTab('url')}
        >
          Install from URL
        </button>
      </div>
      
      <div className="mb-6">
        {activeTab === 'upload' ? (
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10'
                : file
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/10'
                  : 'border-gray-300 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClickUploadArea}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".zip,.vsix"
              className="hidden"
            />
            
            {file ? (
              <div className="flex flex-col items-center">
                <CheckCircle className="text-green-500 mb-2" size={36} />
                <span className="text-green-600 dark:text-green-400 font-medium">{file.name}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
                <button
                  className="mt-3 text-sm text-red-500 dark:text-red-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <Upload className="text-gray-400 dark:text-gray-500 mb-2" size={32} />
                <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">
                  Drop your plugin package here
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  or click to browse files (.zip or .vsix)
                </p>
              </div>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Plugin URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/plugin.zip"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:text-white"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Enter the direct download URL for the plugin package
            </p>
          </div>
        )}
      </div>
      
      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 flex items-start">
          <AlertCircle className="text-red-500 mr-2 flex-shrink-0 mt-0.5" size={16} />
          <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
        </div>
      )}
      
      {success && (
        <div className="mb-4 p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 flex items-start">
          <CheckCircle className="text-green-500 mr-2 flex-shrink-0 mt-0.5" size={16} />
          <span className="text-sm text-green-600 dark:text-green-400">
            Plugin installed successfully!
          </span>
        </div>
      )}
      
      <div className="flex justify-end space-x-3">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
        >
          Cancel
        </button>
        
        <button
          onClick={handleInstall}
          disabled={loading || success || (activeTab === 'upload' && !file) || (activeTab === 'url' && !url)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center transition-colors"
        >
          {loading ? (
            <><Loader size={16} className="animate-spin mr-2" /> Installing...</>
          ) : success ? (
            <><CheckCircle size={16} className="mr-2" /> Installed!</>
          ) : (
            'Install'
          )}
        </button>
      </div>
    </Dialog>
  );
};

export default InstallPluginDialog;