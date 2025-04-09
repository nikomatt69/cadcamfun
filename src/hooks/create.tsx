// src/pages/components/create.tsx

import { useState } from 'react';
import Head from 'next/head';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { DynamicLayout } from 'src/components/dynamic-imports';
import { Save, ArrowLeft, Upload, Code, Info } from 'react-feather';
import Loading from '@/src/components/ui/Loading';
import MetaTags from '../components/layout/Metatags';

export default function CreateComponentPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState('properties');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    projectId: '',
    data: '{}'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // Validate JSON
      let parsedData;
      try {
        parsedData = JSON.parse(formData.data);
      } catch (error) {
        alert('Invalid JSON data. Please check your input.');
        setIsSubmitting(false);
        return;
      }
      
      // Create component
      const response = await fetch('/api/components', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          projectId: formData.projectId || null,
          data: parsedData
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create component');
      }
      
      const component = await response.json();
      router.push(`/components/${component.id}`);
    } catch (error) {
      console.error('Error creating component:', error);
      alert('Error creating component. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    router.push('/components');
  };

  if (status === 'loading') {
    return <div className="flex h-screen items-center justify-center"><Loading/></div>;
  }

  

  return (
    <>
       <MetaTags 
        title="COMPONENTS" 
     
      />
      <DynamicLayout>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white border-b px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <button
                  onClick={handleBack}
                  className="mr-4 text-gray-500 hover:text-gray-700"
                >
                  <ArrowLeft size={20} />
                </button>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">Create New Component</h1>
                  <p className="text-sm text-gray-500">
                    Create a reusable component for your CAD designs
                  </p>
                </div>
              </div>
              <button
                onClick={() => document.getElementById('component-form')?.onsubmit}
                disabled={isSubmitting}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 flex items-center"
              >
                <Save size={18} className="mr-2" />
                {isSubmitting ? 'Creating...' : 'Create Component'}
              </button>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white border-b">
            <div className="flex px-6">
              <button
                className={`px-4 py-3 font-medium text-sm focus:outline-none ${
                  activeTab === 'properties'
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:border-b-2'
                }`}
                onClick={() => setActiveTab('properties')}
              >
                <div className="flex items-center">
                  <Info size={16} className="mr-2" />
                  Properties
                </div>
              </button>
              <button
                className={`px-4 py-3 font-medium text-sm focus:outline-none ${
                  activeTab === 'editor'
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:border-b-2'
                }`}
                onClick={() => setActiveTab('editor')}
              >
                <div className="flex items-center">
                  <Code size={16} className="mr-2" />
                  JSON Data
                </div>
              </button>
              <button
                className={`px-4 py-3 font-medium text-sm focus:outline-none ${
                  activeTab === 'import'
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:border-b-2'
                }`}
                onClick={() => setActiveTab('import')}
              >
                <div className="flex items-center">
                  <Upload size={16} className="mr-2" />
                  Import
                </div>
              </button>
            </div>
          </div>
          
          {/* Main content */}
          <div className="flex-1 overflow-auto p-6">
            <form id="component-form" onSubmit={handleSubmit}>
              {activeTab === 'properties' && (
                <div className="max-w-3xl mx-auto">
                  <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow rounded-lg overflow-hidden">
                    <div className="p-6">
                      <div className="mb-4">
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                          Component Name*
                        </label>
                        <input
                          type="text"
                          id="name"
                          name="name"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={formData.name}
                          onChange={handleChange}
                          required
                        />
                      </div>
                      
                      <div className="mb-4">
                        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                          Description (optional)
                        </label>
                        <textarea
                          id="description"
                          name="description"
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={formData.description}
                          onChange={handleChange}
                        ></textarea>
                      </div>
                      
                      <div className="mb-4">
                        <label htmlFor="projectId" className="block text-sm font-medium text-gray-700 mb-1">
                          Project (optional)
                        </label>
                        <select
                          id="projectId"
                          name="projectId"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={formData.projectId}
                          onChange={handleChange}
                        >
                          <option value="">None (Global Component)</option>
                          {/* Project options would be fetched from API and added here */}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {activeTab === 'editor' && (
                <div className="max-w-4xl mx-auto">
                  <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow rounded-lg overflow-hidden">
                    <div className="p-6">
                      <div className="mb-4">
                        <label htmlFor="data" className="block text-sm font-medium text-gray-700 mb-1">
                          Component Data (JSON format)
                        </label>
                        <textarea
                          id="data"
                          name="data"
                          rows={15}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                          value={formData.data}
                          onChange={handleChange}
                          required
                        ></textarea>
                      </div>
                      
                      <div className="text-sm text-gray-500">
                        <p className="mb-2">Example of valid JSON data:</p>
                        <pre className="bg-gray-50 p-3 rounded-md overflow-auto">
{`{
  "type": "component",
  "version": "1.0",
  "geometry": {
    "elements": [
      {
        "type": "rectangle",
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 50
      }
    ]
  },
  "metadata": {
    "author": "Your Name",
    "createdAt": "${new Date().toISOString()}"
  }
}`}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {activeTab === 'import' && (
                <div className="max-w-3xl mx-auto">
                  <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow rounded-lg overflow-hidden">
                    <div className="p-6">
                      <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Import from File
                        </label>
                        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                          <div className="space-y-1 text-center">
                            <svg
                              className="mx-auto h-12 w-12 text-gray-400"
                              stroke="currentColor"
                              fill="none"
                              viewBox="0 0 48 48"
                              aria-hidden="true"
                            >
                              <path
                                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <div className="flex text-sm text-gray-600">
                              <label
                                htmlFor="file-upload"
                                className="relative cursor-pointer bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                              >
                                <span>Upload a file</span>
                                <input 
                                  id="file-upload" 
                                  name="file-upload" 
                                  type="file" 
                                  className="sr-only" 
                                />
                              </label>
                              <p className="pl-1">or drag and drop</p>
                            </div>
                            <p className="text-xs text-gray-500">
                              STEP, IGES, STL or JSON up to 10MB
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-2">Supported File Formats</h3>
                        <ul className="list-disc pl-5 text-sm text-gray-500 space-y-1">
                          <li>JSON - CAD/CAM FUN Component Format</li>
                          <li>STEP (*.step, *.stp) - Standard for Exchange of Product Model Data</li>
                          <li>IGES (*.iges, *.igs) - Initial Graphics Exchange Specification</li>
                          <li>STL (*.stl) - Stereolithography</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      </DynamicLayout>
    </>
  );
}