// src/pages/privacy.tsx

import { motion, MotionConfig, Variants } from "framer-motion";
import { DynamicLayout } from "src/components/dynamic-imports";
import { Shield, ArrowLeft, Eye, Lock, FileText, Users } from "react-feather";
import Link from "next/link";

import { useRouter } from "next/router";

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

export default function PrivacyPolicy() {

  const router = useRouter();
  if (status === "unauthenticated") {
    router.push("/waitlist");
    return null;
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
          <div className="p-4 md:p-6 max-w-4xl mx-auto">
            {/* Back button */}
            <motion.div
              className="mb-6"
              variants={cardVariants}
            >
              <Link href="/">
                <motion.button
                  className="inline-flex items-center px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50 hover:bg-white/90 dark:hover:bg-gray-800/90 transition-all"
                  variants={buttonVariants}
                  whileHover="hover"
                  whileTap="tap"
                >
                  <ArrowLeft size={16} className="mr-2" />
                  Back to Home
                </motion.button>
              </Link>
            </motion.div>

            {/* Header */}
            <motion.div
              className="backdrop-blur-md bg-white/80 dark:bg-gray-900/80 rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/30 px-6 py-6 mb-8"
              variants={cardVariants}
            >
              <div className="flex items-center">
                <motion.div
                  className="w-12 h-12 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center mr-4"
                  whileHover={{ scale: 1.05, rotate: 5 }}
                >
                  <Shield size={24} className="text-white" />
                </motion.div>
                <div>
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    Privacy Policy
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">
                    Last updated: January 2024
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Content */}
            <motion.div
              className="backdrop-blur-md bg-white/80 dark:bg-gray-900/80 rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/30 overflow-hidden"
              variants={cardVariants}
            >
              <div className="p-8 space-y-8">
                {/* Introduction */}
                <section>
                  <div className="flex items-center mb-4">
                    <Eye size={20} className="text-blue-600 dark:text-blue-400 mr-3" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      Introduction
                    </h2>
                  </div>
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-6">
                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                      This Privacy Policy describes how your personal information is collected, used, and shared when you use our CAD/CAM application (CAD/CAM AI) (the &ldquo;Service&rdquo;). We are committed to protecting your privacy and ensuring the security of your personal information.
                    </p>
                  </div>
                </section>

                {/* Information We Collect */}
                <section>
                  <div className="flex items-center mb-4">
                    <FileText size={20} className="text-green-600 dark:text-green-400 mr-3" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      Information We Collect
                    </h2>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-white/50 dark:bg-gray-800/50 rounded-xl p-6 border border-gray-200/50 dark:border-gray-700/50">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                        Personal Information
                      </h3>
                      <ul className="text-gray-700 dark:text-gray-300 space-y-2">
                        <li>• Account registration information (name, email address)</li>
                        <li>• Profile information and preferences</li>
                        <li>• Communication data when you contact us</li>
                      </ul>
                    </div>

                    <div className="bg-white/50 dark:bg-gray-800/50 rounded-xl p-6 border border-gray-200/50 dark:border-gray-700/50">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                        Usage Information
                      </h3>
                      <ul className="text-gray-700 dark:text-gray-300 space-y-2">
                        <li>• Application usage patterns and features accessed</li>
                        <li>• CAD designs and manufacturing data you create</li>
                        <li>• Performance metrics and error logs</li>
                      </ul>
                    </div>

                    <div className="bg-white/50 dark:bg-gray-800/50 rounded-xl p-6 border border-gray-200/50 dark:border-gray-700/50">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                        Technical Information
                      </h3>
                      <ul className="text-gray-700 dark:text-gray-300 space-y-2">
                        <li>• Device information and browser type</li>
                        <li>• IP address and location data</li>
                        <li>• Cookies and similar tracking technologies</li>
                      </ul>
                    </div>
                  </div>
                </section>

                {/* How We Use Information */}
                <section>
                  <div className="flex items-center mb-4">
                    <Users size={20} className="text-purple-600 dark:text-purple-400 mr-3" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      How We Use Your Information
                    </h2>
                  </div>
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-6">
                    <ul className="text-gray-700 dark:text-gray-300 space-y-3">
                      <li className="flex items-start">
                        <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                        <span>Provide, maintain, and improve our CAD/CAM services</span>
                      </li>
                      <li className="flex items-start">
                        <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                        <span>Process your designs and manufacturing instructions</span>
                      </li>
                      <li className="flex items-start">
                        <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                        <span>Communicate with you about your account and services</span>
                      </li>
                      <li className="flex items-start">
                        <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                        <span>Ensure security and prevent fraud</span>
                      </li>
                      <li className="flex items-start">
                        <span className="w-2 h-2 bg-purple-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                        <span>Comply with legal obligations and resolve disputes</span>
                      </li>
                    </ul>
                  </div>
                </section>

                {/* Data Security */}
                <section>
                  <div className="flex items-center mb-4">
                    <Lock size={20} className="text-red-600 dark:text-red-400 mr-3" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      Data Security
                    </h2>
                  </div>
                  <div className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 rounded-xl p-6">
                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
                      We implement appropriate technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Encryption</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">All data is encrypted in transit and at rest</p>
                      </div>
                      <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Access Control</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Strict access controls and authentication</p>
                      </div>
                      <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Monitoring</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Continuous security monitoring and auditing</p>
                      </div>
                      <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Backup</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Regular secure backups and disaster recovery</p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Your Rights */}
                <section>
                  <div className="flex items-center mb-4">
                    <Shield size={20} className="text-blue-600 dark:text-blue-400 mr-3" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      Your Rights
                    </h2>
                  </div>
                  <div className="bg-white/50 dark:bg-gray-800/50 rounded-xl p-6 border border-gray-200/50 dark:border-gray-700/50">
                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
                      You have the right to access, update, or delete your personal information. You may also opt out of certain communications from us.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 rounded-full text-sm">
                        Right to Access
                      </span>
                      <span className="px-3 py-1 bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 rounded-full text-sm">
                        Right to Rectification
                      </span>
                      <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300 rounded-full text-sm">
                        Right to Erasure
                      </span>
                      <span className="px-3 py-1 bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300 rounded-full text-sm">
                        Right to Portability
                      </span>
                    </div>
                  </div>
                </section>

                {/* Contact */}
                <section>
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 rounded-xl p-6 text-center">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      Questions About This Policy?
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      If you have any questions about this Privacy Policy, please contact us.
                    </p>
                    <motion.button
                      className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:from-blue-600 hover:to-purple-700 shadow-lg shadow-blue-500/25"
                      variants={buttonVariants}
                      whileHover="hover"
                      whileTap="tap"
                    >
                      Contact Support
                    </motion.button>
                  </div>
                </section>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </DynamicLayout>
    </MotionConfig>
  );
}
