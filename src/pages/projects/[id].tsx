// src/pages/projects/[id].tsx
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { DynamicLayout } from 'src/components/dynamic-imports';
import { 
  Grid, File, Plus, Clock, Users, 
  Edit, Trash2, Download, Share, Copy, ChevronRight,
  Tool, ArrowLeft, Check
} from 'react-feather';
import { motion, AnimatePresence, MotionConfig, useReducedMotion } from 'framer-motion';
import Modal from 'src/components/ui/Modal';
import { Component, Drawing, Project, Toolpath } from '@prisma/client';
import Metatags from '@/src/components/layout/Metatags';
import { cn } from '@/src/lib/utils';

// Animation variants
const pageTransition = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { 
      when: "beforeChildren",
      staggerChildren: 0.1,
      duration: 0.4,
      ease: [0.25, 0.1, 0.25, 1.0]
    }
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.2,
      ease: [0.25, 0.1, 0.25, 1.0]
    }
  }
};

const cardContainerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { 
      staggerChildren: 0.07,
      delayChildren: 0.1
    }
  }
};

const cardVariants = {
  hidden: { 
    y: 20, 
    opacity: 0,
    scale: 0.95
  },
  visible: { 
    y: 0, 
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 25
    }
  },
  hover: {
    y: -8,
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
    transition: {
      type: "spring", 
      stiffness: 400, 
      damping: 20
    }
  },
  tap: { 
    scale: 0.98,
    transition: { 
      type: "spring", 
      stiffness: 400, 
      damping: 17 
    }
  }
};

const fadeUpVariant = {
  hidden: { 
    y: 20, 
    opacity: 0 
  },
  visible: { 
    y: 0, 
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 30
    }
  },
  exit: { 
    y: -20, 
    opacity: 0,
    transition: {
      duration: 0.2
    }
  }
};

const tabContentVariants = {
  hidden: { 
    opacity: 0, 
    x: -5,
    filter: "blur(5px)"
  },
  visible: { 
    opacity: 1, 
    x: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.4,
      ease: [0.25, 0.1, 0.25, 1.0]
    }
  },
  exit: { 
    opacity: 0,
    x: 5,
    filter: "blur(5px)",
    transition: {
      duration: 0.3,
      ease: [0.25, 0.1, 0.25, 1.0]
    }
  }
};

const emptyStateVariants = {
  hidden: { 
    opacity: 0, 
    scale: 0.8 
  },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 25,
      delay: 0.1
    }
  }
};

const buttonHoverVariants = {
  hover: { 
    scale: 1.05,
    y: -2,
    transition: {
      type: "spring",
      stiffness: 400, 
      damping: 10
    }
  },
  tap: { 
    scale: 0.95 
  }
};

