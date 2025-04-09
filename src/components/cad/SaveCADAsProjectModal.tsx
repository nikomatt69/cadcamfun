// src/components/cad/SaveCADAsProjectModal.tsx
import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { Save, X, Users } from 'react-feather';
import { saveCADAsProject } from '@/src/lib/saveCADAsProject';


interface SaveCADAsProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizations: Array<{ id: string; name: string }>;
}

export default function SaveCADAsProjectModal({
  isOpen,
  onClose,
  organizations = []
}: SaveCADAsProjectModalProps) {
  const router = useRouter();
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  if (!isOpen) return null;
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    
    if (!projectName.trim()) {
      setError('Project name is required');
      setIsSubmitting(false);
      return;
    }
    
    try {
      const result = await saveCADAsProject({
        name: projectName,
        description,
        organizationId: organizationId || undefined,
        isPublic
      });
      
      setIsSubmitting(false);
      onClose();
      
      // Navigate to the new project
      router.push(`/projects/${result.projectId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to save project');
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-medium text-gray-900">Save as Project</h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
                <div className="text-sm text-red-700">{error}</div>
              </div>
            )}
            
            <div className="mb-4">
              <label htmlFor="projectName" className="block text-sm font-medium text-gray-700 mb-1">
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="projectName"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter a name for your project"
                required
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Describe your project..."
              ></textarea>
            </div>
            
            {organizations.length > 0 && (
              <div className="mb-4">
                <label htmlFor="organization" className="block text-sm font-medium text-gray-700 mb-1">
                  Organization
                </label>
                <div className="relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Users size={18} className="text-gray-400" />
                  </div>
                  <select
                    id="organization"
                    value={organizationId}
                    onChange={(e) => setOrganizationId(e.target.value)}
                    className="w-full pl-10 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Personal Project</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            
            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="public"
                  name="public"
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="public" className="font-medium text-gray-700">
                  Public Project
                </label>
                <p className="text-gray-500">
                  If enabled, the project will be visible to all users.
                </p>
              </div>
            </div>
          </div>
          
          <div className="px-6 py-4 bg-gray-50 flex justify-end space-x-3 rounded-b-lg">
            <button
              type="button"
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </span>
              ) : (
                <span className="flex items-center">
                  <Save size={18} className="mr-1.5" />
                  Save as Project
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}