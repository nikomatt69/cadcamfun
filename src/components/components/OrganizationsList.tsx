// src/components/organizations/OrganizationsList.tsx

import React, { useState } from 'react';
import { useOrganizations } from 'src/hooks/useOrganizations';
import { Organization } from '@prisma/client';
import { Users, Plus,  Folder, UserPlus, Cloud } from 'react-feather';
import Link from 'next/link';


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
  
  if (isLoading) {
    return <div className="p-4 flex justify-center">Loading organizations...</div>;
  }
  
  if (error) {
    return <div className="p-4 text-red-500">Error loading organizations: {error.message}</div>;
  }
  
  return (
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
                  <Cloud size={32} className="text-white" />
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
      
      {/* Organization Modal */}
      
    </div>
  );
}