export default function ProjectDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { id } = router.query;
  const shouldReduceMotion = useReducedMotion();
  
  const [project, setProject] = useState<Project | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [toolpaths, setToolpaths] = useState<Toolpath[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showNewDrawingModal, setShowNewDrawingModal] = useState(false);
  const [showNewComponentModal, setShowNewComponentModal] = useState(false);
  const [showNewToolpathModal, setShowNewToolpathModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sucessMessage, setSuccessMessage] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'mill',
    operationType: 'contour'
  });
  const [activeTab, setActiveTab] = useState<'drawings' | 'components' | 'toolpaths'>('drawings');

  useEffect(() => {
    if (id && typeof id === 'string') {
      fetchProjectData(id);
    }
  }, [id]);
  
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }
  
  const fetchProjectData = async (projectId: string) => {
    setIsLoading(true);
    try {
      // Fetch project details
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch project');
      }
      const data = await response.json();
      setProject(data);
      setFormData({
        name: data.name,
        description: data.description || '',
        type: 'mill',
        operationType: 'contour'
      });
      
      // Fetch project drawings
      const drawingsResponse = await fetch(`/api/projects/${projectId}/drawings`);
      if (drawingsResponse.ok) {
        const drawingsData = await drawingsResponse.json();
        setDrawings(drawingsData);
      }
      
      // Fetch project components
      const componentsResponse = await fetch(`/api/projects/${projectId}/components`);
      if (componentsResponse.ok) {
        const componentsData = await componentsResponse.json();
        setComponents(componentsData);
      }

      // Fetch project toolpaths
      const toolpathsResponse = await fetch(`/api/projects/${projectId}/toolpaths`);
      if (toolpathsResponse.ok) {
        const toolpathsData = await toolpathsResponse.json();
        setToolpaths(toolpathsData);
      }
    } catch (error) {
      console.error('Error fetching project data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!project) return;
    
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update project');
      }
      
      const updatedProject = await response.json();
      setProject(updatedProject);
      setShowEditModal(false);
      showSuccessToast('Project updated successfully');
    } catch (error) {
      console.error('Error updating project:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!project) return;
    
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete project');
      }
      
      router.push('/projects');
    } catch (error) {
      console.error('Error deleting project:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateDrawing = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!project) return;
    
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/drawings`, {
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
        throw new Error('Failed to create drawing');
      }
      
      const newDrawing = await response.json();
      setDrawings(prev => [newDrawing, ...prev]);
      setShowNewDrawingModal(false);
      
      // Navigate to the CAD editor with the new drawing
      router.push(`/cad?drawingId=${newDrawing.id}`);
    } catch (error) {
      console.error('Error creating drawing:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!project) return;
    
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/components`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          type: 'custom'
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create component');
      }
      
      const newComponent = await response.json();
      setComponents(prev => [newComponent, ...prev]);
      setShowNewComponentModal(false);
      
      // Navigate to the component editor
      router.push(`/components/${newComponent.id}`);
    } catch (error) {
      console.error('Error creating component:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateToolpath = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!project) return;
    
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/toolpaths`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          type: formData.type,
          operationType: formData.operationType,
          data: {},
          gcode: '',
          isPublic: false
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create toolpath');
      }
      
      const newToolpath = await response.json();
      setToolpaths(prev => [newToolpath, ...prev]);
      setShowNewToolpathModal(false);
      
      // Navigate to the CAM editor
      router.push(`/cam?toolpathId=${newToolpath.id}`);
    } catch (error) {
      console.error('Error creating toolpath:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const openModal = (modalType: 'drawing' | 'component' | 'toolpath') => {
    setFormData({ name: '', description: '', type: 'mill', operationType: 'contour' });
    if (modalType === 'drawing') {
      setShowNewDrawingModal(true);
    } else if (modalType === 'component') {
      setShowNewComponentModal(true);
    } else {
      setShowNewToolpathModal(true);
    }
  };

  const showSuccessToast = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // Loading state with animation
  if (isLoading) {
    return (
      <DynamicLayout>
        <div className="flex flex-col items-center justify-center h-full min-h-[60vh]">
          <motion.div
            className="relative w-16 h-16"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div 
              className="absolute inset-0 border-4 border-blue-200 border-t-blue-600 rounded-full"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            />
            <motion.div 
              className="absolute inset-1 border-4 border-transparent border-t-blue-400 rounded-full"
              animate={{ rotate: -180 }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
            />
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-lg text-gray-600 mt-4"
          >
            Loading project details...
          </motion.p>
        </div>
      </DynamicLayout>
    );
  }

  // Project not found state
  if (!project) {
    return (
      <DynamicLayout>
        <motion.div 
          className="flex flex-col items-center justify-center p-6 text-center h-full min-h-[60vh]"
          initial="hidden"
          animate="visible"
          variants={fadeUpVariant}
        >
          <motion.div 
            className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6"
            whileHover={{ scale: 1.05, rotate: 5 }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
          >
            <File size={36} className="text-gray-400" />
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-2xl font-bold text-gray-900 dark:text-white mb-4"
          >
            Project Not Found
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-gray-600 dark:text-gray-300 mb-8 max-w-md"
          >
            The project you are looking for doesn&apos;t exist or you don&apos;t have access to it.
          </motion.p>
          <motion.button
            onClick={() => router.push('/projects')}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center shadow-lg shadow-blue-500/20"
            variants={buttonHoverVariants}
            whileHover="hover"
            whileTap="tap"
          >
            <ArrowLeft size={16} className="mr-2" />
            Back to Projects
          </motion.button>
        </motion.div>
      </DynamicLayout>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <Metatags 
        title={project.name}
        description={project.description || ''}
        ogImage={`/api/og-image/project/${project.id}?title=${encodeURIComponent(project.name)}`} 
      />
      <DynamicLayout>
        <motion.div 
          className="p-4 md:p-6 max-w-7xl mx-auto"
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={shouldReduceMotion ? {} : pageTransition}
        >
          {/* Success toast message */}
          <AnimatePresence>
            {sucessMessage && (
              <motion.div 
                className="fixed top-4 right-4 z-50 bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded shadow-lg max-w-sm"
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              >
                <div className="flex items-center">
                  <Check size={20} className="mr-2 flex-shrink-0" />
                  <p>{sucessMessage}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Project header */}
          <motion.div 
            className="bg-white dark:bg-gray-900 shadow-lg rounded-xl p-5 md:p-6 mb-8 overflow-hidden border border-gray-100 dark:border-gray-800"
            variants={fadeUpVariant}
          >
            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
              <div>
                <motion.h1 
                  className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  {project.name}
                </motion.h1>
                {project.description && (
                  <motion.p 
                    className="text-gray-600 dark:text-gray-300 mt-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                  >
                    {project.description}
                  </motion.p>
                )}
                <motion.div 
                  className="mt-4 flex flex-wrap items-center text-sm text-gray-500 dark:text-gray-400 gap-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                >
                  <div className="flex items-center">
                    <Clock size={16} className="mr-1.5" />
                    <span>Updated: {formatDate(project.updatedAt as unknown as string)}</span>
                  </div>
                  <div className="flex items-center">
                    <Users size={16} className="mr-1.5" />
                    <span>
                      {project.organizationId
                        ? `${project.organizationId} (Organization)`
                        : `${project.ownerId || project.ownerId} (Personal)`}
                    </span>
                  </div>
                </motion.div>
              </div>
              <div className="flex flex-wrap gap-2 mt-2 md:mt-0">
                <motion.button
                  onClick={() => setShowEditModal(true)}
                  className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 px-3.5 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center shadow-sm"
                  variants={buttonHoverVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  <Edit size={16} className="mr-1.5" />
                  Edit
                </motion.button>
                <motion.button
                  onClick={() => setShowDeleteModal(true)}
                  className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-red-600 dark:text-red-400 px-3.5 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 flex items-center shadow-sm"
                  variants={buttonHoverVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  <Trash2 size={16} className="mr-1.5" />
                  Delete
                </motion.button>
              </div>
            </div>
          </motion.div>
          
          {/* Project content */}
          <motion.div
            variants={fadeUpVariant}
          >
            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700 mb-8">
              <nav className="-mb-px flex space-x-8">
                <motion.button
                  className={cn(
                    "px-4 py-2 font-medium text-sm focus:outline-none relative",
                    activeTab === 'drawings'
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  )}
                  onClick={() => setActiveTab('drawings')}
                  whileHover={{ y: -2 }}
                  whileTap={{ y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  Drawings
                  {activeTab === 'drawings' && (
                    <motion.div 
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" 
                      layoutId="activeTabIndicator"
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}
                </motion.button>
                <motion.button
                  className={cn(
                    "px-4 py-2 font-medium text-sm focus:outline-none relative",
                    activeTab === 'components'
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  )}
                  onClick={() => setActiveTab('components')}
                  whileHover={{ y: -2 }}
                  whileTap={{ y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  Components
                  {activeTab === 'components' && (
                    <motion.div 
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" 
                      layoutId="activeTabIndicator"
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}
                </motion.button>
                <motion.button
                  className={cn(
                    "px-4 py-2 font-medium text-sm focus:outline-none relative",
                    activeTab === 'toolpaths'
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  )}
                  onClick={() => setActiveTab('toolpaths')}
                  whileHover={{ y: -2 }}
                  whileTap={{ y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  Toolpaths
                  {activeTab === 'toolpaths' && (
                    <motion.div 
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" 
                      layoutId="activeTabIndicator"
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}
                </motion.button>
              </nav>
            </div>
            
            {/* Tab content */}
            <AnimatePresence mode="wait">
              {activeTab === 'drawings' && (
                <motion.div
                  key="drawings-tab"
                  variants={tabContentVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-3">
                    <h2 className="text-lg font-medium text-gray-900 dark:text-white">Project Drawings</h2>
                    <motion.button
                      onClick={() => openModal('drawing')}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-center shadow-md shadow-blue-500/20"
                      variants={buttonHoverVariants}
                      whileHover="hover"
                      whileTap="tap"
                    >
                      <Plus size={16} className="mr-1.5" />
                      New Drawing
                    </motion.button>
                  </div>
                  
                  {/* Empty state */}
                  {drawings.length === 0 ? (
                    <motion.div 
                      className="bg-white dark:bg-gray-900 shadow-lg rounded-xl p-8 text-center border border-gray-100 dark:border-gray-800"
                      variants={emptyStateVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <motion.div 
                        className="mx-auto w-20 h-20 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-6"
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        transition={{ type: "spring", stiffness: 300, damping: 15 }}
                      >
                        <File size={32} className="text-blue-500 dark:text-blue-400" />
                      </motion.div>
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">No drawings yet</h3>
                      <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                        Create your first drawing to start designing in the CAD editor.
                      </p>
                      <motion.button
                        onClick={() => openModal('drawing')}
                        className="bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-md shadow-blue-500/20"
                        variants={buttonHoverVariants}
                        whileHover="hover"
                        whileTap="tap"
                      >
                        <span className="flex items-center">
                          <Plus size={18} className="mr-1.5" />
                          Create Drawing
                        </span>
                      </motion.button>
                    </motion.div>
                  ) : (
                    // Drawings grid
                    <motion.div 
                      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6"
                      variants={cardContainerVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      {drawings.map((drawing) => (
                        <motion.div
                          key={drawing.id}
                          variants={cardVariants}
                          whileHover="hover"
                          whileTap="tap"
                          className="bg-white dark:bg-gray-900 shadow-md rounded-xl overflow-hidden cursor-pointer border border-gray-100 dark:border-gray-800 group"
                          onClick={() => router.push(`/cad?drawingId=${drawing.id}`)}
                          layout
                        >
                          <div className="h-44 sm:h-48 bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                            {drawing.thumbnail ? (
                              <motion.img 
                                src={drawing.thumbnail} 
                                alt={drawing.name} 
                                className="h-full w-full object-contain"
                                initial={{ scale: 1 }}
                                whileHover={{ scale: 1.08 }}
                                transition={{ duration: 0.4 }}
                              />
                            ) : (
                              <motion.div
                                whileHover={{ rotate: 10, scale: 1.1 }}
                                className="p-6 bg-blue-50 dark:bg-blue-900/20 rounded-full"
                              >
                                <Grid size={40} className="text-blue-500 dark:text-blue-400" />
                              </motion.div>
                            )}
                          </div>
                          <div className="p-5">
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{drawing.name}</h3>
                            {drawing.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{drawing.description}</p>
                            )}
                            <div className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                              Updated: {formatDate(drawing.updatedAt as unknown as string)}
                            </div>
                          </div>
                          <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex justify-end space-x-1">
                            <motion.button 
                              onClick={(e) => {
                                e.stopPropagation();
                                // Handle edit drawing
                              }}
                              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md"
                              whileHover={{ scale: 1.2 }}
                              whileTap={{ scale: 0.9 }}
                            >
                              <Edit size={16} />
                            </motion.button>
                            <motion.button 
                              onClick={(e) => {
                                e.stopPropagation();
                                // Handle duplicate drawing
                              }}
                              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md"
                              whileHover={{ scale: 1.2 }}
                              whileTap={{ scale: 0.9 }}
                            >
                              <Copy size={16} />
                            </motion.button>
                            <motion.button 
                              onClick={(e) => {
                                e.stopPropagation();
                                // Handle download drawing
                              }}
                              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md"
                              whileHover={{ scale: 1.2 }}
                              whileTap={{ scale: 0.9 }}
                            >
                              <Download size={16} />
                            </motion.button>
                            <motion.button 
                              onClick={(e) => {
                                e.stopPropagation();
                                // Handle delete drawing
                              }}
                              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
                              whileHover={{ scale: 1.2 }}
                              whileTap={{ scale: 0.9 }}
                            >
                              <Trash2 size={16} />
                            </motion.button>
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </motion.div>
              )}
              
              {activeTab === 'components' && (
                <motion.div
                  key="components-tab"
                  variants={tabContentVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-3">
                    <h2 className="text-lg font-medium text-gray-900 dark:text-white">Project Components</h2>
                    <motion.button
                      onClick={() => openModal('component')}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-center shadow-md shadow-blue-500/20"
                      variants={buttonHoverVariants}
                      whileHover="hover"
                      whileTap="tap"
                    >
                      <Plus size={16} className="mr-1.5" />
                      New Component
                    </motion.button>
                  </div>
                  
                  {/* Empty state */}
                  {components.length === 0 ? (
                    <motion.div 
                      className="bg-white dark:bg-gray-900 shadow-lg rounded-xl p-8 text-center border border-gray-100 dark:border-gray-800"
                      variants={emptyStateVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <motion.div 
                        className="mx-auto w-20 h-20 bg-purple-50 dark:bg-purple-900/20 rounded-full flex items-center justify-center mb-6"
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        transition={{ type: "spring", stiffness: 300, damping: 15 }}
                      >
                        <File size={32} className="text-purple-500 dark:text-purple-400" />
                      </motion.div>
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">No components yet</h3>
                      <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                        Create reusable components to use across your CAD drawings.
                      </p>
                      <motion.button
                        onClick={() => openModal('component')}
                        className="bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-md shadow-blue-500/20"
                        variants={buttonHoverVariants}
                        whileHover="hover"
                        whileTap="tap"
                      >
                        <span className="flex items-center">
                          <Plus size={18} className="mr-1.5" />
                          Create Component
                        </span>
                      </motion.button>
                    </motion.div>
                  ) : (
                    // Components grid
                    <motion.div 
                      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6"
                      variants={cardContainerVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      {components.map((component) => (
                        <motion.div
                          key={component.id}
                          variants={cardVariants}
                          whileHover="hover"
                          whileTap="tap"
                          className="bg-white dark:bg-gray-900 shadow-md rounded-xl overflow-hidden cursor-pointer border border-gray-100 dark:border-gray-800 group"
                          onClick={() => router.push(`/components/${component.id}`)}
                          layout
                        >
                          <div className="h-40 sm:h-40 bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                            {component.thumbnail ? (
                              <motion.img 
                                src={component.thumbnail} 
                                alt={component.name} 
                                className="h-full w-full object-contain"
                                initial={{ scale: 1 }}
                                whileHover={{ scale: 1.08 }}
                                transition={{ duration: 0.4 }}
                              />
                            ) : (
                              <motion.div
                                whileHover={{ rotate: 10, scale: 1.1 }}
                                className="p-6 bg-purple-50 dark:bg-purple-900/20 rounded-full"
                              >
                                <File size={36} className="text-purple-500 dark:text-purple-400" />
                              </motion.div>
                            )}
                          </div>
                          <div className="p-5">
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{component.name}</h3>
                            {component.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{component.description}</p>
                            )}
                          </div>
                          <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex justify-end space-x-1">
                            <motion.button 
                              onClick={(e) => {
                                e.stopPropagation();
                                // Handle edit component
                              }}
                              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md"
                              whileHover={{ scale: 1.2 }}
                              whileTap={{ scale: 0.9 }}
                            >
                              <Edit size={16} />
                            </motion.button>
                            <motion.button 
                              onClick={(e) => {
                                e.stopPropagation();
                                // Handle duplicate component
                              }}
                              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md"
                              whileHover={{ scale: 1.2 }}
                              whileTap={{ scale: 0.9 }}
                            >
                              <Copy size={16} />
                            </motion.button>
                            <motion.button 
                              onClick={(e) => {
                                e.stopPropagation();
                                // Handle delete component
                              }}
                              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
                              whileHover={{ scale: 1.2 }}
                              whileTap={{ scale: 0.9 }}
                            >
                              <Trash2 size={16} />
                            </motion.button>
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </motion.div>
              )}

              {activeTab === 'toolpaths' && (
                <motion.div
                  key="toolpaths-tab"
                  variants={tabContentVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-3">
                    <h2 className="text-lg font-medium text-gray-900 dark:text-white">Project Toolpaths</h2>
                    <motion.button
                      onClick={() => openModal('toolpath')}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-center shadow-md shadow-blue-500/20"
                      variants={buttonHoverVariants}
                      whileHover="hover"
                      whileTap="tap"
                    >
                      <Plus size={16} className="mr-1.5" />
                      New Toolpath
                    </motion.button>
                  </div>
                  
                  {/* Empty state */}
                  {toolpaths.length === 0 ? (
                    <motion.div 
                      className="bg-white dark:bg-gray-900 shadow-lg rounded-xl p-8 text-center border border-gray-100 dark:border-gray-800"
                      variants={emptyStateVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      <motion.div 
                        className="mx-auto w-20 h-20 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mb-6"
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        transition={{ type: "spring", stiffness: 300, damping: 15 }}
                      >
                        <Tool size={32} className="text-green-500 dark:text-green-400" />
                      </motion.div>
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">No toolpaths yet</h3>
                      <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                        Create your first toolpath to start machining your designs.
                      </p>
                      <motion.button
                        onClick={() => openModal('toolpath')}
                        className="bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-md shadow-blue-500/20"
                        variants={buttonHoverVariants}
                        whileHover="hover"
                        whileTap="tap"
                      >
                        <span className="flex items-center">
                          <Plus size={18} className="mr-1.5" />
                          Create Toolpath
                        </span>
                      </motion.button>
                    </motion.div>
                  ) : (
                    // Toolpaths grid
                    <motion.div 
                      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6"
                      variants={cardContainerVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      {toolpaths.map((toolpath) => (
                        <motion.div
                          key={toolpath.id}
                          variants={cardVariants}
                          whileHover="hover"
                          whileTap="tap"
                          className="bg-white dark:bg-gray-900 shadow-md rounded-xl overflow-hidden cursor-pointer border border-gray-100 dark:border-gray-800 group"
                          onClick={() => router.push(`/cam?toolpathId=${toolpath.id}`)}
                          layout
                        >
                          <div className="h-40 sm:h-40 bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                            <motion.div
                              whileHover={{ rotate: 10, scale: 1.1 }}
                              className="p-6 bg-green-50 dark:bg-green-900/20 rounded-full"
                            >
                              <Tool size={36} className="text-green-500 dark:text-green-400" />
                            </motion.div>
                          </div>
                          <div className="p-5">
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{toolpath.name}</h3>
                            {toolpath.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{toolpath.description}</p>
                            )}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <motion.span 
                                className="px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 rounded-full"
                                whileHover={{ scale: 1.05 }}
                              >
                                {toolpath.type || 'mill'}
                              </motion.span>
                              <motion.span 
                                className="px-2.5 py-1 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 rounded-full"
                                whileHover={{ scale: 1.05 }}
                              >
                                {toolpath.operationType || 'contour'}
                              </motion.span>
                            </div>
                          </div>
                          <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex justify-end space-x-1">
                            <motion.button 
                              onClick={(e) => {
                                e.stopPropagation();
                                // Handle edit toolpath
                              }}
                              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md"
                              whileHover={{ scale: 1.2 }}
                              whileTap={{ scale: 0.9 }}
                            >
                              <Edit size={16} />
                            </motion.button>
                            <motion.button 
                              onClick={(e) => {
                                e.stopPropagation();
                                // Handle download gcode
                              }}
                              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md"
                              whileHover={{ scale: 1.2 }}
                              whileTap={{ scale: 0.9 }}
                            >
                              <Download size={16} />
                            </motion.button>
                            <motion.button 
                              onClick={(e) => {
                                e.stopPropagation();
                                // Handle delete toolpath
                              }}
                              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
                              whileHover={{ scale: 1.2 }}
                              whileTap={{ scale: 0.9 }}
                            >
                              <Trash2 size={16} />
                            </motion.button>
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
        
        {/* Edit Project Modal */}
        <AnimatePresence>
          {showEditModal && (
            <Modal
              isOpen={showEditModal}
              onClose={() => setShowEditModal(false)}
              title="Edit Project"
              size="sm"
              preventBackdropClose={true}
            >
              <form onSubmit={handleUpdateProject}>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Project Name
                    </label>
                    <motion.input
                      type="text"
                      id="name"
                      name="name"
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-all"
                      value={formData.name}
                      onChange={handleChange}
                      whileFocus={{ scale: 1.01, borderColor: 'rgb(59, 130, 246)' }}
                      required
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Description (optional)
                    </label>
                    <motion.textarea
                      id="description"
                      name="description"
                      rows={3}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-all"
                      value={formData.description}
                      onChange={handleChange}
                      whileFocus={{ scale: 1.01, borderColor: 'rgb(59, 130, 246)' }}
                    ></motion.textarea>
                  </div>
                </div>
                
                <div className="mt-6 flex justify-end space-x-3">
                  <motion.button
                    type="button"
                    className="px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    onClick={() => setShowEditModal(false)}
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    type="submit"
                    className="px-4 py-2.5 bg-blue-600 border border-transparent rounded-lg text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-md shadow-blue-500/20 flex items-center"
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <motion.div 
                          className="w-4 h-4 rounded-full border-2 border-transparent border-t-white mr-2" 
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        />
                        Saving...
                      </>
                    ) : 'Save Changes'}
                  </motion.button>
                </div>
              </form>
            </Modal>
          )}
        </AnimatePresence>
        
        {/* Delete Project Modal */}
        <AnimatePresence>
          {showDeleteModal && (
            <Modal
              isOpen={showDeleteModal}
              onClose={() => setShowDeleteModal(false)}
              title="Delete Project"
              size="sm"
            >
              <div className="p-1">
                <p className="text-gray-700 dark:text-gray-300 mb-6">
                  Are you sure you want to delete this project? This action cannot be undone and will delete all drawings and components associated with this project.
                </p>
                
                <div className="flex justify-end space-x-3">
                  <motion.button
                    type="button"
                    className="px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    onClick={() => setShowDeleteModal(false)}
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    type="button"
                    className="px-4 py-2.5 bg-red-600 border border-transparent rounded-lg text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 shadow-md shadow-red-500/20 flex items-center"
                    onClick={handleDeleteProject}
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <motion.div 
                          className="w-4 h-4 rounded-full border-2 border-transparent border-t-white mr-2" 
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 size={16} className="mr-1.5" />
                        Delete Project
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
            </Modal>
          )}
        </AnimatePresence>
        
        {/* New Drawing Modal */}
        <AnimatePresence>
          {showNewDrawingModal && (
            <Modal
              isOpen={showNewDrawingModal}
              onClose={() => setShowNewDrawingModal(false)}
              title="Create New Drawing"
              size="sm"
              preventBackdropClose={true}
            >
              <form onSubmit={handleCreateDrawing}>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Drawing Name
                    </label>
                    <motion.input
                      type="text"
                      id="name"
                      name="name"
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-all"
                      value={formData.name}
                      onChange={handleChange}
                      whileFocus={{ scale: 1.01, borderColor: 'rgb(59, 130, 246)' }}
                      required
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Description (optional)
                    </label>
                    <motion.textarea
                      id="description"
                      name="description"
                      rows={3}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-all"
                      value={formData.description}
                      onChange={handleChange}
                      whileFocus={{ scale: 1.01, borderColor: 'rgb(59, 130, 246)' }}
                    ></motion.textarea>
                  </div>
                </div>
                
                <div className="mt-6 flex justify-end space-x-3">
                  <motion.button
                    type="button"
                    className="px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    onClick={() => setShowNewDrawingModal(false)}
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    type="submit"
                    className="px-4 py-2.5 bg-blue-600 border border-transparent rounded-lg text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-md shadow-blue-500/20 flex items-center"
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <motion.div 
                          className="w-4 h-4 rounded-full border-2 border-transparent border-t-white mr-2" 
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        />
                        Creating...
                      </>
                    ) : 'Create & Open'}
                  </motion.button>
                </div>
              </form>
            </Modal>
          )}
        </AnimatePresence>
        
        {/* New Component Modal */}
        <AnimatePresence>
          {showNewComponentModal && (
            <Modal
              isOpen={showNewComponentModal}
              onClose={() => setShowNewComponentModal(false)}
              title="Create New Component"
              size="md"
              preventBackdropClose
            >
              <form onSubmit={handleCreateComponent}>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Component Name
                    </label>
                    <motion.input
                      type="text"
                      id="name"
                      name="name"
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-all"
                      value={formData.name}
                      onChange={handleChange}
                      whileFocus={{ scale: 1.01, borderColor: 'rgb(59, 130, 246)' }}
                      required
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Description (optional)
                    </label>
                    <motion.textarea
                      id="description"
                      name="description"
                      rows={3}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-all"
                      value={formData.description}
                      onChange={handleChange}
                      whileFocus={{ scale: 1.01, borderColor: 'rgb(59, 130, 246)' }}
                    ></motion.textarea>
                  </div>
                </div>
                
                <div className="mt-6 flex justify-end space-x-3">
                  <motion.button
                    type="button"
                    className="px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    onClick={() => setShowNewComponentModal(false)}
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    type="submit"
                    className="px-4 py-2.5 bg-blue-600 border border-transparent rounded-lg text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-md shadow-blue-500/20 flex items-center"
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <motion.div 
                          className="w-4 h-4 rounded-full border-2 border-transparent border-t-white mr-2" 
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        />
                        Creating...
                      </>
                    ) : 'Create & Open'}
                  </motion.button>
                </div>
              </form>
            </Modal>
          )}
        </AnimatePresence>

        {/* New Toolpath Modal */}
        <AnimatePresence>
          {showNewToolpathModal && (
            <Modal
              isOpen={showNewToolpathModal}
              onClose={() => setShowNewToolpathModal(false)}
              title="Create New Toolpath"
              size="md"
              preventBackdropClose
            >
              <form onSubmit={handleCreateToolpath}>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Toolpath Name
                    </label>
                    <motion.input
                      type="text"
                      id="name"
                      name="name"
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-all"
                      value={formData.name}
                      onChange={handleChange}
                      whileFocus={{ scale: 1.01, borderColor: 'rgb(59, 130, 246)' }}
                      required
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Description (optional)
                    </label>
                    <motion.textarea
                      id="description"
                      name="description"
                      rows={3}
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-all"
                      value={formData.description}
                      onChange={handleChange}
                      whileFocus={{ scale: 1.01, borderColor: 'rgb(59, 130, 246)' }}
                    ></motion.textarea>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Machine Type
                      </label>
                      <motion.select
                        id="type"
                        name="type"
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-all"
                        value={formData.type}
                        onChange={handleChange}
                        whileFocus={{ scale: 1.01, borderColor: 'rgb(59, 130, 246)' }}
                      >
                        <option value="mill">Mill</option>
                        <option value="lathe">Lathe</option>
                        <option value="3dprinter">3D Printer</option>
                      </motion.select>
                    </div>

                    <div>
                      <label htmlFor="operationType" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Operation Type
                      </label>
                      <motion.select
                        id="operationType"
                        name="operationType"
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-all"
                        value={formData.operationType}
                        onChange={handleChange}
                        whileFocus={{ scale: 1.01, borderColor: 'rgb(59, 130, 246)' }}
                      >
                        <option value="contour">Contour</option>
                        <option value="pocket">Pocket</option>
                        <option value="drill">Drill</option>
                        <option value="profile">3D Profile</option>
                      </motion.select>
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 flex justify-end space-x-3">
                  <motion.button
                    type="button"
                    className="px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    onClick={() => setShowNewToolpathModal(false)}
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    type="submit"
                    className="px-4 py-2.5 bg-blue-600 border border-transparent rounded-lg text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-md shadow-blue-500/20 flex items-center"
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <motion.div 
                          className="w-4 h-4 rounded-full border-2 border-transparent border-t-white mr-2" 
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        />
                        Creating...
                      </>
                    ) : 'Create & Open'}
                  </motion.button>
                </div>
              </form>
            </Modal>
          )}
        </AnimatePresence>
      </DynamicLayout>
    </MotionConfig>
  );
}