// src/pages/projects/create.tsx - Updated version
import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";

import { motion, AnimatePresence, Variants } from "framer-motion";
import { FileText, Save, X, Users, Tag, Folder, ArrowLeft, Plus, Check } from "react-feather";
import { DynamicLayout } from "src/components/dynamic-imports";
import { createProject } from "@/src/lib/api/projects";
import { useProjects } from "@/src/hooks/useProjects";
import MetaTags from "@/src/components/layout/Metatags";

// Animation variants
const pageVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.1, 0.25, 1.0],
      staggerChildren: 0.1
    }
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: {
      duration: 0.3,
      ease: [0.25, 0.1, 0.25, 1.0]
    }
  }
};

const cardVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
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

const buttonVariants: Variants = {
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

const inputVariants: Variants = {
  focus: {
    scale: 1.02,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 25
    }
  }
};

interface Organization {
  id: string;
  name: string;
}

export default function CreateProjectPage() {

  const router = useRouter();
  const { addProject, isCreating, createError } = useProjects();

  // Form state
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedOrganization, setSelectedOrganization] = useState<string>("");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [currentTag, setCurrentTag] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  // Form status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch organizations
  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/organizations")
        .then(res => res.json())
        .then(data => {
          setOrganizations(data || []);
          setIsLoading(false);
        })
        .catch(err => {
          console.error("Error fetching organizations:", err);
          setOrganizations([]);
          setIsLoading(false);
        });
    }
  }, [status]);

  if (status === "unauthenticated") {
    router.push("/waitlist");
    return null;
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (!projectName.trim()) {
      setError("Project name is required");
      setIsSubmitting(false);
      return;
    }

    try {
      const newProject = await addProject({
        name: projectName,
        description,
        organizationId: selectedOrganization || undefined
      });

      setSuccess("Project created successfully!");
      setTimeout(() => {
        router.push(`/projects/${newProject.id}`);
      }, 1000);
    } catch (err: any) {
      setError(err.message || "Error creating project");
      setIsSubmitting(false);
    }
  };

  // Tag handling methods
  const handleAddTag = () => {
    if (currentTag.trim() && !tags.includes(currentTag.trim())) {
      setTags([...tags, currentTag.trim()]);
      setCurrentTag("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleTagKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  return (
    <DynamicLayout>
      <MetaTags ogImage="/og-image.png" title="Create New Project" />

      <motion.div
        className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={pageVariants}
      >
        <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
          {/* Header */}
          <motion.div
            className="mb-8"
            variants={cardVariants}
          >
            <div className="flex items-center mb-4">
              <motion.button
                onClick={() => router.back()}
                className="mr-4 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <ArrowLeft size={20} />
              </motion.button>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Create New Project
                </h1>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                  Projects are workspaces where you can organize drawings, models and components.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Success/Error Messages */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4"
              >
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <X className="h-5 w-5 text-red-400" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Error</h3>
                    <div className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</div>
                  </div>
                </div>
              </motion.div>
            )}

            {success && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4"
              >
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <Check className="h-5 w-5 text-green-400" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800 dark:text-green-200">Success</h3>
                    <div className="mt-2 text-sm text-green-700 dark:text-green-300">{success}</div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Form Card */}
          <motion.div
            className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl shadow-2xl rounded-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden"
            variants={cardVariants}
          >
            <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 dark:from-blue-600/20 dark:to-purple-600/20 p-6 border-b border-gray-200/50 dark:border-gray-700/50">
              <div className="flex items-center">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl mr-4">
                  <Folder className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Project Details</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Configure your new project settings</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-8">
              {/* Project Name */}
              <motion.div variants={cardVariants}>
                <label htmlFor="projectName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <FileText className="h-5 w-5 text-gray-400" />
                  </div>
                  <motion.input
                    type="text"
                    id="projectName"
                    value={projectName}
                    onChange={e => setProjectName(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all"
                    placeholder="Enter a name for your project"
                    variants={inputVariants}
                    whileFocus="focus"
                    required
                  />
                </div>
              </motion.div>

              {/* Description */}
              <motion.div variants={cardVariants}>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </label>
                <motion.textarea
                  id="description"
                  rows={4}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all resize-none"
                  placeholder="Describe your project and its objectives..."
                  variants={inputVariants}
                  whileFocus="focus"
                />
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Brief description of the project and its objectives.
                </p>
              </motion.div>

              {/* Organization */}
              <motion.div variants={cardVariants}>
                <label htmlFor="organization" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Organization
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Users className="h-5 w-5 text-gray-400" />
                  </div>
                  <motion.select
                    id="organization"
                    value={selectedOrganization}
                    onChange={e => setSelectedOrganization(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all appearance-none"
                    variants={inputVariants}
                    whileFocus="focus"
                  >
                    <option value="">Personal Project</option>
                    {organizations.map(org => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </motion.select>
                </div>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Select an organization or leave empty for a personal project.
                </p>
              </motion.div>

              {/* Tags */}
              <motion.div variants={cardVariants}>
                <label htmlFor="tags" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tags
                </label>
                <div className="flex rounded-xl shadow-sm">
                  <div className="relative flex-grow">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Tag className="h-5 w-5 text-gray-400" />
                    </div>
                    <motion.input
                      type="text"
                      id="tags"
                      value={currentTag}
                      onChange={e => setCurrentTag(e.target.value)}
                      onKeyPress={handleTagKeyPress}
                      className="w-full pl-12 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-l-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all"
                      placeholder="Add tags..."
                      variants={inputVariants}
                      whileFocus="focus"
                    />
                  </div>
                  <motion.button
                    type="button"
                    onClick={handleAddTag}
                    className="px-6 py-3 border border-l-0 border-gray-300 dark:border-gray-600 text-sm font-medium rounded-r-xl text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-600 hover:bg-gray-100 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    variants={buttonVariants}
                    whileHover="hover"
                    whileTap="tap"
                  >
                    <Plus size={16} />
                  </motion.button>
                </div>

                <AnimatePresence>
                  {tags.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 flex flex-wrap gap-2"
                    >
                      {tags.map(tag => (
                        <motion.span
                          key={tag}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-700"
                        >
                          {tag}
                          <motion.button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="ml-2 h-4 w-4 flex items-center justify-center rounded-full text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800 hover:text-blue-800 dark:hover:text-blue-200 focus:outline-none transition-colors"
                            whileHover={{ scale: 1.2 }}
                            whileTap={{ scale: 0.9 }}
                          >
                            <X size={10} />
                          </motion.button>
                        </motion.span>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Add tags to categorize your project and make it easier to find.
                </p>
              </motion.div>

              {/* Public Project Toggle */}
              <motion.div variants={cardVariants}>
                <div className="flex items-start space-x-3">
                  <div className="flex items-center h-6">
                    <motion.input
                      id="public"
                      name="public"
                      type="checkbox"
                      checked={isPublic}
                      onChange={e => setIsPublic(e.target.checked)}
                      className="h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 bg-white dark:bg-gray-700"
                      whileTap={{ scale: 0.95 }}
                    />
                  </div>
                  <div className="text-sm">
                    <label htmlFor="public" className="font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                      Public Project
                    </label>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                      If enabled, the project will be visible to all users in the public feed.
                    </p>
                  </div>
                </div>
              </motion.div>
            </form>

            {/* Footer Actions */}
            <div className="bg-gray-50/50 dark:bg-gray-800/50 px-6 py-4 border-t border-gray-200/50 dark:border-gray-700/50 flex justify-end space-x-3">
              <motion.button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-2.5 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-xl text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                variants={buttonVariants}
                whileHover="hover"
                whileTap="tap"
                disabled={isSubmitting}
              >
                Cancel
              </motion.button>
              <motion.button
                type="submit"
                form="project-form"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="inline-flex items-center px-6 py-2.5 border border-transparent shadow-sm text-sm font-medium rounded-xl text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                variants={buttonVariants}
                whileHover={!isSubmitting ? "hover" : {}}
                whileTap={!isSubmitting ? "tap" : {}}
              >
                {isSubmitting ? (
                  <>
                    <motion.div
                      className="w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    />
                    Creating...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Create Project
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </DynamicLayout>
  );
}
