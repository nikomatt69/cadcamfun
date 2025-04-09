import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Save, 
  Package, 
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight
} from 'react-feather';
import toast from 'react-hot-toast';

// Type to represent a project
interface Project {
  id: string;
  name: string;
}

interface SaveSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string;
    description: string;
    projectId: string;
    type: string;
  }) => Promise<void>;
  selectionData: any;
  selectionBounds?: {
    width: number;
    height: number;
    depth: number;
  } | null;
}

const SaveSelectionModal: React.FC<SaveSelectionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  selectionData,
  selectionBounds
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('mechanical');
  const [projectId, setProjectId] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  // Load projects on component mount
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await fetch('/api/projects');
        if (!response.ok) throw new Error('Failed to fetch projects');
        const data = await response.json();
        setProjects(data);
        
        // Select the first project by default if none is selected
        if (data.length > 0 && !projectId) {
          setProjectId(data[0].id);
        }
      } catch (error) {
        console.error('Error fetching projects:', error);
        setError('Could not load projects. Please try again later.');
      }
    };

    if (isOpen) {
      fetchProjects();
    }
  }, [isOpen, projectId]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName(`Component (${new Date().toLocaleString()})`);
      setDescription('');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Please enter a component name');
      return;
    }
    
    if (!projectId) {
      setError('Please select a project');
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      await onSave({
        name,
        description,
        projectId,
        type
      });
      
      toast.success('Component saved successfully');
      onClose();
    } catch (err) {
      console.error('Error saving component:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while saving the component');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-auto"
        >
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center">
              <Package size={18} className="mr-2" />
              Save as Component
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 focus:outline-none"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-4">
            {error && (
              <div className="mb-4 p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm flex items-start">
                <AlertCircle size={16} className="mr-2 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            
            {selectionBounds && (
              <div className="mb-4 p-3 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Selection Details</span>
                  <button 
                    type="button"
                    onClick={() => setShowDetails(!showDetails)}
                    className="text-blue-600 dark:text-blue-400 focus:outline-none"
                  >
                    {showDetails ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                </div>
                <div className="mt-1">
                  <p><span className="font-medium">Elements:</span> {selectionData?.elements?.length || 0}</p>
                  <p><span className="font-medium">Size:</span> {selectionBounds.width.toFixed(1)} x {selectionBounds.height.toFixed(1)} x {selectionBounds.depth.toFixed(1)}</p>
                </div>
                
                {showDetails && (
                  <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-800">
                    <pre className="text-xs overflow-auto max-h-32 bg-white dark:bg-gray-900 p-2 rounded">
                      {JSON.stringify(selectionData, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="componentName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Component Name*
                </label>
                <input
                  id="componentName"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  placeholder="Enter component name"
                  required
                />
              </div>

              <div>
                <label htmlFor="componentDescription" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  id="componentDescription"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                  placeholder="Optional description"
                  rows={3}
                />
              </div>

              <div>
                <label htmlFor="componentType" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Component Type
                </label>
                <select
                  id="componentType"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                >
                  <option value="mechanical">Mechanical</option>
                  <option value="electronic">Electronic</option>
                  <option value="fixture">Fixture</option>
                  <option value="tool">Tool</option>
                  <option value="structural">Structural</option>
                  <option value="enclosure">Enclosure</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div>
                <label htmlFor="projectId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Project*
                </label>
                {projects.length > 0 ? (
                  <select
                    id="projectId"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                    required
                  >
                    <option value="" disabled>Select a project</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                    No projects found. Please create a project first.
                  </div>
                )}
              </div>

              <div className="flex items-center">
                <input
                  id="isPublic"
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                />
                <label htmlFor="isPublic" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                  Make component public
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={16} className="mr-2" />
                    Save Component
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default SaveSelectionModal;