// src/components/organizations/OrganizationsList.tsx

import React, { useState } from 'react';
import { useOrganizations } from 'src/hooks/useOrganizations';
import { Organization } from '@prisma/client';
import { Users, Plus,  Folder, UserPlus, Cloud, ArrowLeft } from 'react-feather';
import Link from 'next/link';
import router, { useRouter } from 'next/router';
import Layout from '@/src/components/layout/Layout';
import Metatags from '@/src/components/layout/Metatags';
import { useSession } from 'next-auth/react';


export default function OrganizationsList() {
  // State for the modal
  const [showModal, setShowModal] = useState(false);
  
  // Fetch organizations data using our custom hook
  const { 
    organizations, 
    isLoading, 
    error, 
    refreshOrganizations, 
    addOrganization 
  } = useOrganizations();
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
 
  const { data: session, status } = useSession();
  const router = useRouter(); 
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }
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
 
    
    try {
      const response = await fetch('/api/organizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create organization');
      }
      
      const organization = await response.json();
      router.push(`/organizations/${organization.id}`);
    } catch (error: any) {
      console.error('Error creating organization:', error);
     
    } finally {
      setIsSubmitting(false);
    }
  };

 

  
  // Handle organization creation
  const handleCreateOrganization = async (orgData: any) => {
    try {
      const newOrg = await addOrganization(orgData);
      setShowModal(false);
      window.location.href = `/organizations/${newOrg.id}`;
    } catch (error) {
      console.error('Failed to create organization:', error);
      alert('Failed to create organization. Please try again.');
    }
  };
  
 
  
  return (
    
    <Layout>
      <Metatags title={'Organizations'} />
    <div className="p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Your Organizations</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center"
        >
          <Plus size={20} className="mr-2" />
          New Organization
        </button>
      </div>
      
      {organizations.length === 0 ? (
        <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-lg p-6 text-center">
          <Users size={64} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No organizations yet</h3>
          <p className="text-gray-600 mb-4">
            Create your first organization to collaborate with your team on CAD/CAM projects.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Create Organization
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {organizations.map((org) => (
            <Link key={org.id} href={`/organizations/${org.id}`} passHref>
              <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-shadow">
                <div className="h-16 bg-blue-600 flex items-center justify-center">
                  <Users size={32} className="text-white" />
                </div>
                
                <div className="p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">{org.name}</h3>
                  {org.description && (
                    <p className="text-sm text-gray-600 mb-4">{org.description}</p>
                  )}
                  
                  
                </div>
                
                <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
                  <span className={`
                    inline-block px-2 py-1 text-xs font-medium rounded-full
                    ${org.id === 'ADMIN' ? 'bg-red-100 text-red-800' : 
                      org.name === 'MANAGER' ? 'bg-blue-100 text-blue-800' : 
                      'bg-gray-100 text-gray-800'}
                  `}>
                    {org.name}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
     {showModal && (
      
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
      )}
      </div>
    </Layout>
  );
}