// src/components/ui/Dropdown.tsx
import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  width?: string;
}

const Dropdown: React.FC<DropdownProps> = ({ 
  trigger, 
  children, 
  align = 'left',
  width = '12rem'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div onClick={toggleDropdown} className="cursor-pointer">
        {trigger}
      </div>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="absolute z-50 mt-2 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-md shadow-lg py-1 focus:outline-none"
            style={{ 
              width, 
              [align === 'left' ? 'left' : 'right']: 0 
            }}
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dropdown;