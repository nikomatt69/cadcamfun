import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";

import { motion, AnimatePresence, Variants } from "framer-motion";
import {
  Home,
  Grid,
  Tool,
  Package,
  Users,
  Settings,
  FileText,
  Server,
  Database,
  HelpCircle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  PlusSquare,
  Circle,
  Box,
  Sliders,
  Layers,
  Eye,
  EyeOff,
  DollarSign,
  User,
  BarChart2,
  Activity,
  Airplay,
  Globe,
  CreditCard,
  Cpu,
  List
} from "react-feather";
import { useCADStore } from "src/store/cadStore";

import CAMWorkpieceSetup from "../cam/CamWorkpieceSetup";
import LibrarySection from "../ui/LibrarySection";
import OriginControls from "../cad/OriginControls";
import ToolBrowser from "../cam/ToolBroswer";
import MaterialBrowser from "../cam/MaterialBroswer";
import SnapSettings from "../cad/SnapSettings";
import CAMElementExplorer from "./CAMElementExplorer";

import ToolMenus from "../cam/ToolMenus";
import { BrainCircuitIcon, Puzzle } from "lucide-react";
import ToolsList from "../tools/ToolsList";
import ToolsLibraryView from "../library/ToolsLibraryView";

// Animation variants
const sidebarVariants = {
  open: {
    width: 320,
    transition: {
      duration: 0.3,
      ease: "easeInOut"
    }
  },
  closed: {
    width: 80,
    transition: {
      duration: 0.3,
      ease: "easeInOut"
    }
  }
};

const contentVariants = {
  open: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.3,
      delay: 0.1
    }
  },
  closed: {
    opacity: 0,
    x: -10,
    transition: {
      duration: 0.2
    }
  }
};

const tabVariants = {
  inactive: {
    scale: 1,
    backgroundColor: "transparent"
  },
  active: {
    scale: 1.02,
    backgroundColor: "rgba(0, 122, 204, 0.1)",
    transition: {
      duration: 0.2
    }
  },
  hover: {
    scale: 1.05,
    backgroundColor: "rgba(0, 122, 204, 0.05)",
    transition: {
      duration: 0.15
    }
  }
};

const buttonVariants = {
  hover: {
    scale: 1.05,
    transition: {
      duration: 0.2
    }
  },
  tap: {
    scale: 0.95,
    transition: {
      duration: 0.1
    }
  }
};

const navItemVariants = {
  hover: {
    x: 4,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    transition: { duration: 0.2 }
  }
};

const dropdownVariants = {
  closed: {
    opacity: 0,
    height: 0,
    transition: { duration: 0.2 }
  },
  open: {
    opacity: 1,
    height: "auto",
    transition: { duration: 0.3, ease: "easeOut" }
  }
};

const toggleVariants = {
  closed: { rotate: 0 },
  open: { rotate: 180 }
};

interface EnhancedSidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  activeSidebarTab: "layers" | "settings" | "machine" | "explorer";
  setActiveSidebarTab: (tab: "layers" | "settings" | "machine" | "explorer") => void;
  onSelectTool?: (tool: any) => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  current?: boolean;
  disable?: boolean;
  children?: NavItem[];
}

