import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";

import {
  Edit,
  Trash2,
  Plus,
  Book,
  Settings,
  Search,
  X,
  Filter,
  Copy,
  Share2,
  Tool,
  AlertCircle,
  Clock
} from "react-feather";
import Layout from "@/src/components/layout/Layout";
import PredefinedLibrary from "@/src/components/library/PredefinedLibrary";
import Loading from "@/src/components/ui/Loading";
import {
  getMachineConfigs,
  createMachineConfig,
  updateMachineConfig,
  deleteMachineConfig,
  cloneMachineConfig,
  shareMachineConfig,
  MachineConfig,
  WorkVolume,
  MachineConfigDetails
} from "src/lib/api/machineConfigApi";
import ExportImportControls from "@/src/components/components/ExportImportControls";
import Metatags from "@/src/components/layout/Metatags";
import toast from "react-hot-toast";
import { AnimatePresence, motion, MotionConfig, Variants } from "framer-motion";
import { formatDistance } from "date-fns";
import { debounce } from "lodash";
import MetaTags from "@/src/components/layout/Metatags";
import ExportImportToolpathsControls from "@/src/components/cam/ToolpathControls";
import { DynamicLayout } from "src/components/dynamic-imports";
import Link from "next/link";
import { Cpu, Monitor, Play, CheckCircle } from "react-feather";


interface MachineConfigFilterState {
  type: string;
  search: string;
  showPublic: boolean;
}

interface MachineConfigFormState {
  name: string;
  description: string;
  type: "mill" | "lathe" | "printer" | "laser";
  maxSpindleSpeed: number;
  maxFeedRate: number;
  workVolumeX: number;
  workVolumeY: number;
  workVolumeZ: number;
  controller: string;
  isPublic: boolean;
}

// Animation variants
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

const cardContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
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

