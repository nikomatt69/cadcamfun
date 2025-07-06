// src/pages/profile/index.tsx

import { useState, useEffect } from "react";

import { useRouter } from "next/router";
import Link from "next/link";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { DynamicLayout } from "src/components/dynamic-imports";
import { User, Mail, MapPin, Calendar, Edit, GitHub, Globe, Settings, Layout, Folder, Tool, Box, Shield } from "react-feather";
import Loading from "@/src/components/ui/Loading";
import MetaTags from "@/src/components/layout/Metatags";
import ImageService from "@/src/lib/imageService";
import useUserProfileStore from "@/src/store/userProfileStore";
import Image from "next/image";
import { useAuth } from "@/src/contexts/AuthContext";

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

const tabVariants: Variants = {
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
  },
  exit: {
    opacity: 0,
    x: 20,
    transition: {
      duration: 0.2
    }
  }
};

const statsVariants: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 25,
      staggerChildren: 0.1
    }
  }
};

const statItemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 25
    }
  }
};

interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  description: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  github: string | null;
  createdAt: string;
  organizations: {
    id: string;
    name: string;
    role: string;
  }[];
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Component {
  id: string;
  name: string;
  description: string | null;
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
  projectId: string;
}

interface Toolpath {
  id: string;
  name: string;
  description: string | null;
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
  projectId: string;
}

