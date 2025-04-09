import React, { useEffect, useState } from 'react';

interface DragDropIndicatorProps {
  position: {
    x: number;
    y: number;
    z: number;
  };
  screenPosition?: {
    x: number;
    y: number;
  };
}

const DragDropIndicator: React.FC<DragDropIndicatorProps> = ({ position, screenPosition }) => {
  const [visible, setVisible] = useState(true);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(prev => !prev);
    }, 400);
    
    return () => {
      clearInterval(interval);
    };
  }, []);
  
  if (!visible) return null;
  
  return (
    <div 
      className="absolute pointer-events-none z-50"
      style={screenPosition ? {
        left: `${screenPosition.x}px`,
        top: `${screenPosition.y}px`,
        transform: 'translate(-50%, -50%)'
      } : {
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)'
      }}
    >
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full border-2 border-blue-500 flex items-center justify-center">
          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
        </div>
        
        <div className="mt-2 px-2 py-1 bg-black bg-opacity-75 text-white text-xs rounded">
          {position.x.toFixed(1)}, {position.y.toFixed(1)}, {position.z.toFixed(1)}
        </div>
      </div>
    </div>
  );
};

export default DragDropIndicator;