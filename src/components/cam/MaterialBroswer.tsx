// src/components/cam/MaterialBrowser.tsx
import React, { useState } from 'react';
import { Grid, ChevronDown, ChevronUp } from 'react-feather';
import { MaterialItem } from '@/src/hooks/useLocalLibraries';
import LocalMaterialLibrary from '../library/LocalMaterialLibrary';
import { useCAMStore } from '@/src/store/camStore';

const MaterialBrowser: React.FC = () => {
  const [expanded, setExpanded] = useState(true);
  const { addItem } = useCAMStore();

  const handleSelectMaterial = (material: MaterialItem) => {
    // Add material to CAM environment
    addItem({
      name: material.name,
      type: 'workpiece',
      details: {
        ...material,
        type: 'material'
      }
    });
  };

  return (
    <div className="border rounded-md overflow-hidden bg-white mb-4">
      <div 
        className="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center">
          <Grid size={16} className="mr-2 text-amber-600" />
          <span className="font-medium">Material Local Library</span>
        </div>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </div>
      
      {expanded && (
        <div className="max-h-60 overflow-y-auto">
          <LocalMaterialLibrary onSelectMaterial={handleSelectMaterial} />
        </div>
      )}
    </div>
  );
};

export default MaterialBrowser;