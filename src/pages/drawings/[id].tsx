// src/components/drawings/ProjectDrawingsList.tsx

import React, { useState, useEffect } from "react";
import { useProjectDrawings } from "src/hooks/useDrawings";
import { File, Grid, Edit, Trash2, Copy, Download, Plus, AlertCircle, Tool, List } from "react-feather";
import { motion, AnimatePresence, MotionConfig, Variants } from "framer-motion";
import { Drawing } from "@/src/types/mainTypes";
import { cn } from "@/src/lib/utils";

import { useRouter } from "next/router";
import MetaTags from "@/src/components/layout/Metatags";
import { DynamicLayout } from "src/components/dynamic-imports";
import { FileText, ArrowLeft, Eye, Activity, Calendar, User } from "react-feather";
import Link from "next/link";
import toast from "react-hot-toast";

// Animation variants
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1
    }
  }
};

const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 24
    }
  }
};

const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5 } }
};

const pageVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.1, 0.25, 1.0],
      staggerChildren: 0.1
    }
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.3,
      ease: [0.25, 0.1, 0.25, 1.0]
    }
  }
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 30
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

const tabContentVariants: Variants = {
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

interface ProjectDrawingsListProps {
  projectId: string;
}

export default function ProjectDrawingsList({ projectId }: ProjectDrawingsListProps) {
  // State for the modal
  const [showModal, setShowModal] = useState(false);
  const [selectedDrawing, setSelectedDrawing] = useState<Drawing | null>(null);
  const [drawingName, setDrawingName] = useState("");
  const [drawingDescription, setDrawingDescription] = useState("");


  // Fetch project drawings using our custom hook
  const { drawings, isLoading, error, refreshDrawings, addDrawing } = useProjectDrawings(projectId);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!showModal) {
      setDrawingName("");
      setDrawingDescription("");
      setSelectedDrawing(null);
    } else if (selectedDrawing) {
      setDrawingName(selectedDrawing.name);
      setDrawingDescription(selectedDrawing.description || "");
    }
  }, [showModal, selectedDrawing]);
  const router = useRouter();
  if (status === "unauthenticated") {
    router.push("/waitlist");
    return null;
  }
  // Handle drawing creation
  const handleCreateDrawing = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const drawingData = {
        name: drawingName,
        description: drawingDescription
      };

      const newDrawing = await addDrawing(drawingData as any);
      setShowModal(false);

      // Navigate to CAD editor with the new drawing
      if (newDrawing?.id) {
        window.location.href = `/cad?drawingId=${newDrawing.id}`;
      }
    } catch (error) {
      console.error("Failed to create drawing:", error);
      alert("Failed to create drawing. Please try again.");
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
        description: drawing?.description || "",
        data: drawing.data,
        thumbnail: drawing.thumbnail || ""
      });

      // Refresh the drawings list
      await refreshDrawings();
    } catch (error) {
      console.error("Failed to duplicate drawing:", error);
      alert("Failed to duplicate drawing. Please try again.");
    }
  };

  // Handle drawing deletion
  const handleDeleteDrawing = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this drawing?")) return;

    try {
      // Here we would call the delete function from our hooks
      // For now, let's just refresh the drawings list
      await refreshDrawings();
    } catch (error) {
      console.error("Failed to delete drawing:", error);
      alert("Failed to delete drawing. Please try again.");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <MotionConfig reducedMotion="user">
      <DynamicLayout>
        <motion.div
          className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={pageVariants}
        >
          <div className="p-4 md:p-6 max-w-7xl mx-auto">
            {/* Back button */}
            <motion.div
              className="mb-6"
              variants={cardVariants}
            >
              <Link href="/drawings">
                <motion.button
                  className="inline-flex items-center px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50 hover:bg-white/90 dark:hover:bg-gray-800/90 transition-all"
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  <ArrowLeft size={16} className="mr-2" />
                  Back to Drawings
                </motion.button>
              </Link>
            </motion.div>

            {/* Error display */}
            <AnimatePresence>
              {error && (
                <motion.div
                  className="backdrop-blur-md bg-red-50/80 dark:bg-red-900/20 rounded-2xl shadow-xl border border-red-200/50 dark:border-red-800/30 px-6 py-4 mb-6"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  variants={cardVariants}
                >
                  <div className="flex items-center text-red-700 dark:text-red-300">
                    <Activity size={20} className="mr-2" />
                    {error}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Drawing header */}
            <motion.div
              className="backdrop-blur-md bg-white/80 dark:bg-gray-900/80 rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/30 overflow-hidden mb-8"
              variants={cardVariants}
            >
              <div className="p-6 border-b border-gray-100/50 dark:border-gray-700/50">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
                  <div className="flex items-center">
                    <motion.div
                      className="w-12 h-12 rounded-2xl bg-gradient-to-r from-purple-500 to-blue-600 flex items-center justify-center mr-4"
                      whileHover={{ scale: 1.05, rotate: 5 }}
                    >
                      <FileText size={24} className="text-white" />
                    </motion.div>
                    <div>
                      <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                        {selectedDrawing ? selectedDrawing.name : "Drawing Details"}
                      </h1>
                      <p className="text-gray-600 dark:text-gray-400">
                        {selectedDrawing ? selectedDrawing.data.format : "Format: N/A"} • {selectedDrawing ? selectedDrawing.data.fileSize : "File Size: N/A"} • {selectedDrawing ? selectedDrawing.data.version : "Version: N/A"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <motion.button
                      className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 shadow-lg shadow-green-500/25"
                      variants={buttonVariants}
                      whileHover="hover"
                      whileTap="tap"
                      onClick={() => toast.success("Download started")}
                    >
                      <Download size={16} className="mr-2" />
                      Download
                    </motion.button>

                    <motion.button
                      className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-xl hover:from-blue-600 hover:to-cyan-700 shadow-lg shadow-blue-500/25"
                      variants={buttonVariants}
                      whileHover="hover"
                      whileTap="tap"
                      onClick={() => toast.success("Opening viewer...")}
                    >
                      <Eye size={16} className="mr-2" />
                      View
                    </motion.button>

                    <motion.button
                      className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl hover:from-purple-600 hover:to-pink-700 shadow-lg shadow-purple-500/25"
                      variants={buttonVariants}
                      whileHover="hover"
                      whileTap="tap"
                      onClick={() => toast.success("Opening editor...")}
                    >
                      <Edit size={16} className="mr-2" />
                      Edit
                    </motion.button>
                  </div>
                </div>

                {/* Status and basic info */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</span>
                      <motion.div
                        className={`w-3 h-3 rounded-full ${selectedDrawing ? (selectedDrawing.data.status === "approved" ? "bg-green-500" : selectedDrawing.data.status === "review" ? "bg-yellow-500" : "bg-gray-400") : ""
                          }`}
                        animate={selectedDrawing ? (selectedDrawing.data.status === "approved" ? { scale: [1, 1.2, 1] } : {}) : {}}
                        transition={{ repeat: Infinity, duration: 2 }}
                      />
                    </div>
                    <div className="mt-2 text-lg font-semibold capitalize text-gray-900 dark:text-white">
                      {selectedDrawing ? selectedDrawing.data.status : "Status: N/A"}
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 rounded-xl p-4">
                    <div className="flex items-center">
                      <Calendar size={16} className="text-gray-600 dark:text-gray-400 mr-2" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Created</span>
                    </div>
                    <div className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                      {selectedDrawing ? new Date(selectedDrawing.createdAt).toLocaleDateString() : "Created: N/A"}
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 rounded-xl p-4">
                    <div className="flex items-center">
                      <Activity size={16} className="text-gray-600 dark:text-gray-400 mr-2" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Modified</span>
                    </div>
                    <div className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                      {selectedDrawing ? new Date(selectedDrawing.updatedAt).toLocaleDateString() : "Modified: N/A"}
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 rounded-xl p-4">
                    <div className="flex items-center">
                      <User size={16} className="text-gray-600 dark:text-gray-400 mr-2" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Author</span>
                    </div>
                    <div className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                      {selectedDrawing ? selectedDrawing.data.author : "Author: N/A"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="border-b border-gray-200/50 dark:border-gray-700/50">
                <div className="flex space-x-8 px-6">
                  {[
                    { key: "overview", label: "Overview", icon: FileText },
                    { key: "versions", label: "Versions", icon: Calendar },
                    { key: "comments", label: "Comments", icon: Activity }
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      className={`py-3 px-1 font-medium text-sm border-b-2 focus:outline-none flex items-center ${selectedDrawing ? (selectedDrawing.data.key === tab.key ? "border-purple-500 text-purple-600 dark:text-purple-400" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300") : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                        }`}
                      onClick={() => setSelectedDrawing(selectedDrawing ? { ...selectedDrawing, data: { ...selectedDrawing.data, key: tab.key as any } } : null)}
                    >
                      <tab.icon size={16} className="mr-2" />
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab content */}
              <div className="p-6">
                <AnimatePresence mode="wait">
                  {selectedDrawing ? (
                    <>
                      {selectedDrawing.data.key === "overview" && (
                        <motion.div
                          key="overview-tab"
                          variants={tabContentVariants}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                        >
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Drawing Details */}
                            <div className="backdrop-blur-sm bg-white/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 rounded-xl p-6">
                              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                                <FileText size={18} className="mr-2" />
                                Drawing Details
                              </h3>

                              <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                  <span className="text-gray-600 dark:text-gray-400">Format</span>
                                  <span className="font-medium text-gray-900 dark:text-white bg-gray-100/50 dark:bg-gray-800/50 px-2 py-1 rounded">
                                    {selectedDrawing.data.format}
                                  </span>
                                </div>

                                <div className="flex justify-between items-center">
                                  <span className="text-gray-600 dark:text-gray-400">File Size</span>
                                  <span className="font-medium text-gray-900 dark:text-white">
                                    {selectedDrawing.data.fileSize}
                                  </span>
                                </div>

                                <div className="flex justify-between items-center">
                                  <span className="text-gray-600 dark:text-gray-400">Version</span>
                                  <span className="font-medium text-gray-900 dark:text-white">
                                    {selectedDrawing.data.version}
                                  </span>
                                </div>

                                <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                                  <span className="text-gray-600 dark:text-gray-400 text-sm">Description</span>
                                  <p className="mt-2 text-gray-900 dark:text-white">
                                    {selectedDrawing.data.description}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Drawing Preview */}
                            <div className="backdrop-blur-sm bg-white/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 rounded-xl p-6">
                              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                                <Eye size={18} className="mr-2" />
                                Preview
                              </h3>

                              <div className="bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-xl aspect-video flex items-center justify-center">
                                <div className="text-center">
                                  <FileText size={48} className="mx-auto mb-4 text-gray-400 dark:text-gray-600" />
                                  <p className="text-gray-500 dark:text-gray-400">
                                    Drawing preview not available
                                  </p>
                                  <motion.button
                                    className="mt-4 px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-600 text-white rounded-lg hover:from-purple-600 hover:to-blue-700 text-sm"
                                    variants={buttonVariants}
                                    whileHover="hover"
                                    whileTap="tap"
                                    onClick={() => toast.success("Opening full viewer...")}
                                  >
                                    Open Viewer
                                  </motion.button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {selectedDrawing.data.key === "versions" && (
                        <motion.div
                          key="versions-tab"
                          variants={tabContentVariants}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                        >
                          <div className="text-center py-12">
                            <Calendar size={48} className="mx-auto mb-4 text-gray-400 dark:text-gray-600" />
                            <p className="text-gray-500 dark:text-gray-400">No version history available</p>
                          </div>
                        </motion.div>
                      )}

                      {selectedDrawing.data.key === "comments" && (
                        <motion.div
                          key="comments-tab"
                          variants={tabContentVariants}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                        >
                          <div className="text-center py-12">
                            <Activity size={48} className="mx-auto mb-4 text-gray-400 dark:text-gray-600" />
                            <p className="text-gray-500 dark:text-gray-400">No comments yet</p>
                          </div>
                        </motion.div>
                      )}
                    </>
                  ) : (
                    <motion.div
                      key="overview-tab"
                      variants={tabContentVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                      >
                        {drawings.map((drawing, index) => (
                          <motion.div
                            key={drawing.id}
                            variants={itemVariants}
                            custom={index}
                            className="bg-white dark:bg-gray-900 shadow-md rounded-lg overflow-hidden cursor-pointer border border-gray-100 dark:border-gray-800 group"
                            whileHover={{ y: -4, boxShadow: "0 12px 24px -10px rgba(0, 0, 0, 0.15)" }}
                            onClick={() => (window.location.href = `/cad?drawingId=${drawing.id}`)}
                          >
                            <div className="h-40 sm:h-48 bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden relative">
                              {drawing.thumbnail ? (
                                <motion.img
                                  src={drawing.thumbnail}
                                  alt={drawing.name}
                                  className="h-full w-full object-contain"
                                  initial={{ scale: 1 }}
                                  whileHover={{ scale: 1.05 }}
                                  transition={{ duration: 0.3 }}
                                />
                              ) : (
                                <motion.div
                                  whileHover={{ rotate: 10, scale: 1.1 }}
                                  className="p-6 bg-gray-200 dark:bg-gray-900 rounded-full"
                                >
                                  <Grid size={36} className="text-gray-400 dark:text-gray-500" />
                                </motion.div>
                              )}

                              {/* Overlay for hover effect */}
                              <motion.div
                                className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
                                initial={{ opacity: 0 }}
                                whileHover={{ opacity: 1 }}
                              />
                            </div>
                            <div className="p-4">
                              <h3 className="text-lg font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                {drawing.name}
                              </h3>
                              {drawing.description && (
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{drawing.description}</p>
                              )}
                              <div className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                                Updated: {formatDate(drawing?.updatedAt ? drawing.updatedAt.toString() : "")}
                              </div>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex justify-end space-x-2">
                              <motion.button
                                onClick={e => handleEditClick(drawing, e)}
                                className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md"
                                whileHover={{ scale: 1.15 }}
                                whileTap={{ scale: 0.9 }}
                                title="Edit Drawing Info"
                              >
                                <Edit size={16} />
                              </motion.button>
                              <motion.button
                                onClick={e => handleDuplicateDrawing(drawing, e)}
                                className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md"
                                whileHover={{ scale: 1.15 }}
                                whileTap={{ scale: 0.9 }}
                                title="Duplicate Drawing"
                              >
                                <Copy size={16} />
                              </motion.button>
                              <motion.button
                                onClick={e => handleDeleteDrawing(drawing.id, e)}
                                className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
                                whileHover={{ scale: 1.15 }}
                                whileTap={{ scale: 0.9 }}
                                title="Delete Drawing"
                              >
                                <Trash2 size={16} />
                              </motion.button>
                            </div>
                          </motion.div>
                        ))}
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </DynamicLayout>
    </MotionConfig>
  );
}
