import { useState, useEffect, useCallback } from "react";

import { useRouter } from "next/router";
import { DynamicLayout } from "src/components/dynamic-imports";
import { motion, AnimatePresence, MotionConfig, Variants } from "framer-motion";
import { Cpu, ArrowLeft, Activity, Play, Pause, Settings, Monitor, Tool, AlertCircle, CheckCircle, BarChart, Calendar, Clock } from "react-feather";
// TODO: Implement machine API functions
const getMachine = async (id: string) => {
  // Placeholder - implement actual API call
  return { id, name: "Sample Machine", status: "offline", type: "mill" };
};

const updateMachine = async (id: string, data: any) => {
  // Placeholder - implement actual API call
  return { id, ...data };
};
import toast from "react-hot-toast";
import Link from "next/link";

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

export default function MachineDetailPage() {

  const router = useRouter();
  const { id } = router.query;

  const [machine, setMachine] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<"overview" | "jobs" | "maintenance" | "settings">("overview");
  const [error, setError] = useState<string | null>(null);

  const fetchMachine = useCallback(async () => {
    if (!id || Array.isArray(id)) return;

    try {
      setLoading(true);
      setError(null);
      const machineData = await getMachine(id);
      setMachine(machineData);
    } catch (err: any) {
      setError(err.message || "Failed to load machine");
      toast.error("Failed to load machine");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (status === "authenticated" && id) {
      fetchMachine();
    }
  }, [status, id, fetchMachine]);

  const handleStatusChange = async (newStatus: string) => {
    if (!machine) return;

    try {
      const updatedMachines = await updateMachine(machine.id, { status: newStatus });
      console.log(updatedMachines);
      setMachine(updatedMachines);
      toast.success(`Machine status updated to ${newStatus}`);
    } catch (err: any) {
      setError(err.message || "Failed to update machine status");
      toast.error("Failed to update machine status");
    }
  };

  if (status === "loading" || loading) {
    return (
      <DynamicLayout>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-orange-600"></div>
        </div>
      </DynamicLayout>
    );
  }

  if (status === "unauthenticated") {
    router.push("/waitlist");
    return null;
  }

  if (!machine) {
    return (
      <MotionConfig reducedMotion="user">
        <DynamicLayout>
          <motion.div
            className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"
            initial="hidden"
            animate="visible"
            variants={pageVariants}
          >
            <div className="p-4 md:p-6 max-w-7xl mx-auto">
              <motion.div
                className="backdrop-blur-md bg-red-50/80 dark:bg-red-900/20 rounded-2xl shadow-xl border border-red-200/50 dark:border-red-800/30 p-8 text-center"
                variants={cardVariants}
              >
                <div className="text-red-700 dark:text-red-300 text-lg mb-4">
                  {error || "Machine not found"}
                </div>
                <motion.div
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  <Link href="/machine">
                    <button className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-xl hover:from-gray-600 hover:to-gray-700 shadow-lg shadow-gray-500/25">
                      <ArrowLeft size={16} className="mr-2" />
                      Back to Machines
                    </button>
                  </Link>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </DynamicLayout>
      </MotionConfig>
    );
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
            {/* Back button */}
            <motion.div
              className="mb-6"
              variants={cardVariants}
            >
              <Link href="/machine">
                <motion.button
                  className="inline-flex items-center px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50 hover:bg-white/90 dark:hover:bg-gray-800/90 transition-all"
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  <ArrowLeft size={16} className="mr-2" />
                  Back to Machines
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

            {/* Machine header */}
            <motion.div
              className="backdrop-blur-md bg-white/80 dark:bg-gray-900/80 rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/30 overflow-hidden mb-8"
              variants={cardVariants}
            >
              <div className="p-6 border-b border-gray-100/50 dark:border-gray-700/50">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
                  <div className="flex items-center">
                    <motion.div
                      className="w-12 h-12 rounded-2xl bg-gradient-to-r from-orange-500 to-red-600 flex items-center justify-center mr-4"
                      whileHover={{ scale: 1.05, rotate: 5 }}
                    >
                      <Cpu size={24} className="text-white" />
                    </motion.div>
                    <div>
                      <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                        {machine.name || "Unnamed Machine"}
                      </h1>
                      <p className="text-gray-600 dark:text-gray-400">
                        {machine.manufacturer || "Unknown"} {machine.model || ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {machine.status === "active" ? (
                      <motion.button
                        onClick={() => handleStatusChange("offline")}
                        className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-yellow-500 to-orange-600 text-white rounded-xl hover:from-yellow-600 hover:to-orange-700 shadow-lg shadow-yellow-500/25"
                        variants={buttonVariants}
                        whileHover="hover"
                        whileTap="tap"
                      >
                        <Pause size={16} className="mr-2" />
                        Stop Machine
                      </motion.button>
                    ) : (
                      <motion.button
                        onClick={() => handleStatusChange("active")}
                        className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 shadow-lg shadow-green-500/25"
                        variants={buttonVariants}
                        whileHover="hover"
                        whileTap="tap"
                      >
                        <Play size={16} className="mr-2" />
                        Start Machine
                      </motion.button>
                    )}

                    <motion.button
                      onClick={() => handleStatusChange("maintenance")}
                      className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-xl hover:from-blue-600 hover:to-cyan-700 shadow-lg shadow-blue-500/25"
                      variants={buttonVariants}
                      whileHover="hover"
                      whileTap="tap"
                    >
                      <Tool size={16} className="mr-2" />
                      Maintenance Mode
                    </motion.button>
                  </div>
                </div>

                {/* Status and basic info */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</span>
                      <motion.div
                        className={`w-3 h-3 rounded-full ${machine.status === "active" ? "bg-green-500" :
                          machine.status === "maintenance" ? "bg-yellow-500" : "bg-gray-400"
                          }`}
                        animate={machine.status === "active" ? { scale: [1, 1.2, 1] } : {}}
                        transition={{ repeat: Infinity, duration: 2 }}
                      />
                    </div>
                    <div className="mt-2 flex items-center">
                      {machine.status === "active" ? (
                        <div className="flex items-center text-green-600 dark:text-green-400">
                          <CheckCircle size={16} className="mr-1" />
                          Active
                        </div>
                      ) : machine.status === "maintenance" ? (
                        <div className="flex items-center text-yellow-600 dark:text-yellow-400">
                          <AlertCircle size={16} className="mr-1" />
                          Maintenance
                        </div>
                      ) : (
                        <div className="flex items-center text-gray-500 dark:text-gray-400">
                          <AlertCircle size={16} className="mr-1" />
                          Offline
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 rounded-xl p-4">
                    <div className="flex items-center">
                      <Monitor size={16} className="text-gray-600 dark:text-gray-400 mr-2" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Type</span>
                    </div>
                    <div className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">
                      {machine.type === "mill" ? "Mill" : machine.type === "lathe" ? "Lathe" : machine.type === "printer" ? "3D Printer" : "Laser Cutter"}
                    </div>
                  </div>

                  {machine.serialNumber && (
                    <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 rounded-xl p-4">
                      <div className="flex items-center">
                        <BarChart size={16} className="text-gray-600 dark:text-gray-400 mr-2" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Serial Number</span>
                      </div>
                      <div className="mt-2 text-sm font-mono bg-gray-100/50 dark:bg-gray-800/50 px-2 py-1 rounded">
                        {machine.serialNumber}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="border-b border-gray-200/50 dark:border-gray-700/50">
                <div className="flex space-x-8 px-6">
                  {[
                    { key: "overview", label: "Overview", icon: Monitor },
                    { key: "jobs", label: "Jobs", icon: Calendar },
                    { key: "maintenance", label: "Maintenance", icon: Tool },
                    { key: "settings", label: "Settings", icon: Settings }
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      className={`py-3 px-1 font-medium text-sm border-b-2 focus:outline-none flex items-center ${selectedTab === tab.key
                        ? "border-orange-500 text-orange-600 dark:text-orange-400"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                        }`}
                      onClick={() => setSelectedTab(tab.key as any)}
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
                  {selectedTab === "overview" && (
                    <motion.div
                      key="overview-tab"
                      variants={tabContentVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Machine Specifications */}
                        <div className="backdrop-blur-sm bg-white/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 rounded-xl p-6">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                            <Settings size={18} className="mr-2" />
                            Specifications
                          </h3>

                          <div className="space-y-4">
                            {machine.config?.maxSpindleSpeed && (
                              <div className="flex justify-between items-center">
                                <span className="text-gray-600 dark:text-gray-400">Max Spindle Speed</span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {machine.config.maxSpindleSpeed} RPM
                                </span>
                              </div>
                            )}

                            {machine.config?.maxFeedRate && (
                              <div className="flex justify-between items-center">
                                <span className="text-gray-600 dark:text-gray-400">Max Feed Rate</span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {machine.config.maxFeedRate} mm/min
                                </span>
                              </div>
                            )}

                            {machine.config?.workVolume && (
                              <div className="flex justify-between items-center">
                                <span className="text-gray-600 dark:text-gray-400">Work Volume</span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {machine.config.workVolume.x}×{machine.config.workVolume.y}×{machine.config.workVolume.z} mm
                                </span>
                              </div>
                            )}

                            {machine.config?.controller && (
                              <div className="flex justify-between items-center">
                                <span className="text-gray-600 dark:text-gray-400">Controller</span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                  {machine.config.controller}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Recent Activity */}
                        <div className="backdrop-blur-sm bg-white/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 rounded-xl p-6">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                            <Clock size={18} className="mr-2" />
                            Recent Activity
                          </h3>

                          <div className="space-y-3">
                            <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                              <div className="flex items-center">
                                <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                                <span className="text-sm text-gray-900 dark:text-white">Machine started</span>
                              </div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">2 hours ago</span>
                            </div>

                            <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                              <div className="flex items-center">
                                <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                                <span className="text-sm text-gray-900 dark:text-white">Job completed</span>
                              </div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">4 hours ago</span>
                            </div>

                            <div className="flex items-center justify-between py-2">
                              <div className="flex items-center">
                                <div className="w-2 h-2 bg-yellow-500 rounded-full mr-3"></div>
                                <span className="text-sm text-gray-900 dark:text-white">Maintenance scheduled</span>
                              </div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">1 day ago</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {selectedTab === "jobs" && (
                    <motion.div
                      key="jobs-tab"
                      variants={tabContentVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      <div className="text-center py-12">
                        <Calendar size={48} className="mx-auto mb-4 text-gray-400 dark:text-gray-600" />
                        <p className="text-gray-500 dark:text-gray-400">No jobs scheduled for this machine</p>
                      </div>
                    </motion.div>
                  )}

                  {selectedTab === "maintenance" && (
                    <motion.div
                      key="maintenance-tab"
                      variants={tabContentVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      <div className="text-center py-12">
                        <Tool size={48} className="mx-auto mb-4 text-gray-400 dark:text-gray-600" />
                        <p className="text-gray-500 dark:text-gray-400">No maintenance records yet</p>
                      </div>
                    </motion.div>
                  )}

                  {selectedTab === "settings" && (
                    <motion.div
                      key="settings-tab"
                      variants={tabContentVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      <div className="backdrop-blur-sm bg-white/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                          Machine Configuration
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400">
                          Advanced machine settings and configuration options will be available here.
                        </p>
                      </div>
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
