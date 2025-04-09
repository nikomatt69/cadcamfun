// src/pages/projects/create.tsx - Updated version
import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { FileText, Save, X, Users, Tag, Folder } from 'react-feather';
import Layout from '@/src/components/layout/Layout';
import { createProject } from '@/src/lib/api/projects';
import { useProjects } from '@/src/hooks/useProjects';
import Metatags from '@/src/components/layout/Metatags';


interface Organization {
  id: string;
  name: string;
}

export default function CreateProjectPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { addProject, isCreating, createError } = useProjects();
  
  // Form state
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedOrganization, setSelectedOrganization] = useState<string>('');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [currentTag, setCurrentTag] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  
  // Form status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Fetch organizations
  useEffect(() => {
     {
      // In a real implementation, call API endpoint
      fetch('/api/organizations')
        .then(res => res.json())
        .then(data => {
          setOrganizations(data || []);
          setIsLoading(false);
        })
        .catch(err => {
          console.error('Error fetching organizations:', err);
          setOrganizations([]);
          setIsLoading(false);
        });
    }
  }, [status]);
  
  // If user not authenticated, redirect
  
  
  // Handle form submission
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
      // Use the projects hook to create the project
      const newProject = await addProject({
        name: projectName,
        description,
        organizationId: selectedOrganization || undefined,
        // tags and isPublic are not in your API currently, so not included
      });
      
      setIsSubmitting(false);
      // Navigate to the new project
      router.push(`/projects/${newProject.id}`);
    } catch (err: any) {
      setError(err.message || 'Error creating project');
      setIsSubmitting(false);
    }
  };
  
  // Tag handling methods
  const handleAddTag = () => {
    if (currentTag.trim() && !tags.includes(currentTag.trim())) {
      setTags([...tags, currentTag.trim()]);
      setCurrentTag('');
    }
  };
  
  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };
  
  const handleTagKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }
  
  return (
    <Layout>
      <Metatags title={'Create New Project'} />
      
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Create new project</h1>
          <p className="mt-1 text-sm text-gray-600">
            Projects are workspaces where you can organize drawings, models and components.
          </p>
        </div>
        
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <X className="h-5 w-5 text-red-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Error
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  {error}
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <form onSubmit={handleSubmit}>
            <div className="p-6 space-y-6">
              <div>
                <label htmlFor="projectName" className="block text-sm font-medium text-gray-700">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FileText className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    id="projectName"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
                    placeholder="Enter a name for your project"
                    required
                  />
                </div>
              </div>
              
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <div className="mt-1">
                  <textarea
                    id="description"
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border border-gray-300 rounded-md"
                    placeholder="Describe your project..."
                  ></textarea>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  Brief description of the project and its objectives.
                </p>
              </div>
              
              <div>
                <label htmlFor="organization" className="block text-sm font-medium text-gray-700">
                  Organization
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Users className="h-5 w-5 text-gray-400" />
                  </div>
                  <select
                    id="organization"
                    value={selectedOrganization}
                    onChange={(e) => setSelectedOrganization(e.target.value)}
                    className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
                  >
                    <option value="">Personal Project</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  Select an organization or leave empty for a personal project.
                </p>
              </div>
              
              <div>
                <label htmlFor="tags" className="block text-sm font-medium text-gray-700">
                  Tags
                </label>
                <div className="mt-1 flex rounded-md shadow-sm">
                  <div className="relative flex items-stretch flex-grow">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Tag className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      id="tags"
                      value={currentTag}
                      onChange={(e) => setCurrentTag(e.target.value)}
                      onKeyPress={handleTagKeyPress}
                      className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-l-md"
                      placeholder="Add tags..."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="-ml-px relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-r-md text-gray-700 bg-gray-50 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  >
                    Add
                  </button>
                </div>
                
                {tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-1.5 h-4 w-4 flex items-center justify-center rounded-full text-blue-400 hover:bg-blue-200 hover:text-blue-600 focus:outline-none"
                        >
                          <span className="sr-only">Remove tag {tag}</span>
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                
                <p className="mt-2 text-sm text-gray-500">
                  Add tags to categorize your project and make it easier to find.
                </p>
              </div>
              
              <div>
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
                      If enabled, the project will be visible to all users in the public feed.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="px-6 py-4 bg-gray-50 text-right">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 mr-3"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <div className="flex items-center">
                  <Save className="mr-2 h-4 w-4" />
                  {isSubmitting ? 'Creating...' : 'Create Project'}
                </div>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}