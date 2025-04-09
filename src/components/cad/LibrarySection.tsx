import React, { useState } from 'react';
import { predefinedComponents } from '@/src/lib/predefinedLibraries';

import { useElementsStore } from 'src/store/elementsStore';
import { transformLibraryItemToCADElement } from '@/src/lib/libraryTransform';

// Modifica la firma del componente LibrarySection
export interface LibrarySectionProps {
  mode: 'cad' | 'cam';
  onSelectComponent?: (component: any) => void;
}

const LibrarySection: React.FC<LibrarySectionProps> = ({ mode, onSelectComponent }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'components' | 'tools' | 'materials'>('components');
  const [previewComponent, setPreviewComponent] = useState<any | null>(null);

  // Filtra i componenti in base alla query di ricerca
  const filteredComponents = predefinedComponents.filter(component => 
    component.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (component.description && component.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleComponentSelect = (component: any) => {
    if (mode === 'cad') {
      // Prima di aggiungere, imposta l'anteprima
      setPreviewComponent(component);
      
      try {
        // Trasforma il componente in un elemento CAD
        const cadElement = transformLibraryItemToCADElement({
          ...component,
          category: 'component'
        });
        
        // Aggiungi l'elemento al CAD
        const elementId = useElementsStore.getState().addElement(cadElement);
        
        // Se è stato passato un callback, chiamalo con il componente
        if (onSelectComponent) {
          onSelectComponent(component);
        }
        
        console.log(`Componente aggiunto al CAD con ID: ${elementId}`);
      } catch (error) {
        console.error('Impossibile aggiungere il componente al CAD:', error);
        alert('Impossibile aggiungere il componente');
      }
    }
  };

  return (
    <div className="library-section">
      <div className="mb-4">
        <input 
          type="text"
          placeholder="Cerca componenti..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {filteredComponents.map((component) => (
          <div 
            key={component.name}
            className="p-2 border rounded-md hover:bg-gray-100 cursor-pointer"
            onClick={() => handleComponentSelect(component)}
          >
            <div className="text-sm font-medium">{component.name}</div>
            {component.description && (
              <div className="text-xs text-gray-500">{component.description}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default LibrarySection;