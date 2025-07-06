import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";

import { motion, AnimatePresence, Variants } from "framer-motion";
import { Layers, Plus, Book, Search, X, Filter, Edit, Trash2, Cpu, Package, ArrowLeft } from "react-feather";
import { DynamicLayout } from "src/components/dynamic-imports";
import PredefinedLibrary from "@/src/components/library/PredefinedLibrary";
import LocalMaterialsLibraryView from "@/src/components/library/LocalMaterialsLibraryView";
import Loading from "@/src/components/ui/Loading";
import { Material } from "@prisma/client";
import { fetchMaterials, createMaterial, deleteMaterial } from "@/src/lib/api/materials";
import toast from "react-hot-toast";
import MetaTags from "@/src/components/layout/Metatags";

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

const cardVariants: Variants = {
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
    scale: 1.02,
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

const emptyStateVariants: Variants = {
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
      delay: 0.2
    }
  }
};

const modalVariants: Variants = {
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
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 20,
    transition: {
      duration: 0.2
    }
  }
};

interface MaterialsFilterState {
  search: string;
  density: string;
}

export default function MaterialsList() {

  const router = useRouter();

  const [filters, setFilters] = useState<MaterialsFilterState>({
    search: "",
    density: ""
  });

  const [showModal, setShowModal] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showLocalLibrary, setShowLocalLibrary] = useState(false);

  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    density: 0,
    description: ""
  });

  useEffect(() => {
    if (status === "authenticated") {
      fetchMaterialsData();
    }
  }, [filters, status]);

  const fetchMaterialsData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const materialsData = await fetchMaterials({
        search: filters.search,

      });
      setMaterials(materialsData as Material[]);
    } catch (err) {
      console.error("Error fetching materials:", err);
      setError(err instanceof Error ? err : new Error("An unknown error occurred"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const clearFilters = () => {
    setFilters({
      search: "",
      density: ""
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === "density" ? parseFloat(value) || 0 : value
    }));
  };

  const resetForm = () => {
    setFormData({
      name: "",
      density: 0,
      description: ""
    });
  };

  const handleCreateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const materialData = {
        ...formData,
        properties: {
          density: formData.density,
          description: formData.description
        }
      };

      await createMaterial(materialData as any);
      toast.success("Material created successfully");
      await fetchMaterialsData();
      setShowModal(false);
      resetForm();
    } catch (err) {
      console.error("Error creating material:", err);
      toast.error(err instanceof Error ? err.message : "Failed to create material");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (material: Material, e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/materials/${material.id}`);
  };

  const handleSendToCAD = (material: Material, e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      if (!material || !material.id) {
        toast.error("Cannot send to CAD: Material data is missing");
        return;
      }

      localStorage.setItem(
        "materialToLoadInCAD",
        JSON.stringify({
          id: material.id,
          name: material.name,
          properties: material.properties
        })
      );

      router.push({
        pathname: "/cad",
        query: { loadMaterial: material.id }
      });

      toast.success(`Opening ${material.name} in CAD editor`);
    } catch (err) {
      console.error("Failed to send material to CAD:", err);
      toast.error("Failed to send material to CAD editor");
    }
  };

  const handleDeleteMaterial = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this material?")) return;

    try {
      await deleteMaterial(id);
      toast.success("Material deleted successfully");
      await fetchMaterialsData();
    } catch (err) {
      console.error("Failed to delete material:", err);
      toast.error(err instanceof Error ? err.message : "Failed to delete material");
    }
  };

  const handleSelectLibraryItem = async (item: any) => {
    try {
      const materialData = {
        name: item.name,
        density: item.density || 0,
        description: item.description || "",
        properties: item.properties || { density: item.density || 0 }
      };

      await createMaterial(materialData);
      toast.success("Material created from library successfully");
      setShowLibrary(false);
      await fetchMaterialsData();
    } catch (err) {
      console.error("Failed to create material from library:", err);
      toast.error(err instanceof Error ? err.message : "Failed to create material from library");
    }
  };

  const handleLoadLocalMaterial = (material: any) => {
    try {
      const materialData = {
        name: material.name,
        density: material.density || 0,
        description: material.description || "",
        properties: material.properties || { density: material.density || 0 }
      };

      createMaterial(materialData).then(() => {
        toast.success("Material imported from local library");
        fetchMaterialsData();
      });
    } catch (err) {
      console.error("Failed to import local material:", err);
      toast.error(err instanceof Error ? err.message : "Failed to import local material");
    } finally {
      setShowLocalLibrary(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loading />
      </div>
    );
  }

  if (status === "unauthenticated") {
    router.push("/waitlist");
    return null;
  }

  return (
    <DynamicLayout>
      <MetaTags ogImage="/og-image.png" title="Materials Library" />

      <motion.div
        className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={pageVariants}
      >
        <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
          {/* Header Section */}
          <motion.div
            className="mb-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Materials Library
                </h1>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                  Manage and organize materials for your CAD/CAM projects
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <motion.button
                  onClick={() => setShowLocalLibrary(true)}
                  className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:from-indigo-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-lg shadow-indigo-500/25 transition-all"
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  <Package size={18} className="mr-2" />
                  Local Library
                </motion.button>

                <motion.button
                  onClick={() => setShowLibrary(true)}
                  className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-green-500 shadow-lg shadow-green-500/25 transition-all"
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  <Book size={18} className="mr-2" />
                  Standard Library
                </motion.button>

                <motion.button
                  onClick={() => setShowModal(true)}
                  className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg shadow-blue-500/25 transition-all"
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  <Plus size={18} className="mr-2" />
                  New Material
                </motion.button>
              </div>
            </div>
          </motion.div>

          {/* Search and Filters */}
          <motion.div
            className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl shadow-lg rounded-2xl border border-gray-200/50 dark:border-gray-700/50 p-6 mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
          >
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={18} className="text-gray-400 dark:text-gray-500" />
                </div>
                <motion.input
                  type="text"
                  name="search"
                  value={filters.search}
                  onChange={handleFilterChange}
                  placeholder="Search materials..."
                  className="block w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all"
                  whileFocus={{ scale: 1.02 }}
                />
                {filters.search && (
                  <button
                    type="button"
                    onClick={() => setFilters(prev => ({ ...prev, search: "" }))}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              <div className="w-full md:w-48">
                <motion.input
                  type="number"
                  name="density"
                  value={filters.density}
                  onChange={handleFilterChange}
                  placeholder="Min density"
                  className="block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all"
                  whileFocus={{ scale: 1.02 }}
                />
              </div>

              <motion.button
                onClick={clearFilters}
                className="inline-flex items-center px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-all"
                variants={buttonVariants}
                whileHover="hover"
                whileTap="tap"
              >
                <X size={16} className="mr-2" />
                Clear
              </motion.button>
            </div>

            {/* Active Filters */}
            {(filters.search || filters.density) && (
              <div className="mt-4 flex flex-wrap gap-2">
                <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center">
                  <Filter size={14} className="mr-1" />
                  Active Filters:
                </div>

                {filters.search && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-full flex items-center"
                  >
                    Search: {filters.search}
                    <button
                      onClick={() => setFilters(prev => ({ ...prev, search: "" }))}
                      className="ml-2 text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-200"
                    >
                      <X size={12} />
                    </button>
                  </motion.div>
                )}

                {filters.density && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-xs bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1.5 rounded-full flex items-center"
                  >
                    Min Density: {filters.density}
                    <button
                      onClick={() => setFilters(prev => ({ ...prev, density: "" }))}
                      className="ml-2 text-green-500 dark:text-green-400 hover:text-green-700 dark:hover:text-green-200"
                    >
                      <X size={12} />
                    </button>
                  </motion.div>
                )}
              </div>
            )}
          </motion.div>

          {/* Materials Content */}
          {isLoading ? (
            <motion.div
              className="flex flex-col items-center justify-center h-64"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
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
              <p className="text-lg text-gray-600 dark:text-gray-400 mt-4">Loading materials...</p>
            </motion.div>
          ) : error ? (
            <motion.div
              className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl shadow-lg rounded-2xl border border-red-200 dark:border-red-900/50 p-8 text-center"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div className="bg-red-100 dark:bg-red-900/20 w-16 h-16 rounded-full mx-auto flex items-center justify-center text-red-500 dark:text-red-400 mb-4">
                <X size={32} />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Error Loading Materials</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">{error.message}</p>
              <motion.button
                onClick={fetchMaterialsData}
                className="bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg shadow-blue-500/25"
                variants={buttonVariants}
                whileHover="hover"
                whileTap="tap"
              >
                Try Again
              </motion.button>
            </motion.div>
          ) : materials.length === 0 ? (
            <motion.div
              className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl shadow-2xl rounded-2xl border border-gray-200/50 dark:border-gray-700/50 p-12 text-center"
              variants={emptyStateVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.div
                className="mx-auto w-24 h-24 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-6"
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
              >
                <Layers size={48} className="text-blue-500 dark:text-blue-400" />
              </motion.div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                No materials found
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
                {filters.search || filters.density
                  ? "No materials match your search criteria. Try adjusting your filters."
                  : "Create your first material or choose from our standard library to get started."}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                {filters.search || filters.density ? (
                  <motion.button
                    onClick={clearFilters}
                    className="inline-flex items-center px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    variants={buttonVariants}
                    whileHover="hover"
                    whileTap="tap"
                  >
                    Clear Filters
                  </motion.button>
                ) : (
                  <>
                    <motion.button
                      onClick={() => setShowModal(true)}
                      className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg shadow-blue-500/25"
                      variants={buttonVariants}
                      whileHover="hover"
                      whileTap="tap"
                    >
                      <Plus size={20} className="mr-2" />
                      Create Material
                    </motion.button>
                    <motion.button
                      onClick={() => setShowLibrary(true)}
                      className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-green-500 shadow-lg shadow-green-500/25"
                      variants={buttonVariants}
                      whileHover="hover"
                      whileTap="tap"
                    >
                      <Book size={20} className="mr-2" />
                      Browse Library
                    </motion.button>
                  </>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              variants={cardContainerVariants}
              initial="hidden"
              animate="visible"
            >
              {materials.map((material, index) => (
                <motion.div
                  key={material.id}
                  variants={cardVariants}
                  whileHover="hover"
                  whileTap="tap"
                  className="group cursor-pointer"
                  custom={index}
                  onClick={() => router.push(`/materials/${material.id}`)}
                >
                  <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl shadow-lg rounded-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden transition-all duration-300 hover:border-blue-300 dark:hover:border-blue-600">
                    {/* Material Header */}
                    <div className="relative h-20 bg-gradient-to-r from-amber-500/20 to-orange-500/20 dark:from-amber-600/30 dark:to-orange-600/30 flex items-center justify-center">
                      <motion.div
                        className="p-3 bg-white/20 dark:bg-white/10 rounded-xl backdrop-blur-sm"
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        transition={{ type: "spring", stiffness: 300, damping: 15 }}
                      >
                        <Layers size={28} className="text-amber-600 dark:text-amber-400" />
                      </motion.div>
                    </div>

                    {/* Material Content */}
                    <div className="p-6">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-2">
                        {material.name}
                      </h3>

                      {material.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                          {material.description}
                        </p>
                      )}

                      {/* Material Properties */}
                      <div className="space-y-2 mb-4">
                        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                          <span>Density:</span>
                          <span className="font-mono">
                            {typeof material.properties === 'object' && material.properties !== null && 'density' in material.properties
                              ? `${material.properties.density} g/cm³`
                              : 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Material Footer */}
                    <div className="bg-gray-50/50 dark:bg-gray-700/30 px-6 py-4 border-t border-gray-200/50 dark:border-gray-600/50 flex items-center justify-between">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Updated {new Date(material.updatedAt).toLocaleDateString()}
                      </span>

                      <div className="flex space-x-2">
                        <motion.button
                          onClick={(e) => handleSendToCAD(material, e)}
                          className="p-2 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                          title="Use in CAD"
                          variants={buttonVariants}
                          whileHover="hover"
                          whileTap="tap"
                        >
                          <Cpu size={16} />
                        </motion.button>
                        <motion.button
                          onClick={(e) => handleEditClick(material, e)}
                          className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                          title="Edit"
                          variants={buttonVariants}
                          whileHover="hover"
                          whileTap="tap"
                        >
                          <Edit size={16} />
                        </motion.button>
                        <motion.button
                          onClick={(e) => handleDeleteMaterial(material.id, e)}
                          className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Delete"
                          variants={buttonVariants}
                          whileHover="hover"
                          whileTap="tap"
                        >
                          <Trash2 size={16} />
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

        {/* Create Material Modal */}
        <AnimatePresence>
          {showModal && (
            <motion.div
              className="fixed inset-0 z-50 overflow-y-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                {/* Background overlay */}
                <motion.div
                  className="fixed inset-0 bg-gray-500/75 dark:bg-gray-900/75 backdrop-blur-sm transition-opacity"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowModal(false)}
                />

                {/* Modal panel */}
                <motion.div
                  className="inline-block align-bottom bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl px-4 pt-5 pb-4 text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6 border border-gray-200/50 dark:border-gray-700/50"
                  variants={modalVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <div>
                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 mb-4">
                      <Layers className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="mt-3 text-center sm:mt-5">
                      <h3 className="text-lg leading-6 font-semibold text-gray-900 dark:text-white">
                        Create New Material
                      </h3>
                      <div className="mt-2">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Add a new material to your library with custom properties.
                        </p>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={handleCreateMaterial} className="mt-6 space-y-4">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Material Name *
                      </label>
                      <motion.input
                        type="text"
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all"
                        placeholder="Steel, Aluminum, etc."
                        whileFocus={{ scale: 1.02 }}
                      />
                    </div>

                    <div>
                      <label htmlFor="density" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Density (g/cm³) *
                      </label>
                      <motion.input
                        type="number"
                        id="density"
                        name="density"
                        value={formData.density}
                        onChange={handleChange}
                        step="0.01"
                        min="0"
                        required
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all"
                        placeholder="7.85"
                        whileFocus={{ scale: 1.02 }}
                      />
                    </div>

                    <div>
                      <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Description (optional)
                      </label>
                      <motion.textarea
                        id="description"
                        name="description"
                        rows={3}
                        value={formData.description}
                        onChange={handleChange}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all resize-none"
                        placeholder="Brief description of the material properties..."
                        whileFocus={{ scale: 1.02 }}
                      />
                    </div>

                    <div className="mt-6 flex justify-end space-x-3">
                      <motion.button
                        type="button"
                        onClick={() => {
                          setShowModal(false);
                          resetForm();
                        }}
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
                            <Layers size={16} className="mr-2" />
                            Create Material
                          </>
                        )}
                      </motion.button>
                    </div>
                  </form>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Library Modals */}
        {showLibrary && (
          <PredefinedLibrary
            libraryType="materials"
            onSelectItem={handleSelectLibraryItem}
            isOpen={showLibrary}
            onClose={() => setShowLibrary(false)}
          />
        )}

        {showLocalLibrary && (
          <LocalMaterialsLibraryView
            onLoadMaterial={handleLoadLocalMaterial}
            onClose={() => setShowLocalLibrary(false)}
            showCloseButton={true}
          />
        )}
      </motion.div>
    </DynamicLayout>
  );
}
