// src/pages/organizations/index.tsx

import React, { useState } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { useOrganizations } from "src/hooks/useOrganizations";
import { Organization } from "@prisma/client";
import { Users, Plus, Folder, UserPlus, Cloud, ArrowLeft, Star, Calendar } from "react-feather";
import Link from "next/link";
import { useRouter } from "next/router";
import { DynamicLayout } from "src/components/dynamic-imports";

import MetaTags from "@/src/components/layout/Metatags";
import { Building } from "lucide-react";
import OrganizationCard from "src/components/organizations/OrganizationCard";

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

const emptyStateVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.8
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 25,
      delay: 0.2
    }
  }
};

const modalVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    y: 20
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 25
    }
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 20,
    transition: {
      duration: 0.2
    }
  }
};

export default function OrganizationsList() {
  const [showModal, setShowModal] = useState(false);
  const { organizations, isLoading, error, refreshOrganizations, addOrganization } = useOrganizations();
  const [formData, setFormData] = useState({
    name: "",
    description: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);


  const router = useRouter();

  if (status === "unauthenticated") {
    router.push("/waitlist");
    return null;
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description
        })
      });

      if (!response.ok) {
        throw new Error("Failed to create organization");
      }

      const organization = await response.json();
      setShowModal(false);
      setFormData({ name: "", description: "" });
      router.push(`/organizations/${organization.id}`);
    } catch (error: any) {
      console.error("Error creating organization:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateOrganization = async (orgData: any) => {
    try {
      const newOrg = await addOrganization(orgData);
      setShowModal(false);
      window.location.href = `/organizations/${newOrg.id}`;
    } catch (error) {
      console.error("Failed to create organization:", error);
      alert("Failed to create organization. Please try again.");
    }
  };

  return (
    <DynamicLayout>
      <MetaTags ogImage="/og-image.png" title="Organizations" />

      <motion.div
        className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={pageVariants}
      >
        <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
          {/* Header Section */}
          <motion.div
            className="mb-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Your Organizations
                </h1>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                  Manage your teams and collaborate on CAD/CAM projects
                </p>
              </div>
              <motion.button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg shadow-blue-500/25 transition-all"
                variants={buttonVariants}
                whileHover="hover"
                whileTap="tap"
              >
                <Plus size={20} className="mr-2" />
                New Organization
              </motion.button>
            </div>
          </motion.div>

          {/* Organizations Content */}
          {organizations.length === 0 ? (
            /* Empty State */
            <motion.div
              className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl shadow-2xl rounded-2xl border border-gray-200/50 dark:border-gray-700/50 p-12 text-center"
              variants={emptyStateVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.div
                className="mx-auto w-24 h-24 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-6"
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
              >
                <Building size={48} className="text-blue-500 dark:text-blue-400" />
              </motion.div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                No organizations yet
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
                Create your first organization to collaborate with your team on CAD/CAM projects and share resources.
              </p>
              <motion.button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg shadow-blue-500/25"
                variants={buttonVariants}
                whileHover="hover"
                whileTap="tap"
              >
                <Plus size={20} className="mr-2" />
                Create Organization
              </motion.button>
            </motion.div>
          ) : (
            /* Organizations Grid */
            <motion.div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              variants={cardContainerVariants}
              initial="hidden"
              animate="visible"
            >
              {organizations.map((org, index) => (
                <OrganizationCard
                  key={org.id}
                  org={org}
                  index={index}
                />
              ))}
            </motion.div>
          )}
        </div>

        {/* Create Organization Modal */}
        <AnimatePresence>
          {showModal && (
            <motion.div
              className="fixed inset-0 z-50 overflow-y-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                {/* Background overlay */}
                <motion.div
                  className="fixed inset-0 bg-gray-500/75 dark:bg-gray-900/75 backdrop-blur-sm transition-opacity"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowModal(false)}
                />

                {/* Modal panel */}
                <motion.div
                  className="inline-block align-bottom bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl px-4 pt-5 pb-4 text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6 border border-gray-200/50 dark:border-gray-700/50"
                  variants={modalVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <div>
                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 mb-4">
                      <Building className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="mt-3 text-center sm:mt-5">
                      <h3 className="text-lg leading-6 font-semibold text-gray-900 dark:text-white">
                        Create New Organization
                      </h3>
                      <div className="mt-2">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Create a new organization to collaborate with your team on projects.
                        </p>
                      </div>
                    </div>
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4"
                    >
                      <div className="text-sm text-red-700 dark:text-red-300">{error}</div>
                    </motion.div>
                  )}

                  <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Organization Name *
                      </label>
                      <motion.input
                        type="text"
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all"
                        placeholder="Acme Inc."
                        whileFocus={{ scale: 1.02 }}
                      />
                    </div>

                    <div>
                      <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Description (optional)
                      </label>
                      <motion.textarea
                        id="description"
                        name="description"
                        rows={3}
                        value={formData.description}
                        onChange={handleChange}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all resize-none"
                        placeholder="Briefly describe your organization..."
                        whileFocus={{ scale: 1.02 }}
                      />
                    </div>

                    <div className="mt-6 flex justify-end space-x-3">
                      <motion.button
                        type="button"
                        onClick={() => setShowModal(false)}
                        className="px-6 py-2.5 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-xl text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                        variants={buttonVariants}
                        whileHover="hover"
                        whileTap="tap"
                        disabled={isSubmitting}
                      >
                        Cancel
                      </motion.button>
                      <motion.button
                        type="submit"
                        disabled={isSubmitting}
                        className="inline-flex items-center px-6 py-2.5 border border-transparent shadow-sm text-sm font-medium rounded-xl text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        variants={buttonVariants}
                        whileHover={!isSubmitting ? "hover" : {}}
                        whileTap={!isSubmitting ? "tap" : {}}
                      >
                        {isSubmitting ? (
                          <>
                            <motion.div
                              className="w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"
                              animate={{ rotate: 360 }}
                              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                            />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Building size={16} className="mr-2" />
                            Create Organization
                          </>
                        )}
                      </motion.button>
                    </div>
                  </form>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </DynamicLayout>
  );
}
