// src/components/cam/CamLibraries.tsx
import React from 'react';
import MaterialBrowser from './MaterialBroswer';
import ToolBrowser from './ToolBroswer';


const CamLibraries: React.FC = () => {
  return (
    <div className="space-y-4">
      <MaterialBrowser />
      <ToolBrowser />
    </div>
  );
};

export default CamLibraries;