const EnhancedSidebarCam: React.FC<EnhancedSidebarProps> = ({
  isOpen,
  setIsOpen,
  activeSidebarTab,
  setActiveSidebarTab,
  onSelectTool
}) => {
  const router = useRouter();

  const { viewMode, setViewMode, gridVisible, toggleGrid, axisVisible, toggleAxis } = useCADStore();
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({
    projects: true,
    resources: false,
    settings: false
  });
  const [selectedLibraryComponent, setSelectedLibraryComponent] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [selectedLibraryTool, setSelectedLibraryTool] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  // Generate navigation items with current route indicated
  const getNavigation = (): NavItem[] => {
    return [
      {
        name: "Dashboard",
        href: "/",
        icon: <Home size={20} />,
        current: router.pathname === "/"
      },
      {
        name: "Projects",
        href: "#",
        icon: <FileText size={20} />,
        current: router.pathname.startsWith("/projects"),
        children: [
          {
            name: "All Projects",
            href: "/projects",
            icon: <FileText size={16} />,
            current: router.pathname === "/projects"
          },
          {
            name: "New Project",
            href: "/projects",
            icon: <PlusSquare size={16} />,
            current: router.pathname === "/projects"
          }
        ]
      },
      {
        name: "CAD Editor",
        href: "/cad",
        icon: <Grid size={20} />,
        current: router.pathname === "/cad"
      },
      {
        name: "CAM Editor",
        href: "/cam",
        icon: <Tool size={20} />,
        current: router.pathname === "/cam"
      },
      {
        name: "Resources",
        href: "#",
        icon: <Package size={20} />,
        current: ["/components", "/materials", "/machine", "/tools", "/drawing-instruments", "/library"].some(path =>
          router.pathname.startsWith(path)
        ),
        children: [
          {
            name: "Toolpaths",
            href: "/toolpaths",
            icon: <Tool size={16} />,
            current: router.pathname.startsWith("/toolpaths")
          },
          {
            name: "Components",
            href: "/components",
            icon: <Package size={16} />,
            current: router.pathname.startsWith("/components")
          },
          {
            name: "Materials",
            href: "/materials",
            icon: <Database size={16} />,
            current: router.pathname.startsWith("/materials")
          },
          {
            name: "Configurations",
            href: "/machine",
            icon: <Server size={16} />,
            current: router.pathname.startsWith("/machine")
          },
          {
            name: "Tools",
            href: "/tools",
            icon: <Tool size={16} />,
            current: router.pathname.startsWith("/tools")
          }
        ]
      },
      {
        name: "Organization",
        href: "/organizations",
        icon: <Users size={20} />,
        current: router.pathname.startsWith("/organizations")
      },
      {
        name: "Plugins",
        href: "/plugins",
        icon: <Puzzle size={20} />,
        current: router.pathname.startsWith("/plugins")
      },
      {
        name: "Website",
        href: "https://site.cadcamfun.xyz",
        icon: <Globe size={20} />,
        current: router.pathname.startsWith("https://site.cadcamfun.xyz")
      },
      {
        name: "Pricing",
        href: "/pricing",
        icon: <DollarSign size={20} />,
        current: router.pathname.startsWith("/pricing")
      },
      {
        name: "AI",
        href: "/ai",
        icon: <Cpu size={20} />,
        current: router.pathname.startsWith("/ai"),
        children: [
          {
            name: "Dashboard",
            href: "/ai",
            icon: <BarChart2 size={16} />,
            current: router.pathname === "/ai"
          }
        ]
      },
      {
        name: "Analytics",
        href: "#",
        icon: <BarChart2 size={20} />,
        current: router.pathname.startsWith("/analytics"),
        children: [
          {
            name: "Dashboard",
            href: "/analytics",
            icon: <BarChart2 size={16} />,
            current: router.pathname === "/analytics"
          },
          {
            name: "Activity History",
            href: "/analytics/history",
            icon: <Activity size={16} />,
            current: router.pathname === "/analytics/history"
          }
        ]
      },
      {
        name: "Docs",
        href: "#",
        icon: <BookOpen size={20} />,
        current: router.pathname.startsWith("#"),
        children: [
          {
            name: "UserGuide",
            href: "https://docs.cadcamfun.xyz",
            icon: <FileText size={16} />,
            current: router.pathname === "https://docs.cadcamfun.xyz"
          },
          {
            name: "Api Playground",
            href: "/graphql",
            icon: <BrainCircuitIcon size={16} />,
            current: router.pathname === "/graphql"
          }
        ]
      },
      {
        name: "Settings",
        href: "#",
        icon: <Settings size={20} />,
        current: router.pathname.startsWith("/settings") || router.pathname === "/profile",
        children: [
          {
            name: "Profile",
            href: "/profile",
            icon: <User size={16} />,
            current: router.pathname === "/profile"
          },
          {
            name: "Preferences",
            href: "/settings",
            icon: <Settings size={16} />,
            current: router.pathname === "/settings"
          },
          {
            name: "Subscription",
            href: "/settings/subscription",
            icon: <CreditCard size={16} />,
            current: router.pathname === "/settings/subscription"
          }
        ]
      }
    ];
  };

  const PluginIcon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="20"
      height="20"
    >
      <path d="M 4 4 L 10 4 C 10 2 14 2 14 4 L 20 4 L 20 10 C 22 10 22 14 20 14 L 20 20 L 4 20 Z" />
    </svg>
  );

  const navigation = getNavigation();

  // Toggle expanded items
  const toggleExpanded = (key: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Render a nav item with potential children
  const renderNavItem = (item: NavItem, depth: number = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = hasChildren && expandedItems[item.name.toLowerCase()];
    const textColor = item.current ? "text-blue-700 dark:text-blue-400" : "text-gray-700 dark:text-gray-300";
    const bgColor = item.current ? "bg-white/60 dark:bg-blue-900/30 backdrop-blur-sm shadow-md border border-blue-200/30 dark:border-blue-500/30" : "hover:bg-white/40 dark:hover:bg-gray-700/40 backdrop-blur-sm";
    const disabled = item.disable ? "opacity-50 cursor-not-allowed" : "";

    return (
      <motion.div
        key={item.name}
        className="mb-1"
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: depth * 0.1 }}
      >
        <motion.div
          className={`group flex items-center justify-between px-3 py-2 text-sm font-medium rounded-xl cursor-pointer transition-all duration-200 ${textColor} ${bgColor} ${disabled}`}
          variants={navItemVariants}
          whileHover="hover"
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            if (hasChildren) {
              toggleExpanded(item.name.toLowerCase());
            } else if (item.href !== "#") {
              router.push(item.href);
            }
          }}
        >
          <div className="flex items-center">
            <motion.span
              className={`${item.current ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"} mr-3`}
              whileHover={{ scale: 1.1 }}
              transition={{ duration: 0.2 }}
            >
              {item.icon}
            </motion.span>
            <AnimatePresence>
              {isOpen && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {item.name}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <AnimatePresence>
            {isOpen && hasChildren && (
              <motion.div
                className="ml-2"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
              >
                <motion.div
                  variants={toggleVariants}
                  animate={isExpanded ? "open" : "closed"}
                  transition={{ duration: 0.2 }}
                >
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <AnimatePresence>
          {isOpen && hasChildren && isExpanded && (
            <motion.div
              className="mt-1 ml-4 space-y-1"
              variants={dropdownVariants as Variants}
              initial="closed"
              animate="open"
              exit="closed"
            >
              {item.children?.map((child, index) => (
                <motion.div
                  key={child.name}
                  className={`group flex items-center px-3 py-2 text-sm font-medium rounded-xl cursor-pointer transition-all duration-200 ${child.current
                    ? "text-blue-700 dark:text-blue-400 bg-white/60 dark:bg-blue-900/30 backdrop-blur-sm shadow-md border border-blue-200/30 dark:border-blue-500/30"
                    : "text-gray-700 dark:text-gray-300 hover:bg-white/40 dark:hover:bg-gray-700/40 backdrop-blur-sm"
                    }`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  whileHover={{ x: 4, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => router.push(child.href)}
                >
                  <motion.span
                    className="mr-3 text-gray-500 dark:text-gray-400"
                    whileHover={{ scale: 1.1 }}
                    transition={{ duration: 0.2 }}
                  >
                    {child.icon}
                  </motion.span>
                  <span>{child.name}</span>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  // Content for sidebar based on active tab
  const renderSidebarContent = () => {
    if (!isOpen) {
      return (
        <motion.div
          className="py-4 px-2 flex flex-col backdrop-blur-sm bg-white/30 dark:bg-gray-800/50 items-center rounded-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {activeSidebarTab === "machine" && <></>}

          {activeSidebarTab === "explorer" && (
            <motion.div
              className="text-center text-xs text-gray-500 dark:text-gray-400 mt-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <motion.div
                whileHover={{ scale: 1.1 }}
                transition={{ duration: 0.2 }}
              >
                <List size={20} className="mx-auto mb-2" />
              </motion.div>
              Open sidebar
              <br />
              to view elements
            </motion.div>
          )}

          {activeSidebarTab === "settings" && (
            <motion.div
              className="space-y-4 p-1"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <motion.button
                onClick={toggleGrid}
                className="p-3 rounded-xl hover:bg-white/40 dark:hover:bg-gray-700/40 backdrop-blur-sm shadow-md border border-white/30 dark:border-gray-600/30 transition-all duration-200"
                title="Toggle Grid"
                variants={buttonVariants}
                whileHover="hover"
                whileTap="tap"
              >
                <Grid size={20} className={gridVisible ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-400"} />
              </motion.button>
              <motion.button
                onClick={toggleAxis}
                className="p-3 rounded-xl hover:bg-white/40 dark:hover:bg-gray-700/40 backdrop-blur-sm shadow-md border border-white/30 dark:border-gray-600/30 transition-all duration-200"
                title="Toggle Axis"
                variants={buttonVariants}
                whileHover="hover"
                whileTap="tap"
              >
                {axisVisible ? (
                  <Eye size={20} className="text-blue-600 dark:text-blue-400" />
                ) : (
                  <EyeOff size={20} className="text-gray-600 dark:text-gray-400" />
                )}
              </motion.button>
              <motion.button
                onClick={() => setViewMode(viewMode === "2d" ? "3d" : "2d")}
                className="p-3 rounded-xl hover:bg-white/40 dark:hover:bg-gray-700/40 backdrop-blur-sm shadow-md border border-white/30 dark:border-gray-600/30 transition-all duration-200"
                title="Toggle View Mode"
                variants={buttonVariants}
                whileHover="hover"
                whileTap="tap"
              >
                <Box size={20} className={viewMode === "3d" ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-400"} />
              </motion.button>
            </motion.div>
          )}
        </motion.div>
      );
    }

    return (
      <motion.div
        className="p-4 space-y-6 flex flex-col items-center"
        variants={contentVariants}
        animate={isOpen ? "open" : "closed"}
      >
        {activeSidebarTab === "explorer" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="w-full"
          >
            <CAMElementExplorer
              onElementSelect={id => {
                console.log("Element selected:", id);
              }}
            />
          </motion.div>
        )}
        {activeSidebarTab === "machine" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="w-full space-y-6"
          >
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.3 }}
            >
              <OriginControls />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.4 }}
            >
              <CAMWorkpieceSetup />
            </motion.div>
            <motion.div
              className="mt-6 pt-4 border-t border-white/30 dark:border-gray-600/30"
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.3, delay: 0.5 }}
            />
          </motion.div>
        )}
        {activeSidebarTab === "settings" && (
          <motion.div
            className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 shadow-xl rounded-2xl p-6 max-h-[calc(100vh-100px)] overflow-y-auto text-center w-full border border-white/30 dark:border-gray-600/30"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <motion.h3
              className="text-lg font-medium text-gray-900 dark:text-white mb-6"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 }}
            >
              View Settings
            </motion.h3>
            <div className="space-y-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.4 }}
              >
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block">View Mode</label>
                <div className="flex space-x-3 justify-center">
                  <motion.button
                    onClick={() => setViewMode("2d")}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${viewMode === "2d"
                      ? "bg-blue-600 text-white shadow-lg border border-blue-500/50"
                      : "bg-white/60 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-700/80 backdrop-blur-sm border border-white/30 dark:border-gray-600/30"
                      }`}
                    variants={buttonVariants}
                    whileHover="hover"
                    whileTap="tap"
                  >
                    2D View
                  </motion.button>
                  <motion.button
                    onClick={() => setViewMode("3d")}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${viewMode === "3d"
                      ? "bg-blue-600 text-white shadow-lg border border-blue-500/50"
                      : "bg-white/60 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-gray-700/80 backdrop-blur-sm border border-white/30 dark:border-gray-600/30"
                      }`}
                    variants={buttonVariants}
                    whileHover="hover"
                    whileTap="tap"
                  >
                    3D View
                  </motion.button>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.5 }}
              >
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block">Display Options</label>
                <div className="space-y-3">
                  <motion.button
                    onClick={toggleGrid}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm backdrop-blur-sm bg-white/60 dark:bg-gray-700/60 hover:bg-white/80 dark:hover:bg-gray-700/80 border border-white/30 dark:border-gray-600/30 transition-all duration-200"
                    variants={buttonVariants}
                    whileHover="hover"
                    whileTap="tap"
                  >
                    <span className="flex items-center text-gray-700 dark:text-gray-300">
                      <Grid size={16} className="mr-3" />
                      Show Grid
                    </span>
                    <motion.span
                      className={`h-5 w-9 rounded-full ${gridVisible ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-500"} relative transition-colors duration-200 ease-in-out`}
                      whileTap={{ scale: 0.95 }}
                    >
                      <motion.span
                        className="absolute top-0.5 left-0.5 inline-block h-4 w-4 rounded-full bg-white shadow-lg transform transition-transform duration-200 ease-in-out"
                        animate={{ x: gridVisible ? 16 : 0 }}
                        transition={{ duration: 0.2 }}
                      />
                    </motion.span>
                  </motion.button>
                  <motion.button
                    onClick={toggleAxis}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm backdrop-blur-sm bg-white/60 dark:bg-gray-700/60 hover:bg-white/80 dark:hover:bg-gray-700/80 border border-white/30 dark:border-gray-600/30 transition-all duration-200"
                    variants={buttonVariants}
                    whileHover="hover"
                    whileTap="tap"
                  >
                    <span className="flex items-center text-gray-700 dark:text-gray-300">
                      {axisVisible ? <Eye size={16} className="mr-3" /> : <EyeOff size={16} className="mr-3" />}
                      Show Axis
                    </span>
                    <motion.span
                      className={`h-5 w-9 rounded-full ${axisVisible ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-500"} relative transition-colors duration-200 ease-in-out`}
                      whileTap={{ scale: 0.95 }}
                    >
                      <motion.span
                        className="absolute top-0.5 left-0.5 inline-block h-4 w-4 rounded-full bg-white shadow-lg transform transition-transform duration-200 ease-in-out"
                        animate={{ x: axisVisible ? 16 : 0 }}
                        transition={{ duration: 0.2 }}
                      />
                    </motion.span>
                  </motion.button>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.6 }}
              >
                <SnapSettings />
              </motion.div>
            </div>
          </motion.div>
        )}
      </motion.div>
    );
  };

  return (
    <>
      {/* Mobile sidebar backdrop */}

      {/* Sidebar */}
      <motion.div
        className="flex-shrink-0 backdrop-blur-md bg-gradient-to-b from-white/90 via-white/80 to-white/70 dark:from-gray-800/90 dark:via-gray-800/80 dark:to-gray-800/70 border-2 mr-0.5 rounded-2xl border-white/30 dark:border-gray-600/30 shadow-xl h-full flex flex-col"
        variants={sidebarVariants as Variants}
        animate={isOpen ? "open" : "closed"}
        initial={false}
      >
        {/* Sidebar tabs */}
        <motion.div
          className="w-full border-b rounded-t-2xl border-white/30 dark:border-gray-600/30 backdrop-blur-sm bg-white/60 dark:bg-gray-700/60 flex justify-center shadow-md"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.div
                className="flex justify-center w-full text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <motion.button
                  className={`flex-1 py-4 px-4 text-sm font-medium rounded-xl transition-all duration-200 ${activeSidebarTab === "explorer"
                    ? "text-[#007ACC] bg-blue-50/80 dark:bg-blue-900/30 border-b-2 border-[#007ACC] shadow-md"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/40 dark:hover:bg-gray-700/40"
                    }`}
                  variants={tabVariants}
                  animate={activeSidebarTab === "explorer" ? "active" : "inactive"}
                  whileHover="hover"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setActiveSidebarTab("explorer")}
                >
                  <motion.div
                    className="flex items-center justify-center"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                  >
                    <motion.div
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ duration: 0.2 }}
                    >
                      <List size={16} className="mr-2" />
                    </motion.div>
                    Files
                  </motion.div>
                </motion.button>
                <motion.button
                  className={`flex-1 py-4 px-4 text-sm font-medium rounded-xl transition-all duration-200 ${activeSidebarTab === "settings"
                    ? "text-[#007ACC] bg-blue-50/80 dark:bg-blue-900/30 border-b-2 border-[#007ACC] shadow-md"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/40 dark:hover:bg-gray-700/40"
                    }`}
                  variants={tabVariants}
                  animate={activeSidebarTab === "settings" ? "active" : "inactive"}
                  whileHover="hover"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setActiveSidebarTab("settings")}
                >
                  <motion.div
                    className="flex items-center justify-center"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.3 }}
                  >
                    <motion.div
                      whileHover={{ scale: 1.1, rotate: -5 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Sliders size={16} className="mr-2" />
                    </motion.div>
                    Settings
                  </motion.div>
                </motion.button>
                <motion.button
                  className={`flex-1 py-4 px-4 text-sm font-medium rounded-xl transition-all duration-200 ${activeSidebarTab === "machine"
                    ? "text-[#007ACC] bg-blue-50/80 dark:bg-blue-900/30 border-b-2 border-[#007ACC] shadow-md"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/40 dark:hover:bg-gray-700/40"
                    }`}
                  variants={tabVariants}
                  animate={activeSidebarTab === "machine" ? "active" : "inactive"}
                  whileHover="hover"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setActiveSidebarTab("machine")}
                >
                  <motion.div
                    className="flex items-center justify-center"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.4 }}
                  >
                    <motion.div
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Database size={16} className="mr-2" />
                    </motion.div>
                    Machine
                  </motion.div>
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                className="flex flex-col w-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <motion.button
                  className={`w-full py-5 flex flex-col items-center justify-center rounded-xl transition-all duration-200 ${activeSidebarTab === "explorer"
                    ? "text-[#007ACC] bg-blue-50/80 dark:bg-blue-900/30 border-b-2 border-[#007ACC] shadow-md"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/40 dark:hover:bg-gray-700/40"
                    }`}
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                  onClick={() => setActiveSidebarTab("explorer")}
                  title="Explorer"
                >
                  <motion.div
                    whileHover={{ scale: 1.2, rotate: 10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <List size={20} />
                  </motion.div>
                </motion.button>
                <motion.button
                  className={`w-full py-5 flex flex-col items-center justify-center rounded-xl transition-all duration-200 ${activeSidebarTab === "settings"
                    ? "text-[#007ACC] bg-blue-50/80 dark:bg-blue-900/30 border-b-2 border-[#007ACC] shadow-md"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/40 dark:hover:bg-gray-700/40"
                    }`}
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                  onClick={() => setActiveSidebarTab("settings")}
                  title="Settings"
                >
                  <motion.div
                    whileHover={{ scale: 1.2, rotate: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Sliders size={20} />
                  </motion.div>
                </motion.button>
                <motion.button
                  className={`w-full py-5 flex flex-col items-center justify-center rounded-xl transition-all duration-200 ${activeSidebarTab === "machine"
                    ? "text-[#007ACC] bg-blue-50/80 dark:bg-blue-900/30 border-b-2 border-[#007ACC] shadow-md"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/40 dark:hover:bg-gray-700/40"
                    }`}
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                  onClick={() => setActiveSidebarTab("machine")}
                  title="Machine"
                >
                  <motion.div
                    whileHover={{ scale: 1.2, rotate: 10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Database size={20} />
                  </motion.div>
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Sidebar content */}
        <motion.div
          className="flex-1 flex-col rounded-xl overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          {renderSidebarContent()}
        </motion.div>

        {/* Navigation from the original sidebar */}
        <motion.div
          className="mt-2 p-3 overflow-y-auto rounded-xl border-t border-white/30 dark:border-gray-600/30 backdrop-blur-sm bg-white/40 dark:bg-gray-700/40"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <motion.button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center justify-center w-full px-4 py-3 text-sm font-medium text-center rounded-xl hover:bg-white/50 dark:hover:bg-gray-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 backdrop-blur-sm transition-all duration-200 border border-white/30 dark:border-gray-600/30"
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
          >
            <AnimatePresence>
              {isOpen && (
                <motion.span
                  className="text-xs text-gray-500 dark:text-gray-400"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  Quick Navigation
                </motion.span>
              )}
            </AnimatePresence>
            <motion.svg
              className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform ${isOpen ? "ml-2" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              variants={toggleVariants}
              animate={isDropdownOpen ? "open" : "closed"}
              transition={{ duration: 0.2 }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </motion.svg>
          </motion.button>

          <AnimatePresence>
            {isDropdownOpen && (
              <motion.div
                className="space-y-2 scrollbar overflow-y-auto mt-3 flex flex-col items-center"
                variants={dropdownVariants as Variants}
                initial="closed"
                animate="open"
                exit="closed"
              >
                {navigation.slice(0, isOpen ? undefined : 0).map((item, index) =>
                  <motion.div
                    key={item.name}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.05 }}
                  >
                    {renderNavItem(item)}
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Toggle sidebar button */}
        <motion.div
          className="border-t border-white/30 dark:border-gray-600/30 p-3 flex justify-center backdrop-blur-sm bg-white/40 dark:bg-gray-700/40 rounded-b-2xl"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          <motion.button
            className="p-3 rounded-xl hover:bg-white/50 dark:hover:bg-gray-700/50 backdrop-blur-sm border border-white/30 dark:border-gray-600/30 shadow-md transition-all duration-200"
            onClick={() => setIsOpen(!isOpen)}
            title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
          >
            <motion.div
              variants={toggleVariants}
              animate={isOpen ? "open" : "closed"}
              transition={{ duration: 0.3 }}
            >
              {isOpen ? (
                <ChevronLeft size={20} className="text-gray-600 dark:text-gray-400" />
              ) : (
                <ChevronRight size={20} className="text-gray-600 dark:text-gray-400" />
              )}
            </motion.div>
          </motion.button>
        </motion.div>
      </motion.div>

      {/* Toggle sidebar button outside for mobile */}
    </>
  );
};

export default EnhancedSidebarCam;
