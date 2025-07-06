/* eslint-disable react-hooks/rules-of-hooks */
// src/components/library/AddLibraryItem.tsx
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Package, Layers, Tool, Star } from "react-feather";
import { useLocalLibraries, ComponentItem, MaterialItem, ToolItem } from "@/src/hooks/useLocalLibraries";

interface AddLibraryItemProps {
  type: "components" | "materials" | "tools";
  onItemAdded?: () => void;
}

const AddLibraryItem: React.FC<AddLibraryItemProps> = ({ type, onItemAdded }) => {
  const [showForm, setShowForm] = useState(false);

  // Component form state
  const [componentData, setComponentData] = useState<Partial<ComponentItem>>({
    name: "",
    description: "",
    type: "",
    data: { type: "", properties: {}, geometry: { type: "", elements: [] } }
  });

  // Material form state
  const [materialData, setMaterialData] = useState<Partial<MaterialItem>>({
    name: "",
    description: "",
    color: "#cccccc",
    density: 1.0,
    hardness: 100,
    properties: {}
  });

  // Tool form state
  const [toolData, setToolData] = useState<Partial<ToolItem>>({
    name: "",
    description: "",
    type: "endmill",
    diameter: 6,
    material: "HSS",
    numberOfFlutes: 2
  });

  // Get the appropriate hook based on type
  const { saveItem } =
    type === "components"
      ? useLocalLibraries<ComponentItem>("components")
      : type === "materials"
        ? useLocalLibraries<MaterialItem>("materials")
        : useLocalLibraries<ToolItem>("tools");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let result;
    let eventName = "";

    if (type === "components") {
      result = saveItem(componentData);
      eventName = "component-library-updated";
    } else if (type === "materials") {
      result = saveItem(materialData);
      eventName = "material-library-updated";
    } else {
      result = saveItem(toolData);
      eventName = "tool-library-updated";
    }

    if (result) {
      setShowForm(false);
      if (onItemAdded) onItemAdded();

      // Reset form data
      if (type === "components") {
        setComponentData({
          name: "",
          description: "",
          type: "",
          data: { type: "", properties: {}, geometry: { type: "", elements: [] } }
        });
      } else if (type === "materials") {
        setMaterialData({
          name: "",
          description: "",
          color: "#cccccc",
          density: 1.0,
          hardness: 100,
          properties: {}
        });
      } else {
        setToolData({
          name: "",
          description: "",
          type: "endmill",
          diameter: 6,
          material: "HSS",
          numberOfFlutes: 2
        });
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(eventName));
      }

      if (onItemAdded) onItemAdded();
    }
  };

  const getTypeIcon = () => {
    switch (type) {
      case "components":
        return <Package size={16} className="text-blue-500" />;
      case "materials":
        return <Layers size={16} className="text-purple-500" />;
      case "tools":
        return <Tool size={16} className="text-green-500" />;
      default:
        return <Star size={16} className="text-gray-500" />;
    }
  };

  const getTypeColor = () => {
    switch (type) {
      case "components":
        return "from-blue-500 to-blue-600";
      case "materials":
        return "from-purple-500 to-purple-600";
      case "tools":
        return "from-green-500 to-green-600";
      default:
        return "from-gray-500 to-gray-600";
    }
  };

  const getTypeTheme = () => {
    switch (type) {
      case "components":
        return {
          gradient: "from-blue-500/10 via-blue-400/5 to-blue-600/10",
          border: "border-blue-200/50 dark:border-blue-700/50",
          focus: "focus:ring-blue-500/50 focus:border-blue-500/50",
          button: "from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
        };
      case "materials":
        return {
          gradient: "from-purple-500/10 via-purple-400/5 to-purple-600/10",
          border: "border-purple-200/50 dark:border-purple-700/50",
          focus: "focus:ring-purple-500/50 focus:border-purple-500/50",
          button: "from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
        };
      case "tools":
        return {
          gradient: "from-green-500/10 via-green-400/5 to-green-600/10",
          border: "border-green-200/50 dark:border-green-700/50",
          focus: "focus:ring-green-500/50 focus:border-green-500/50",
          button: "from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
        };
      default:
        return {
          gradient: "from-gray-500/10 via-gray-400/5 to-gray-600/10",
          border: "border-gray-200/50 dark:border-gray-700/50",
          focus: "focus:ring-gray-500/50 focus:border-gray-500/50",
          button: "from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700"
        };
    }
  };

  const theme = getTypeTheme();

  const renderComponentForm = () => (
    <motion.form 
      onSubmit={handleSubmit} 
      className="space-y-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.1 }}
      >
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name</label>
        <input
          type="text"
          className={`w-full p-3 border ${theme.border} rounded-xl text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 ${theme.focus} focus:border-transparent transition-all duration-200`}
          value={componentData.name}
          onChange={e => setComponentData({ ...componentData, name: e.target.value })}
          placeholder="Enter component name..."
          required
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.15 }}
      >
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</label>
        <textarea
          className={`w-full p-3 border ${theme.border} rounded-xl text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 ${theme.focus} focus:border-transparent transition-all duration-200 resize-none`}
          value={componentData.description}
          onChange={e => setComponentData({ ...componentData, description: e.target.value })}
          placeholder="Describe your component..."
          rows={3}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
      >
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Type</label>
        <select
          className={`w-full p-3 border ${theme.border} rounded-xl text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 ${theme.focus} focus:border-transparent transition-all duration-200`}
          value={componentData.type}
          onChange={e => {
            const type = e.target.value;
            setComponentData({
              ...componentData,
              type,
              data: { ...componentData.data, type }
            });
          }}
        >
          <option value="mechanical">Mechanical</option>
          <option value="electronic">Electronic</option>
          <option value="geometric">Geometric</option>
          <option value="composite">Composite</option>
          <option value="custom">Custom</option>
          <option value="manufacturing">Manufacturing</option>
          <option value="structural">Structural</option>
          <option value="fixture">Fixture</option>
          <option value="enclosure">Enclosure</option>
          <option value="tool">Tool</option>
        </select>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="flex space-x-3 pt-4"
      >
        <motion.button
          type="submit"
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.98 }}
          className={`flex-1 py-3 px-4 bg-gradient-to-r ${theme.button} text-white font-medium rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl`}
        >
          Add Component
        </motion.button>
        <motion.button
          type="button"
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowForm(false)}
          className="px-4 py-3 bg-gray-200/80 dark:bg-gray-700/80 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-300/80 dark:hover:bg-gray-600/80 transition-all duration-200 backdrop-blur-sm"
        >
          Cancel
        </motion.button>
      </motion.div>
    </motion.form>
  );

  const renderMaterialForm = () => (
    <motion.form 
      onSubmit={handleSubmit} 
      className="space-y-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.1 }}
      >
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name</label>
        <input
          type="text"
          className={`w-full p-3 border ${theme.border} rounded-xl text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 ${theme.focus} focus:border-transparent transition-all duration-200`}
          value={materialData.name}
          onChange={e => setMaterialData({ ...materialData, name: e.target.value })}
          placeholder="Enter material name..."
          required
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.15 }}
      >
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</label>
        <textarea
          className={`w-full p-3 border ${theme.border} rounded-xl text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 ${theme.focus} focus:border-transparent transition-all duration-200 resize-none`}
          value={materialData.description}
          onChange={e => setMaterialData({ ...materialData, description: e.target.value })}
          placeholder="Describe the material properties..."
          rows={3}
        />
      </motion.div>

      <div className="grid grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Color</label>
          <div className="relative">
            <input
              type="color"
              className={`w-full h-12 border ${theme.border} rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 ${theme.focus} focus:border-transparent transition-all duration-200 cursor-pointer`}
              value={materialData.color}
              onChange={e => setMaterialData({ ...materialData, color: e.target.value })}
            />
            <div className="absolute inset-0 rounded-xl border-2 border-white/20 pointer-events-none" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.25 }}
        >
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Density (g/cm³)</label>
          <input
            type="number"
            step="0.1"
            className={`w-full p-3 border ${theme.border} rounded-xl text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 ${theme.focus} focus:border-transparent transition-all duration-200`}
            value={materialData.density}
            onChange={e => setMaterialData({ ...materialData, density: parseFloat(e.target.value) || 0 })}
            placeholder="1.0"
          />
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 }}
      >
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Hardness (HB)</label>
        <input
          type="number"
          className={`w-full p-3 border ${theme.border} rounded-xl text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 ${theme.focus} focus:border-transparent transition-all duration-200`}
          value={materialData.hardness}
          onChange={e => setMaterialData({ ...materialData, hardness: parseInt(e.target.value) || 0 })}
          placeholder="100"
        />
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="flex space-x-3 pt-4"
      >
        <motion.button
          type="submit"
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.98 }}
          className={`flex-1 py-3 px-4 bg-gradient-to-r ${theme.button} text-white font-medium rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl`}
        >
          Add Material
        </motion.button>
        <motion.button
          type="button"
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowForm(false)}
          className="px-4 py-3 bg-gray-200/80 dark:bg-gray-700/80 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-300/80 dark:hover:bg-gray-600/80 transition-all duration-200 backdrop-blur-sm"
        >
          Cancel
        </motion.button>
      </motion.div>
    </motion.form>
  );

  const renderToolForm = () => (
    <motion.form 
      onSubmit={handleSubmit} 
      className="space-y-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.1 }}
      >
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Name</label>
        <input
          type="text"
          className={`w-full p-3 border ${theme.border} rounded-xl text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 ${theme.focus} focus:border-transparent transition-all duration-200`}
          value={toolData.name}
          onChange={e => setToolData({ ...toolData, name: e.target.value })}
          placeholder="Enter tool name..."
          required
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.15 }}
      >
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description</label>
        <textarea
          className={`w-full p-3 border ${theme.border} rounded-xl text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 ${theme.focus} focus:border-transparent transition-all duration-200 resize-none`}
          value={toolData.description}
          onChange={e => setToolData({ ...toolData, description: e.target.value })}
          placeholder="Describe the tool specifications..."
          rows={3}
        />
      </motion.div>

      <div className="grid grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Type</label>
          <select
            className={`w-full p-3 border ${theme.border} rounded-xl text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 ${theme.focus} focus:border-transparent transition-all duration-200`}
            value={toolData.type}
            onChange={e => setToolData({ ...toolData, type: e.target.value })}
          >
            <option value="endmill">End Mill</option>
            <option value="drillbit">Drill Bit</option>
            <option value="facemill">Face Mill</option>
            <option value="ballmill">Ball Mill</option>
            <option value="reamer">Reamer</option>
            <option value="tap">Tap</option>
            <option value="boring">Boring Bar</option>
            <option value="custom">Custom</option>
          </select>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.25 }}
        >
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Diameter (mm)</label>
          <input
            type="number"
            step="0.1"
            className={`w-full p-3 border ${theme.border} rounded-xl text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 ${theme.focus} focus:border-transparent transition-all duration-200`}
            value={toolData.diameter}
            onChange={e => setToolData({ ...toolData, diameter: parseFloat(e.target.value) || 0 })}
            placeholder="6.0"
          />
        </motion.div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Material</label>
          <select
            className={`w-full p-3 border ${theme.border} rounded-xl text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 ${theme.focus} focus:border-transparent transition-all duration-200`}
            value={toolData.material}
            onChange={e => setToolData({ ...toolData, material: e.target.value })}
          >
            <option value="HSS">High Speed Steel (HSS)</option>
            <option value="Carbide">Carbide</option>
            <option value="Ceramic">Ceramic</option>
            <option value="Cobalt">Cobalt</option>
            <option value="Diamond">Diamond</option>
            <option value="Custom">Custom</option>
          </select>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.35 }}
        >
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Number of Flutes</label>
          <input
            type="number"
            className={`w-full p-3 border ${theme.border} rounded-xl text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 ${theme.focus} focus:border-transparent transition-all duration-200`}
            value={toolData.numberOfFlutes}
            onChange={e => setToolData({ ...toolData, numberOfFlutes: parseInt(e.target.value) || 0 })}
            placeholder="2"
          />
        </motion.div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="flex space-x-3 pt-4"
      >
        <motion.button
          type="submit"
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.98 }}
          className={`flex-1 py-3 px-4 bg-gradient-to-r ${theme.button} text-white font-medium rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl`}
        >
          Add Tool
        </motion.button>
        <motion.button
          type="button"
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowForm(false)}
          className="px-4 py-3 bg-gray-200/80 dark:bg-gray-700/80 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-300/80 dark:hover:bg-gray-600/80 transition-all duration-200 backdrop-blur-sm"
        >
          Cancel
        </motion.button>
      </motion.div>
    </motion.form>
  );

  return (
    <div className="w-full">
      <AnimatePresence>
        {!showForm ? (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowForm(true)}
            className={`w-full p-4 bg-gradient-to-r ${getTypeColor()} text-white rounded-xl font-medium flex items-center justify-center space-x-3 transition-all duration-200 shadow-lg hover:shadow-xl group`}
          >
            <motion.div
              whileHover={{ rotate: 90 }}
              transition={{ duration: 0.2 }}
              className="p-1 rounded-full bg-white/20"
            >
              <Plus size={18} />
            </motion.div>
            <span>Add New {type.slice(0, -1).charAt(0).toUpperCase() + type.slice(1, -1)}</span>
            {getTypeIcon()}
          </motion.button>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="relative overflow-hidden rounded-xl"
          >
            {/* Holographic Background */}
            <div className={`absolute inset-0 bg-gradient-to-br ${theme.gradient} backdrop-blur-xl border ${theme.border} rounded-xl`}>
              {/* Animated Background Pattern */}
              <div className="absolute inset-0 opacity-30">
                <motion.div
                  animate={{ 
                    x: [0, 20, 0],
                    y: [0, -10, 0],
                    rotate: [0, 2, 0]
                  }}
                  transition={{ 
                    duration: 8,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="absolute top-4 right-4 w-16 h-16 rounded-full bg-white/10 blur-xl"
                />
                <motion.div
                  animate={{ 
                    x: [0, -15, 0],
                    y: [0, 8, 0],
                    rotate: [0, -1, 0]
                  }}
                  transition={{ 
                    duration: 10,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="absolute bottom-4 left-4 w-12 h-12 rounded-full bg-white/10 blur-xl"
                />
              </div>
              
              {/* Corner Accents */}
              <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-white/30 rounded-tl" />
              <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-white/30 rounded-br" />
            </div>

            {/* Form Content */}
            <div className="relative z-10 p-6">
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between mb-6"
              >
                <div className="flex items-center space-x-3">
                  <motion.div
                    animate={{ 
                      rotate: [0, 360],
                      scale: [1, 1.1, 1]
                    }}
                    transition={{ 
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center"
                  >
                    {getTypeIcon()}
                  </motion.div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Add New {type.slice(0, -1).charAt(0).toUpperCase() + type.slice(1, -1)}
                  </h3>
                </div>
                
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowForm(false)}
                  className="p-2 rounded-lg bg-white/20 text-gray-700 dark:text-gray-300 hover:bg-white/30 transition-all duration-200"
                >
                  <X size={16} />
                </motion.button>
              </motion.div>

              {type === "components" && renderComponentForm()}
              {type === "materials" && renderMaterialForm()}
              {type === "tools" && renderToolForm()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AddLibraryItem;
