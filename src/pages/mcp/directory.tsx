// MCP server directory// src/pages/mcp/directory.tsx
import { useState, useEffect } from "react";
import { MCPApiClient, MCPServerConfig } from "../../lib/mcp/api-client";
import Link from "next/link";
import { useRouter } from "next/router";
import { DynamicLayout } from "src/components/dynamic-imports";

import Loading from "@/src/components/ui/Loading";
import { motion, AnimatePresence, MotionConfig, Variants } from "framer-motion";
import { Server, Settings, Activity, Database, Zap, Plus } from "react-feather";
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

export default function MCPDirectoryPage() {
  const [servers, setServers] = useState<MCPServerConfig[]>([]);
  const [serverInfo, setServerInfo] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();


  // Load servers on mount
  useEffect(() => {
    const fetchServers = async () => {
      try {
        const serversList = await MCPApiClient.getServers();
        // Ensure serversList is an array before setting state
        setServers(Array.isArray(serversList) ? serversList : []);

        // Ensure serversList (now guaranteed to be an array or empty) is used for further operations
        const validServersList = Array.isArray(serversList) ? serversList : [];

        // Load server info for each enabled server
        const infoPromises = validServersList
          .filter(server => server.enabled)
          .map(async server => {
            try {
              const info = await MCPApiClient.getServerInfo(server.id);
              return { id: server.id, info };
            } catch (err) {
              console.error(`Failed to fetch info for server ${server.id}:`, err);
              return { id: server.id, error: true };
            }
          });

        const infoResults = await Promise.all(infoPromises);
        const infoMap: Record<string, any> = {};

        infoResults.forEach(result => {
          if ("info" in result) {
            infoMap[result.id] = result.info;
          }
        });

        setServerInfo(infoMap);
      } catch (err: any) {
        setError(err.message || "Failed to load servers");
        toast.error("Failed to load servers");
      } finally {
        setLoading(false);
      }
    };

    fetchServers();
  }, []);

  const handleViewServer = (serverId: string) => {
    router.push(`/mcp/servers/${serverId}`);
  };

  const handleToggleServer = async (serverId: string, enabled: boolean) => {
    try {
      await MCPApiClient.updateServer(serverId, { enabled });
      setServers(servers.map(server => (server.id === serverId ? { ...server, enabled } : server)));
      toast.success(`Server ${enabled ? 'enabled' : 'disabled'} successfully`);
    } catch (err: any) {
      setError(err.message || "Failed to update server");
      toast.error("Failed to update server");
    }
  };

  if (status === "unauthenticated") {
    router.push("/waitlist");
    return null;
  }

  if (loading) {
    return (
      <DynamicLayout>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
          <Loading />
        </div>
      </DynamicLayout>
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
            {/* Header */}
            <motion.div
              className="backdrop-blur-md bg-white/80 dark:bg-gray-900/80 rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/30 px-6 py-6 mb-8"
              variants={cardVariants}
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center">
                  <motion.div
                    className="w-12 h-12 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center mr-4"
                    whileHover={{ scale: 1.05, rotate: 5 }}
                  >
                    <Server size={24} className="text-white" />
                  </motion.div>
                  <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                      MCP Server Directory
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                      {servers.length} server{servers.length !== 1 ? "s" : ""} available
                    </p>
                  </div>
                </div>

                <motion.div
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  <Link href="/settings/mcp">
                    <button className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-xl hover:from-blue-600 hover:to-cyan-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-lg shadow-blue-500/25">
                      <Settings size={18} className="mr-2" />
                      Manage Servers
                    </button>
                  </Link>
                </motion.div>
              </div>
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

            {/* Content */}
            {servers.length === 0 ? (
              <motion.div
                className="backdrop-blur-md bg-white/80 dark:bg-gray-900/80 rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/30 p-12 text-center"
                variants={cardVariants}
              >
                <motion.div
                  className="w-20 h-20 bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-2xl flex items-center justify-center mx-auto mb-6"
                  whileHover={{ scale: 1.05, rotate: 5 }}
                >
                  <Database size={32} className="text-gray-400 dark:text-gray-500" />
                </motion.div>

                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No MCP Servers</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                  No MCP servers configured yet. Start by adding your first server to begin using Model Context Protocol features.
                </p>

                <motion.div
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  <Link href="/settings/mcp">
                    <button className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-xl hover:from-blue-600 hover:to-cyan-700 shadow-lg shadow-blue-500/25">
                      <Plus size={18} className="mr-2" />
                      Add Server
                    </button>
                  </Link>
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
                variants={cardContainerVariants}
                initial="hidden"
                animate="visible"
              >
                {(Array.isArray(servers) ? servers : []).map(server => {
                  const info = serverInfo[server.id];

                  return (
                    <motion.div
                      key={server.id}
                      variants={cardVariants}
                      whileHover={{ y: -8, transition: { type: "spring", stiffness: 300, damping: 20 } }}
                      className="backdrop-blur-md bg-white/80 dark:bg-gray-900/80 rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/30 overflow-hidden hover:shadow-2xl transition-all duration-300"
                    >
                      <div className={`p-6 ${server.enabled ? "bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20" : "bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50"}`}>
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center">
                            <motion.div
                              className={`w-3 h-3 rounded-full mr-3 ${server.enabled ? "bg-green-500" : "bg-gray-400"}`}
                              animate={server.enabled ? { scale: [1, 1.2, 1] } : {}}
                              transition={{ repeat: Infinity, duration: 2 }}
                            />
                            <div>
                              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                {server.name}
                              </h2>
                              <span className="text-sm text-gray-600 dark:text-gray-400">
                                {server.enabled ? "Active" : "Inactive"}
                              </span>
                            </div>
                          </div>

                          <span className="text-xs bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900/50 dark:to-purple-900/50 text-blue-800 dark:text-blue-300 px-3 py-1 rounded-full">
                            {server.type === "sse" ? "SSE" : "stdio"}
                          </span>
                        </div>

                        <div className="mb-4">
                          {server.type === "sse" ? (
                            <p className="text-sm text-gray-600 dark:text-gray-300 truncate font-mono bg-gray-100/50 dark:bg-gray-800/50 px-2 py-1 rounded">
                              {server.url}
                            </p>
                          ) : (
                            <p className="text-sm text-gray-600 dark:text-gray-300 truncate font-mono bg-gray-100/50 dark:bg-gray-800/50 px-2 py-1 rounded">
                              {(server as any).command}
                            </p>
                          )}
                        </div>

                        {info ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                {info.name}
                              </span>
                              {info.version && (
                                <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100/50 dark:bg-gray-800/50 px-2 py-1 rounded">
                                  v{info.version}
                                </span>
                              )}
                            </div>

                            <div className="flex space-x-6 text-sm">
                              <div className="flex items-center text-gray-600 dark:text-gray-400">
                                <Database size={14} className="mr-1" />
                                <span>{info.resources?.length || 0} Resource{(info.resources?.length || 0) !== 1 ? "s" : ""}</span>
                              </div>
                              <div className="flex items-center text-gray-600 dark:text-gray-400">
                                <Zap size={14} className="mr-1" />
                                <span>{info.tools?.length || 0} Tool{(info.tools?.length || 0) !== 1 ? "s" : ""}</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                            {server.enabled ? "Server info not available" : "Server is disabled"}
                          </div>
                        )}
                      </div>

                      <div className="px-6 py-4 bg-gray-50/50 dark:bg-gray-800/50 border-t border-gray-100/50 dark:border-gray-700/50 flex justify-between">
                        <motion.button
                          onClick={() => handleToggleServer(server.id, !server.enabled)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${server.enabled
                            ? "bg-gradient-to-r from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 text-gray-800 dark:from-gray-700 dark:to-gray-600 dark:text-gray-200 dark:hover:from-gray-600 dark:hover:to-gray-500"
                            : "bg-gradient-to-r from-green-100 to-emerald-200 hover:from-green-200 hover:to-emerald-300 text-green-800 dark:from-green-900/50 dark:to-emerald-900/50 dark:text-green-300 dark:hover:from-green-800/50 dark:hover:to-emerald-800/50"
                            }`}
                          variants={buttonVariants}
                          whileHover="hover"
                          whileTap="tap"
                        >
                          {server.enabled ? "Disable" : "Enable"}
                        </motion.button>

                        <motion.button
                          onClick={() => handleViewServer(server.id)}
                          className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white rounded-lg text-sm font-medium shadow-lg shadow-blue-500/25"
                          variants={buttonVariants}
                          whileHover="hover"
                          whileTap="tap"
                        >
                          View Details
                        </motion.button>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </div>
        </motion.div>
      </DynamicLayout>
    </MotionConfig>
  );
}
