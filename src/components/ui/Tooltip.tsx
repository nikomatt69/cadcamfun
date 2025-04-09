// src/components/ui/Tooltip.tsx
import React, { useState } from 'react';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  delay = 300,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipTimeout, setTooltipTimeout] = useState<NodeJS.Timeout | null>(null);

  const showTooltip = () => {
    const timeout = setTimeout(() => {
      setIsVisible(true);
    }, delay);
    setTooltipTimeout(timeout);
  };

  const hideTooltip = () => {
    if (tooltipTimeout) {
      clearTimeout(tooltipTimeout);
      setTooltipTimeout(null);
    }
    setIsVisible(false);
  };

  // Position classes
  const positionClasses = {
    top: 'bottom-full left-1/2 transform -translate-x-1/2 -translate-y-2 mb-1',
    bottom: 'top-full left-1/2 transform -translate-x-1/2 translate-y-2 mt-1',
    left: 'right-full top-1/2 transform -translate-y-1/2 -translate-x-2 mr-1',
    right: 'left-full top-1/2 transform -translate-y-1/2 translate-x-2 ml-1',
  };

  // Arrow classes
  const arrowClasses = {
    top: 'bottom-0 left-1/2 transform translate-y-full -translate-x-1/2 border-t-gray-700 dark:border-t-gray-800 border-l-transparent border-r-transparent border-b-transparent',
    bottom: 'top-0 left-1/2 transform -translate-y-full -translate-x-1/2 border-b-gray-700 dark:border-b-gray-800 border-l-transparent border-r-transparent border-t-transparent',
    left: 'right-0 top-1/2 transform translate-x-full -translate-y-1/2 border-l-gray-700 dark:border-l-gray-800 border-t-transparent border-b-transparent border-r-transparent',
    right: 'left-0 top-1/2 transform -translate-x-full -translate-y-1/2 border-r-gray-700 dark:border-r-gray-800 border-t-transparent border-b-transparent border-l-transparent',
  };

  return (
    <div className="relative inline-block" onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
      {children}
      
      {isVisible && (
        <div
          className={`absolute z-50 px-2 py-1 text-xs font-medium text-white bg-gray-700 dark:bg-gray-800 rounded shadow-sm whitespace-nowrap pointer-events-none ${
            positionClasses[position]
          } ${className}`}
        >
          {content}
          <div
            className={`absolute w-0 h-0 border-4 ${arrowClasses[position]}`}
          />
        </div>
      )}
    </div>
  );
};

export default Tooltip;