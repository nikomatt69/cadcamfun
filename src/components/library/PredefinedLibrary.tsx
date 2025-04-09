// src/components/library/PredefinedLibrary.tsx

import React from 'react';
import { predefinedComponents, predefinedMachineConfigs, predefinedMaterials, predefinedTools } from '../../lib/predefinedLibraries';
import { Tool, Material, Component } from '../../types/mainTypes';
import { Package, Box, Disc, Tool as ToolIcon, Layers, Plus, Book } from 'react-feather';

interface PredefinedLibraryProps {
  libraryType: 'components' | 'materials' | 'tools' | 'machines';
  onSelectItem: (item: any) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function PredefinedLibrary({ 
  libraryType, 
  onSelectItem, 
  isOpen, 
  onClose 
}: PredefinedLibraryProps) {
  if (!isOpen) return null;

  const getLibraryItems = () => {
    switch (libraryType) {
      case 'components':
        return predefinedComponents;
      case 'materials':
        return predefinedMaterials;
        case 'machines':
          return predefinedMachineConfigs;  
      case 'tools':
        return predefinedTools;
      default:
        return [];
    }
  };

  const getLibraryTitle = () => {
    switch (libraryType) {
      case 'components':
        return 'Standard Components';
      case 'materials':
        return 'Standard Materials';
        case 'machines':
          return 'Standard MachineConfig';  
      case 'tools':
        return 'Standard Tools';
      default:
        return 'Library';
    }
  };

  const getIcon = (item: any, type: string) => {
    if (type === 'components') {
      const itemType = item.data?.type || '';
      
      if (itemType === 'cube') return <Box size={36} className="text-blue-500" />;
      if (itemType === 'cylinder') return <Disc size={36} className="text-green-500" />;
      if (itemType === 'polygon') return <Layers size={36} className="text-orange-500" />;
      
      return <Package size={36} className="text-gray-500" />;
    }
    
    if (type === 'materials') {
      return (
        <div 
          className="w-9 h-9 rounded-md border border-gray-300"
          style={{ backgroundColor: item.properties.color || '#ccc' }}
        ></div>
      );
    }
    if (type === 'machines') {
      const machineType = item.type || '';
      
      if (machineType === 'mill') return <Book size={36} className="text-blue-500" />;
      if (machineType === 'lathe') return <Book size={36} className="text-green-500" />;
   
      
      return <ToolIcon size={36} className="text-gray-500" />;
    }
    if (type === 'tools') {
      const toolType = item.type || '';
      
      if (toolType === 'endmill') return <ToolIcon size={36} className="text-blue-500" />;
      if (toolType === 'drillbit') return <ToolIcon size={36} className="text-green-500" />;
      if (toolType === 'facemill') return <ToolIcon size={36} className="text-orange-500" />;
      
      return <ToolIcon size={36} className="text-gray-500" />;
    }
    
    return <Package size={36} className="text-gray-500" />;
  };

  const renderItem = (item: any, index: number) => {
    return (
      <div 
        key={index} 
        className="p-4 border rounded-md bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white hover:shadow-md transition-shadow cursor-pointer"
        onClick={() => onSelectItem(item)}
      >
        <div className="flex items-center mb-3">
          <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 bg-gray-100 rounded-md mr-3">
            {getIcon(item, libraryType)}
          </div>
          <div className="flex-1">
            <h3 className="text-md font-medium text-gray-900">{item.name}</h3>
            <p className="text-xs text-gray-500">
              {libraryType === 'tools' ? item.type : (item.data?.type || '')}
            </p>
          </div>
        </div>
        
        {item.description && (
          <p className="text-sm text-gray-600 mb-2 line-clamp-2">{item.description}</p>
        )}
        
        <div className="mt-2 flex flex-wrap gap-1">
          {libraryType === 'materials' && (
            <>
              <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full">
                Density: {item.properties.density} g/cm³
              </span>
              <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full">
                Hardness: {item.properties.hardness}
              </span>
            </>
          )}

           {libraryType === 'machines' && (
            <>
              <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full">
                {item.type} Type
              </span>
              {item.machine && (
                <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full">
                  {item.machine} Macchina
                </span>
              )}
              <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full">
                {item.name}
              </span>
            </>
          )}
          
          {libraryType === 'tools' && (
            <>
              <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full">
                ⌀{item.diameter}mm
              </span>
              {item.numberOfFlutes && (
                <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full">
                  {item.numberOfFlutes} flutes
                </span>
              )}
              <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full">
                {item.material}
              </span>
            </>
          )}
          
          {libraryType === 'components' && item.data?.specifications && (
            Object.entries(item.data.specifications)
              .slice(0, 2)
              .map(([key, value], i) => (
                <span key={i} className="px-2 py-0.5 text-xs bg-gray-100 rounded-full">
                  {key}: {value as string}
                </span>
              ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-medium text-gray-900">
            {getLibraryTitle()}
          </h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {getLibraryItems().map((item, index) => renderItem(item, index))}
          </div>
        </div>
        
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}