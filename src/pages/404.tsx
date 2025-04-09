// src/pages/404.tsx

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import MetaTags from '../components/layout/Metatags';

export default function Custom404() {
  const router = useRouter();

  return (
    <>
       <MetaTags 
        title="CAM ERROR" 
     
      />
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="flex justify-center"
          >
            <div className="h-16 w-16 relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-blue-600 to-blue-400 rounded-lg"></div>
              <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-xl">404</div>
            </div>
          </motion.div>
          <motion.h2
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-6 text-center text-3xl font-extrabold text-gray-900"
          >
            Page not found
          </motion.h2>
          <motion.p
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-2 text-center text-sm text-gray-600 max-w"
          >
            Sorry, we couldn&apos;t find the page you&apos;re looking for.
          </motion.p>
        </div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-8 sm:mx-auto sm:w-full sm:max-w-md"
        >
          <div className="flex flex-col items-center space-y-4">
            <button
              onClick={() => router.back()}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Go back
            </button>
            <Link href="/"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Return to dashboard
            </Link>
          </div>
        </motion.div>
      </div>
    </>
  );
}