// src/components/ui/AnimatedCard.tsx
import React, { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface AnimatedCardProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  onClick?: () => void;
  isMobile?: boolean;
}

const AnimatedCard: React.FC<AnimatedCardProps> = ({ 
  children, 
  className = '',
  delay = 0,
  onClick,
  isMobile = false
}) => {
  // Different animation settings based on device
  const animationSettings = {
    initial: { y: 20, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: { 
      type: "spring", 
      stiffness: isMobile ? 200 : 300,  // Reduce stiffness on mobile
      damping: 24, 
      delay 
    },
    // Disable hover animation on mobile for better performance
    whileHover: isMobile ? {} : { 
      y: -5, 
      boxShadow: "0px 10px 20px rgba(0, 0, 0, 0.1)" 
    },
    // Add tap animation for mobile
    whileTap: isMobile ? { scale: 0.98 } : {}
  };
  
  return (
    <motion.div
      {...animationSettings}
      onClick={onClick}
      className={`bg-[#F8FBFF] dark:bg-gray-700 dark:text-white shadow-md rounded-md overflow-hidden ${className}`}
    >
      {children}
    </motion.div>
  );
};

export default AnimatedCard;