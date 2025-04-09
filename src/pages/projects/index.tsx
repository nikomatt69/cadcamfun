// src/pages/projects/index.tsx
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { DynamicLayout } from 'src/components/dynamic-imports';
import { Plus, Folder, Clock, Users, Search, X, Filter, ArrowUp } from 'react-feather';
import { motion, AnimatePresence, MotionConfig, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { Project } from 'src/types/models';
import { fetchProjects } from 'src/lib/api/projects';
import { useApi } from 'src/hooks/useApi';
import ErrorBoundary from '@/src/components/ui/ErrorBonduary';
import Metatags from '@/src/components/layout/Metatags';

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

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { 
      staggerChildren: 0.07,
      delayChildren: 0.1
    }
  }
};

const itemVariants = {
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
  }
};

const buttonVariants = {
  hover: { 
    scale: 1.05,
    y: -2,
    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
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

const searchVariants = {
  hidden: {
    opacity: 0,
    y: -10,
    scale: 0.98
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 500,
      damping: 30
    }
  }
};

const emptyStateVariants = {
  hidden: {
    opacity: 0,
    scale: 0.9
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 25,
      delay: 0.2
    }
  }
};

const loadingVariants = {
  hidden: {
    opacity: 0,
    y: 20
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5
    }
  }
};

const errorVariants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    y: 20
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 25
    }
  }
};

