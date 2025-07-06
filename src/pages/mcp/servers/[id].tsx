// Server details page

// src/pages/mcp/servers/[id].tsx
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { MCPApiClient } from "../../../lib/mcp/api-client";
import Link from "next/link";
import { DynamicLayout } from "src/components/dynamic-imports";

import Loading from "@/src/components/ui/Loading";
import { motion, AnimatePresence, MotionConfig, Variants } from "framer-motion";
import { Server, ArrowLeft, Activity, Database, Zap, Settings, Edit, Layers, Terminal } from "react-feather";
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

export default function MCPServerDetailsPage() {
  const router = useRouter();
  const { id } = router.query;


  const [server, setServer] = useState<any>(null);
  const [serverInfo, setServerInfo] = useState<any>(null);
  const [selectedTab, setSelectedTab] = useState<"resources" | "tools">("resources");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchServerDetails = async () => {
      if (!id || Array.isArray(id)) return;

      try {
        setLoading(true);
        setError(null);

        // Get server configuration
        const serverConfig = await MCPApiClient.getServer(id);
        setServer(serverConfig);

        // If server is enabled, get server info
        if (serverConfig.enabled) {
          try {
            const info = await MCPApiClient.getServerInfo(id);
            setServerInfo(info);
          } catch (err: any) {
            console.error("Failed to fetch server info:", err);
            toast.error("Server info unavailable");
          }
        }
      } catch (err: any) {
        setError(err.message || "Failed to load server details");
        toast.error("Failed to load server details");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchServerDetails();
    }
  }, [id]);

  const handleToggleStatus = async () => {
    if (!server) return;

    try {
      const updated = await MCPApiClient.updateServer(server.id, {
        enabled: !server.enabled
      });

      setServer(updated);
      toast.success(`Server ${updated.enabled ? 'enabled' : 'disabled'} successfully`);

      // If enabling, try to fetch server info
      if (updated.enabled) {
        try {
          const info = await MCPApiClient.getServerInfo(updated.id);
          setServerInfo(info);
        } catch (err: any) {
          console.error("Failed to fetch server info:", err);
        }
      } else {
        // If disabling, clear server info
        setServerInfo(null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to update server status");
      toast.error("Failed to update server status");
    }
  };

  if (loading) {
    return (
      <DynamicLayout>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
          <Loading />
        </div>
      </DynamicLayout>
    );
  }

  if (status === "unauthenticated") {
    router.push("/waitlist");
    return null;
  }

  if (!server) {
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
                  {error || "Server not found"}
                </div>
                <motion.div
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  <Link href="/mcp/directory">
                    <button className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-xl hover:from-gray-600 hover:to-gray-700 shadow-lg shadow-gray-500/25">
                      <ArrowLeft size={16} className="mr-2" />
                      Back to Directory
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
              <Link href="/mcp/directory">
                <motion.button
                  className="inline-flex items-center px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50 hover:bg-white/90 dark:hover:bg-gray-800/90 transition-all"
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  <ArrowLeft size={16} className="mr-2" />
                  Back to Directory
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

            {/* Server header */}
            <motion.div
              className="backdrop-blur-md bg-white/80 dark:bg-gray-900/80 rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/30 overflow-hidden mb-8"
              variants={cardVariants}
            >
              <div className="p-6 border-b border-gray-100/50 dark:border-gray-700/50">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
                  <div className="flex items-center">
                    <motion.div
                      className="w-12 h-12 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center mr-4"
                      whileHover={{ scale: 1.05, rotate: 5 }}
                    >
                      <Server size={24} className="text-white" />
                    </motion.div>
                    <div>
                      <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                        {server.name}
                      </h1>
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${server.enabled
                          ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300"
                          : "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-300"
                          }`}
                      >
                        <motion.div
                          className={`w-2 h-2 rounded-full mr-2 ${server.enabled ? "bg-green-500" : "bg-gray-400"}`}
                          animate={server.enabled ? { scale: [1, 1.2, 1] } : {}}
                          transition={{ repeat: Infinity, duration: 2 }}
                        />
                        {server.enabled ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <motion.button
                      onClick={handleToggleStatus}
                      className={`inline-flex items-center px-4 py-2.5 rounded-xl text-white font-medium shadow-lg transition-all ${server.enabled
                        ? "bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 shadow-red-500/25"
                        : "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-green-500/25"
                        }`}
                      variants={buttonVariants}
                      whileHover="hover"
                      whileTap="tap"
                    >
                      <Activity size={16} className="mr-2" />
                      {server.enabled ? "Disable Server" : "Enable Server"}
                    </motion.button>

                    <motion.div
                      variants={buttonVariants}
                      whileHover="hover"
                      whileTap="tap"
                    >
                      <Link href={`/settings/mcp/edit/${server.id}`}>
                        <button className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-xl hover:from-blue-600 hover:to-cyan-700 shadow-lg shadow-blue-500/25">
                          <Edit size={16} className="mr-2" />
                          Edit Configuration
                        </button>
                      </Link>
                    </motion.div>
                  </div>
                </div>

                <div className="flex items-center gap-4 mb-4">
                  <span className="text-xs bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900/50 dark:to-purple-900/50 text-blue-800 dark:text-blue-300 px-3 py-1 rounded-full">
                    {server.type === "sse" ? "Server-Sent Events (SSE)" : "Standard I/O (stdio)"}
                  </span>
                </div>

                <div className="space-y-3">
                  {server.type === "sse" ? (
                    <div className="bg-gray-50/50 dark:bg-gray-800/50 rounded-xl p-3">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Endpoint:</span>
                      <div className="font-mono text-sm text-gray-900 dark:text-gray-100 mt-1 break-all">
                        {server.url}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="bg-gray-50/50 dark:bg-gray-800/50 rounded-xl p-3">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Command:</span>
                        <div className="font-mono text-sm text-gray-900 dark:text-gray-100 mt-1">
                          {(server as any).command}
                        </div>
                      </div>

                      {(server as any).args && (server as any).args.length > 0 && (
                        <div className="bg-gray-50/50 dark:bg-gray-800/50 rounded-xl p-3">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Arguments:</span>
                          <div className="font-mono text-sm text-gray-900 dark:text-gray-100 mt-1">
                            {Array.isArray((server as any).args)
                              ? (server as any).args.join(" ")
                              : JSON.stringify((server as any).args)}
                          </div>
                        </div>
                      )}

                      {(server as any).workingDirectory && (
                        <div className="bg-gray-50/50 dark:bg-gray-800/50 rounded-xl p-3">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Working Directory:</span>
                          <div className="font-mono text-sm text-gray-900 dark:text-gray-100 mt-1">
                            {(server as any).workingDirectory}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Server info section */}
              {serverInfo && (
                <div className="p-6">
                  <div className="mb-6">
                    <div className="flex items-center gap-3 mb-2">
                      <Layers size={20} className="text-gray-600 dark:text-gray-400" />
                      <span className="text-lg font-medium text-gray-900 dark:text-white">Server Information</span>
                    </div>

                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900 dark:text-white text-lg">
                          {serverInfo.name}
                        </span>
                        {serverInfo.version && (
                          <span className="text-sm text-gray-600 dark:text-gray-400 bg-white/50 dark:bg-gray-800/50 px-3 py-1 rounded-full">
                            v{serverInfo.version}
                          </span>
                        )}
                      </div>

                      {serverInfo.instructions && (
                        <div className="mt-3 text-sm text-gray-700 dark:text-gray-300 bg-white/50 dark:bg-gray-800/50 p-3 rounded-lg">
                          {serverInfo.instructions}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="border-b border-gray-200/50 dark:border-gray-700/50 mb-6">
                    <div className="flex space-x-8">
                      <button
                        className={`py-3 px-1 font-medium text-sm border-b-2 focus:outline-none flex items-center ${selectedTab === "resources"
                          ? "border-blue-500 text-blue-600 dark:text-blue-400"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                          }`}
                        onClick={() => setSelectedTab("resources")}
                      >
                        <Database size={16} className="mr-2" />
                        Resources ({serverInfo.resources?.length || 0})
                      </button>
                      <button
                        className={`py-3 px-1 font-medium text-sm border-b-2 focus:outline-none flex items-center ${selectedTab === "tools"
                          ? "border-blue-500 text-blue-600 dark:text-blue-400"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                          }`}
                        onClick={() => setSelectedTab("tools")}
                      >
                        <Zap size={16} className="mr-2" />
                        Tools ({serverInfo.tools?.length || 0})
                      </button>
                    </div>
                  </div>

                  {/* Tab content */}
                  <AnimatePresence mode="wait">
                    {selectedTab === "resources" && (
                      <motion.div
                        key="resources-tab"
                        variants={tabContentVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                      >
                        {serverInfo.resources?.length > 0 ? (
                          <div className="grid gap-4">
                            {serverInfo.resources.map((resource: any, index: number) => (
                              <motion.div
                                key={index}
                                className="backdrop-blur-sm bg-white/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 rounded-xl p-4 hover:bg-white/70 dark:hover:bg-gray-800/70 transition-all"
                                whileHover={{ scale: 1.02 }}
                              >
                                <div className="font-medium text-gray-900 dark:text-white mb-2">
                                  {resource.name}
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-400 font-mono bg-gray-100/50 dark:bg-gray-900/50 px-2 py-1 rounded mb-2">
                                  {resource.uriTemplate}
                                </div>
                                {resource.description && (
                                  <div className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                                    {resource.description}
                                  </div>
                                )}

                                {resource.arguments?.length > 0 && (
                                  <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">
                                      Arguments:
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                      {resource.arguments.map((arg: any, argIndex: number) => (
                                        <div key={argIndex} className="flex items-center">
                                          <span className="font-mono text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 px-2 py-1 rounded">
                                            {arg.name}
                                          </span>
                                          {arg.required && (
                                            <span className="text-red-500 ml-1 text-xs">*</span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </motion.div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-12">
                            <Database size={48} className="mx-auto mb-4 text-gray-400 dark:text-gray-600" />
                            <p className="text-gray-500 dark:text-gray-400">No resources available</p>
                          </div>
                        )}
                      </motion.div>
                    )}

                    {selectedTab === "tools" && (
                      <motion.div
                        key="tools-tab"
                        variants={tabContentVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                      >
                        {serverInfo.tools?.length > 0 ? (
                          <div className="grid gap-4">
                            {serverInfo.tools.map((tool: any, index: number) => (
                              <motion.div
                                key={index}
                                className="backdrop-blur-sm bg-white/50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 rounded-xl p-4 hover:bg-white/70 dark:hover:bg-gray-800/70 transition-all"
                                whileHover={{ scale: 1.02 }}
                              >
                                <div className="font-medium text-gray-900 dark:text-white mb-2">
                                  {tool.name}
                                </div>
                                {tool.description && (
                                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                    {tool.description}
                                  </div>
                                )}

                                {tool.parameters && (
                                  <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">
                                      Parameters:
                                    </div>
                                    <div className="space-y-2 text-sm">
                                      {Object.entries(tool.parameters.properties || {}).map(
                                        ([key, value]: [string, any], paramIndex: number) => (
                                          <div key={paramIndex} className="flex items-start space-x-3">
                                            <div className="flex items-center">
                                              <span className="font-mono text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300 px-2 py-1 rounded">
                                                {key}
                                              </span>
                                              {tool.parameters.required?.includes(key) && (
                                                <span className="text-red-500 ml-1 text-xs">*</span>
                                              )}
                                            </div>
                                            {value.description && (
                                              <span className="text-xs text-gray-500 dark:text-gray-400 flex-1">
                                                {value.description}
                                              </span>
                                            )}
                                          </div>
                                        )
                                      )}
                                    </div>
                                  </div>
                                )}
                              </motion.div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-12">
                            <Zap size={48} className="mx-auto mb-4 text-gray-400 dark:text-gray-600" />
                            <p className="text-gray-500 dark:text-gray-400">No tools available</p>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Empty states */}
              {!serverInfo && server.enabled && (
                <div className="p-6 text-center">
                  <Terminal size={48} className="mx-auto mb-4 text-gray-400 dark:text-gray-600" />
                  <p className="text-gray-500 dark:text-gray-400">
                    Server information not available. The server might be offline or inaccessible.
                  </p>
                </div>
              )}

              {!server.enabled && (
                <div className="p-6 text-center">
                  <Settings size={48} className="mx-auto mb-4 text-gray-400 dark:text-gray-600" />
                  <p className="text-gray-500 dark:text-gray-400">
                    This server is currently disabled. Enable it to view server information.
                  </p>
                </div>
              )}
            </motion.div>
          </div>
        </motion.div>
      </DynamicLayout>
    </MotionConfig>
  );
}
