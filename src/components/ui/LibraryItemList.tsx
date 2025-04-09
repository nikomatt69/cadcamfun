// LibraryItemList.tsx
import React from 'react';
import { LibraryItem } from 'src/components/cam/LibraryManagerUI';

interface LibraryItemListProps {
  items: LibraryItem[];
  onItemClick: (item: LibraryItem) => void;
}

const LibraryItemList: React.FC<LibraryItemListProps> = ({ items, onItemClick }) => {
  const renderItemRow = (item: LibraryItem) => {
    return (
      <tr
        key={item.id}
        className="hover:bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white p-2 m-1 items-center rounded-xl outline-bottom outline-blue-500 flex  cursor-pointer"
        onClick={() => onItemClick(item)}
      >
        <td className="px-4 py-2">{item.name}</td>
        <td className="px-4 truncate py-2">{item.description || '-'}</td>
        
      </tr>
    );
  };

  return (
    <div className="flex-1 rounded-xl  overflow-auto">
      <table className="rounded-xl ">
        <thead className='rounded-xl '>
          <tr className="bg-blue-500 flex text-white rounded-xl  uppercase text-sm leading-normal">
            <th className="px-4 rounded-xl  py-2">Nome</th>
            <th className="px-4 rounded-xl  py-2">Descrizione</th>
            
          </tr>
        </thead>
        <tbody className="text-gray-600 text-sm">
          {items.length > 0 ? (
            items.map(renderItemRow)
          ) : (
            <tr>
              <td colSpan={3} className="px-4 py-2 text-center">
                Nessun elemento trovato
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default LibraryItemList;