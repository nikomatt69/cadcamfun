// src/components/cad/LayerManager.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Lock, Unlock, Edit, Trash2, Plus, Save, X } from 'react-feather';
import { useLayerStore } from 'src/store/layerStore';
import { useElementsStore } from 'src/store/elementsStore';

const getRandomColor = () => {
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
};

const LayerManager: React.FC = () => {
  const { layers, activeLayer, addLayer, updateLayer, deleteLayer, setActiveLayer } = useLayerStore();
  const { getElementsByLayerId } = useElementsStore();
  const [newLayerName, setNewLayerName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingLayer, setEditingLayer] = useState<string | null>(null);
  const [editLayerName, setEditLayerName] = useState('');
  const [editLayerColor, setEditLayerColor] = useState('');

  // Manage layer creation
  const handleAddLayer = () => {
    if (newLayerName.trim()) {
      addLayer({
        name: newLayerName,
        visible: true,
        locked: false,
        color: getRandomColor()
      });
      setNewLayerName('');
      setIsAdding(false);
    }
  };

  // Toggle layer visibility
  const handleVisibilityToggle = (id: string, visible: boolean) => {
    updateLayer(id, { visible: !visible });
  };

  // Toggle layer lock
  const handleLockToggle = (id: string, locked: boolean) => {
    updateLayer(id, { locked: !locked });
  };

  // Delete layer (if not the last one)
  const handleDelete = (id: string) => {
    if (layers.length > 1) {
      // Check if layer has elements
      const layerElements = getElementsByLayerId(id);
      if (layerElements.length > 0) {
        if (!confirm(`This layer contains ${layerElements.length} elements. Delete anyway?`)) {
          return;
        }
      }
      deleteLayer(id);
    } else {
      alert('Cannot delete the last layer');
    }
  };

  // Start editing a layer's properties
  const handleStartEdit = (layer: { id: string; name: string; color: string }) => {
    setEditingLayer(layer.id);
    setEditLayerName(layer.name);
    setEditLayerColor(layer.color);
  };

  // Save layer edits
  const handleSaveEdit = () => {
    if (editingLayer && editLayerName.trim()) {
      updateLayer(editingLayer, {
        name: editLayerName,
        color: editLayerColor
      });
      setEditingLayer(null);
    }
  };

  // Cancel layer edit
  const handleCancelEdit = () => {
    setEditingLayer(null);
  };

  return (
    <motion.div 
      className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-md p-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      <div className="flex justify-between items-center mb-4">
        <motion.h3 
          className="text-lg font-medium text-gray-900"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          Layers
        </motion.h3>
        <motion.button
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsAdding(true)}
          className="p-1 rounded-full text-blue-600 hover:bg-blue-100 focus:outline-none"
          disabled={isAdding}
        >
          <Plus size={18} />
        </motion.button>
      </div>
      
      <AnimatePresence>
        {isAdding && (
          <motion.div 
            className="mb-4 flex items-center flex-col  space-x-2"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <input
              type="text"
              placeholder="Layer name"
              value={newLayerName}
              onChange={(e) => setNewLayerName(e.target.value)}
              className="flex-1 block border-gray-300 rounded-md my-2 p-2 shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              autoFocus
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleAddLayer}
              className="px-3 py-1 bg-blue-600 text-white my-1 flex rounded-md hover:bg-blue-700 focus:outline-none text-sm"
            >
              Add
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsAdding(false)}
              className="px-3 py-1 bg-gray-300 text-gray-700 my-1 flex rounded-md hover:bg-gray-400 focus:outline-none text-sm"
            >
              Cancel
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
      
      <motion.div 
        className="space-y-2 max-h-80 overflow-y-auto pr-1"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: {
              staggerChildren: 0.07
            }
          }
        }}
      >
        {layers.map((layer) => (
          <motion.div
            key={layer.id}
            variants={{
              hidden: { opacity: 0, y: 10 },
              visible: { opacity: 1, y: 0 }
            }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            layoutId={`layer-${layer.id}`}
            className={`${
              activeLayer === layer.id ? 'bg-gray border border-blue-300' : 'hover:bg-gray'
            } rounded cursor-pointer`}
          >
            {editingLayer === layer.id ? (
              // Edit mode
              <div className="p-2">
                <div className="flex items-center mb-2">
                  <input
                    type="color"
                    value={editLayerColor}
                    onChange={(e) => setEditLayerColor(e.target.value)}
                    className="w-6 h-6 mr-2 border-0"
                  />
                  <input
                    type="text"
                    value={editLayerName}
                    onChange={(e) => setEditLayerName(e.target.value)}
                    className="flex-1 block border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-xs"
                    autoFocus
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={handleSaveEdit}
                    className="p-1 rounded-full text-green-600 hover:bg-green-100"
                  >
                    <Save size={14} />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={handleCancelEdit}
                    className="p-1 rounded-full text-red-600 hover:bg-red-100"
                  >
                    <X size={14} />
                  </motion.button>
                </div>
              </div>
            ) : (
              // Display mode
              <div 
                className="flex items-center justify-between p-2"
                onClick={() => setActiveLayer(layer.id)}
                onDoubleClick={() => handleStartEdit(layer)}
                title="Click to select, double-click to edit"
              >
                <div className="flex items-center space-x-2">
                  <motion.div 
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: layer.color }}
                    whileHover={{ scale: 1.2 }}
                  />
                  <span className="font-medium text-gray-800 text-sm">{layer.name}</span>
                  {layer.locked && (
                    <span className="text-xs text-gray-500">(locked)</span>
                  )}
                </div>
                <div className="flex items-center space-x-1">
                  <motion.button
                    whileHover={{ scale: 1.2, rotate: 5 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVisibilityToggle(layer.id, layer.visible);
                    }}
                    className="p-1 rounded-full hover:bg-gray-200 focus:outline-none"
                    title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                  >
                    {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.2, rotate: 5 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLockToggle(layer.id, layer.locked);
                    }}
                    className="p-1 rounded-full hover:bg-gray-200 focus:outline-none"
                    title={layer.locked ? 'Unlock Layer' : 'Lock Layer'}
                  >
                    {layer.locked ? <Lock size={16} /> : <Unlock size={16} />}
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.2, rotate: 5 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEdit(layer);
                    }}
                    className="p-1 rounded-full hover:bg-gray-200 focus:outline-none"
                    title="Edit Layer"
                  >
                    <Edit size={16} />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: layers.length <= 1 ? 1 : 1.2, rotate: 5 }}
                    whileTap={{ scale: layers.length <= 1 ? 1 : 0.9 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(layer.id);
                    }}
                    className="p-1 rounded-full hover:bg-gray-200 focus:outline-none"
                    title="Delete Layer"
                    disabled={layers.length <= 1}
                  >
                    <Trash2 size={16} className={layers.length <= 1 ? 'text-gray-300' : 'text-red-500'} />
                  </motion.button>
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </motion.div>
      
      {/* Layer count & info */}
      <div className="mt-4 text-xs text-gray-500 flex justify-between">
        <span>{layers.length} layer{layers.length !== 1 ? 's' : ''}</span>
        <span>Active: {layers.find(l => l.id === activeLayer)?.name || 'None'}</span>
      </div>
    </motion.div>
  );
};

export default LayerManager;