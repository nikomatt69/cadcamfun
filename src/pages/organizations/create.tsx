// src/pages/organizations/create.tsx

import { useState } from 'react';
import Head from 'next/head';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { DynamicLayout } from 'src/components/dynamic-imports';
import { ArrowLeft, Users } from 'react-feather';
import Loading from '@/src/components/ui/Loading';
import Metatags from '@/src/components/layout/Metatags';

export default function CreateOrganizationPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    
    try {
      const response = await fetch('/api/organizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          users: {
            create: {
              
              role: 'ADMIN'
            }
          }
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create organization');
      }
      
      const organization = await response.json();
      router.push(`/organizations/${organization.id}`);
    } catch (error: any) {
      console.error('Error creating organization:', error);
      setError(error.message || 'An error occurred while creating the organization');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === 'loading') {
    return <div className="flex h-screen items-center justify-center"><Loading/></div>;
  }

  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }

  return (
    <>
      <Metatags title={'Create Organization'} />
      <DynamicLayout>
        <div className="p-6">
          <div className="mb-6 flex items-center">
            <button
              onClick={() => router.back()}
              className="mr-4 text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Create New Organization</h1>
          </div>
          
          <div className="max-w-3xl mx-auto">
            <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-lg overflow-hidden">
              <div className="p-6">
                <div className="flex items-center mb-6">
                  <div className="mr-4 h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <Users className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-medium text-gray-900">Organization Details</h2>
                    <p className="text-sm text-gray-500">Create a new organization to collaborate with your team</p>
                  </div>
                </div>
                
                {error && (
                  <div className="mb-4 bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                    <span className="block sm:inline">{error}</span>
                  </div>
                )}
                
                <form onSubmit={handleSubmit}>
                  <div className="space-y-6">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                        Organization Name *
                      </label>
                      <div className="mt-1">
                        <input
                          type="text"
                          id="name"
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          required
                          className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                          placeholder="Acme Inc."
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                        Description (optional)
                      </label>
                      <div className="mt-1">
                        <textarea
                          id="description"
                          name="description"
                          rows={3}
                          value={formData.description}
                          onChange={handleChange}
                          className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                          placeholder="Briefly describe your organization..."
                        ></textarea>
                      </div>
                    </div>
                    
                    <div className="border-t border-gray-200 pt-6">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => router.back()}
                          className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                          {isSubmitting ? 'Creating...' : 'Create Organization'}
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </DynamicLayout>
    </>
  );
}