const cardHoverVariants = {
  hover: {
    y: -8,
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 15
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

// Animated loading spinner component
const LoadingSpinner = () => {
  return (
    <motion.div 
      className="flex flex-col items-center justify-center h-64"
      variants={loadingVariants}
      initial="hidden"
      animate="visible"
    >
      <div className="relative w-16 h-16">
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
      </div>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="text-lg text-gray-600 mt-4"
      >
        Loading projects...
      </motion.p>
    </motion.div>
  );
};

// Error message component with retry button
const ErrorMessage = ({ message, onRetry }: { message: string, onRetry: () => void }) => {
  return (
    <motion.div
      className="bg-white dark:bg-gray-900 rounded-xl border border-red-200 dark:border-red-900/50 shadow-lg p-6 text-center"
      variants={errorVariants}
      initial="hidden"
      animate="visible"
    >
      <div className="bg-red-100 dark:bg-red-900/20 w-16 h-16 rounded-full mx-auto flex items-center justify-center text-red-500 dark:text-red-400 mb-4">
        <X size={32} />
      </div>
      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Error Loading Projects</h3>
      <p className="text-gray-600 dark:text-gray-400 mb-4">{message}</p>
      <motion.button
        onClick={onRetry}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-md shadow-blue-500/20"
        variants={buttonVariants}
        whileHover="hover"
        whileTap="tap"
      >
        Try Again
      </motion.button>
    </motion.div>
  );
};

// Empty state component
const EmptyState = () => {
  return (
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
        <Folder size={36} className="text-blue-500 dark:text-blue-400" />
      </motion.div>
      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">No projects yet</h3>
      <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
        Create your first project to get started with CAD/CAM designs.
      </p>
      <Link href={'/projects/create'}>
        <motion.button
          className="bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-md shadow-blue-500/20 flex items-center mx-auto"
          variants={buttonVariants}
          whileHover="hover"
          whileTap="tap"
        >
          <Plus size={18} className="mr-1.5" />
          Create Project
        </motion.button>
      </Link>
    </motion.div>
  );
};

// Project card component
const ProjectCard = ({ project, onClick }: { project: Project, onClick: () => void }) => {
  return (
    <motion.div
      key={project.id}
      variants={itemVariants}
      whileHover="hover"
      whileTap="tap"
      className="bg-white dark:bg-gray-900 shadow-md rounded-xl overflow-hidden cursor-pointer border border-gray-100 dark:border-gray-800 hover:border-blue-200 dark:hover:border-blue-900/50 transition-colors"
      onClick={onClick}
    >
      <div className="p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white group-hover:text-blue-600 mb-2">{project.name}</h3>
        {project.description && (
          <p className="text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">{project.description}</p>
        )}
        <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 mb-2">
          <Clock size={16} className="mr-2 flex-shrink-0" />
          <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
        </div>
        <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
          <Users size={16} className="mr-2 flex-shrink-0" />
          <span className="truncate">
            {project.organization
              ? `${project.organization.name} (Organization)`
              : `${project.owner?.name || project.owner?.email || 'Personal'}`}
          </span>
        </div>
      </div>
      <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-3 flex justify-between border-t border-gray-100 dark:border-gray-800">
        <motion.span 
          className="text-sm text-gray-500 dark:text-gray-400 flex items-center"
          whileHover={{ scale: 1.05 }}
        >
          {project._count?.drawings || 0} drawings
        </motion.span>
        <motion.span 
          className="text-sm text-gray-500 dark:text-gray-400 flex items-center"
          whileHover={{ scale: 1.05 }}
        >
          {project._count?.components || 0} components
        </motion.span>
      </div>
    </motion.div>
  );
};

export default function ProjectsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const [searchTerm, setSearchTerm] = useState('');
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  
  // Utilizziamo il nostro hook personalizzato
  const { 
    data: projects, 
    isLoading, 
    error, 
    execute: loadProjects 
  } = useApi<Project[]>();

  useEffect(() => {
    // Carica i progetti solo se l'utente è autenticato
    if (status === 'authenticated') {
      loadProjects(() => fetchProjects());
    }
  }, [status, loadProjects]);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setShowScrollToTop(true);
      } else {
        setShowScrollToTop(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Funzione per gestire la ricerca
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadProjects(() => fetchProjects());
  };

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  // Gestione degli stati di autenticazione e caricamento
  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }

  return (
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <Metatags title={'Projects'} />
        <DynamicLayout>
          <motion.div 
            className="p-5 md:p-6 max-w-7xl mx-auto"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={shouldReduceMotion ? {} : pageTransition}
          >
            {/* Header section */}
            <motion.div 
              className="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4"
              variants={searchVariants}
            >
              <motion.h1 
                className="text-2xl font-bold text-gray-900 dark:text-white"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                I Tuoi Progetti
              </motion.h1>
              <Link href={'/projects/create'}>
                <motion.button 
                  className="bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center shadow-md shadow-blue-500/20"
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  <Plus size={18} className="mr-1.5" />
                  Nuovo Progetto
                </motion.button>
              </Link>
            </motion.div>

            {/* Search form */}
            <motion.form 
              onSubmit={handleSearch} 
              className="mb-8"
              variants={searchVariants}
            >
              <div className={`relative flex transition-all duration-200 ${searchFocused ? 'transform scale-[1.02]' : ''}`}>
                <div className="relative flex-grow">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search size={18} className="text-gray-400 dark:text-gray-500" />
                  </div>
                  <motion.input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    placeholder="Cerca nei progetti..."
                    className="flex-grow w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-700 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white transition-all"
                    whileFocus={{ scale: 1.01 }}
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <motion.button
                  type="submit"
                  className="bg-blue-600 text-white px-5 py-3 rounded-r-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-center shadow-md shadow-blue-500/20"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Cerca
                </motion.button>
                <motion.button
                  type="button"
                  className="ml-2 p-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  title="Filter projects"
                >
                  <Filter size={18} />
                </motion.button>
              </div>
            </motion.form>

            {/* Content area */}
            {isLoading ? (
              <LoadingSpinner />
            ) : error ? (
              <ErrorMessage 
                message={`Error loading projects: ${error.message}`} 
                onRetry={() => loadProjects(() => fetchProjects())} 
              />
            ) : projects && projects.length === 0 ? (
              <EmptyState />
            ) : (
              <motion.div 
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {projects && projects.map((project) => (
                  <ProjectCard 
                    key={project.id} 
                    project={project} 
                    onClick={() => router.push(`/projects/${project.id}`)} 
                  />
                ))}
              </motion.div>
            )}

            {/* Scroll to top button */}
            <AnimatePresence>
              {showScrollToTop && (
                <motion.button
                  className="fixed bottom-6 right-6 p-3 bg-blue-600 text-white rounded-full shadow-lg shadow-blue-500/30 z-50 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  onClick={scrollToTop}
                  initial={{ opacity: 0, scale: 0, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0, y: 10 }}
                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                  whileHover={{ y: -5, boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)" }}
                  whileTap={{ scale: 0.9 }}
                >
                  <ArrowUp size={20} />
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        </DynamicLayout>
      </ErrorBoundary>
    </MotionConfig>
  );
}