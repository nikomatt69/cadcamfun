import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Layout from '@/src/components/layout/Layout';
import { Save, ArrowLeft, Trash2, Layers, Cpu, Check, AlertCircle } from 'react-feather';
import { fetchMaterialById, updateMaterial, deleteMaterial } from '@/src/lib/api/materials';
import Loading from '@/src/components/ui/Loading';
import { Material } from '@prisma/client';
import Metatags from '@/src/components/layout/Metatags';
import { useLocalMaterialsLibraryStore } from '@/src/store/localMaterialsLibraryStore';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import toast from 'react-hot-toast';
import { cn } from '@/src/lib/utils';

// Animation variants
const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.4 } }
};

const slideUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { 
      type: "spring", 
      stiffness: 300, 
      damping: 30 
    } 
  }
};

export default function MaterialDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { id } = router.query;
  
  // State for material data and UI
  const [material, setMaterial] = useState<Material | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Local library store
  const { addMaterial } = useLocalMaterialsLibraryStore();
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    density: 0,
    hardness: 0,
    color: '#cccccc'
  });

  // Check if material exists in the material store
  const [isInLibrary, setIsInLibrary] = useState(false);

  // Function to verify if material is already in local library
  const checkMaterialInLibrary = (materialData: any) => {
    const localLibrary = localStorage.getItem('localMaterialsLibrary');
    if (!localLibrary) return false;
    
    try {
      const library = JSON.parse(localLibrary);
      const exists = library.some((item: any) => 
        item.name === materialData.name || 
        (materialData.id && item.id === materialData.id)
      );
      return exists;
    } catch (err) {
      console.error('Error checking material in library:', err);
      return false;
    }
  };

  // Fetch material data when component mounts or id changes
  useEffect(() => {
    if (id && typeof id === 'string') {
      fetchMaterial(id);
    }
  }, [status, id]);

  // Check if material is in library when it loads
  useEffect(() => {
    if (material) {
      const exists = checkMaterialInLibrary(material);
      setIsInLibrary(exists);
    }
  }, [material]);

  const fetchMaterial = async (materialId: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await fetchMaterialById(materialId);
      setMaterial(data);
      
      // Extract properties from material
      const properties = data.properties as any;
      
      setFormData({
        name: data.name,
        description: data.description || '',
        density: properties.density || 0,
        hardness: properties.hardness || 0,
        color: properties.color || '#cccccc'
      });

      // Check if material is in local library
      const exists = checkMaterialInLibrary(data);
      setIsInLibrary(exists);
    } catch (err) {
      console.error('Error fetching material:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      
      // If material not found, redirect to materials list
      if (err instanceof Error && err.message.includes('not found')) {
        router.push('/materials');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!material) return;
    
    setIsSaving(true);
    
    try {
      // Update material
      const updatedMaterial = await updateMaterial({
        id: material.id,
        name: formData.name,
        description: formData.description,
        properties: {
          density: parseFloat(formData.density.toString()),
          hardness: parseFloat(formData.hardness.toString()),
          color: formData.color
        }
      });
      
      setMaterial(updatedMaterial);
      toast.success('Material saved successfully');
    } catch (err) {
      console.error('Error updating material:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update material');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!material || !confirm('Are you sure you want to delete this material?')) return;
    
    setIsLoading(true);
    
    try {
      await deleteMaterial(material.id);
      toast.success('Material deleted successfully');
      
      // Redirect to materials list after a short delay
      setTimeout(() => {
        router.push('/materials');
      }, 1500);
    } catch (err) {
      console.error('Error deleting material:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to delete material');
      setIsLoading(false);
    }
  };
  
  const handleSaveToLocalLibrary = () => {
    if (!material) return;
    
    try {
      // Extract properties from material
      const properties = material.properties as any;
      
      // Convert the material to local library format
      const localMaterial = {
        id: material.id, // Save the original ID for reference
        name: material.name,
        description: material.description || '',
        properties: {
          density: parseFloat(properties?.density || 0),
          hardness: parseFloat(properties?.hardness || 0),
          color: properties?.color || '#cccccc'
        },
        tags: []
      };
      
      // Save to local library
      addMaterial(localMaterial);
      
      // Update library status
      setIsInLibrary(true);
      
      // Show success message
      toast.success('Material saved to local library successfully');
    } catch (err) {
      console.error('Failed to save to local library:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save to local library');
    }
  };

  // Function to send material to CAD editor
  const sendToCAD = () => {
    try {
      if (!material) return;
      
      // Save to localStorage for CAD to pick up
      localStorage.setItem('materialToLoadInCAD', JSON.stringify({
        id: material.id,
        name: material.name,
        properties: material.properties
      }));
      
      // Redirect to CAD editor
      router.push({
        pathname: '/cad',
        query: { loadMaterial: material.id }
      });
      
      toast.success('Opening material in CAD editor');
    } catch (err) {
      console.error('Failed to send material to CAD:', err);
      toast.error('Failed to send material to CAD editor');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleBack = () => {
    router.push('/materials');
  };

  if (status === 'loading' || (isLoading && !error)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          className="w-16 h-16 border-4 border-blue-200 dark:border-blue-800 rounded-full border-t-blue-600"
        />
      </div>
    );
  }
  
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }
  
  return (
    <MotionConfig reducedMotion="user">
      <Metatags title={material ? `${material.name} | Material Editor` : 'Material Editor'} />
      
      <Layout>
        <div className="flex flex-col h-full">
          {/* Header */}
          <motion.div 
            className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-4 md:px-6"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center">
                <motion.button
                  onClick={handleBack}
                  className="mr-4 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                  whileHover={{ scale: 1.1, backgroundColor: "rgba(0,0,0,0.05)" }}
                  whileTap={{ scale: 0.95 }}
                >
                  <ArrowLeft size={20} />
                </motion.button>
                <div className="flex items-center">
                  {material && (
                    <motion.div 
                      className="w-8 h-8 rounded-full mr-3"
                      style={{ backgroundColor: formData.color }}
                      whileHover={{ scale: 1.1 }}
                    />
                  )}
                  <div>
                    <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                      {material ? material.name : 'Material not found'}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {material ? 'Edit material properties' : 'Material may have been deleted or does not exist'}
                    </p>
                  </div>
                </div>
              </div>
              {material && (
                <div className="flex flex-wrap gap-3">
                  {/* Send to CAD button */}
                  <motion.button
                    onClick={sendToCAD}
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 flex items-center shadow-sm"
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Cpu size={18} className="mr-2" />
                    Use in CAD
                  </motion.button>
                  
                  {/* Save to Library button - disabled if already in library */}
                  <motion.button
                    onClick={handleSaveToLocalLibrary}
                    disabled={isInLibrary}
                    className={`${
                      isInLibrary 
                        ? 'bg-gray-300 dark:bg-gray-900 cursor-not-allowed' 
                        : 'bg-indigo-600 hover:bg-indigo-700'
                    } text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center shadow-sm`}
                    whileHover={isInLibrary ? {} : { scale: 1.02, y: -2 }}
                    whileTap={isInLibrary ? {} : { scale: 0.98 }}
                  >
                    <Save size={18} className="mr-2" />
                    {isInLibrary ? 'Already in Library' : 'Save to Library'}
                  </motion.button>
                  
                  <motion.button
                    onClick={handleDelete}
                    className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-red-600 dark:text-red-400 px-4 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-red-500 flex items-center"
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isSaving || isLoading}
                  >
                    <Trash2 size={18} className="mr-2" />
                    Delete
                  </motion.button>
                  
                  <motion.button
                    onClick={handleSave}
                    disabled={isSaving || isLoading}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center shadow-sm"
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Save size={18} className="mr-2" />
                    {isSaving ? 'Saving...' : 'Save'}
                  </motion.button>
                </div>
              )}
            </div>
          </motion.div>
          
          {/* Display error */}
          {error && !material && (
            <motion.div 
              className="flex-1 flex items-center justify-center p-6"
              variants={fadeIn}
              initial="hidden"
              animate="visible"
            >
              <div className="text-center max-w-md">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle size={28} className="text-red-500 dark:text-red-400" />
                </div>
                <div className="text-red-600 dark:text-red-400 text-lg mb-4">{error}</div>
                <motion.button
                  onClick={handleBack}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 shadow-sm"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Return to Materials List
                </motion.button>
              </div>
            </motion.div>
          )}
          
          {/* Material form */}
          {material && (
            <motion.div 
              className="flex-1 overflow-auto p-6" 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <motion.div 
                className="max-w-3xl mx-auto"
                variants={slideUp}
                initial="hidden"
                animate="visible"
              >
                <div className="bg-white dark:bg-gray-900 shadow rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800">
                  <div className="p-6">
                    <div className="mb-4">
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Material Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        value={formData.name}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Description
                      </label>
                      <textarea
                        id="description"
                        name="description"
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        value={formData.description}
                        onChange={handleChange}
                      ></textarea>
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor="color" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Color
                      </label>
                      <div className="flex items-center space-x-3">
                        <input
                          type="color"
                          id="color"
                          name="color"
                          className="h-10 w-20 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={formData.color}
                          onChange={handleChange}
                        />
                        <input
                          type="text"
                          name="color"
                          className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono"
                          value={formData.color}
                          onChange={handleChange}
                          pattern="^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"
                          title="Valid hex color (e.g. #FF0000)"
                        />
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Color preview
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="mb-4">
                        <label htmlFor="density" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Density (g/cm³)
                        </label>
                        <input
                          type="number"
                          id="density"
                          name="density"
                          step="0.01"
                          min="0"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          value={formData.density}
                          onChange={handleChange}
                          required
                        />
                      </div>
                      
                      <div className="mb-4">
                        <label htmlFor="hardness" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Hardness (HRC)
                        </label>
                        <input
                          type="number"
                          id="hardness"
                          name="hardness"
                          step="0.1"
                          min="0"
                          max="100"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          value={formData.hardness}
                          onChange={handleChange}
                          required
                        />
                      </div>
                    </div>
                    
                    <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800">
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Material Info</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
                          <span className="block text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider mb-1">ID</span>
                          <span className="font-mono text-gray-900 dark:text-gray-200">{material.id}</span>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
                          <span className="block text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider mb-1">Created</span>
                          <span className="text-gray-900 dark:text-gray-200">{new Date(material.createdAt).toLocaleString()}</span>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
                          <span className="block text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider mb-1">Updated</span>
                          <span className="text-gray-900 dark:text-gray-200">{new Date(material.updatedAt).toLocaleString()}</span>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
                          <span className="block text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider mb-1">Used In</span>
                          <span className="text-gray-900 dark:text-gray-200">CAM Operations</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Action buttons */}
                    <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800 flex justify-end space-x-3">
                      <button
                        onClick={sendToCAD}
                        className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        <Cpu size={16} className="mr-2" />
                        Use in CAD
                      </button>
                      <button
                        onClick={handleSave}
                        className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <Save size={16} className="mr-2" />
                        Save Changes
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </div>
      </Layout>
    </MotionConfig>
  );
}