export default function MachineConfigsPage() {

  const router = useRouter();

  // State for filters
  const [filters, setFilters] = useState<MachineConfigFilterState>({
    type: "",
    search: "",
    showPublic: false
  });

  // State for the modals
  const [showModal, setShowModal] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);
  const [selectedConfig, setSelectedConfig] = useState<MachineConfig | null>(null);

  // State for data and UI
  const [configs, setConfigs] = useState<MachineConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Form state
  const [formData, setFormData] = useState<MachineConfigFormState>({
    name: "",
    description: "",
    type: "mill",
    maxSpindleSpeed: 10000,
    maxFeedRate: 5000,
    workVolumeX: 300,
    workVolumeY: 300,
    workVolumeZ: 100,
    controller: "",
    isPublic: false
  });

  // Fetch configs when component mounts or non-search filters change
  useEffect(() => {
    if (status === "authenticated") {
      fetchConfigs();
    }
  }, [filters.type, filters.showPublic, status]);

  // Debounced search effect
  useEffect(() => {
    const debouncedFetch = debounce(() => {
      if (status === "authenticated") {
        fetchConfigs();
      }
    }, 300);

    debouncedFetch();

    return () => {
      debouncedFetch.cancel();
    };
  }, [filters.search]);

  const fetchConfigs = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await getMachineConfigs({
        type: filters.type as "mill" | "lathe" | "printer" | "laser" | undefined,
        search: filters.search || undefined,
        public: filters.showPublic
      });

      // Handle paginated response
      const machineConfigs = Array.isArray(response.data) ? response.data : [];
      setConfigs(machineConfigs);
    } catch (err) {
      console.error("Error fetching machine configurations:", err);
      setError(err instanceof Error ? err : new Error("An unknown error occurred"));
      setConfigs([]); // Set empty array on error

      // Session might have expired
      if (err instanceof Error && err.message.includes("unauthorized")) {
        router.push("/auth/signin?callbackUrl=/machine");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle filter changes
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  // Toggle public filter
  const togglePublicFilter = () => {
    setFilters(prev => ({ ...prev, showPublic: !prev.showPublic }));
  };

  // Clear filters
  const clearFilters = () => {
    setFilters({
      type: "",
      search: "",
      showPublic: false
    });
  };

  // Handle form changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    if (type === "checkbox") {
      setFormData(prev => ({
        ...prev,
        [name]: (e.target as HTMLInputElement).checked
      }));
    } else if (type === "number") {
      setFormData(prev => ({
        ...prev,
        [name]: parseInt(value) || 0
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  // Reset form data
  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      type: "mill",
      maxSpindleSpeed: 10000,
      maxFeedRate: 5000,
      workVolumeX: 300,
      workVolumeY: 300,
      workVolumeZ: 100,
      controller: "",
      isPublic: false
    });
    setSelectedConfig(null);
  };

  // Handle machine configuration creation/update
  const handleCreateConfig = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsLoading(true);

    try {
      const configDetails: MachineConfigDetails = {
        type: formData.type,
        maxSpindleSpeed: formData.maxSpindleSpeed,
        maxFeedRate: formData.maxFeedRate,
        controller: formData.controller,
        workVolume: {
          x: formData.workVolumeX,
          y: formData.workVolumeY,
          z: formData.workVolumeZ
        }
      };

      const configData = {
        name: formData.name,
        description: formData.description,
        type: formData.type,
        isPublic: formData.isPublic,
        config: configDetails
      };

      let result;

      if (selectedConfig) {
        // Update existing config
        result = await updateMachineConfig(selectedConfig.id, configData);
        toast.success("Machine configuration updated successfully");
      } else {
        // Create new config
        result = await createMachineConfig(configData);
        toast.success("Machine configuration created successfully");
      }

      // Refresh the configs list
      await fetchConfigs();

      // Close the modal
      setShowModal(false);
      resetForm();
    } catch (err) {
      console.error("Error saving machine configuration:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save machine configuration");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle selecting item from library
  const handleSelectLibraryItem = async (item: any) => {
    try {
      setIsLoading(true);

      // Create config from library item
      const configData = {
        name: item.name,
        description: item.description || "",
        type: item.type as "mill" | "lathe" | "printer" | "laser",
        config: item.config
      };

      await createMachineConfig(configData);
      toast.success("Machine configuration created from template successfully");

      // Refresh the list
      await fetchConfigs();
      setShowLibrary(false);
    } catch (err) {
      console.error("Error creating machine configuration from template:", err);
      toast.error(err instanceof Error ? err.message : "Failed to create machine configuration from template");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle opening the edit modal
  const handleEditClick = (config: MachineConfig) => {
    setSelectedConfig(config);

    // Extract config values
    const configData = config.config || {};

    setFormData({
      name: config.name,
      description: config.description || "",
      type: config.type || "mill",
      maxSpindleSpeed: configData.maxSpindleSpeed || 10000,
      maxFeedRate: configData.maxFeedRate || 5000,
      workVolumeX: configData.workVolume?.x || 300,
      workVolumeY: configData.workVolume?.y || 300,
      workVolumeZ: configData.workVolume?.z || 100,
      controller: configData.controller || "",
      isPublic: config.isPublic || false
    });

    setShowModal(true);
  };

  // Handle config deletion
  const handleDeleteConfig = async (id: string) => {
    setIsLoading(true);

    try {
      await deleteMachineConfig(id);
      toast.success("Machine configuration deleted successfully");
      setShowConfirmDelete(null);

      // Refresh the list
      await fetchConfigs();
    } catch (err) {
      console.error("Failed to delete machine configuration:", err);

      // More specific error message for usage
      if (err instanceof Error && err.message.includes("being used")) {
        toast.error("Cannot delete configuration as it is currently in use by one or more toolpaths");
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to delete machine configuration");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle config cloning
  const handleCloneConfig = async (config: MachineConfig) => {
    try {
      setIsLoading(true);
      await cloneMachineConfig(config.id, `${config.name} (Copy)`);
      toast.success("Machine configuration cloned successfully");
      await fetchConfigs();
    } catch (err) {
      console.error("Failed to clone machine configuration:", err);
      toast.error(err instanceof Error ? err.message : "Failed to clone machine configuration");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle config sharing
  const handleToggleShare = async (config: MachineConfig) => {
    try {
      setIsLoading(true);
      await shareMachineConfig(config.id, !config.isPublic);
      toast.success(`Machine configuration ${config.isPublic ? "private" : "shared"} successfully`);
      await fetchConfigs();
    } catch (err) {
      console.error("Failed to update sharing settings:", err);
      toast.error(err instanceof Error ? err.message : "Failed to update sharing settings");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle navigation to detail page
  const handleViewDetail = (id: string) => {
    router.push(`/machine/${id}`);
  };

  if (status === "loading") {
    return (
      <DynamicLayout>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
        </div>
      </DynamicLayout>
    );
  }

  if (status === "unauthenticated") {
    router.push("/waitlist");
    return null;
  }

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
            {/* Header */}
            <motion.div
              className="backdrop-blur-md bg-white/80 dark:bg-gray-900/80 rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/30 px-6 py-6 mb-8"
              variants={cardVariants}
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center">
                  <motion.div
                    className="w-12 h-12 rounded-2xl bg-gradient-to-r from-orange-500 to-red-600 flex items-center justify-center mr-4"
                    whileHover={{ scale: 1.05, rotate: 5 }}
                  >
                    <Cpu size={24} className="text-white" />
                  </motion.div>
                  <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                      Machines
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                      {configs.length} machine{configs.length !== 1 ? "s" : ""} available
                    </p>
                  </div>
                </div>

                <motion.div
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  <Link href="/machine/new">
                    <button className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl hover:from-orange-600 hover:to-red-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 shadow-lg shadow-orange-500/25">
                      <Plus size={18} className="mr-2" />
                      Add Machine
                    </button>
                  </Link>
                </motion.div>
              </div>

              {/* Search */}
              <div className="mt-6">
                <div className="relative">
                  <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search machines by name, manufacturer, or model..."
                    value={filters.search}
                    onChange={handleFilterChange}
                    className="w-full pl-10 pr-4 py-3 bg-white/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent backdrop-blur-sm"
                  />
                </div>
              </div>
            </motion.div>

            {/* Content */}
            {isLoading ? (
              <motion.div
                className="backdrop-blur-md bg-white/80 dark:bg-gray-900/80 rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/30 p-12 text-center"
                variants={cardVariants}
              >
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-orange-600 mx-auto mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">Loading machines...</p>
              </motion.div>
            ) : configs.length === 0 ? (
              <motion.div
                className="backdrop-blur-md bg-white/80 dark:bg-gray-900/80 rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/30 p-12 text-center"
                variants={cardVariants}
              >
                <motion.div
                  className="w-20 h-20 bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-2xl flex items-center justify-center mx-auto mb-6"
                  whileHover={{ scale: 1.05, rotate: 5 }}
                >
                  <Monitor size={32} className="text-gray-400 dark:text-gray-500" />
                </motion.div>

                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  {filters.search ? "No Matching Machines" : "No Machines"}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                  {filters.search
                    ? `No machines found matching "${filters.search}". Try adjusting your search terms.`
                    : "No machines configured yet. Add your first machine to start managing your manufacturing equipment."
                  }
                </p>

                {!filters.search && (
                  <motion.div
                    variants={buttonVariants}
                    whileHover="hover"
                    whileTap="tap"
                  >
                    <Link href="/machine/new">
                      <button className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl hover:from-orange-600 hover:to-red-700 shadow-lg shadow-orange-500/25">
                        <Plus size={18} className="mr-2" />
                        Add First Machine
                      </button>
                    </Link>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div
                className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
                variants={cardContainerVariants}
                initial="hidden"
                animate="visible"
              >
                {configs.map((config) => (
                  <motion.div
                    key={config.id}
                    variants={cardVariants}
                    whileHover={{ y: -8, transition: { type: "spring", stiffness: 300, damping: 20 } }}
                    className="backdrop-blur-md bg-white/80 dark:bg-gray-900/80 rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/30 overflow-hidden hover:shadow-2xl transition-all duration-300"
                  >
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center">
                          <motion.div
                            className="w-10 h-10 rounded-xl bg-gradient-to-r from-orange-400 to-red-500 flex items-center justify-center mr-3"
                            whileHover={{ scale: 1.05, rotate: 5 }}
                          >
                            <Cpu size={20} className="text-white" />
                          </motion.div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                              {config.name || "Unnamed Machine"}
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {config.type === "mill" ? "Mill" : config.type === "lathe" ? "Lathe" : config.type === "printer" ? "3D Printer" : "Laser Cutter"}
                            </p>
                          </div>
                        </div>

                        <motion.div
                          className={`w-3 h-3 rounded-full ${config.isPublic === true ? "bg-green-500" :
                            config.isPublic === false ? "bg-yellow-500" : "bg-gray-400"
                            }`}
                          animate={config.isPublic === true ? { scale: [1, 1.2, 1] } : {}}
                          transition={{ repeat: Infinity, duration: 2 }}
                        />
                      </div>

                      <div className="space-y-3 mb-6">
                        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                          <span className="font-medium mr-2">Type:</span>
                          <span className="px-2 py-1 bg-gradient-to-r from-blue-100 to-cyan-100 dark:from-blue-900/50 dark:to-cyan-900/50 text-blue-800 dark:text-blue-300 rounded-full text-xs">
                            {config.type === "mill" ? "Mill" : config.type === "lathe" ? "Lathe" : config.type === "printer" ? "3D Printer" : "Laser Cutter"}
                          </span>
                        </div>

                        {config.isPublic === true && (
                          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                            <span className="font-medium mr-2">Serial:</span>
                            <span className="font-mono bg-gray-100/50 dark:bg-gray-800/50 px-2 py-1 rounded text-xs">
                              {config.id}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center text-sm">
                          {config.isPublic === true ? (
                            <div className="flex items-center text-green-600 dark:text-green-400">
                              <CheckCircle size={16} className="mr-1" />
                              Public
                            </div>
                          ) : config.isPublic === false ? (
                            <div className="flex items-center text-yellow-600 dark:text-yellow-400">
                              <AlertCircle size={16} className="mr-1" />
                              Private
                            </div>
                          ) : (
                            <div className="flex items-center text-gray-500 dark:text-gray-400">
                              <AlertCircle size={16} className="mr-1" />
                              Unshared
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <motion.div
                          className="flex-1"
                          variants={buttonVariants}
                          whileHover="hover"
                          whileTap="tap"
                        >
                          <Link href={`/machine/${config.id}`}>
                            <button className="w-full px-4 py-2.5 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl hover:from-orange-600 hover:to-red-700 text-sm font-medium shadow-lg shadow-orange-500/25">
                              <Play size={16} className="inline mr-1" />
                              Manage
                            </button>
                          </Link>
                        </motion.div>

                        <motion.button
                          onClick={() => handleDeleteConfig(config.id)}
                          className="px-4 py-2.5 bg-gradient-to-r from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 text-gray-700 dark:from-gray-700 dark:to-gray-600 dark:text-gray-200 dark:hover:from-gray-600 dark:hover:to-gray-500 rounded-xl text-sm font-medium transition-all"
                          variants={buttonVariants}
                          whileHover="hover"
                          whileTap="tap"
                        >
                          <Settings size={16} />
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        </motion.div>
      </DynamicLayout>
    </MotionConfig>
  );
}
