import { useState, useEffect } from "react";

import { useRouter } from "next/router";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { DynamicLayout } from "src/components/dynamic-imports";
import { Save, ArrowLeft, Trash2, Layers, Cpu, Check, AlertCircle, Package, Zap } from "react-feather";
import { fetchMaterialById, updateMaterial, deleteMaterial } from "@/src/lib/api/materials";
import Loading from "@/src/components/ui/Loading";
import { Material } from "@prisma/client";
import { useLocalMaterialsLibraryStore } from "@/src/store/localMaterialsLibraryStore";
import toast from "react-hot-toast";
import { cn } from "@/src/lib/utils";
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

const formVariants: Variants = {
  hidden: {
    opacity: 0,
    x: -20
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 25
    }
  }
};

export default function MaterialDetailPage() {

  const router = useRouter();
  const { id } = router.query;

  const [material, setMaterial] = useState<Material | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isInLocalLibrary, setIsInLocalLibrary] = useState(false);

  const { addMaterial } = useLocalMaterialsLibraryStore();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    density: 0,
    hardness: 0,
    thermalConductivity: 0,
    elasticModulus: 0,
    poissonRatio: 0,
    yieldStrength: 0,
    ultimateStrength: 0,
    color: "#cccccc"
  });

  useEffect(() => {
    if (id && status === "authenticated") {
      fetchMaterial(id as string);
    }
  }, [id, status]);

  const checkMaterialInLibrary = (materialData: any) => {
    try {
      const localMaterials = JSON.parse(localStorage.getItem("localMaterialsLibrary") || "[]");
      const found = localMaterials.some((mat: any) => mat.id === materialData.id || mat.name === materialData.name);
      setIsInLocalLibrary(found);
    } catch (error) {
      console.error("Error checking material in library:", error);
      setIsInLocalLibrary(false);
    }
  };

  const fetchMaterial = async (materialId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const materialData = await fetchMaterialById(materialId);
      setMaterial(materialData);

      const properties = materialData.properties as any;
      setFormData({
        name: materialData.name,
        description: materialData.description || "",
        density: properties?.density || 0,
        hardness: properties?.hardness || 0,
        thermalConductivity: properties?.thermalConductivity || 0,
        elasticModulus: properties?.elasticModulus || 0,
        poissonRatio: properties?.poissonRatio || 0,
        yieldStrength: properties?.yieldStrength || 0,
        ultimateStrength: properties?.ultimateStrength || 0,
        color: properties?.color || "#cccccc"
      });

      checkMaterialInLibrary(materialData);
    } catch (err) {
      console.error("Error fetching material:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!material) return;

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const materialData = {
        id: material.id,
        name: formData.name,
        description: formData.description,
        properties: {
          density: formData.density,
          hardness: formData.hardness,
          thermalConductivity: formData.thermalConductivity,
          elasticModulus: formData.elasticModulus,
          poissonRatio: formData.poissonRatio,
          yieldStrength: formData.yieldStrength,
          ultimateStrength: formData.ultimateStrength,
          color: formData.color
        }
      };

      await updateMaterial(materialData);
      setSuccessMessage("Material updated successfully");
      toast.success("Material updated successfully");

      await fetchMaterial(material.id);
    } catch (err) {
      console.error("Error updating material:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to update material";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!material) return;

    if (!confirm("Are you sure you want to delete this material? This action cannot be undone.")) {
      return;
    }

    setIsSaving(true);

    try {
      await deleteMaterial(material.id);
      toast.success("Material deleted successfully");
      router.push("/materials");
    } catch (err) {
      console.error("Error deleting material:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to delete material";
      setError(errorMessage);
      toast.error(errorMessage);
      setIsSaving(false);
    }
  };

  const handleSaveToLocalLibrary = () => {
    if (!material) return;

    try {
      const materialToSave = {
        id: material.id,
        name: formData.name,
        description: formData.description,
        properties: {
          density: formData.density,
          hardness: formData.hardness,
          thermalConductivity: formData.thermalConductivity,
          elasticModulus: formData.elasticModulus,
          poissonRatio: formData.poissonRatio,
          yieldStrength: formData.yieldStrength,
          ultimateStrength: formData.ultimateStrength,
          color: formData.color
        },
        createdAt: new Date().toISOString(),
        type: "custom"
      };

      addMaterial(materialToSave);
      setIsInLocalLibrary(true);
      toast.success("Material saved to local library");
    } catch (error) {
      console.error("Error saving to local library:", error);
      toast.error("Failed to save to local library");
    }
  };

  const sendToCAD = () => {
    if (!material) return;

    try {
      localStorage.setItem(
        "materialToLoadInCAD",
        JSON.stringify({
          id: material.id,
          name: formData.name,
          properties: {
            density: formData.density,
            hardness: formData.hardness,
            thermalConductivity: formData.thermalConductivity,
            elasticModulus: formData.elasticModulus,
            poissonRatio: formData.poissonRatio,
            yieldStrength: formData.yieldStrength,
            ultimateStrength: formData.ultimateStrength,
            color: formData.color
          }
        })
      );

      router.push({
        pathname: "/cad",
        query: { loadMaterial: material.id }
      });

      toast.success(`Opening ${formData.name} in CAD editor`);
    } catch (err) {
      console.error("Failed to send material to CAD:", err);
      toast.error("Failed to send material to CAD editor");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: ["density", "hardness", "thermalConductivity", "elasticModulus", "poissonRatio", "yieldStrength", "ultimateStrength"].includes(name)
        ? parseFloat(value) || 0
        : value
    }));
  };

  const handleBack = () => {
    router.push("/materials");
  };

  if (status === "loading" || isLoading) {
    return (
      <DynamicLayout>
        <div className="flex h-screen items-center justify-center">
          <Loading />
        </div>
      </DynamicLayout>
    );
  }

  if (status === "unauthenticated") {
    router.push("/waitlist");
    return null;
  }

  if (error && !material) {
    return (
      <DynamicLayout>
        <div className="max-w-7xl mx-auto p-6">
          <motion.div
            className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl shadow-lg rounded-2xl border border-red-200 dark:border-red-900/50 p-8 text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="bg-red-100 dark:bg-red-900/20 w-16 h-16 rounded-full mx-auto flex items-center justify-center text-red-500 dark:text-red-400 mb-4">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Material Not Found</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
            <motion.button
              onClick={handleBack}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg shadow-blue-500/25"
              variants={buttonVariants}
              whileHover="hover"
              whileTap="tap"
            >
              Back to Materials
            </motion.button>
          </motion.div>
        </div>
      </DynamicLayout>
    );
  }

  return (
    <DynamicLayout>
      <MetaTags ogImage="/og-image.png" title={`Material: ${formData.name || 'Loading...'}`} />

      <motion.div
        className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={pageVariants}
      >
        <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
          {/* Header */}
          <motion.div
            className="mb-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
              <div className="flex items-center space-x-4">
                <motion.button
                  onClick={handleBack}
                  className="p-3 bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl shadow-lg rounded-xl border border-gray-200/50 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-600 transition-all"
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  <ArrowLeft size={20} />
                </motion.button>
                <div>
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    {formData.name || "Material"}
                  </h1>
                  <p className="mt-2 text-gray-600 dark:text-gray-400">
                    Edit material properties and characteristics
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <motion.button
                  onClick={sendToCAD}
                  className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl hover:from-purple-600 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-lg shadow-purple-500/25 transition-all"
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                  disabled={isSaving}
                >
                  <Cpu size={18} className="mr-2" />
                  Use in CAD
                </motion.button>

                <motion.button
                  onClick={handleSaveToLocalLibrary}
                  disabled={isInLocalLibrary || isSaving}
                  className={cn(
                    "inline-flex items-center px-4 py-2.5 rounded-xl focus:outline-none focus:ring-2 shadow-lg transition-all",
                    isInLocalLibrary
                      ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
                      : "bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700 focus:ring-indigo-500 shadow-indigo-500/25"
                  )}
                  variants={buttonVariants}
                  whileHover={!isInLocalLibrary ? "hover" : {}}
                  whileTap={!isInLocalLibrary ? "tap" : {}}
                >
                  {isInLocalLibrary ? (
                    <>
                      <Check size={18} className="mr-2" />
                      In Library
                    </>
                  ) : (
                    <>
                      <Package size={18} className="mr-2" />
                      Save to Library
                    </>
                  )}
                </motion.button>

                <motion.button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-green-500 shadow-lg shadow-green-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  variants={buttonVariants}
                  whileHover={!isSaving ? "hover" : {}}
                  whileTap={!isSaving ? "tap" : {}}
                >
                  {isSaving ? (
                    <>
                      <motion.div
                        className="w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                      />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={18} className="mr-2" />
                      Save Changes
                    </>
                  )}
                </motion.button>

                <motion.button
                  onClick={handleDelete}
                  disabled={isSaving}
                  className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 shadow-lg shadow-red-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  variants={buttonVariants}
                  whileHover={!isSaving ? "hover" : {}}
                  whileTap={!isSaving ? "tap" : {}}
                >
                  <Trash2 size={18} className="mr-2" />
                  Delete
                </motion.button>
              </div>
            </div>
          </motion.div>

          {/* Messages */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl"
              >
                {error}
              </motion.div>
            )}

            {successMessage && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-xl"
              >
                {successMessage}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Form */}
            <motion.div
              className="lg:col-span-2 space-y-6"
              variants={formVariants}
              initial="hidden"
              animate="visible"
            >
              {/* Basic Properties */}
              <motion.div
                className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl shadow-lg rounded-2xl border border-gray-200/50 dark:border-gray-700/50 p-6"
                variants={cardVariants}
              >
                <div className="flex items-center mb-6">
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl mr-4">
                    <Layers className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Basic Properties</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Define the basic characteristics of the material
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all"
                      required
                      whileFocus={{ scale: 1.02 }}
                    />
                  </div>

                  <div>
                    <label htmlFor="color" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Color
                    </label>
                    <div className="flex items-center space-x-3">
                      <motion.input
                        type="color"
                        id="color"
                        name="color"
                        value={formData.color}
                        onChange={handleChange}
                        className="h-12 w-20 border-2 border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        whileHover={{ scale: 1.05 }}
                        whileFocus={{ scale: 1.1 }}
                      />
                      <motion.input
                        type="text"
                        name="color"
                        value={formData.color}
                        onChange={handleChange}
                        className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono transition-all"
                        pattern="^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"
                        title="Valid hex color (e.g. #FF0000)"
                        whileFocus={{ scale: 1.02 }}
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Description
                    </label>
                    <motion.textarea
                      id="description"
                      name="description"
                      rows={3}
                      value={formData.description}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all resize-none"
                      placeholder="Brief description of the material..."
                      whileFocus={{ scale: 1.02 }}
                    />
                  </div>
                </div>
              </motion.div>

              {/* Physical Properties */}
              <motion.div
                className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl shadow-lg rounded-2xl border border-gray-200/50 dark:border-gray-700/50 p-6"
                variants={cardVariants}
              >
                <div className="flex items-center mb-6">
                  <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-xl mr-4">
                    <Zap className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Physical Properties</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Mechanical and thermal characteristics
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all"
                      required
                      whileFocus={{ scale: 1.02 }}
                    />
                  </div>

                  <div>
                    <label htmlFor="hardness" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Hardness (HRC)
                    </label>
                    <motion.input
                      type="number"
                      id="hardness"
                      name="hardness"
                      value={formData.hardness}
                      onChange={handleChange}
                      step="0.1"
                      min="0"
                      max="100"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all"
                      whileFocus={{ scale: 1.02 }}
                    />
                  </div>

                  <div>
                    <label htmlFor="thermalConductivity" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Thermal Conductivity (W/m·K)
                    </label>
                    <motion.input
                      type="number"
                      id="thermalConductivity"
                      name="thermalConductivity"
                      value={formData.thermalConductivity}
                      onChange={handleChange}
                      step="0.01"
                      min="0"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all"
                      whileFocus={{ scale: 1.02 }}
                    />
                  </div>

                  <div>
                    <label htmlFor="elasticModulus" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Elastic Modulus (GPa)
                    </label>
                    <motion.input
                      type="number"
                      id="elasticModulus"
                      name="elasticModulus"
                      value={formData.elasticModulus}
                      onChange={handleChange}
                      step="0.01"
                      min="0"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all"
                      whileFocus={{ scale: 1.02 }}
                    />
                  </div>

                  <div>
                    <label htmlFor="poissonRatio" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Poissons Ratio (ν)
                    </label>
                    <motion.input
                      type="number"
                      id="poissonRatio"
                      name="poissonRatio"
                      value={formData.poissonRatio}
                      onChange={handleChange}
                      step="0.01"
                      min="0"
                      max="0.5"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all"
                      whileFocus={{ scale: 1.02 }}
                    />
                  </div>

                  <div>
                    <label htmlFor="yieldStrength" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Yield Strength (MPa)
                    </label>
                    <motion.input
                      type="number"
                      id="yieldStrength"
                      name="yieldStrength"
                      value={formData.yieldStrength}
                      onChange={handleChange}
                      step="0.01"
                      min="0"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all"
                      whileFocus={{ scale: 1.02 }}
                    />
                  </div>

                  <div className="md:col-span-2 lg:col-span-1">
                    <label htmlFor="ultimateStrength" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Ultimate Strength (MPa)
                    </label>
                    <motion.input
                      type="number"
                      id="ultimateStrength"
                      name="ultimateStrength"
                      value={formData.ultimateStrength}
                      onChange={handleChange}
                      step="0.01"
                      min="0"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all"
                      whileFocus={{ scale: 1.02 }}
                    />
                  </div>
                </div>
              </motion.div>
            </motion.div>

            {/* Sidebar */}
            <motion.div
              className="space-y-6"
              variants={formVariants}
              initial="hidden"
              animate="visible"
            >
              {/* Material Preview */}
              <motion.div
                className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl shadow-lg rounded-2xl border border-gray-200/50 dark:border-gray-700/50 p-6"
                variants={cardVariants}
              >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Material Preview</h3>
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <motion.div
                      className="w-8 h-8 rounded-full border-2 border-gray-300 dark:border-gray-600"
                      style={{ backgroundColor: formData.color }}
                      whileHover={{ scale: 1.1 }}
                    />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{formData.name || "Untitled Material"}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{formData.description || "No description"}</p>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Density</span>
                        <p className="font-medium text-gray-900 dark:text-white">{formData.density || 0} g/cm³</p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Hardness</span>
                        <p className="font-medium text-gray-900 dark:text-white">{formData.hardness || 0} HRC</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Material Info */}
              <motion.div
                className="bg-blue-50/70 dark:bg-blue-900/20 backdrop-blur-xl shadow-lg rounded-2xl border border-blue-200/50 dark:border-blue-800/50 p-6"
                variants={cardVariants}
              >
                <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-200 mb-4">Material Properties Guide</h3>
                <div className="space-y-3 text-sm text-blue-800 dark:text-blue-300">
                  <div>
                    <strong>Density:</strong> Mass per unit volume. Affects weight calculations and material selection.
                  </div>
                  <div>
                    <strong>Hardness:</strong> Resistance to deformation. Important for tool selection and machining parameters.
                  </div>
                  <div>
                    <strong>Thermal Conductivity:</strong> Heat transfer capability. Affects cutting temperatures and cooling strategies.
                  </div>
                  <div>
                    <strong>Elastic Modulus:</strong> Stiffness of the material. Used in stress and deflection analysis.
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </DynamicLayout>
  );
}
