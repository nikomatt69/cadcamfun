// src/components/drawings/ProjectDrawingsList.tsx

import React, { useState, useEffect } from 'react';
import { useProjectDrawings } from 'src/hooks/useDrawings';
import { File, Grid, Edit, Trash2, Copy, Download, Plus, AlertCircle, Tool, List } from 'react-feather';
import Link from 'next/link';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { Drawing } from '@/src/types/mainTypes';
import Metatags from '@/src/components/layout/Metatags';
import { cn } from '@/src/lib/utils';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { 
      staggerChildren: 0.08,
      delayChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { 
    y: 0, 
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 24
    }
  }
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5 } }
};

interface ProjectDrawingsListProps {
  projectId: string;
}

export default function ProjectDrawingsList({ projectId }: ProjectDrawingsListProps) {
  // State for the modal
  const [showModal, setShowModal] = useState(false);
  const [selectedDrawing, setSelectedDrawing] = useState<Drawing | null>(null);
  const [drawingName, setDrawingName] = useState('');
  const [drawingDescription, setDrawingDescription] = useState('');
  const { data: session, status } = useSession();
 
  // Fetch project drawings using our custom hook
  const { 
    drawings, 
    isLoading, 
    error, 
    refreshDrawings, 
    addDrawing 
  } = useProjectDrawings(projectId);
  
  // Reset form when modal opens/closes
  useEffect(() => {
    if (!showModal) {
      setDrawingName('');
      setDrawingDescription('');
      setSelectedDrawing(null);
    } else if (selectedDrawing) {
      setDrawingName(selectedDrawing.name);
      setDrawingDescription(selectedDrawing.description || '');
    }
  }, [showModal, selectedDrawing]);
  const router = useRouter(); 
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }
  // Handle drawing creation
  const handleCreateDrawing = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const drawingData = {
        name: drawingName,
        description: drawingDescription
      };
      
      const newDrawing = await addDrawing(drawingData as any);
      setShowModal(false);
      
      // Navigate to CAD editor with the new drawing
      if (newDrawing?.id) {
        window.location.href = `/cad?drawingId=${newDrawing.id}`;
      }
    } catch (error) {
      console.error('Failed to create drawing:', error);
      alert('Failed to create drawing. Please try again.');
    }
  };
  
  // Handle opening the edit modal
  const handleEditClick = (drawing: Drawing, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDrawing(drawing);
    setShowModal(true);
  };
  
  // Handle drawing duplication
  const handleDuplicateDrawing = async (drawing: Drawing, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await addDrawing({
        name: `${drawing.name} (Copy)`,
        description: drawing?.description || "",
        data: drawing.data,
        thumbnail: drawing.thumbnail || ""
      });
      
      // Refresh the drawings list
      await refreshDrawings();
    } catch (error) {
      console.error('Failed to duplicate drawing:', error);
      alert('Failed to duplicate drawing. Please try again.');
    }
  };
  
  // Handle drawing deletion
  const handleDeleteDrawing = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this drawing?')) return;
    
    try {
      // Here we would call the delete function from our hooks
      // For now, let's just refresh the drawings list
      await refreshDrawings();
    } catch (error) {
      console.error('Failed to delete drawing:', error);
      alert('Failed to delete drawing. Please try again.');
    }
  };
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };
  
  return (
    <MotionConfig reducedMotion="user">
      <div className="my-6 px-4 md:px-0 max-w-7xl mx-auto">
        <Metatags title={'Drawings'} />
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-3">
          <motion.h2 
            className="text-xl font-semibold text-gray-900 dark:text-white"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            Project Drawings
          </motion.h2>
          <motion.button
            onClick={() => {
              setSelectedDrawing(null);
              setShowModal(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-center shadow-sm"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <Plus size={16} className="mr-1.5" />
            New Drawing
          </motion.button>
        </div>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
              className="w-12 h-12 border-4 border-blue-200 dark:border-blue-900 rounded-full border-t-blue-600 dark:border-t-blue-500"
            />
          </div>
        ) : error ? (
          <motion.div 
            className="bg-red-50 dark:bg-red-900/20 rounded-lg p-6 text-center shadow-sm"
            variants={fadeIn}
            initial="hidden"
            animate="visible"
          >
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 mx-auto flex items-center justify-center mb-4">
              <AlertCircle size={30} className="text-red-500 dark:text-red-400" />
            </div>
            <h3 className="text-lg font-medium text-red-800 dark:text-red-300 mb-2">Error Loading Drawings</h3>
            <p className="text-red-600 dark:text-red-400 mb-4">{error.toString()}</p>
            <motion.button
              onClick={() => refreshDrawings()}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Try Again
            </motion.button>
          </motion.div>
        ) : drawings.length === 0 ? (
          <motion.div 
            className="bg-white dark:bg-gray-900 shadow-md rounded-lg p-6 text-center"
            variants={fadeIn}
            initial="hidden"
            animate="visible"
          >
            <motion.div 
              className="mx-auto w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4"
              whileHover={{ scale: 1.05, rotate: 5 }}
            >
              <File size={36} className="text-gray-400 dark:text-gray-500" />
            </motion.div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No drawings yet</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
              Create your first drawing to start designing in the CAD editor.
            </p>
            <motion.button
              onClick={() => setShowModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Create Drawing
            </motion.button>
          </motion.div>
        ) : (
          <motion.div 
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {drawings.map((drawing, index) => (
              <motion.div
                key={drawing.id}
                variants={itemVariants}
                custom={index}
                className="bg-white dark:bg-gray-900 shadow-md rounded-lg overflow-hidden cursor-pointer border border-gray-100 dark:border-gray-800 group"
                whileHover={{ y: -4, boxShadow: "0 12px 24px -10px rgba(0, 0, 0, 0.15)" }}
                onClick={() => window.location.href = `/cad?drawingId=${drawing.id}`}
              >
                <div className="h-40 sm:h-48 bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden relative">
                  {drawing.thumbnail ? (
                    <motion.img 
                      src={drawing.thumbnail} 
                      alt={drawing.name} 
                      className="h-full w-full object-contain"
                      initial={{ scale: 1 }}
                      whileHover={{ scale: 1.05 }}
                      transition={{ duration: 0.3 }}
                    />
                  ) : (
                    <motion.div
                      whileHover={{ rotate: 10, scale: 1.1 }}
                      className="p-6 bg-gray-200 dark:bg-gray-900 rounded-full"
                    >
                      <Grid size={36} className="text-gray-400 dark:text-gray-500" />
                    </motion.div>
                  )}
                  
                  {/* Overlay for hover effect */}
                  <motion.div 
                    className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
                    initial={{ opacity: 0 }}
                    whileHover={{ opacity: 1 }}
                  />
                </div>
                <div className="p-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {drawing.name}
                  </h3>
                  {drawing.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                      {drawing.description}
                    </p>
                  )}
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                    Updated: {formatDate(drawing?.updatedAt ? drawing.updatedAt.toString() : '')}
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex justify-end space-x-2">
                  <motion.button 
                    onClick={(e) => handleEditClick(drawing, e)}
                    className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md"
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.9 }}
                    title="Edit Drawing Info"
                  >
                    <Edit size={16} />
                  </motion.button>
                  <motion.button 
                    onClick={(e) => handleDuplicateDrawing(drawing, e)}
                    className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md"
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.9 }}
                    title="Duplicate Drawing"
                  >
                    <Copy size={16} />
                  </motion.button>
                  <div className="flex space-x-4">
  {/* Altri bottoni */}
  <motion.button
    onClick={() => router.push(`/cam?drawingId=${drawing.id}`)}
    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center shadow-sm"
    whileHover={{ scale: 1.02, y: -2 }}
    whileTap={{ scale: 0.98 }}
  >
    <Tool size={18} className="mr-2" />
    Genera Toolpath
  </motion.button>
  
  {/* Bottone per visualizzare i toolpath esistenti */}
  <motion.button
    onClick={() => router.push(`/toolpaths?drawingId=${drawing.id}`)}
    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center shadow-sm"
    whileHover={{ scale: 1.02, y: -2 }}
    whileTap={{ scale: 0.98 }}
  >
    <List size={18} className="mr-2" />
    Visualizza Toolpath
  </motion.button>
</div>
                  <motion.button 
                    onClick={(e) => {
                      e.stopPropagation();
                      // Download logic would go here
                    }}
                    className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md"
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.9 }}
                    title="Download Drawing"
                  >
                    <Download size={16} />
                  </motion.button>
                  <motion.button 
                    onClick={(e) => handleDeleteDrawing(drawing.id, e)}
                    className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.9 }}
                    title="Delete Drawing"
                  >
                    <Trash2 size={16} />
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
        
        {/* Drawing Modal */}
        <AnimatePresence>
          {showModal && (
            <motion.div
              className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Backdrop */}
              <motion.div 
                className="fixed inset-0 bg-black/50 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowModal(false)}
              />
              
              {/* Modal content */}
              <motion.div 
                className="bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 m-4 max-w-md w-full relative z-10"
                initial={{ scale: 0.9, y: 20, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.9, y: 20, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              >
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                  {selectedDrawing ? 'Edit Drawing' : 'Create New Drawing'}
                </h2>
                
                <form onSubmit={handleCreateDrawing}>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Drawing Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        value={drawingName}
                        onChange={(e) => setDrawingName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        required
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Description (optional)
                      </label>
                      <textarea
                        id="description"
                        value={drawingDescription}
                        onChange={(e) => setDrawingDescription(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      ></textarea>
                    </div>
                  </div>
                  
                  <div className="mt-6 flex justify-end space-x-3">
                    <motion.button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Cancel
                    </motion.button>
                    <motion.button
                      type="submit"
                      disabled={!drawingName.trim()}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 shadow-sm",
                        drawingName.trim() 
                          ? "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500" 
                          : "bg-blue-400 cursor-not-allowed"
                      )}
                      whileHover={drawingName.trim() ? { scale: 1.02 } : {}}
                      whileTap={drawingName.trim() ? { scale: 0.98 } : {}}
                    >
                      {selectedDrawing ? 'Save Changes' : 'Create & Open'}
                    </motion.button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}