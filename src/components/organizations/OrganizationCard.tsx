import React from "react";
import Link from "next/link";
import { motion, Variants } from "framer-motion";
import { Building, Users, Folder, Star, Calendar } from "lucide-react";
import { useOrganizationStats } from "src/hooks/useOrganizationStats";
import { Organization } from "@prisma/client";

interface OrganizationCardProps {
  org: Organization;
  index: number;
}

const cardVariants = {
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

const OrganizationCard: React.FC<OrganizationCardProps> = ({ org, index }) => {
  const { stats, isLoading: statsLoading } = useOrganizationStats(org.id);

  return (
    <motion.div
      key={org.id}
      variants={cardVariants as Variants}
      whileHover="hover"
      whileTap="tap"
      className="group"
      custom={index}
    >
      <Link href={`/organizations/${org.id}`} passHref>
        <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl shadow-lg rounded-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden cursor-pointer transition-all duration-300 hover:border-blue-300 dark:hover:border-blue-600">
          {/* Organization Header */}
          <div className="relative h-20 bg-gradient-to-r from-blue-500/20 to-purple-500/20 dark:from-blue-600/30 dark:to-purple-600/30 flex items-center justify-center">
            <motion.div
              className="p-3 bg-white/20 dark:bg-white/10 rounded-xl backdrop-blur-sm"
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 300, damping: 15 }}
            >
              <Building size={28} className="text-blue-600 dark:text-blue-400" />
            </motion.div>

            {/* Status Badge */}
            <div className="absolute top-3 right-3">
              <div className="flex items-center px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded-full">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1"></div>
                Active
              </div>
            </div>
          </div>

          {/* Organization Content */}
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-2">
              {org.name}
            </h3>

            {org.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                {org.description}
              </p>
            )}

            {/* Organization Statistics */}
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center">
                  <Users size={14} className="mr-1" />
                  <span>Members:</span>
                </div>
                <span className="font-medium text-gray-900 dark:text-white">
                  {statsLoading ? (
                    <div className="h-3 w-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                  ) : (
                    stats.memberCount
                  )}
                </span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center">
                  <Folder size={14} className="mr-1" />
                  <span>Projects:</span>
                </div>
                <span className="font-medium text-gray-900 dark:text-white">
                  {statsLoading ? (
                    <div className="h-3 w-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                  ) : (
                    stats.projectCount
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Organization Footer */}
          <div className="bg-gray-50/50 dark:bg-gray-700/30 px-6 py-4 border-t border-gray-200/50 dark:border-gray-600/50 flex items-center justify-between">
            <motion.span
              className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${org.id === "ADMIN"
                  ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                  : "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300"
                }`}
              whileHover={{ scale: 1.05 }}
            >
              <Star size={12} className="mr-1" />
              {org.id === "ADMIN" ? "Admin" : "Member"}
            </motion.span>

            <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
              <Calendar size={12} className="mr-1" />
              <span>{new Date(org.createdAt).getFullYear()}</span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
};

export default OrganizationCard; 