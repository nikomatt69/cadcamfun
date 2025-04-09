import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence, useAnimation, PanInfo } from 'framer-motion';
import { useRouter } from 'next/router';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  height?: string;
  snapPoints?: string[];
  className?: string;
}

const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  children,
  height = '50vh',
  snapPoints = [],
  className = '',
}) => {
  const controls = useAnimation();
  const sheetRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  
  useEffect(() => {
    const handleRouteChange = () => {
      if (isOpen) onClose();
    };
    
    router.events.on('routeChangeStart', handleRouteChange);
    return () => {
      router.events.off('routeChangeStart', handleRouteChange);
    };
  }, [isOpen, onClose, router.events]);
  
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEscKey);
    return () => {
      window.removeEventListener('keydown', handleEscKey);
    };
  }, [isOpen, onClose]);
  
  useEffect(() => {
    if (isOpen) {
      controls.start('visible');
    } else {
      controls.start('hidden');
    }
  }, [isOpen, controls]);
  
  const handleDragEnd = (_: any, info: PanInfo) => {
    const threshold = 100;
    if (info.offset.y > threshold) {
      onClose();
    } else {
      controls.start('visible');
    }
  };
  
  const sheetVariants = {
    hidden: { y: '100%' },
    visible: { 
      y: 0,
      transition: { 
        type: 'spring', 
        damping: 30, 
        stiffness: 300,
        mass: 0.8
      } 
    },
  };
  
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={sheetRef}
          className={`fixed bottom-0 left-1 right-1 z-50 bg-white rounded-t-2xl shadow-lg overflow-hidden ${className} md:left-10 md:right-10`}
          style={{ height, touchAction: 'none' }}
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={sheetVariants}
          drag="y"
          dragConstraints={{ top: 0 }}
          dragElastic={0.1}
          onDragEnd={handleDragEnd}
          dragDirectionLock
        >
          <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto my-3" />
          <div className="max-h-full overflow-y-auto">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BottomSheet;