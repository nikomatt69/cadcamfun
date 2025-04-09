// LibraryItemModal.tsx
import React from 'react';
import { LibraryItem } from 'src/components/cam/LibraryManagerUI';
import LibraryItemDetails from './LibraryItemDetails';
import LibraryItemPreview from './LibraryItemPreview';

interface LibraryItemModalProps {
  item: LibraryItem | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToCAD: (item: LibraryItem) => void;
}

const LibraryItemModal: React.FC<LibraryItemModalProps> = ({
  item,
  isOpen,
  onClose,
  onAddToCAD,
}) => {
  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="fixed inset-0 bg-black opacity-50" onClick={onClose}></div>
      <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-lg shadow-lg p-6 max-w-4xl w-full z-10">
        <div className="flex">
          {/* Anteprima 3D */}
          <div className="w-1/2 pr-4">
            <LibraryItemPreview item={item} />
          </div>

          {/* Dettagli elemento */}
          <div className="w-1/2">
            <LibraryItemDetails item={item} />

            {/* Bottone Aggiungi al CAD */}
            {item.category === 'component' && (
              <div className="mt-4">
                <button
                  onClick={() => {
                    onAddToCAD(item);
                    onClose();
                  }}
                  className="w-full bg-blue-500 text-white py-2 rounded-md hover:bg-blue-600 transition-colors"
                >
                  Aggiungi al CAD
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LibraryItemModal;