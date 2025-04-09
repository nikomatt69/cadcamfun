import React, { useState } from 'react';
import { Download, Upload, Share2 } from 'react-feather';
import toast from 'react-hot-toast';
import { useRouter } from 'next/router';
import { useRef } from 'react';

interface ExportImportToolpathsControlsProps {
  entityType: string;
}

const ExportImportToolpathsControls: React.FC<ExportImportToolpathsControlsProps> = ({ entityType }) => {
  const router = useRouter();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'json' | 'zip'>('json');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle export
  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      // Create the export URL with the selected format
      const url = `/api/${entityType}/export-import?format=${exportFormat}`;
      
      // Trigger the download
      window.location.href = url;
      
      toast.success(`Exporting ${entityType} as ${exportFormat.toUpperCase()}`);
    } catch (error) {
      console.error(`Error exporting ${entityType}:`, error);
      toast.error(`Failed to export ${entityType}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Handle import from file
  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsImporting(true);
    
    try {
      // Get project ID for import
      const projectId = router.query.projectId as string;
      
      if (!projectId) {
        toast.error('Please select a project first');
        return;
      }
      
      // Read the file
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        try {
          const fileContent = event.target?.result;
          
          // Parse the file content
          let importData;
          
          if (file.name.endsWith('.json')) {
            importData = JSON.parse(fileContent as string);
          } else if (file.name.endsWith('.gcode') || file.name.endsWith('.nc')) {
            // For G-code files, create a minimal import structure
            importData = {
              name: file.name.split('.')[0],
              gcode: fileContent,
              type: 'mill',
              operationType: 'contour'
            };
          } else {
            toast.error('Unsupported file format. Please upload JSON or G-code files.');
            return;
          }
          
          // Send the import request
          const response = await fetch(`/api/${entityType}/export-import`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              projectId,
              data: importData,
              importMode: 'create'
            }),
          });
          
          if (!response.ok) {
            throw new Error('Import failed');
          }
          
          const result = await response.json();
          
          toast.success(`Imported ${result.created.length} ${entityType}`);
          
          // Refresh the page to show the imported items
          router.reload();
        } catch (error) {
          console.error(`Error processing import file:`, error);
          toast.error('Failed to process import file');
        } finally {
          setIsImporting(false);
        }
      };
      
      reader.onerror = () => {
        toast.error('Error reading file');
        setIsImporting(false);
      };
      
      reader.readAsText(file);
    } catch (error) {
      console.error(`Error importing ${entityType}:`, error);
      toast.error(`Failed to import ${entityType}`);
      setIsImporting(false);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:justify-between items-center">
      <div className="mb-4 sm:mb-0">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Import/Export Tools</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Share your {entityType} between projects or with other users
        </p>
      </div>
      
      <div className="flex space-x-4">
        <div className="flex items-center">
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as 'json' | 'zip')}
            className="mr-2 p-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-sm"
          >
            <option value="json">JSON</option>
            <option value="zip">ZIP (with G-code)</option>
          </select>
          
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center"
          >
            <Download size={16} className="mr-2" />
            Export
          </button>
        </div>
        
        <button
          onClick={handleImportClick}
          disabled={isImporting}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center"
        >
          <Upload size={16} className="mr-2" />
          Import
        </button>
        
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept=".json,.gcode,.nc"
          className="hidden"
        />
      </div>
    </div>
  );
};

export default ExportImportToolpathsControls;