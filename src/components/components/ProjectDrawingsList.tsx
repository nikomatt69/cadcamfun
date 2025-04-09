// src/components/drawings/ProjectDrawingsList.tsx

import React, { useState } from 'react';
import { useProjectDrawings } from 'src/hooks/useDrawings';

import { File, Grid, Edit, Trash2, Copy, Download, Plus } from 'react-feather';
import Link from 'next/link';
import Image from 'next/image';
import { Drawing } from '@/src/types/mainTypes';

interface ProjectDrawingsListProps {
  projectId: string;
}

export default function ProjectDrawingsList({ projectId }: ProjectDrawingsListProps) {
  // State for the modal
  const [showModal, setShowModal] = useState(false);
  const [selectedDrawing, setSelectedDrawing] = useState<Drawing | null>(null);
  
  // Fetch project drawings using our custom hook
  const { 
    drawings, 
    isLoading, 
    error, 
    refreshDrawings, 
    addDrawing 
  } = useProjectDrawings(projectId);
  
  // Handle drawing creation
  const handleCreateDrawing = async (drawingData: any) => {
    try {
      const newDrawing = await addDrawing(drawingData);
      setShowModal(false);
      // Navigate to CAD editor with the new drawing
      window.location.href = `/cad?drawingId=${newDrawing?.id}`;
    } catch (error) {
      console.error('Failed to create drawing:', error);
      alert('Failed to create drawing. Please try again.');
    }
  };
  
  // Handle opening the edit modal
  const handleEditClick = (drawing: Drawing, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDrawing(drawing);
    setShowModal(true);
  };
  
  // Handle drawing duplication
  const handleDuplicateDrawing = async (drawing: Drawing, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await addDrawing({
        name: `${drawing.name} (Copy)`,
        description: drawing?.description||"",
        data: drawing.data,
        thumbnail: drawing.thumbnail||""
      });
    } catch (error) {
      console.error('Failed to duplicate drawing:', error);
      alert('Failed to duplicate drawing. Please try again.');
    }
  };
  
  // Handle drawing deletion
  const handleDeleteDrawing = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this drawing?')) return;
    
    try {
      // Here we would call the delete function from our hooks
      // For now, let's just refresh the drawings list
      await refreshDrawings();
    } catch (error) {
      console.error('Failed to delete drawing:', error);
      alert('Failed to delete drawing. Please try again.');
    }
  };
  
  if (isLoading) {
    return <div className="p-4 flex justify-center">Loading drawings...</div>;
  }
  
  if (error) {
    return <div className="p-4 text-red-500">Error loading drawings: {error.message}</div>;
  }
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };
  
  return (
    <div className="my-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Project Drawings</h2>
        <button
          onClick={() => {
            setSelectedDrawing(null);
            setShowModal(true);
          }}
          className="bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center"
        >
          <Plus size={16} className="mr-1" />
          New Drawing
        </button>
      </div>
      
      {drawings.length === 0 ? (
        <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-lg p-6 text-center">
          <File size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No drawings yet</h3>
          <p className="text-gray-600 mb-4">
            Create your first drawing to start designing in the CAD editor.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Create Drawing
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {drawings.map((drawing) => (
            <div
              key={drawing.id}
              className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => window.location.href = `/cad?drawingId=${drawing.id}`}
            >
              <div className="h-48 bg-gray-100 flex items-center justify-center">
                {drawing.thumbnail ? (
                  <img 
                    src={drawing.thumbnail} 
                    alt={drawing.name} 
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <Grid size={48} className="text-gray-400" />
                )}
              </div>
              
              <div className="p-4">
                <h3 className="text-lg font-medium text-gray-900">{drawing.name}</h3>
                {drawing.description && (
                  <p className="text-sm text-gray-600 mt-1">{drawing.description}</p>
                )}
                <div className="mt-2 text-xs text-gray-500">
                  Updated: {formatDate(drawing?.updatedAt ? drawing.updatedAt.toString() : '')}
                </div>
              </div>
              
              <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex justify-end space-x-2">
                <button 
                  onClick={(e) => handleEditClick(drawing, e)}
                  className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                  title="Edit Drawing Info"
                >
                  <Edit size={16} />
                </button>
                <button 
                  onClick={(e) => handleDuplicateDrawing(drawing, e)}
                  className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                  title="Duplicate Drawing"
                >
                  <Copy size={16} />
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    // Download logic would go here
                  }}
                  className="p-1 text-green-600 hover:bg-green-50 rounded"
                  title="Download Drawing"
                >
                  <Download size={16} />
                </button>
                <button 
                  onClick={(e) => handleDeleteDrawing(drawing.id, e)}
                  className="p-1 text-red-600 hover:bg-red-50 rounded"
                  title="Delete Drawing"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Drawing Modal */}
      
    </div>
  );
}