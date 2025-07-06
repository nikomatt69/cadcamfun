// src/pages/terms.tsx

import { motion, MotionConfig, Variants } from "framer-motion";
import { DynamicLayout } from "src/components/dynamic-imports";
import { FileText, ArrowLeft, Shield, AlertTriangle, CheckCircle } from "react-feather";
import Link from "next/link";

import { useRouter } from "next/router";
import { Scale } from "lucide-react";

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

export default function TermsPage() {

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
                  className="w-12 h-12 rounded-2xl bg-gradient-to-r from-green-500 to-blue-600 flex items-center justify-center mr-4"
                  whileHover={{ scale: 1.05, rotate: 5 }}
                >
                  <Scale size={24} className="text-white" />
                </motion.div>
                <div>
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
                    Terms of Service
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
                {/* Agreement */}
                <section>
                  <div className="flex items-center mb-4">
                    <CheckCircle size={20} className="text-green-600 dark:text-green-400 mr-3" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      Agreement to Terms
                    </h2>
                  </div>
                  <div className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-xl p-6">
                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                      By accessing and using our CAD/CAM application, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
                    </p>
                  </div>
                </section>

                {/* Use License */}
                <section>
                  <div className="flex items-center mb-4">
                    <FileText size={20} className="text-blue-600 dark:text-blue-400 mr-3" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      Use License
                    </h2>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-white/50 dark:bg-gray-800/50 rounded-xl p-6 border border-gray-200/50 dark:border-gray-700/50">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                        Permitted Uses
                      </h3>
                      <ul className="text-gray-700 dark:text-gray-300 space-y-2">
                        <li className="flex items-start">
                          <CheckCircle size={16} className="text-green-500 mr-2 mt-1 flex-shrink-0" />
                          <span>Create and edit CAD designs for personal and commercial use</span>
                        </li>
                        <li className="flex items-start">
                          <CheckCircle size={16} className="text-green-500 mr-2 mt-1 flex-shrink-0" />
                          <span>Generate manufacturing toolpaths and G-code</span>
                        </li>
                        <li className="flex items-start">
                          <CheckCircle size={16} className="text-green-500 mr-2 mt-1 flex-shrink-0" />
                          <span>Collaborate with team members on shared projects</span>
                        </li>
                        <li className="flex items-start">
                          <CheckCircle size={16} className="text-green-500 mr-2 mt-1 flex-shrink-0" />
                          <span>Export your designs in supported formats</span>
                        </li>
                      </ul>
                    </div>

                    <div className="bg-white/50 dark:bg-gray-800/50 rounded-xl p-6 border border-gray-200/50 dark:border-gray-700/50">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                        Restrictions
                      </h3>
                      <ul className="text-gray-700 dark:text-gray-300 space-y-2">
                        <li className="flex items-start">
                          <AlertTriangle size={16} className="text-red-500 mr-2 mt-1 flex-shrink-0" />
                          <span>Reverse engineer, decompile, or disassemble the software</span>
                        </li>
                        <li className="flex items-start">
                          <AlertTriangle size={16} className="text-red-500 mr-2 mt-1 flex-shrink-0" />
                          <span>Use the service for illegal or unauthorized purposes</span>
                        </li>
                        <li className="flex items-start">
                          <AlertTriangle size={16} className="text-red-500 mr-2 mt-1 flex-shrink-0" />
                          <span>Attempt to gain unauthorized access to the system</span>
                        </li>
                        <li className="flex items-start">
                          <AlertTriangle size={16} className="text-red-500 mr-2 mt-1 flex-shrink-0" />
                          <span>Distribute malware or interfere with the service</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </section>

                {/* Account Responsibilities */}
                <section>
                  <div className="flex items-center mb-4">
                    <Shield size={20} className="text-purple-600 dark:text-purple-400 mr-3" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      Account Responsibilities
                    </h2>
                  </div>
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white mb-3">Your Responsibilities</h4>
                        <ul className="text-gray-700 dark:text-gray-300 space-y-2 text-sm">
                          <li>• Maintain the confidentiality of your account</li>
                          <li>• Use strong, unique passwords</li>
                          <li>• Notify us of any unauthorized access</li>
                          <li>• Ensure your content complies with our policies</li>
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white mb-3">Our Responsibilities</h4>
                        <ul className="text-gray-700 dark:text-gray-300 space-y-2 text-sm">
                          <li>• Maintain service availability and security</li>
                          <li>• Protect your data according to our privacy policy</li>
                          <li>• Provide technical support</li>
                          <li>• Give notice of significant changes</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Content Ownership */}
                <section>
                  <div className="flex items-center mb-4">
                    <FileText size={20} className="text-orange-600 dark:text-orange-400 mr-3" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      Content Ownership
                    </h2>
                  </div>
                  <div className="bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-900/20 dark:to-yellow-900/20 rounded-xl p-6">
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Your Content</h4>
                        <p className="text-gray-700 dark:text-gray-300 text-sm">
                          You retain all intellectual property rights to the designs, models, and content you create using our service. We do not claim ownership of your creations.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Our Content</h4>
                        <p className="text-gray-700 dark:text-gray-300 text-sm">
                          The CAD/CAM application, including its design, functionality, and underlying technology, remains our intellectual property.
                        </p>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">License to Us</h4>
                        <p className="text-gray-700 dark:text-gray-300 text-sm">
                          You grant us a limited license to host, backup, and process your content solely for the purpose of providing our services to you.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Service Availability */}
                <section>
                  <div className="flex items-center mb-4">
                    <AlertTriangle size={20} className="text-red-600 dark:text-red-400 mr-3" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      Service Availability & Disclaimers
                    </h2>
                  </div>
                  <div className="bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 rounded-xl p-6">
                    <div className="space-y-4">
                      <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2 flex items-center">
                          <AlertTriangle size={16} className="text-yellow-500 mr-2" />
                          Service Interruptions
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          We strive for 99.9% uptime but cannot guarantee uninterrupted service due to maintenance, updates, or unforeseen circumstances.
                        </p>
                      </div>
                      <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2 flex items-center">
                          <AlertTriangle size={16} className="text-yellow-500 mr-2" />
                          Data Backup
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          While we maintain regular backups, you are responsible for maintaining your own copies of important designs and data.
                        </p>
                      </div>
                      <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2 flex items-center">
                          <AlertTriangle size={16} className="text-yellow-500 mr-2" />
                          Manufacturing Accuracy
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Generated G-code and toolpaths should be verified before use. We are not responsible for manufacturing errors or material waste.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Termination */}
                <section>
                  <div className="flex items-center mb-4">
                    <Scale size={20} className="text-gray-600 dark:text-gray-400 mr-3" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                      Termination
                    </h2>
                  </div>
                  <div className="bg-white/50 dark:bg-gray-800/50 rounded-xl p-6 border border-gray-200/50 dark:border-gray-700/50">
                    <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
                      Either party may terminate this agreement at any time. Upon termination, your access to the service will cease, and we may delete your account and associated data after a reasonable notice period.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 rounded-full text-sm">
                        30-day notice period
                      </span>
                      <span className="px-3 py-1 bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 rounded-full text-sm">
                        Data export available
                      </span>
                      <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300 rounded-full text-sm">
                        No refund required
                      </span>
                    </div>
                  </div>
                </section>

                {/* Contact */}
                <section>
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 rounded-xl p-6 text-center">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                      Questions About These Terms?
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      If you have any questions about these Terms of Service, please contact our legal team.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <motion.button
                        className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-green-500 to-blue-600 text-white rounded-xl hover:from-green-600 hover:to-blue-700 shadow-lg shadow-green-500/25"
                        variants={buttonVariants}
                        whileHover="hover"
                        whileTap="tap"
                      >
                        Contact Legal Team
                      </motion.button>
                      <Link href="/legal/privacy">
                        <motion.button
                          className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 text-gray-700 dark:from-gray-700 dark:to-gray-600 dark:text-gray-200 dark:hover:from-gray-600 dark:hover:to-gray-500 rounded-xl shadow-lg shadow-gray-500/25"
                          variants={buttonVariants}
                          whileHover="hover"
                          whileTap="tap"
                        >
                          Privacy Policy
                        </motion.button>
                      </Link>
                    </div>
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
