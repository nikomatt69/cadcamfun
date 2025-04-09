// src/components/ui/LoadingScreen.tsx
import React from 'react';
import { motion } from 'framer-motion';
import Loading from './Loading';

interface LoadingScreenProps {
  message?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ message = 'Loading...' }) => {
  return (
    <motion.div
      className="fixed inset-0 flex flex-col items-center justify-center z-50 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white bg-opacity-80"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="relative w-24 h-24">
        <motion.div
          className="absolute inset-0 border-4 border-blue-200 rounded-full"
          initial={{ opacity: 0.2 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, repeat: Infinity, repeatType: 'reverse' }}
        />
        <motion.div
          className="absolute inset-0 border-4 border-t-blue-500 border-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, ease: "linear", repeat: Infinity }}
        />
      </div>
      <motion.p
        className="mt-4 text-lg font-medium text-gray-700"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <Loading/>
      </motion.p>
    </motion.div>
  );
};

export default LoadingScreen;