// src/components/cad/EnhancedSidebar2.tsx
import React, { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/router";

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
import ToolPanel from "../cad/ToolPanel";
import LayerManager from "../cad/LayerManager";
import WorkpieceSetup from "../cad/WorkpieceSetup";
import CADElementExplorer from "./CADElementExplorer";

import OriginControls from "../cad/OriginControls";
import ComponentsBrowserLocal from "../cad/ComponentBroswerLocal";
import { ComponentBrowser } from "../cad/ComponentBroswer";
import SnapSettings from "../cad/SnapSettings";

import { ComponentLibraryItem } from "@/src/hooks/useUnifiedLibrary";
import ToolOptionsPanel from "../cad/panels/ToolOptionsPanel";
import { CadTool } from "@/src/types/cad";
import CanvasToolbar from "../cad/toolbar/CanvasToolbar";
import LibraryMenu from "../cad/LibraryMenu";
import { BrainCircuitIcon, Puzzle } from "lucide-react";

interface EnhancedSidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  activeSidebarTab: "tools" | "layers" | "explorer";
  setActiveSidebarTab: (tab: "tools" | "layers" | "explorer") => void;
  onSelectComponent?: (component: any) => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  disable?: boolean;
  current?: boolean;
  children?: NavItem[];
}

// Animation variants
const sidebarVariants = {
  open: { width: "20rem", opacity: 1 },
  closed: { width: "5rem", opacity: 0.9 }
};

const contentVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

const tabVariants = {
  active: {
    scale: 1.02,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderColor: "rgba(59, 130, 246, 1)"
  },
  inactive: {
    scale: 1,
    backgroundColor: "transparent",
    borderColor: "transparent"
  }
};

const navItemVariants = {
  hover: {
    scale: 1.02,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    x: 2
  },
  tap: { scale: 0.98 }
};

