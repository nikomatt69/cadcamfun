// src/components/projects/ProjectsList.tsx

import React, { useState } from 'react';
import { useProjects } from 'src/hooks/useProjects';

import { Folder, Clock, Users, Edit, Trash2, Plus } from 'react-feather';
import Link from 'next/link';
import { motion } from 'framer-motion';

import { Project } from '@/src/types/mainTypes';
import router from 'next/router';

export default function ProjectsList() {
  // State for the modal
  const [showModal, setShowModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  
  // Fetch projects data using our custom hook
  const { 
    projects, 
    isLoading, 
    error, 
    refreshProjects, 
    addProject 
  } = useProjects();
  
  // Handle project creation
  const handleCreateProject = async (projectData: any) => {
    try {
      await addProject(projectData);
      setShowModal(false);
    } catch (error) {
      console.error('Failed to create project:', error);
      alert('Failed to create project. Please try again.');
    }
  };
  
  // Handle opening the edit modal
  const handleEditClick = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedProject(project);
    setShowModal(true);
  };
  
  // Handle project deletion
  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this project?')) return;
    
    try {
      // Here we would call the delete function from our hooks
      // For now, let's just refresh the projects list
      await refreshProjects();
    } catch (error) {
      console.error('Failed to delete project:', error);
      alert('Failed to delete project. Please try again.');
    }
  };
  
  if (isLoading) {
    return <div className="p-4 flex justify-center">Loading projects...</div>;
  }
  
  if (error) {
    return <div className="p-4 text-red-500">Error loading projects: {error.message}</div>;
  }
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };
  
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <button
          onClick={() => {
            setSelectedProject(null);
            setShowModal(true);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center"
        >
          <Plus size={20} className="mr-2" />
          New Project
        </button>
      </div>
      
      {projects.length === 0 ? (
        <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-lg p-6 text-center">
          <Folder size={64} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No projects yet</h3>
          <p className="text-gray-600 mb-4">
            Create your first project to get started with CAD/CAM designs.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Create Project
          </button>
        </div>
      ) : (
        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: {
              transition: {
                staggerChildren: 0.1
              }
            }
          }}
        >
          {projects.map((project) => (
            <motion.div
              key={project.id}
              variants={{
                hidden: { y: 20, opacity: 0 },
                visible: { y: 0, opacity: 1 }
              }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
              whileHover={{ y: -5, scale: 1.02 }}
              className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => router.push(`/projects/${project.id}`)}
            >
              <div className="p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-2">{project.name}</h3>
                {project.description && (
                  <p className="text-gray-600 mb-4 truncate">{project.description}</p>
                )}
                <div className="flex items-center text-sm text-gray-500 mb-2">
                  <Clock size={16} className="mr-2" />
                  Updated: {formatDate(project?.updatedAt ? project.updatedAt.toString() : '')}
                </div>
                <div className="flex items-center text-sm text-gray-500">
                  <Users size={16} className="mr-2" />
                  <span>
                    {project.organizationId
                      ? `${project.organizationId} (Organization)`
                      : `${project.ownerId|| 'Personal'}`}
                  </span>
                </div>
              </div>
              <div className="bg-gray-50 px-6 py-3 flex justify-between border-t border-gray-200">
                <div className="flex items-center space-x-4">
               
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={(e) => handleEditClick(project, e)}
                    className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                    title="Edit Project"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    onClick={(e) => handleDeleteProject(project.id, e)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                    title="Delete Project"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
      
      {/* Project Modal */}
     
    </div>
  );
}