export default function ProfilePage() {

  const router = useRouter();
  const { username } = router.query;
  const { user: session, isLoading: authLoading, isAuthenticated } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [toolpaths, setToolpaths] = useState<Toolpath[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"projects" | "components" | "toolpaths">("projects");
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const { profileImage: storeProfileImage, setProfileImage: setStoreProfileImage } = useUserProfileStore();

  // Admin emails
  const ADMIN_EMAILS = [
    "nicola.mattioli.95@gmail.com",
    "nicom.19@icloud.com"
  ];

  useEffect(() => {
    if (storeProfileImage) {
      setProfileImage(storeProfileImage);
    } else if (session?.email) {
      const savedImage = ImageService.getImageFromLocalStorage(session.email);
      if (savedImage) {
        setProfileImage(savedImage);
        setStoreProfileImage(savedImage);
      } else if (session?.image) {
        setProfileImage(session.image);
        setStoreProfileImage(session.image);
      }
    }
  }, [session, storeProfileImage, setStoreProfileImage]);

  useEffect(() => {
    if (isAuthenticated && session) {
      // Check if user is admin
      if (session?.email && ADMIN_EMAILS.includes(session.email)) {
        setIsAdmin(true);
      }

      if (!username || username === session?.id) {
        setIsOwnProfile(true);
        fetchOwnProfile();
      } else {
        setIsOwnProfile(false);
        fetchUserProfile(username as string);
      }
    } else if (!authLoading && !isAuthenticated && !username) {
      router.push("/auth/signin");
    }
  }, [isAuthenticated, authLoading, username, session]);

  const fetchOwnProfile = async () => {
    setIsLoading(true);
    try {
      const profileRes = await fetch("/api/user/profile");
      if (!profileRes.ok) throw new Error("Failed to fetch profile");
      const profileData = await profileRes.json();
      setProfile(profileData);

      const projectsRes = await fetch("/api/user/projects");
      if (!projectsRes.ok) throw new Error("Failed to fetch projects");
      const projectsData = await projectsRes.json();
      setProjects(projectsData);

      const componentsRes = await fetch("/api/user/components");
      if (!componentsRes.ok) throw new Error("Failed to fetch components");
      const componentsData = await componentsRes.json();
      setComponents(componentsData);

      const toolpathsRes = await fetch("/api/user/toolpaths");
      if (!toolpathsRes.ok) throw new Error("Failed to fetch toolpaths");
      const toolpathsData = await toolpathsRes.json();
      setToolpaths(toolpathsData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserProfile = async (userId: string) => {
    setIsLoading(true);
    try {
      const profileRes = await fetch(`/api/users/${userId}`);
      if (!profileRes.ok) throw new Error("Failed to fetch profile");
      const profileData = await profileRes.json();
      setProfile(profileData);

      const projectsRes = await fetch(`/api/users/${userId}/projects`);
      if (!projectsRes.ok) throw new Error("Failed to fetch projects");
      const projectsData = await projectsRes.json();
      setProjects(projectsData);

      const componentsRes = await fetch(`/api/users/${userId}/components`);
      if (!componentsRes.ok) throw new Error("Failed to fetch components");
      const componentsData = await componentsRes.json();
      setComponents(componentsData);

      const toolpathsRes = await fetch(`/api/users/${userId}/toolpaths`);
      if (!toolpathsRes.ok) throw new Error("Failed to fetch toolpaths");
      const toolpathsData = await toolpathsRes.json();
      setToolpaths(toolpathsData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long"
    });
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loading />
      </div>
    );
  }

  if (!profile) {
    return (
      <DynamicLayout>
        <div className="p-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">User not found</h1>
          <p className="text-gray-600 mb-4">The profile you are looking for doesn&apos;t exist or isn&apos;t available.</p>
          <Link href="/" className="text-blue-600 hover:text-blue-800">
            Return to homepage
          </Link>
        </div>
      </DynamicLayout>
    );
  }

  if (!authLoading && !isAuthenticated) {
    router.push("/auth/signin");
    return null;
  }

  return (
    <>
      <MetaTags
        ogImage="/og-image.png"
        title={`${profile.name || "User"} | Profile`}
        description={`View ${profile.name || "User"}'s profile, projects and components.`}
      />
      <DynamicLayout>
        <motion.div
          className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={pageVariants}
        >
          <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
            {/* Profile Header */}
            <motion.div
              className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-2xl shadow-2xl rounded-3xl border border-white/20 dark:border-gray-700/20 mb-8 overflow-hidden relative"
              variants={cardVariants}
            >
              {/* Enhanced Background Pattern */}
              <div className="relative h-40 bg-gradient-to-br from-blue-500/30 via-purple-500/25 via-pink-500/20 to-indigo-500/30 dark:from-blue-600/40 dark:via-purple-600/35 dark:via-pink-600/25 dark:to-indigo-600/40">
                {/* Animated background elements */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-transparent to-purple-500/10 dark:from-blue-600/20 dark:to-purple-600/20"></div>
                <div className="absolute top-0 left-0 w-full h-full">
                  <div className="absolute top-8 left-8 w-20 h-20 bg-white/10 dark:bg-white/5 rounded-full blur-xl"></div>
                  <div className="absolute top-12 right-12 w-16 h-16 bg-purple-400/20 dark:bg-purple-400/10 rounded-full blur-lg"></div>
                  <div className="absolute bottom-8 left-20 w-12 h-12 bg-blue-400/20 dark:bg-blue-400/10 rounded-full blur-md"></div>
                </div>
                {/* Geometric pattern overlay */}
                <div className="absolute inset-0 opacity-10 dark:opacity-5">
                  <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <defs>
                      <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                        <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.5" />
                      </pattern>
                    </defs>
                    <rect width="100" height="100" fill="url(#grid)" />
                  </svg>
                </div>
              </div>

              <div className="relative px-8 pb-8">
                {/* Enhanced Profile Avatar */}
                <div className="flex flex-col xl:flex-row xl:items-end xl:space-x-8 -mt-20">
                  <motion.div
                    className="relative group"
                    whileHover={{ scale: 1.05 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  >
                    <div className="absolute -inset-2 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-3xl blur-lg opacity-25 group-hover:opacity-40 transition-opacity"></div>
                    {profileImage ? (
                      <img
                        src={profileImage}
                        alt="Profile"
                        className="relative h-40 w-40 rounded-3xl object-cover border-6 border-white dark:border-gray-800 shadow-2xl"
                      />
                    ) : (
                      <div className="relative h-40 w-40 rounded-3xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center border-6 border-white dark:border-gray-800 shadow-2xl">
                        <User size={64} className="text-white" />
                      </div>
                    )}
                    {/* Online status indicator */}
                    <div className="absolute bottom-2 right-2 w-6 h-6 bg-green-500 border-3 border-white dark:border-gray-800 rounded-full shadow-lg"></div>
                  </motion.div>

                  <div className="flex-1 mt-6 xl:mt-0 xl:pb-6">
                    <div className="flex flex-col xl:flex-row xl:justify-between xl:items-end space-y-6 xl:space-y-0 xl:gap-12">
                      <div className="space-y-4">
                        {/* Enhanced Name and Title */}
                        <div className="space-y-2">
                          <motion.h1
                            className="text-3xl xl:text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent leading-tight"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2, duration: 0.5 }}
                          >
                            {profile.name || "User"}
                          </motion.h1>
                          <motion.div
                            className="inline-flex items-center px-3 py-1 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-full border border-blue-200/50 dark:border-blue-700/50"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.25, duration: 0.5 }}
                          >
                            <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full mr-2"></div>
                            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Mechanical Industrial Operator</span>
                          </motion.div>
                        </div>

                        {/* Enhanced Contact Info */}
                        <motion.div
                          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 text-sm"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.3, duration: 0.5 }}
                        >
                          {profile.email && (
                            <div className="flex items-center group">
                              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg mr-3 group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 transition-colors">
                                <Mail className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Email</p>
                                <p className="text-gray-900 dark:text-white font-medium truncate">{profile.email}</p>
                              </div>
                            </div>
                          )}
                          {profile.location && (
                            <div className="flex items-center group">
                              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg mr-3 group-hover:bg-green-200 dark:group-hover:bg-green-900/50 transition-colors">
                                <MapPin className="h-4 w-4 text-green-600 dark:text-green-400" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Location</p>
                                <p className="text-gray-900 dark:text-white font-medium">{profile.location}</p>
                              </div>
                            </div>
                          )}
                          <div className="flex items-center group">
                            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg mr-3 group-hover:bg-purple-200 dark:group-hover:bg-purple-900/50 transition-colors">
                              <Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Joined</p>
                              <p className="text-gray-900 dark:text-white font-medium">{formatDate(profile.createdAt)}</p>
                            </div>
                          </div>
                        </motion.div>

                        {/* Enhanced Bio */}
                        {profile.bio && (
                          <motion.div
                            className="bg-gray-50/50 dark:bg-gray-700/20 rounded-2xl p-4 border border-gray-200/50 dark:border-gray-600/30"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4, duration: 0.5 }}
                          >
                            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                              {profile.bio}
                            </p>
                          </motion.div>
                        )}

                        {/* Enhanced Social Links */}
                        <motion.div
                          className="flex flex-wrap gap-3"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.5, duration: 0.5 }}
                        >
                          {profile.website && (
                            <Link
                              href={profile.website}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <motion.div
                                className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm rounded-xl hover:from-blue-600 hover:to-blue-700 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all"
                                whileHover={{ scale: 1.05, y: -2 }}
                                whileTap={{ scale: 0.95 }}
                              >
                                <Globe className="w-4 h-4 mr-2" />
                                Website
                              </motion.div>
                            </Link>
                          )}
                          {profile.github && (
                            <Link
                              href={`https://github.com/${profile.github}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <motion.div
                                className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-gray-600 to-gray-700 text-white text-sm rounded-xl hover:from-gray-700 hover:to-gray-800 shadow-lg shadow-gray-500/25 hover:shadow-gray-500/40 transition-all"
                                whileHover={{ scale: 1.05, y: -2 }}
                                whileTap={{ scale: 0.95 }}
                              >
                                <GitHub className="w-4 h-4 mr-2" />
                                GitHub
                              </motion.div>
                            </Link>
                          )}
                        </motion.div>
                      </div>

                      {/* Enhanced Action Buttons */}
                      {isOwnProfile && (
                        <motion.div
                          className="flex flex-col space-y-3"
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.6, duration: 0.5 }}
                        >
                          {/* Admin Dashboard Button - Only for admin users */}
                          {isAdmin && (
                            <Link href="/admin">
                              <motion.button
                                className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-red-600 via-pink-600 to-purple-600 text-white rounded-2xl hover:from-red-700 hover:via-pink-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-red-500 shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/30 transition-all font-medium"
                                whileHover={{ scale: 1.05, y: -2 }}
                                whileTap={{ scale: 0.95 }}
                              >
                                <Shield className="mr-2 h-5 w-5" />
                                Admin Dashboard
                              </motion.button>
                            </Link>
                          )}

                          {/* Edit Profile Button */}
                          <Link href="/profile/settings">
                            <motion.button
                              className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white rounded-2xl hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all font-medium"
                              whileHover={{ scale: 1.05, y: -2 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <Settings className="mr-2 h-5 w-5" />
                              Edit Profile
                            </motion.button>
                          </Link>

                          {/* Share Profile Button */}
                          <motion.button
                            className="inline-flex items-center px-6 py-2.5 bg-white/80 dark:bg-gray-700/80 backdrop-blur-sm text-gray-700 dark:text-gray-300 rounded-xl hover:bg-white dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 shadow-md hover:shadow-lg transition-all text-sm font-medium"
                            whileHover={{ scale: 1.02, y: -1 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Share Profile
                          </motion.button>
                        </motion.div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Enhanced Stats Section */}
              <motion.div
                className="bg-gradient-to-r from-gray-50/80 via-white/50 to-gray-50/80 dark:from-gray-700/40 dark:via-gray-800/30 dark:to-gray-700/40 border-t border-gray-200/30 dark:border-gray-600/30 backdrop-blur-sm"
                variants={statsVariants}
                initial="hidden"
                animate="visible"
              >
                <div className="px-8 py-6 grid grid-cols-2 lg:grid-cols-4 gap-6">
                  <motion.div
                    className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-2xl p-4 border border-white/40 dark:border-gray-700/40 hover:bg-white/80 dark:hover:bg-gray-800/80 transition-all group"
                    variants={statItemVariants}
                    whileHover={{ scale: 1.02, y: -2 }}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg group-hover:shadow-blue-500/25 transition-shadow">
                        <Folder className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{projects.length}</p>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Projects</p>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-2xl p-4 border border-white/40 dark:border-gray-700/40 hover:bg-white/80 dark:hover:bg-gray-800/80 transition-all group"
                    variants={statItemVariants}
                    whileHover={{ scale: 1.02, y: -2 }}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="p-3 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg group-hover:shadow-purple-500/25 transition-shadow">
                        <Box className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{components.length}</p>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Components</p>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-2xl p-4 border border-white/40 dark:border-gray-700/40 hover:bg-white/80 dark:hover:bg-gray-800/80 transition-all group"
                    variants={statItemVariants}
                    whileHover={{ scale: 1.02, y: -2 }}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="p-3 bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg group-hover:shadow-green-500/25 transition-shadow">
                        <Tool className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{toolpaths.length}</p>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Toolpaths</p>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-2xl p-4 border border-white/40 dark:border-gray-700/40 hover:bg-white/80 dark:hover:bg-gray-800/80 transition-all group"
                    variants={statItemVariants}
                    whileHover={{ scale: 1.02, y: -2 }}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="p-3 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg group-hover:shadow-orange-500/25 transition-shadow">
                        <Layout className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {profile.organizations?.length || 0}
                        </p>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Organizations</p>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            </motion.div>

            {/* Enhanced Tabs Section */}
            <motion.div
              className="mb-8"
              variants={cardVariants}
            >
              <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-2xl rounded-3xl border border-white/20 dark:border-gray-700/20 p-2 shadow-lg">
                <nav className="flex space-x-2">
                  {[
                    { id: "projects", label: "Projects", icon: Folder },
                    { id: "components", label: "Components", icon: Box },
                    { id: "toolpaths", label: "Toolpaths", icon: Tool }
                  ].map(tab => (
                    <motion.button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex-1 px-6 py-4 text-sm font-semibold rounded-2xl transition-all relative flex items-center justify-center space-x-2 ${activeTab === tab.id
                        ? "text-white shadow-xl"
                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50/50 dark:hover:bg-gray-700/30"
                        }`}
                      whileHover={{ scale: 1.02, y: -1 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {activeTab === tab.id && (
                        <motion.div
                          className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-2xl shadow-lg"
                          layoutId="activeTab"
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        />
                      )}
                      <span className="relative flex items-center space-x-2">
                        <tab.icon className="h-4 w-4" />
                        <span className="hidden sm:inline">{tab.label}</span>
                      </span>
                    </motion.button>
                  ))}
                </nav>
              </div>
            </motion.div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                variants={tabVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
              >
                {activeTab === "projects" &&
                  projects.map(project => (
                    <motion.div
                      key={project.id}
                      variants={cardVariants}
                      whileHover="hover"
                      whileTap="tap"
                    >
                      <Link href={`/projects/${project.id}`}>
                        <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl rounded-2xl shadow-lg hover:shadow-xl transition-all border border-gray-200/50 dark:border-gray-700/50 overflow-hidden cursor-pointer group">
                          <div className="h-48 bg-gradient-to-br from-blue-500/20 to-purple-500/20 dark:from-blue-600/30 dark:to-purple-600/30 flex items-center justify-center">
                            {project.thumbnail ? (
                              <Image
                                src={project.thumbnail}
                                alt={project.name}
                                fill
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <motion.div
                                whileHover={{ scale: 1.1, rotate: 5 }}
                                className="p-6 bg-white/20 dark:bg-white/10 rounded-xl backdrop-blur-sm"
                              >
                                <Folder size={48} className="text-blue-600 dark:text-blue-400" />
                              </motion.div>
                            )}
                          </div>
                          <div className="p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {project.name}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                              Updated {new Date(project.updatedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  ))}

                {activeTab === "components" &&
                  components.map(component => (
                    <motion.div
                      key={component.id}
                      variants={cardVariants}
                      whileHover="hover"
                      whileTap="tap"
                    >
                      <Link href={`/components/${component.id}`} className="block">
                        <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl rounded-2xl shadow-lg hover:shadow-xl transition-all border border-gray-200/50 dark:border-gray-700/50 overflow-hidden cursor-pointer group">
                          <div className="h-48 bg-gradient-to-br from-purple-500/20 to-pink-500/20 dark:from-purple-600/30 dark:to-pink-600/30 flex items-center justify-center">
                            {component.thumbnail ? (
                              <Image
                                src={component.thumbnail}
                                alt={component.name}
                                fill
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <motion.div
                                whileHover={{ scale: 1.1, rotate: 5 }}
                                className="p-6 bg-white/20 dark:bg-white/10 rounded-xl backdrop-blur-sm"
                              >
                                <Box size={48} className="text-purple-600 dark:text-purple-400" />
                              </motion.div>
                            )}
                          </div>
                          <div className="p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                              {component.name}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                              {component.description || "No description"}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                              Updated {new Date(component.updatedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  ))}

                {activeTab === "toolpaths" &&
                  toolpaths.map(toolpath => (
                    <motion.div
                      key={toolpath.id}
                      variants={cardVariants}
                      whileHover="hover"
                      whileTap="tap"
                    >
                      <Link href={`/toolpaths/${toolpath.id}`}>
                        <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl rounded-2xl shadow-lg hover:shadow-xl transition-all border border-gray-200/50 dark:border-gray-700/50 overflow-hidden cursor-pointer group">
                          <div className="h-48 bg-gradient-to-br from-green-500/20 to-blue-500/20 dark:from-green-600/30 dark:to-blue-600/30 flex items-center justify-center">
                            {toolpath.thumbnail ? (
                              <img src={toolpath.thumbnail} alt={toolpath.name} className="h-full w-full object-cover" />
                            ) : (
                              <motion.div
                                whileHover={{ scale: 1.1, rotate: 5 }}
                                className="p-6 bg-white/20 dark:bg-white/10 rounded-xl backdrop-blur-sm"
                              >
                                <Tool size={48} className="text-green-600 dark:text-green-400" />
                              </motion.div>
                            )}
                          </div>
                          <div className="p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">
                              {toolpath.name}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                              Updated {new Date(toolpath.updatedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  ))}

                {/* Empty States */}
                {activeTab === "projects" && projects.length === 0 && (
                  <EmptyState
                    icon={<Folder size={48} />}
                    title="No projects found"
                    description="Start creating amazing CAD/CAM projects"
                  />
                )}
                {activeTab === "components" && components.length === 0 && (
                  <EmptyState
                    icon={<Box size={48} />}
                    title="No components found"
                    description="Create reusable components for your designs"
                  />
                )}
                {activeTab === "toolpaths" && toolpaths.length === 0 && (
                  <EmptyState
                    icon={<Tool size={48} />}
                    title="No toolpaths found"
                    description="Generate toolpaths for your manufacturing needs"
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </DynamicLayout>
    </>
  );
}

// Helper component for empty states
const EmptyState: React.FC<{ icon: React.ReactNode; title: string; description: string }> = ({
  icon,
  title,
  description
}) => (
  <motion.div
    className="col-span-1 sm:col-span-2 lg:col-span-3 bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-12 text-center"
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ type: "spring", stiffness: 300, damping: 25 }}
  >
    <motion.div
      className="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4 text-gray-400 dark:text-gray-500"
      whileHover={{ scale: 1.1, rotate: 5 }}
      transition={{ type: "spring", stiffness: 300, damping: 15 }}
    >
      {icon}
    </motion.div>
    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{title}</h3>
    <p className="text-gray-600 dark:text-gray-400">{description}</p>
  </motion.div>
);