const EnhancedSidebarCad: React.FC<EnhancedSidebarProps> = ({
  isOpen,
  setIsOpen,
  activeSidebarTab,
  setActiveSidebarTab,
  onSelectComponent
}) => {
  const router = useRouter();
  const [selectedLibraryComponent, setSelectedLibraryComponent] = useState<string | null>(null);
  const [previewComponent, setPreviewComponent] = useState<any | null>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);


  const { viewMode, setViewMode, gridVisible, toggleGrid, axisVisible, toggleAxis, activeTool } = useCADStore();
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({
    projects: true,
    resources: false,
    settings: false
  });
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
        name: "Pricing",
        href: "/pricing",
        icon: <DollarSign size={20} />,
        current: router.pathname.startsWith("/pricing")
      },
      {
        name: "Website",
        href: "https://site.cadcamfun.xyz",
        icon: <Globe size={20} />,
        current: router.pathname.startsWith("https://site.cadcamfun.xyz")
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
    const bgColor = item.current ? "bg-gray-100 dark:bg-blue-900/20" : "hover:bg-gray-100 dark:hover:bg-gray-800/60";
    const disabled = item.disable ? "opacity-50 cursor-not-allowed" : "";

    return (
      <div key={item.name} className="rounded-xl">
        <div
          className={`group flex rounded-xl items-center justify-center px-1 py-1 text-sm font-medium rounded-md cursor-pointer transition-colors ${textColor} ${bgColor} ${disabled}`}
          onClick={() => {
            if (hasChildren) {
              toggleExpanded(item.name.toLowerCase());
            } else if (item.href !== "#") {
              router.push(item.href);
            }
          }}
        >
          <div className="flex rounded-xl items-center">
            <span
              className={`${item.current ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"} mr-3`}
            >
              {item.icon}
            </span>
            {isOpen && <span>{item.name}</span>}
          </div>
          {isOpen && hasChildren && (
            <div className="rounded-xl ml-2">{isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</div>
          )}
        </div>

        {isOpen && hasChildren && isExpanded && (
          <div className="ml-3 rounded-xl space-y-1">
            {item.children?.map(child => (
              <div
                key={child.name}
                className={`group flex items-center justify-center px-3 py-2 text-sm font-medium rounded-md cursor-pointer ${child.current
                  ? "text-blue-700 dark:text-blue-400 bg-gray-100 dark:bg-blue-900/20"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/60"
                  }`}
                onClick={() => router.push(child.href)}
              >
                <span className="mr-3 text-gray-500 dark:text-gray-400">{child.icon}</span>
                <span>{child.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Content for sidebar based on active tab
  const renderSidebarContent = () => {
    if (!isOpen) {
      return (
        <div className="py-4 px-2 rounded-xl flex flex-col overflow-y-auto scrollbar items-center">
          {activeSidebarTab === "tools" && (
            <div className="space-y-4 w-full flex flex-col items-center">
              <div className="flex flex-col items-center">
                <button className="p-2 rounded-md hover:bg-gray-100" title="Line">
                  <div className="transform rotate-45">
                    <Box size={20} />
                  </div>
                </button>
                <button className="p-2 rounded-md hover:bg-gray-100" title="Rectangle">
                  <Box size={20} />
                </button>
                <button className="p-2 rounded-md hover:bg-gray-100" title="Circle">
                  <Circle size={20} className="text-gray-600" />
                </button>
                <button className="p-2 rounded-md hover:bg-gray-100" title="Cube">
                  <Box size={20} className="text-gray-600" />
                </button>
                <button className="p-2 rounded-md hover:bg-gray-100" title="Sphere">
                  <Circle size={20} className="text-gray-600" />
                </button>
              </div>
            </div>
          )}

          {activeSidebarTab === "layers" && (
            <div className="text-center text-xs text-gray-500 mt-4">
              <Layers size={20} className="mx-auto mb-2" />
              Open sidebar
              <br />
              to manage layers
            </div>
          )}

          {activeSidebarTab === "explorer" && (
            <div className="text-center text-xs text-gray-500 mt-4">
              <List size={20} className="mx-auto mb-2" />
              Open sidebar
              <br />
              to view elements
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="p-1 rounded-xl overflow-y-auto space-y-6 flex flex-col items-center">
        {activeSidebarTab === "tools" && (
          <>
            <ToolPanel />
          </>
        )}
        {activeSidebarTab === "layers" && <LayerManager />}
        {activeSidebarTab === "explorer" && (
          <CADElementExplorer
            onElementSelect={id => {
              // You can add custom logic here when an element is selected
              console.log("Element selected:", id);
            }}
          />
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile sidebar backdrop */}

      {/* Sidebar */}
      <motion.div
        className="flex-shrink-0 backdrop-blur-md bg-white/90 dark:bg-gray-800/90 dark:text-white border border-white/30 dark:border-gray-600/30 mr-2 rounded-2xl border-r h-full flex flex-col shadow-xl"
        variants={sidebarVariants}
        animate={isOpen ? "open" : "closed"}
        transition={{ duration: 0.5, ease: "easeInOut" }}
        initial={false}
      >
        {/* Sidebar tabs */}
        <motion.div
          className="w-full border-b border-white/30 dark:border-gray-600/30 rounded-t-2xl bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-gray-700/50 dark:to-gray-800/50 backdrop-blur-sm flex justify-center"
          variants={contentVariants}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {isOpen ? (
            <div className="flex justify-center w-full text-center gap-1 p-2">
              <motion.button
                className={`flex-1 py-3 px-3 text-sm font-medium rounded-xl transition-all duration-200 ${activeSidebarTab === "tools"
                  ? "text-blue-600 dark:text-blue-400 bg-white/60 dark:bg-gray-700/60 shadow-md"
                  : "text-gray-500 hover:text-gray-700 hover:bg-white/40 dark:hover:bg-gray-700/40"
                  }`}
                onClick={() => setActiveSidebarTab("tools")}
                variants={tabVariants}
                animate={activeSidebarTab === "tools" ? "active" : "inactive"}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center justify-center">
                  <Tool size={16} className="mr-2" />
                  Tools
                </div>
              </motion.button>
              <motion.button
                className={`flex-1 py-3 px-3 text-sm font-medium rounded-xl transition-all duration-200 ${activeSidebarTab === "explorer"
                  ? "text-blue-600 dark:text-blue-400 bg-white/60 dark:bg-gray-700/60 shadow-md"
                  : "text-gray-500 hover:text-gray-700 hover:bg-white/40 dark:hover:bg-gray-700/40"
                  }`}
                onClick={() => setActiveSidebarTab("explorer")}
                variants={tabVariants}
                animate={activeSidebarTab === "explorer" ? "active" : "inactive"}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center justify-center">
                  <List size={16} className="mr-2" />
                  Explorer
                </div>
              </motion.button>
              <motion.button
                className={`flex-1 py-3 px-3 text-sm font-medium rounded-xl transition-all duration-200 ${activeSidebarTab === "layers"
                  ? "text-blue-600 dark:text-blue-400 bg-white/60 dark:bg-gray-700/60 shadow-md"
                  : "text-gray-500 hover:text-gray-700 hover:bg-white/40 dark:hover:bg-gray-700/40"
                  }`}
                onClick={() => setActiveSidebarTab("layers")}
                variants={tabVariants}
                animate={activeSidebarTab === "layers" ? "active" : "inactive"}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center justify-center">
                  <Layers size={16} className="mr-2" />
                  Layers
                </div>
              </motion.button>
            </div>
          ) : (
            <div className="flex flex-col w-full gap-1 p-2">
              <motion.button
                className={`w-full py-4 flex flex-col items-center justify-center rounded-xl transition-all duration-200 ${activeSidebarTab === "tools"
                  ? "text-blue-600 dark:text-blue-400 bg-white/60 dark:bg-gray-700/60 shadow-md"
                  : "text-gray-500 hover:text-gray-700 hover:bg-white/40 dark:hover:bg-gray-700/40"
                  }`}
                onClick={() => setActiveSidebarTab("tools")}
                title="Tools"
                variants={tabVariants}
                animate={activeSidebarTab === "tools" ? "active" : "inactive"}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Tool size={20} />
              </motion.button>
              <motion.button
                className={`w-full py-4 flex flex-col items-center justify-center rounded-xl transition-all duration-200 ${activeSidebarTab === "explorer"
                  ? "text-blue-600 dark:text-blue-400 bg-white/60 dark:bg-gray-700/60 shadow-md"
                  : "text-gray-500 hover:text-gray-700 hover:bg-white/40 dark:hover:bg-gray-700/40"
                  }`}
                onClick={() => setActiveSidebarTab("explorer")}
                title="Element Explorer"
                variants={tabVariants}
                animate={activeSidebarTab === "explorer" ? "active" : "inactive"}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <List size={20} />
              </motion.button>
              <motion.button
                className={`w-full py-4 flex flex-col items-center justify-center rounded-xl transition-all duration-200 ${activeSidebarTab === "layers"
                  ? "text-blue-600 dark:text-blue-400 bg-white/60 dark:bg-gray-700/60 shadow-md"
                  : "text-gray-500 hover:text-gray-700 hover:bg-white/40 dark:hover:bg-gray-700/40"
                  }`}
                onClick={() => setActiveSidebarTab("layers")}
                title="Layers"
                variants={tabVariants}
                animate={activeSidebarTab === "layers" ? "active" : "inactive"}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Layers size={20} />
              </motion.button>
            </div>
          )}
        </motion.div>

        <motion.div
          className="flex-1 flex-col rounded-xl overflow-y-auto"
          variants={contentVariants}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          {renderSidebarContent()}
        </motion.div>

        {/* Navigation from the original sidebar */}
        <motion.div
          className="mt-2 p-3 overflow-y-auto rounded-xl border-t border-white/30 dark:border-gray-600/30"
          variants={contentVariants}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <motion.button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center justify-center w-full px-3 py-2 text-sm font-medium text-center rounded-xl hover:bg-white/60 dark:hover:bg-gray-700/60 focus:outline-none transition-all duration-200 backdrop-blur-sm border border-white/40 dark:border-gray-600/40"
            variants={navItemVariants}
            whileHover="hover"
            whileTap="tap"
          >
            <span className="text-xs text-gray-500">{isOpen ? "Quick Navigation" : ""}</span>
            <motion.svg
              className={`w-4 h-4 text-gray-500 ${isOpen ? "ml-2" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              animate={{ rotate: isDropdownOpen ? 180 : 0 }}
              transition={{ duration: 0.3 }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </motion.svg>
          </motion.button>

          {isDropdownOpen && (
            <motion.div
              className="space-y-1 scrollbar overflow-y-auto mt-2 flex flex-col items-center"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              {navigation.slice(0, isOpen ? undefined : 0).map(item => renderNavItem(item))}
            </motion.div>
          )}
        </motion.div>

        {/* Toggle sidebar button */}
        <motion.div
          className="border-t border-white/30 dark:border-gray-600/30 p-3 flex justify-center"
          variants={contentVariants}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.6, delay: 0.8 }}
        >
          <motion.button
            className="p-3 rounded-xl hover:bg-white/60 dark:hover:bg-gray-700/60 transition-all duration-200 backdrop-blur-sm border border-white/40 dark:border-gray-600/40 shadow-sm"
            onClick={() => setIsOpen(!isOpen)}
            title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
            variants={navItemVariants}
            whileHover="hover"
            whileTap="tap"
          >
            <motion.div
              animate={{ rotate: isOpen ? 0 : 180 }}
              transition={{ duration: 0.3 }}
            >
              {isOpen ? (
                <ChevronLeft size={20} className="text-gray-600 dark:text-gray-300" />
              ) : (
                <ChevronRight size={20} className="text-gray-600 dark:text-gray-300" />
              )}
            </motion.div>
          </motion.button>
        </motion.div>
      </motion.div>

      {/* Toggle sidebar button outside for mobile */}
    </>
  );
};

export default EnhancedSidebarCad;
