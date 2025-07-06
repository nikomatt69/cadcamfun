import Link from "next/link";
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import type { FC } from "react";
import urlcat from "urlcat";
import Image from "next/image";

// Animation variants
const footerVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 20 }
};

const linkVariants = {
  initial: { scale: 1 },
  hover: { scale: 1.05 },
  tap: { scale: 0.95 }
};

const Footer: FC = () => {
  const [currentYear, setCurrentYear] = useState<number | null>(null);

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
  }, []);

  return (
    <motion.footer 
      className="relative mt-auto"
      variants={footerVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.5 }}
    >
      {/* Background with gradient and glassmorphism */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 via-white/50 to-purple-50/50 dark:from-gray-900/50 dark:via-gray-800/50 dark:to-gray-900/50 backdrop-blur-xl"></div>
      
      {/* Border */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-200/50 dark:via-gray-700/50 to-transparent"></div>
      
      <div className="relative px-4 py-8">
        <div className="container mx-auto">
          <motion.div 
            className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl shadow-lg rounded-2xl border border-gray-200/50 dark:border-gray-700/50 p-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex flex-col items-center gap-y-6 sm:flex-row sm:justify-between">
        {/* Left Side: Logo & Copyright */}
              <motion.div 
                className="flex flex-col items-center gap-y-3 sm:flex-row sm:items-center sm:gap-x-4"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                <motion.span
                  whileHover={{ scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
            <Image
              src="/logo.png"
              alt="CAD/CAM FUN Logo"
              width={100}
                    height={100}
                    className="h-8 w-auto sm:h-10 filter drop-shadow-sm"
            />
                </motion.span>

                <span className="text-gray-600 dark:text-gray-300 text-center sm:text-left font-medium">
                  © {currentYear || "..."} <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent font-semibold">CAD/CAM FUN</span>. All Rights Reserved.
          </span>
              </motion.div>

        {/* Right Side: Links & Vercel */}
              <motion.div 
                className="flex flex-col items-center gap-y-4 sm:flex-row sm:items-center sm:gap-x-6"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
              >
                <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
                  <motion.div variants={linkVariants} whileHover="hover" whileTap="tap">
                    <Link 
                      href="/legal/terms" 
                      className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors duration-200"
                    >
              Terms
            </Link>
                  </motion.div>
                  <motion.div variants={linkVariants} whileHover="hover" whileTap="tap">
                    <Link 
                      href="/legal/privacy" 
                      className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors duration-200"
                    >
              Privacy
            </Link>
                  </motion.div>
                  <motion.div variants={linkVariants} whileHover="hover" whileTap="tap">
                    <Link 
                      href="/legal/third-party-licenses" 
                      className="text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors duration-200"
                    >
              Licenses
            </Link>
                  </motion.div>
          </div>
                
                <motion.div variants={linkVariants} whileHover="hover" whileTap="tap">
          <Link
                    className="flex items-center gap-x-2 text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white transition-colors duration-200 group"
            href={urlcat("https://vercel.com", { utm_campaign: "oss" })}
            target="_blank"
            rel="noreferrer noopener"
          >
                    <span className="text-lg group-hover:scale-110 transition-transform duration-200">▲</span>
                    <span className="font-medium">Powered by Vercel</span>
          </Link>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.footer>
  );
};

export default Footer;
