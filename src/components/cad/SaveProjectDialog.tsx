// src/components/cad/SaveProjectDialog.tsx
import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { 
  Save, 
  Folder, 
  FileText, 
  Plus, 
  X,
  Loader,
  AlertCircle
} from 'react-feather';
import { useElementsStore } from 'src/store/elementsStore';
import { fetchProjects } from 'src/lib/api/projects';
import { Project } from '@prisma/client';

interface SaveProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSuccess?: (drawingId: string) => void;
}

export default function SaveProjectDialog({
  isOpen,
  onClose,
  onSaveSuccess
}: SaveProjectDialogProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { elements } = useElementsStore();
  
  // Form states
  const [drawingName, setDrawingName] = useState('');
  const [drawingDescription, setDrawingDescription] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [newProjectName, setNewProjectName] = useState('');
  
  // Fetch user's projects
  useEffect(() => {
    if (!isOpen || !session) return;
    
    const loadProjects = async () => {
      setIsLoadingProjects(true);
      try {
        const data = await fetchProjects();
        setProjects(data);
        
        // Set first project as default if available
        if (data.length > 0 && !selectedProjectId) {
          setSelectedProjectId(data[0].id);
        }
      } catch (error) {
        console.error('Failed to load projects:', error);
        setError('Failed to load your projects. Please try again.');
      } finally {
        setIsLoadingProjects(false);
      }
    };
    
    loadProjects();
  }, [isOpen, session, selectedProjectId]);
  
  // Create a thumbnail from the current drawing
  const generateThumbnail = async (): Promise<string | null> => {
    try {
      // Find canvas element
      const canvasElement = document.querySelector('canvas');
      if (!canvasElement) return null;
      
      // Generate thumbnail
      return canvasElement.toDataURL('image/png');
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
      return null;
    }
  };
  
  // Handle creating a new project
  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      setError('Project name is required');
      return;
    }
    
    setIsCreatingProject(true);
    setError(null);
    
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newProjectName,
          description: '',
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create project');
      }
      
      const newProject = await response.json();
      
      // Update projects list and select new project
      setProjects(prev => [newProject, ...prev]);
      setSelectedProjectId(newProject.id);
      setNewProjectName('');
      
    } catch (error) {
      console.error('Error creating project:', error);
      setError('Failed to create project. Please try again.');
    } finally {
      setIsCreatingProject(false);
    }
  };
  
  // Handle save drawing to project
  const handleSaveDrawing = async () => {
    // Validate inputs
    if (!drawingName.trim()) {
      setError('Drawing name is required');
      return;
    }
    
    if (!selectedProjectId) {
      setError('Please select a project or create a new one');
      return;
    }
    
    setIsSaving(true);
    setError(null);
    
    try {
      // Generate thumbnail
      const thumbnail = await generateThumbnail();
      
      // Prepare drawing data
      const drawingData = {
        name: drawingName,
        description: drawingDescription,
        elements: elements,
        thumbnail
      };
      
      // Save to project
      const response = await fetch(`/api/projects/${selectedProjectId}/drawings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(drawingData),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save drawing');
      }
      
      const savedDrawing = await response.json();
      
      // Show success message
      setSuccess(true);
      
      // Call success callback if provided
      if (onSaveSuccess) {
        onSaveSuccess(savedDrawing.id);
      }
      
      // Close dialog after 1.5 seconds
      setTimeout(() => {
        onClose();
        router.push(`/projects/${selectedProjectId}?drawing=${savedDrawing.id}`);
      }, 1500);
      
    } catch (error) {
      console.error('Error saving drawing:', error);
      setError('Failed to save drawing. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-medium text-gray-900">
            Save Drawing to Project
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 focus:outline-none"
          >
            <X size={20} />
          </button>
        </div>
        
        {success ? (
          <div className="p-6 flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Save size={32} className="text-green-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">Drawing Saved!</h3>
            <p className="text-gray-500 text-center">
              Your drawing has been successfully saved to the project.
            </p>
          </div>
        ) : (
          <div className="p-6">
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-800 rounded-md flex items-start">
                <AlertCircle size={18} className="mr-2 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            
            <div className="mb-4">
              <label htmlFor="drawingName" className="block text-sm font-medium text-gray-700 mb-1">
                Drawing Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="drawingName"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                value={drawingName}
                onChange={(e) => setDrawingName(e.target.value)}
                placeholder="Enter drawing name"
                required
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="drawingDescription" className="block text-sm font-medium text-gray-700 mb-1">
                Description (optional)
              </label>
              <textarea
                id="drawingDescription"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                value={drawingDescription}
                onChange={(e) => setDrawingDescription(e.target.value)}
                placeholder="Enter description (optional)"
              ></textarea>
            </div>
            
            <div className="mb-6">
              <label htmlFor="projectSelect" className="block text-sm font-medium text-gray-700 mb-1">
                Project <span className="text-red-500">*</span>
              </label>
              
              {isLoadingProjects ? (
                <div className="flex items-center justify-center p-4">
                  <Loader size={24} className="text-blue-500 animate-spin" />
                </div>
              ) : projects.length === 0 ? (
                <div className="border border-gray-300 rounded-md p-4 bg-gray-50">
                  <p className="text-gray-700 mb-2">Non hai ancora progetti.</p>
                  <div className="flex items-center">
                    <input
                      type="text"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Create a new project"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                    />
                    <button
                      onClick={handleCreateProject}
                      disabled={isCreatingProject || !newProjectName.trim()}
                      className="px-3 py-2 bg-blue-600 border border-transparent rounded-r-md text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      {isCreatingProject ? (
                        <Loader size={16} className="animate-spin" />
                      ) : (
                        <Plus size={16} />
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <select
                    id="projectSelect"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    required
                  >
                    <option value="" disabled>Select a project</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                  
                  <div className="mt-2 flex items-center">
                    <span className="text-sm text-gray-500 mr-2">Or create a new project:</span>
                    <div className="flex flex-1">
                      <input
                        type="text"
                        className="flex-1 px-3 py-1 text-sm border border-gray-300 rounded-l-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        placeholder="New project name"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                      />
                      <button
                        onClick={handleCreateProject}
                        disabled={isCreatingProject || !newProjectName.trim()}
                        className="px-2 py-1 bg-blue-600 border border-transparent rounded-r-md text-white text-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        {isCreatingProject ? (
                          <Loader size={14} className="animate-spin" />
                        ) : (
                          <Plus size={14} />
                        )}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center disabled:opacity-50"
                onClick={handleSaveDrawing}
                disabled={isSaving || !drawingName.trim() || !selectedProjectId}
              >
                {isSaving ? (
                  <>
                    <Loader size={16} className="animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={16} className="mr-2" />
                    Save Drawing
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}