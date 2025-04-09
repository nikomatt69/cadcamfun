// src/components/cam/ToolBrowser.tsx
import React, { useState } from 'react';
import { Tool, ChevronDown, ChevronUp } from 'react-feather';
import { ToolItem } from '@/src/hooks/useLocalLibraries';
import LocalToolLibrary from '../library/LocalToolLibrary';
import { useCAMStore } from '@/src/store/camStore';

const ToolBrowser: React.FC = () => {
  const [expanded, setExpanded] = useState(true);
  const { addItem } = useCAMStore();

  const handleSelectTool = (tool: ToolItem) => {
    // Add tool to CAM environment
    addItem({
      name: tool.name,
      type: 'tool',
      details: {
        ...tool,
        type: tool.type || 'endmill'
      }
    });
  };

  return (
    <div className="border rounded-md overflow-hidden bg-white">
      <div 
        className="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center">
          <Tool size={16} className="mr-2 text-green-600" />
          <span className="font-medium">Tool Local Library</span>
        </div>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </div>
      
      {expanded && (
        <div className="max-h-80 overflow-y-auto">
          <LocalToolLibrary onSelectTool={handleSelectTool} />
        </div>
      )}
    </div>
  );
};

export default ToolBrowser;