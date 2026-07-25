import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/src/contexts/AuthContext";
import { motion, AnimatePresence, Variants } from "framer-motion";
import {
  Sun,
  Moon,
  Bell,
  Settings,
  User,
  LogOut,
  Menu,
  X,
  Users,
  Globe,
  BookOpen,
  ToggleLeft,
  Star,
  Zap
} from "react-feather";
import useUserProfileStore from "src/store/userProfileStore";
import NotificationCenter from "../notifications/NotificationCenter";
import { useSubscription } from "../../contexts/SubscriptionContext";

// Animation variants
const navbarVariants = {
  initial: { opacity: 0, y: -20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: "easeOut",
      staggerChildren: 0.1
    }
  }
};

const logoVariants = {
  initial: { opacity: 0, x: -20, scale: 0.8 },
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: "backOut"
    }
  },
  hover: {
    scale: 1.05,
    transition: { duration: 0.2 }
  }
};

const buttonVariants = {
  initial: { opacity: 0, scale: 0.8 },
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
    y: -2,
    transition: { duration: 0.2 }
  },
  tap: {
    scale: 0.95,
    transition: { duration: 0.1 }
  }
};

const dropdownVariants = {
  initial: {
    opacity: 0,
    scale: 0.95,
    y: -10,
    filter: "blur(8px)"
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.3,
      ease: "easeOut",
      staggerChildren: 0.05
    }
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -10,
    filter: "blur(8px)",
    transition: {
      duration: 0.2,
      ease: "easeIn"
    }
  }
};

const dropdownItemVariants = {
  initial: { opacity: 0, x: -10 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.2 }
  },
  hover: {
    x: 4,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    transition: { duration: 0.15 }
  }
};

const mobileMenuVariants = {
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

const mobileItemVariants = {
  initial: { opacity: 0, x: -20 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3 }
  },
  hover: {
    x: 8,
    scale: 1.02,
    transition: { duration: 0.2 }
  }
};

const planBadgeVariants = {
  initial: { opacity: 0, scale: 0.5, rotate: -10 },
  animate: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: {
      duration: 0.5,
      ease: "backOut"
    }
  },
  hover: {
    scale: 1.1,
    rotate: 2,
    transition: { duration: 0.2 }
  }
};

