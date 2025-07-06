import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "@/src/lib/auth-client";
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
  DollarSign,
  User,
  BarChart2,
  Activity,
  Airplay,
  X,
  Globe,
  CreditCard,
  Cpu,
  ShoppingBag,
  TrendingUp
} from "react-feather";
import { fetchOrganizationById } from "@/src/lib/api/organizations";
import Image from "next/image";
import useUserProfileStore from "@/src/store/userProfileStore";
import { BrainCircuitIcon, Puzzle } from "lucide-react";

// Animation variants
const sidebarVariants = {
  initial: { opacity: 0, x: -20 },
  animate: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.6,
      ease: "easeOut",
      staggerChildren: 0.05
    }
  }
};

const navItemVariants = {
  initial: { opacity: 0, x: -20 },
  animate: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.4,
      ease: "easeOut"
    }
  },
  hover: {
    x: 4,
    scale: 1.02,
    transition: { duration: 0.2 }
  },
  tap: {
    scale: 0.98,
    transition: { duration: 0.1 }
  }
};

const activeItemVariants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.3,
      ease: "backOut"
    }
  },
  hover: {
    scale: 1.03,
    y: -2,
    transition: { duration: 0.2 }
  }
};

const logoVariants = {
  initial: { opacity: 0, scale: 0.8, rotate: -10 },
  animate: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: {
      duration: 0.6,
      ease: "backOut"
    }
  },
  hover: {
    scale: 1.1,
    rotate: 5,
    transition: { duration: 0.3 }
  }
};

const toggleButtonVariants = {
  initial: { opacity: 0, scale: 0.5 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: "backOut"
    }
  },
  hover: {
    scale: 1.1,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    transition: { duration: 0.2 }
  },
  tap: {
    scale: 0.9,
    transition: { duration: 0.1 }
  }
};

const userSectionVariants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: "easeOut"
    }
  },
  hover: {
    y: -2,
    transition: { duration: 0.2 }
  }
};

const childrenVariants = {
  initial: {
    opacity: 0,
    height: 0,
    scaleY: 0
  },
  animate: {
    opacity: 1,
    height: "auto",
    scaleY: 1,
    transition: {
      duration: 0.4,
      ease: "easeOut",
      staggerChildren: 0.05
    }
  },
  exit: {
    opacity: 0,
    height: 0,
    scaleY: 0,
    transition: {
      duration: 0.3,
      ease: "easeIn"
    }
  }
};

const childItemVariants = {
  initial: { opacity: 0, x: -10 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3 }
  },
  hover: {
    x: 6,
    backgroundColor: "rgba(59, 130, 246, 0.05)",
    transition: { duration: 0.15 }
  }
};

const iconVariants = {
  hover: {
    scale: 1.2,
    rotate: 5,
    transition: { duration: 0.2 }
  }
};

interface EnhancedSidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  isMobile?: boolean;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  disable?: boolean;
  current?: boolean;
  children?: NavItem[];
}

