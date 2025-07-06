import { useState, useEffect } from "react";

import { useRouter } from "next/router";
import { DynamicLayout } from "src/components/dynamic-imports";
import { Save, ArrowLeft, Trash2, Tool } from "react-feather";
import { fetchToolById, updateTool, deleteTool } from "@/src/lib/api/tools";
import Loading from "@/src/components/ui/Loading";
import { Tool as ToolType } from "@prisma/client";
import { useLocalToolsLibraryStore } from "@/src/store/localToolsLibraryStore";
import MetaTags from "@/src/components/layout/Metatags";
import { motion, AnimatePresence, MotionConfig, Variants } from "framer-motion";
import toast from "react-hot-toast";

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

export default function ToolDetailPage() {

  const router = useRouter();
  const { id } = router.query;

  // State for tool data and UI
  const [tool, setTool] = useState<ToolType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Local library store
  const { addTool } = useLocalToolsLibraryStore();

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    type: "endmill",
    diameter: 6,
    material: "HSS",
    numberOfFlutes: 2,
    maxRPM: 10000,
    coolantType: "none",
    cuttingLength: 0,
    totalLength: 0,
    shankDiameter: 0,
    notes: ""
  });

  // Fetch tool data when component mounts or id changes
  useEffect(() => {
    if (id && typeof id === "string") {
      fetchTool(id);
    }
  }, [status, id]);

  const fetchTool = async (toolId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchToolById(toolId);
      setTool(data);

      setFormData({
        name: data.name,
        type: data.type,
        diameter: data.diameter,
        material: data.material,
        numberOfFlutes: data.numberOfFlutes || 2,
        maxRPM: data.maxRPM || 10000,
        coolantType: data.coolantType || "none",
        cuttingLength: data.cuttingLength || 0,
        totalLength: data.totalLength || 0,
        shankDiameter: data.shankDiameter || 0,
        notes: data.notes || ""
      });
    } catch (err) {
      console.error("Error fetching tool:", err);
      setError(err instanceof Error ? err.message : "An unknown error occurred");

      // If tool not found, redirect to tools list
      if (err instanceof Error && err.message.includes("not found")) {
        router.push("/tools");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!tool) return;

    setIsSaving(true);
    setMessage(null);

    try {
      // Update tool
      const updatedTool = await updateTool({
        id: tool.id,
        name: formData.name,
        type: formData.type,
        diameter: parseFloat(formData.diameter.toString()),
        material: formData.material,
        numberOfFlutes: parseInt(formData.numberOfFlutes.toString()),
        maxRPM: parseInt(formData.maxRPM.toString()),
        coolantType: formData.coolantType,
        cuttingLength: parseFloat(formData.cuttingLength.toString()),
        totalLength: parseFloat(formData.totalLength.toString()),
        shankDiameter: parseFloat(formData.shankDiameter.toString()),
        notes: formData.notes
      });

      setTool(updatedTool);
      toast.success("Tool saved successfully");
    } catch (err) {
      console.error("Error updating tool:", err);
      toast.error(err instanceof Error ? err.message : "Failed to update tool");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!tool || !confirm("Are you sure you want to delete this tool?")) return;

    setIsLoading(true);
    setMessage(null);

    try {
      await deleteTool(tool.id);
      toast.success("Tool deleted successfully");

      // Redirect to tools list after a short delay
      setTimeout(() => {
        router.push("/tools");
      }, 1500);
    } catch (err) {
      console.error("Error deleting tool:", err);
      toast.error(err instanceof Error ? err.message : "Failed to delete tool");
      setIsLoading(false);
    }
  };

  const handleSaveToLocalLibrary = () => {
    if (!tool) return;

    try {
      // Convert the tool to local library format
      const localTool = {
        name: tool.name,
        type: tool.type,
        diameter: tool.diameter,
        material: tool.material,
        numberOfFlutes: tool.numberOfFlutes || 2,
        maxRPM: tool.maxRPM || 10000,
        coolantType: tool.coolantType || "none",
        cuttingLength: tool.cuttingLength || 0,
        totalLength: tool.totalLength || 0,
        shankDiameter: tool.shankDiameter || 0,
        notes: tool.notes || "",
        tags: []
      };

      // Save to local library
      addTool(localTool);

      // Show success message
      toast.success("Tool saved to local library successfully");
    } catch (err) {
      console.error("Failed to save to local library:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save to local library");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleBack = () => {
    router.push("/tools");
  };

  if (status === "loading" || (isLoading && !error)) {
    return (
      <DynamicLayout>
        <div className="flex h-screen items-center justify-center">
          <Loading />
        </div>
      </DynamicLayout>
    );
  }

  // Tool icon based on type
  const getToolIcon = (type: string) => {
    switch (type) {
      case "endmill":
        return "🔄";
      case "ballendmill":
        return "🔵";
      case "drillbit":
        return "🔨";
      case "chamfermill":
        return "🔺";
      case "facemill":
        return "⬛";
      case "engraver":
        return "✏️";
      case "turningTool":
        return "⚙️";
      case "threadingTool":
        return "🔩";
      default:
        return "🧩";
    }
  };

  if (status === "unauthenticated") {
    router.push("/waitlist");
    return null;
  }

  return (
    <MotionConfig reducedMotion="user">
      <MetaTags ogImage="/og-image.png" title={tool ? `${tool.name} | Tool Editor` : "Tool Editor"} />

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
              className="backdrop-blur-md bg-white/80 dark:bg-gray-900/80 rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/30 px-6 py-4 mb-6"
              variants={cardVariants}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <motion.button
                    onClick={handleBack}
                    className="mr-4 p-2 rounded-full hover:bg-gray-200/50 dark:hover:bg-gray-800/50 transition-colors"
                    variants={buttonVariants}
                    whileHover="hover"
                    whileTap="tap"
                  >
                    <ArrowLeft size={20} />
                  </motion.button>
                  <div className="flex items-center">
                    {tool && (
                      <motion.div
                        className="w-12 h-12 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center mr-4"
                        whileHover={{ scale: 1.05, rotate: 5 }}
                      >
                        <span className="text-xl">{getToolIcon(tool.type)}</span>
                      </motion.div>
                    )}
                    <div>
                      <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                        {tool ? tool.name : "Tool not found"}
                      </h1>
                      <p className="text-gray-600 dark:text-gray-400">
                        {tool ? "Edit tool properties" : "Tool may have been deleted or does not exist"}
                      </p>
                    </div>
                  </div>
                </div>
                {tool && (
                  <div className="flex space-x-3">
                    <motion.button
                      onClick={handleSaveToLocalLibrary}
                      className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:from-indigo-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 shadow-lg shadow-indigo-500/25"
                      variants={buttonVariants}
                      whileHover="hover"
                      whileTap="tap"
                    >
                      <Save size={18} className="mr-2" />
                      Save to Library
                    </motion.button>
                    <motion.button
                      onClick={handleDelete}
                      className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-red-500 to-pink-600 text-white rounded-xl hover:from-red-600 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 shadow-lg shadow-red-500/25"
                      disabled={isSaving || isLoading}
                      variants={buttonVariants}
                      whileHover="hover"
                      whileTap="tap"
                    >
                      <Trash2 size={18} className="mr-2" />
                      Delete
                    </motion.button>
                    <motion.button
                      onClick={handleSave}
                      disabled={isSaving || isLoading}
                      className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-xl hover:from-blue-600 hover:to-cyan-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-lg shadow-blue-500/25"
                      variants={buttonVariants}
                      whileHover="hover"
                      whileTap="tap"
                    >
                      <Save size={18} className="mr-2" />
                      {isSaving ? "Saving..." : "Save"}
                    </motion.button>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Display error */}
            {error && !tool && (
              <motion.div
                className="backdrop-blur-md bg-red-50/80 dark:bg-red-900/20 rounded-2xl shadow-xl border border-red-200/50 dark:border-red-800/30 p-8 text-center"
                variants={cardVariants}
              >
                <div className="text-red-500 text-lg mb-4">{error}</div>
                <motion.button
                  onClick={handleBack}
                  className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-xl hover:from-blue-600 hover:to-cyan-700 shadow-lg shadow-blue-500/25"
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  Return to Tools List
                </motion.button>
              </motion.div>
            )}

            {/* Tool form */}
            {tool && (
              <motion.div
                className="backdrop-blur-md bg-white/80 dark:bg-gray-900/80 rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/30 overflow-hidden"
                variants={cardVariants}
              >
                <div className="p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-6">
                      <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Tool Name
                        </label>
                        <input
                          type="text"
                          id="name"
                          name="name"
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm transition-all"
                          value={formData.name}
                          onChange={handleChange}
                          required
                        />
                      </div>

                      <div>
                        <label htmlFor="type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Tool Type
                        </label>
                        <select
                          id="type"
                          name="type"
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm transition-all"
                          value={formData.type}
                          onChange={handleChange}
                          required
                        >
                          <option value="endmill">End Mill</option>
                          <option value="ballendmill">Ball End Mill</option>
                          <option value="drillbit">Drill Bit</option>
                          <option value="chamfermill">Chamfer Mill</option>
                          <option value="facemill">Face Mill</option>
                          <option value="engraver">Engraver</option>
                          <option value="turningTool">Turning Tool</option>
                          <option value="threadingTool">Threading Tool</option>
                          <option value="insertTool">Insert Tool</option>
                          <option value="tslotcutter">T-Slot Cutter</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="diameter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Diameter (mm)
                          </label>
                          <input
                            type="number"
                            id="diameter"
                            name="diameter"
                            step="0.1"
                            min="0.1"
                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm transition-all"
                            value={formData.diameter}
                            onChange={handleChange}
                            required
                          />
                        </div>

                        <div>
                          <label htmlFor="material" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Material
                          </label>
                          <select
                            id="material"
                            name="material"
                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm transition-all"
                            value={formData.material}
                            onChange={handleChange}
                            required
                          >
                            <option value="HSS">HSS</option>
                            <option value="Carbide">Carbide</option>
                            <option value="Cobalt">Cobalt</option>
                            <option value="Diamond">Diamond</option>
                            <option value="Ceramic">Ceramic</option>
                            <option value="Custom">Custom</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="numberOfFlutes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Number of Flutes
                          </label>
                          <input
                            type="number"
                            id="numberOfFlutes"
                            name="numberOfFlutes"
                            min="1"
                            max="12"
                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm transition-all"
                            value={formData.numberOfFlutes}
                            onChange={handleChange}
                          />
                        </div>

                        <div>
                          <label htmlFor="maxRPM" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Max RPM
                          </label>
                          <input
                            type="number"
                            id="maxRPM"
                            name="maxRPM"
                            min="1000"
                            step="1000"
                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm transition-all"
                            value={formData.maxRPM}
                            onChange={handleChange}
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="coolantType" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Coolant Type
                        </label>
                        <select
                          id="coolantType"
                          name="coolantType"
                          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm transition-all"
                          value={formData.coolantType}
                          onChange={handleChange}
                        >
                          <option value="none">No Coolant</option>
                          <option value="flood">Flood Coolant</option>
                          <option value="mist">Mist Coolant</option>
                          <option value="air">Air Blast</option>
                          <option value="through">Through Tool</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label htmlFor="cuttingLength" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Cutting Length (mm)
                          </label>
                          <input
                            type="number"
                            id="cuttingLength"
                            name="cuttingLength"
                            step="0.1"
                            min="0"
                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm transition-all"
                            value={formData.cuttingLength}
                            onChange={handleChange}
                          />
                        </div>

                        <div>
                          <label htmlFor="totalLength" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Total Length (mm)
                          </label>
                          <input
                            type="number"
                            id="totalLength"
                            name="totalLength"
                            step="0.1"
                            min="0"
                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm transition-all"
                            value={formData.totalLength}
                            onChange={handleChange}
                          />
                        </div>

                        <div>
                          <label htmlFor="shankDiameter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Shank Diameter (mm)
                          </label>
                          <input
                            type="number"
                            id="shankDiameter"
                            name="shankDiameter"
                            step="0.1"
                            min="0"
                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm transition-all"
                            value={formData.shankDiameter}
                            onChange={handleChange}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Notes
                    </label>
                    <textarea
                      id="notes"
                      name="notes"
                      rows={4}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm transition-all"
                      value={formData.notes}
                      onChange={handleChange}
                    ></textarea>
                  </div>

                  <div className="mt-8 pt-6 border-t border-gray-200/50 dark:border-gray-700/50">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Tool Info</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div className="bg-gray-50/50 dark:bg-gray-800/50 backdrop-blur-sm p-3 rounded-xl">
                        <span className="block text-gray-500 dark:text-gray-400">ID</span>
                        <span className="font-mono text-gray-900 dark:text-gray-100">{tool.id}</span>
                      </div>
                      <div className="bg-gray-50/50 dark:bg-gray-800/50 backdrop-blur-sm p-3 rounded-xl">
                        <span className="block text-gray-500 dark:text-gray-400">Created</span>
                        <span className="text-gray-900 dark:text-gray-100">{new Date(tool.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="bg-gray-50/50 dark:bg-gray-800/50 backdrop-blur-sm p-3 rounded-xl">
                        <span className="block text-gray-500 dark:text-gray-400">Updated</span>
                        <span className="text-gray-900 dark:text-gray-100">{new Date(tool.updatedAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </DynamicLayout>
    </MotionConfig>
  );
}
