import type { FC } from 'react';
import { useState, useCallback, useEffect } from 'react';
import { Cpu } from 'react-feather';
import BottomSheet from '../layout/BottomSheet';
import { AIHub } from '../ai/ai-new';

type Props = {
  // Add any props if needed
};

const AIBottomSheet: FC<Props> = () => {
  const [isOpen, setIsOpen] = useState(false);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    // Ensure body overflow is restored
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, []);

  return (
    <div className="flex items-center justify-center flex-col gap-1">
      <button 
        type="button" 
        onClick={handleOpen}
        className="focus:outline-none"
      >
        <div className="px-3 py-1.5 bg-pink-50 dark:bg-pink-900 border border-pink-300 dark:border-pink-700 hover:bg-pink-100 dark:hover:bg-pink-800 text-pink-700 dark:text-pink-300 rounded-md shadow-sm flex items-center animate-pulse">
          <Cpu className="h-4 w-4" />
          <span className="text-sm px-1">AI</span>
        </div>
      </button>

      <BottomSheet 
        isOpen={isOpen} 
        onClose={handleClose}
        height="68vh"
        
        className="bg-gray-100 border-2 w-90 dark:bg-gray-900"
      >
        <div className="flex flex-col h-full">
          <div className="text-lg font-semibold p-4 border-b border-gray-300 dark:border-gray-700">
            AI Assistant
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {isOpen && <AIHub />}
          </div>
        </div>
      </BottomSheet>
    </div>
  );
};

export default AIBottomSheet; 