const EnhancedSidebar: React.FC<EnhancedSidebarProps> = ({ isOpen, setIsOpen, isMobile: propIsMobile }) => {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = session?.user?.email === "nicola.mattioli.95@gmail.com";

  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({
    projects: false,
    resources: false,
    settings: false,
    analytics: false
  });
  const { profileImage } = useUserProfileStore(); // Get image from global store

  // Determine if we're on mobile - use prop if available, otherwise detect
  const [isMobile, setIsMobile] = useState(propIsMobile || false);

  useEffect(() => {
    if (propIsMobile !== undefined) {
      setIsMobile(propIsMobile);
    } else {
      const checkMobile = () => {
        setIsMobile(window.innerWidth < 768);
      };

      checkMobile();
      window.addEventListener("resize", checkMobile);
      return () => window.removeEventListener("resize", checkMobile);
    }
  }, [propIsMobile]);

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
        name: "Marketplace",
        href: "#",
        icon: <ShoppingBag size={20} />,
        current: router.pathname.startsWith("/marketplace"),
        children: [
          {
            name: "Browse Items",
            href: "/marketplace",
            icon: <ShoppingBag size={16} />,
            current: router.pathname === "/marketplace"
          },
          {
            name: "Seller Dashboard",
            href: "/marketplace/seller/dashboard",
            icon: <TrendingUp size={16} />,
            current: router.pathname.startsWith("/marketplace/seller")
          },
          {
            name: "My Purchases",
            href: "/marketplace/purchases",
            icon: <Package size={16} />,
            current: router.pathname.startsWith("/marketplace/purchases")
          }
        ]
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
        current: router.pathname.startsWith("/ai")
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

  // Auto-expand items based on current route
  useEffect(() => {
    const currentPath = router.pathname;

    // Check which sections should be expanded based on the current path
    const newExpandedItems = { ...expandedItems };

    if (currentPath.startsWith("/projects")) {
      newExpandedItems.projects = true;
    }

    if (currentPath.startsWith("/marketplace")) {
      newExpandedItems.marketplace = true;
    }

    if (
      currentPath.startsWith("/components") ||
      currentPath.startsWith("/materials") ||
      currentPath.startsWith("/machine") ||
      currentPath.startsWith("/tools") ||
      currentPath.startsWith("/drawing-instruments") ||
      currentPath.startsWith("/library")
    ) {
      newExpandedItems.resources = true;
    }

    if (currentPath.startsWith("/analytics")) {
      newExpandedItems.analytics = true;
    }

    if (currentPath === "/profile" || currentPath === "/settings") {
      newExpandedItems.settings = true;
    }

    setExpandedItems(newExpandedItems);
  }, [router.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const bgColor = item.current
      ? "bg-gradient-to-r from-blue-50/80 to-purple-50/80 dark:from-blue-900/30 dark:to-purple-900/30 border border-blue-200/50 dark:border-blue-600/30"
      : "hover:bg-white/60 dark:hover:bg-gray-700/40";
    const disabled = item.disable ? "opacity-50 cursor-not-allowed" : "";

    return (
      <div key={item.name} className="px-2">
        <motion.div
          className={`group flex items-center justify-between py-2 px-3 text-sm font-medium rounded-xl cursor-pointer transition-all duration-200 backdrop-blur-sm shadow-sm ${textColor} ${bgColor} ${disabled}`}
          onClick={() => {
            if (hasChildren) {
              toggleExpanded(item.name.toLowerCase());
            } else if (item.href !== "#") {
              router.push(item.href);
              // On mobile, close the sidebar after navigation
              if (isMobile) {
                setIsOpen(false);
              }
            }
          }}
          variants={item.current ? activeItemVariants as Variants : navItemVariants as Variants}
          whileHover="hover"
          whileTap="tap"
        >
          <div className="flex items-center">
            <motion.span
              className={`${item.current ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"} mr-3 flex-shrink-0`}
              variants={iconVariants}
              whileHover="hover"
            >
              {item.icon}
            </motion.span>
            {isOpen && (
              <motion.span
                className="truncate"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                {item.name}
              </motion.span>
            )}
          </div>
          {isOpen && hasChildren && (
            <motion.div
              className="ml-2"
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.3 }}
            >
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </motion.div>
          )}
        </motion.div>

        {isOpen && hasChildren && (
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                className="mt-1 ml-4 space-y-1"
                variants={childrenVariants as Variants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {item.children?.map(child => (
                  <motion.div key={child.name} variants={childItemVariants}>
                    <Link
                      href={child.href}
                      className={`group flex items-center px-3 py-2 text-sm font-medium rounded-xl backdrop-blur-sm transition-all duration-200 ${child.current
                        ? "text-blue-700 dark:text-blue-400 bg-gradient-to-r from-blue-50/60 to-purple-50/60 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200/30 dark:border-blue-600/20"
                        : "text-gray-700 dark:text-gray-300 hover:bg-white/40 dark:hover:bg-gray-700/30"
                        }`}
                      onClick={() => {
                        // On mobile, close the sidebar after navigation
                        if (isMobile) {
                          setIsOpen(false);
                        }
                      }}
                    >
                      <motion.span
                        className="mr-3 text-gray-500 dark:text-gray-400 flex-shrink-0"
                        variants={iconVariants}
                        whileHover="hover"
                      >
                        {child.icon}
                      </motion.span>
                      <span className="truncate">{child.name}</span>
                    </Link>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    );
  };

  // Don't render sidebar at all on mobile when closed
  if (isMobile && !isOpen) {
    return null;
  }

  return (
    <>
      {/* Mobile sidebar backdrop - only show when sidebar is open on mobile */}
      {isOpen && isMobile && (
        <motion.div
          className="fixed inset-0 z-20 bg-black bg-opacity-50 md:hidden"
          onClick={() => setIsOpen(false)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        />
      )}

      {/* Sidebar */}
      <motion.div
        className={`fixed inset-y-0 left-0 z-30 rounded-r-2xl m-1 h-[calc(100%-8px)] backdrop-blur-md bg-gradient-to-b from-white/90 via-white/85 to-white/80 dark:from-gray-800/90 dark:via-gray-800/85 dark:to-gray-800/80 transition-transform duration-300 ease-in-out transform border-r border-white/30 dark:border-gray-600/30 shadow-2xl flex flex-col ${isMobile
          ? `w-64 ${isOpen ? "translate-x-0" : "-translate-x-full"}`
          : `${isOpen ? "w-64 translate-x-0" : "w-16 translate-x-0"}`
          }`}
        variants={sidebarVariants as Variants}
        initial="initial"
        animate="animate"
      >
        {/* Sidebar header with close button on mobile */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-white/30 dark:border-gray-600/30 backdrop-blur-sm">
          {isOpen ? (
            <>
              <motion.div
                className="flex items-center"
                variants={logoVariants as Variants}
                whileHover="hover"
              >
                <div className="flex-shrink-0 w-10 h-10 relative">
                  <motion.img
                    src="/icon.png"
                    className="h-10 w-10"
                    alt="Logo"
                    whileHover={{ scale: 1.1, rotate: 10 }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <motion.span
                  className="ml-3 text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 }}
                >
                  MENU
                </motion.span>
              </motion.div>
              {isMobile && (
                <motion.button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-xl text-gray-500 hover:bg-white/40 dark:hover:bg-gray-700/40 backdrop-blur-sm border border-white/30 dark:border-gray-600/30 transition-all duration-200"
                  aria-label="Close sidebar"
                  variants={toggleButtonVariants as Variants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  <X size={20} />
                </motion.button>
              )}
            </>
          ) : (
            <motion.div
              className="flex items-center justify-center w-full"
              variants={logoVariants as Variants}
              whileHover="hover"
            >
              <div className="flex-shrink-0 w-10 h-10 relative">
                <motion.img
                  src="/icon.png"
                  className="h-10 w-10"
                  alt="Logo"
                  whileHover={{ scale: 1.2, rotate: 15 }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </motion.div>
          )}
        </div>

        {/* Toggle button for desktop only - positioned outside the sidebar */}
        {!isMobile && (
          <motion.button
            onClick={() => setIsOpen(!isOpen)}
            className="absolute -right-2.5 top-20 backdrop-blur-sm bg-white/80 dark:bg-gray-800/80 border border-white/30 dark:border-gray-600/30 rounded-full h-5 w-5 flex items-center justify-center text-gray-500 shadow-lg transform translate-x-0 hover:shadow-xl transition-all duration-200"
            aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
            variants={toggleButtonVariants as Variants}
            whileHover="hover"
            whileTap="tap"
          >
            <motion.div
              animate={{ rotate: isOpen ? 0 : 180 }}
              transition={{ duration: 0.3 }}
            >
              {isOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            </motion.div>
          </motion.button>
        )}

        {/* Sidebar content - scrollable */}
        <div className="flex-grow overflow-y-auto pt-2 pb-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
          <motion.nav
            className="space-y-1"
            variants={sidebarVariants as Variants}
          >
            {navigation.map(item => renderNavItem(item))}
          </motion.nav>
        </div>

        {/* User info at bottom */}
        {isOpen && session && (
          <motion.div
            className="px-3 py-3 mt-auto border-t border-white/30 dark:border-gray-600/30 backdrop-blur-sm"
            variants={userSectionVariants as Variants}
            whileHover="hover"
          >
            <div className="flex items-center space-x-3 p-2 rounded-xl backdrop-blur-sm bg-white/40 dark:bg-gray-700/40 border border-white/30 dark:border-gray-600/30">
              <div className="flex-shrink-0">
                {profileImage || session?.user?.image ? (
                  <motion.img
                    src={profileImage || session?.user?.image || ""}
                    alt="Profile"
                    className="h-10 w-10 rounded-full object-cover border-2 border-white/50 dark:border-gray-600/50"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ duration: 0.2 }}
                  />
                ) : (
                  <motion.div
                    className="h-10 w-10 flex rounded-full items-center justify-center bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900 border-2 border-white/50 dark:border-gray-600/50"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ duration: 0.2 }}
                  >
                    <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent font-medium text-lg">
                      {session?.user?.name?.charAt(0) || "U"}
                    </span>
                  </motion.div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent truncate">
                  {session.user?.name}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </>
  );
};

export default EnhancedSidebar;