interface NavbarProps {
  onSidebarToggle?: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ onSidebarToggle }) => {
  const router = useRouter();
  const { user, handleSignOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const { profileImage } = useUserProfileStore(); // Get image from global store
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { plan, isLoading } = useSubscription(); // Use the hook to get plan and loading state
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect if we're on mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Close any open dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        profileDropdownOpen &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        event.target instanceof HTMLElement &&
        !event.target.closest("#user-menu")
      ) {
        setProfileDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [profileDropdownOpen]);

  // Check the stored theme preference on component mount
  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    // Implement dark/light theme
    if (isDarkMode) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    }
  };

  // Handle profile dropdown clicks without bubbling to document
  const handleProfileClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setProfileDropdownOpen(!profileDropdownOpen);
  };

  // Helper to get display name and icon for plan
  const getPlanDisplayDetails = (planName: string) => {
    switch (planName?.toLowerCase()) {
      case "pro":
        return { name: "Pro", Icon: Star, color: "text-purple-500" };
      case "enterprise":
        return { name: "Enterprise", Icon: Zap, color: "text-yellow-500" };
      case "basic":
        return { name: "Basic", Icon: User, color: "text-blue-500" };
      case "trial":
        return { name: "Trial", Icon: Bell, color: "text-orange-500" };
      case "free":
      default:
        return { name: "Free", Icon: User, color: "text-gray-500" };
    }
  };

  const { name: planName, Icon: PlanIcon, color: planColor } = getPlanDisplayDetails(plan);

  return (
    <motion.header
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-gradient-to-r from-white/90 via-white/85 to-white/80 dark:from-gray-800/90 dark:via-gray-800/85 dark:to-gray-800/80 border-0 shadow-xl border-b border-white/30 dark:border-gray-600/30"
      variants={navbarVariants as Variants}
      initial="initial"
      animate="animate"
    >
      <div className="px-3 sm:px-6 lg:px-8 rounded-b-2xl">
        <div className="flex rounded-b-2xl items-center justify-between h-14 sm:h-16">
          {/* Left section */}
          <motion.div
            className="flex items-center"
            variants={logoVariants as Variants}
          >
            <motion.button
              className="mr-2 inline-flex items-center justify-center p-1 sm:p-2 rounded-xl backdrop-blur-sm bg-white/60 dark:bg-gray-700/60 hover:bg-white/80 dark:hover:bg-gray-700/80 border border-white/30 dark:border-gray-600/30 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white shadow-md transition-all duration-200"
              onClick={() => {
                if (isMobile && onSidebarToggle) {
                  // On mobile, toggle sidebar instead of mobile menu
                  onSidebarToggle();
                } else {
                  // On desktop, toggle mobile menu
                  setMobileMenuOpen(!mobileMenuOpen);
                }
              }}
              aria-expanded={isMobile ? false : mobileMenuOpen}
              aria-controls={isMobile ? undefined : "mobile-menu"}
              variants={buttonVariants as Variants}
              whileHover="hover"
              whileTap="tap"
            >
              <span className="sr-only">
                {isMobile ? "Toggle sidebar" : (mobileMenuOpen ? "Close main menu" : "Open main menu")}
              </span>
              <motion.div
                animate={{ rotate: (!isMobile && mobileMenuOpen) ? 90 : 0 }}
                transition={{ duration: 0.3 }}
              >
                <Menu className="h-6 w-6" />
              </motion.div>
            </motion.button>

            <Link href="/" className="flex items-center">
              <motion.div
                className="flex-shrink-0 flex items-center"
                variants={logoVariants as Variants}
                whileHover="hover"
              >
                <motion.img
                  className="h-10 sm:h-14 w-auto"
                  src="/logo.png"
                  alt="CAD/CAM FUN"
                  whileHover={{ scale: 1.05, rotate: 2 }}
                  transition={{ duration: 0.2 }}
                />
              </motion.div>
            </Link>
          </motion.div>

          {/* Right section - Actions */}
          <motion.div
            className="flex items-center space-x-1 sm:space-x-4"
            variants={navbarVariants as Variants}
          >
            {/* Plan Badge */}
            {!isLoading && plan && (
              <motion.div
                className="hidden sm:flex items-center px-3 py-1.5 backdrop-blur-sm bg-gradient-to-r from-blue-50/80 to-purple-50/80 dark:from-blue-900/40 dark:to-purple-900/40 rounded-xl border border-blue-200/50 dark:border-blue-600/30 shadow-md"
                variants={planBadgeVariants as Variants}
                whileHover="hover"
              >
                <PlanIcon className={`w-4 h-4 mr-2 ${planColor}`} />
                <span className="text-sm font-medium bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  {planName}
                </span>
              </motion.div>
            )}

            {/* Dark/Light Theme toggle */}
            <motion.button
              onClick={toggleDarkMode}
              className="inline-flex items-center justify-center p-1 sm:p-2 rounded-xl backdrop-blur-sm bg-white/60 dark:bg-gray-700/60 hover:bg-white/80 dark:hover:bg-gray-700/80 border border-white/30 dark:border-gray-600/30 text-yellow-500 dark:text-yellow-400 shadow-md transition-all duration-200"
              aria-label="Toggle dark mode"
              variants={buttonVariants as Variants}
              whileHover="hover"
              whileTap="tap"
            >
              <motion.div
                animate={{ rotate: isDarkMode ? 180 : 0, scale: isDarkMode ? 1.1 : 1 }}
                transition={{ duration: 0.4, ease: "backOut" }}
              >
                {isDarkMode ? <Sun className="h-5 w-5 sm:h-6 sm:w-6" /> : <Moon className="h-5 w-5 sm:h-6 sm:w-6" />}
              </motion.div>
            </motion.button>

            {/* Notifications - hide on smallest screens */}
            <motion.div
              className="sm:inline-flex items-center justify-center"
              variants={buttonVariants as Variants}
            >
              <NotificationCenter />
            </motion.div>

            {/* Settings - hide on smallest screens */}
            <motion.div
              variants={buttonVariants as Variants}
            >
              <Link
                href="/settings"
                className="hidden sm:inline-flex items-center justify-center p-1 sm:p-2 rounded-xl backdrop-blur-sm bg-white/60 dark:bg-gray-700/60 hover:bg-white/80 dark:hover:bg-gray-700/80 border border-white/30 dark:border-gray-600/30 text-gray-500 dark:text-gray-400 shadow-md transition-all duration-200"
                aria-label="Settings"
              >
                <motion.div
                  whileHover={{ rotate: 90, scale: 1.1 }}
                  transition={{ duration: 0.3 }}
                >
                  <Settings className="h-5 w-5 sm:h-6 sm:w-6" />
                </motion.div>
              </Link>
            </motion.div>

            {/* User Avatar with Dropdown */}
            <motion.div
              className="relative z-[55]"
              variants={buttonVariants as Variants}
            >
              <motion.button
                onClick={handleProfileClick}
                className="flex text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-lg border-2 border-white/30 dark:border-gray-600/30"
                id="user-menu"
                aria-expanded={profileDropdownOpen}
                aria-haspopup="true"
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <span className="sr-only">Open user menu</span>
                <motion.div
                  className="h-8 w-8 sm:h-10 sm:w-10 rounded-full overflow-hidden backdrop-blur-sm bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900"
                  whileHover={{
                    boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
                    borderRadius: "50%"
                  }}
                >
                  {profileImage || user?.image ? (
                    <img
                      src={profileImage || user?.image || ""}
                      alt="Profile"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900">
                      <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent font-medium text-lg">
                        {user?.name?.charAt(0) || "U"}
                      </span>
                    </div>
                  )}
                </motion.div>
              </motion.button>

              {/* Dropdown menu */}
              <AnimatePresence>
                {profileDropdownOpen && (
                  <motion.div
                    ref={dropdownRef}
                    className="origin-top-right absolute right-0 mt-2 w-48 backdrop-blur-md bg-white/95 dark:bg-gray-800/95 rounded-2xl shadow-2xl border border-white/50 dark:border-gray-600/50 py-1 ring-1 ring-black ring-opacity-5 focus:outline-none z-[60]"
                    role="menu"
                    aria-orientation="vertical"
                    aria-labelledby="user-menu"
                    variants={dropdownVariants as Variants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    style={{ zIndex: 60 }}
                  >
                    <motion.div
                      className="px-4 py-3 border-b border-gray-200/50 dark:border-gray-600/50"
                      variants={dropdownItemVariants}
                    >
                      <p className="text-sm font-medium bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent truncate">
                        {user?.name || "User"}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {user?.email || "user@example.com"}
                      </p>
                    </motion.div>

                    <motion.div variants={dropdownItemVariants}>
                      <Link
                        href="/profile"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 flex items-center rounded-lg mx-2 transition-all duration-200"
                        role="menuitem"
                      >
                        <User size={16} className="mr-3 text-blue-500" />
                        My Profile
                      </Link>
                    </motion.div>

                    <motion.div variants={dropdownItemVariants}>
                      <Link
                        href="/settings"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 flex items-center rounded-lg mx-2 transition-all duration-200"
                        role="menuitem"
                      >
                        <Settings size={16} className="mr-3 text-purple-500" />
                        Settings
                      </Link>
                    </motion.div>

                    <motion.div variants={dropdownItemVariants}>
                      <Link
                        href="/organizations"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 flex items-center rounded-lg mx-2 transition-all duration-200"
                        role="menuitem"
                      >
                        <Users size={16} className="mr-3 text-green-500" />
                        Organizations
                      </Link>
                    </motion.div>

                    <motion.div variants={dropdownItemVariants}>
                      <Link
                        href="https://site.cadcamfun.xyz"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 flex items-center rounded-lg mx-2 transition-all duration-200"
                        role="menuitem"
                      >
                        <Globe size={16} className="mr-3 text-cyan-500" />
                        Website
                      </Link>
                    </motion.div>

                    <motion.div variants={dropdownItemVariants}>
                      <Link
                        href="https://docs.cadcamfun.xyz"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 flex items-center rounded-lg mx-2 transition-all duration-200"
                        role="menuitem"
                      >
                        <BookOpen size={16} className="mr-3 text-orange-500" />
                        Documentation
                      </Link>
                    </motion.div>

                    <motion.div
                      className="border-t border-gray-200/50 dark:border-gray-600/50 mt-1 pt-1"
                      variants={dropdownItemVariants}
                    >
                      <motion.button
                        onClick={handleSignOut}
                        className="w-full text-left block px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50/50 dark:hover:bg-red-900/20 flex items-center rounded-lg mx-2 transition-all duration-200"
                        role="menuitem"
                        whileHover={{ x: 4 }}
                        transition={{ duration: 0.15 }}
                      >
                        <LogOut size={16} className="mr-3" />
                        Sign Out
                      </motion.button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Mobile menu - only show on desktop and small screens, not on mobile where we use sidebar */}
      <AnimatePresence>
        {mobileMenuOpen && !isMobile && (
          <motion.div
            className="sm:hidden z-[55]"
            id="mobile-menu"
            variants={mobileMenuVariants as Variants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <div className="px-2 pt-2 pb-3 space-y-1 backdrop-blur-md bg-white/80 dark:bg-gray-800/80 border-t border-white/30 dark:border-gray-600/30 rounded-b-2xl mx-2 shadow-xl">
              {[
                { href: "/", label: "Dashboard", active: router.pathname === "/" },
                { href: "/projects", label: "Projects", active: router.pathname.startsWith("/projects") },
                { href: "/cad", label: "CAD Editor", active: router.pathname === "/cad" },
                { href: "/cam", label: "CAM Editor", active: router.pathname === "/cam" },
                { href: "/components", label: "Components", active: router.pathname.startsWith("/components") },
                { href: "/settings", label: "Settings", active: router.pathname === "/settings" },
                { href: "/organizations", label: "Organizations", active: router.pathname === "/organizations" },
                { href: "/ai", label: "AI Assistant", active: router.pathname === "/ai" },
                { href: "/analytics", label: "Analytics", active: router.pathname === "/analytics" }
              ].map((item, index) => (
                <motion.div
                  key={item.href}
                  variants={mobileItemVariants}
                  whileHover="hover"
                >
                  <Link
                    href={item.href}
                    className={`block px-3 py-2 rounded-xl text-base font-medium transition-all duration-200 ${item.active
                      ? "bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/50 dark:to-purple-900/50 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-600/30"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-50/50 dark:hover:bg-gray-700/50"
                      }`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
};

export default Navbar;
