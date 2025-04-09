// LibraryItemDetails.tsx
import React from 'react';
import { LibraryItem } from '../cam/LibraryManagerUI';


interface LibraryItemDetailsProps {
  item: LibraryItem;
}

const LibraryItemDetails: React.FC<LibraryItemDetailsProps> = ({ item }) => {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">{item.name}</h2>

      {item.description && <p className="text-gray-600 mb-4">{item.description}</p>}

      {/* Dettagli specifici per categoria */}
      {item.category === 'component' && (
        <div>
          <h3 className="font-semibold mb-2">Specifiche Componente</h3>
          <ul className="space-y-1 text-sm">
            {Object.entries((item as LibraryItem).category || {}).map(([key, value]) => (
              <li key={key} className="flex justify-between">
                <span className="font-medium text-gray-700">{key}:</span>
                <span className="text-gray-600">{String(value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {item.category === 'tool' && (
        <div>
          <h3 className="font-semibold mb-2">Dettagli Utensile</h3>
          <ul className="space-y-1 text-sm">
            <li className="flex justify-between">
              <span className="font-medium text-gray-700">Tipo:</span>
              <span className="text-gray-600">{item.category}</span>
            </li>
            <li className="flex justify-between">
              <span className="font-medium text-gray-700">Diametro:</span>
              <span className="text-gray-600">{item.category} mm</span>
            </li>
            <li className="flex justify-between">
              <span className="font-medium text-gray-700">Materiale:</span>
              <span className="text-gray-600">{item.category}</span>
            </li>
          </ul>
        </div>
      )}

      {item.category === 'material' && (
        <div>
          <h3 className="font-semibold mb-2">Proprietà Materiale</h3>
          <ul className="space-y-1 text-sm">
            {Object.entries((item as LibraryItem).properties || {}).map(([key, value]) => (
              <li key={key} className="flex justify-between">
                <span className="font-medium text-gray-700">{key}:</span>
                <span className="text-gray-600">{String(value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {item.category === 'machine' && (
        <div>
          <h3 className="font-semibold mb-2">Configurazione Macchina</h3>
          <ul className="space-y-1 text-sm">
            {Object.entries((item as LibraryItem).category || {}).map(([key, value]) => (
              <li key={key} className="flex justify-between">
                <span className="font-medium text-gray-700">{key}:</span>
                <span className="text-gray-600">{JSON.stringify(value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default LibraryItemDetails;