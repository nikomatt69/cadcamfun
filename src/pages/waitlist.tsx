import React from 'react';
import SimpleWaitlist from '@/src/components/components/SimpleWaitlist';
import { FEATURES } from '@/src/config/features';
import { ArrowRight, Check } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="flex flex-col items-center justify-center mb-16 text-center">
          <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-cyan-500 mb-6">
            CADCAMFUN
          </h1>
          <p className="text-xl text-gray-700 dark:text-gray-300 max-w-2xl mb-8">
            Professional CAD/CAM system for designing and manufacturing 3D components
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <button className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg flex items-center gap-2 transition-colors">
              Get Started <ArrowRight size={16} />
            </button>
            <button className="px-6 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-medium rounded-lg transition-colors">
              Learn More
            </button>
          </div>
        </div>

        {/* Features Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {[
            {
              title: '3D Design',
              description: 'Advanced tools for creating and modifying three-dimensional models'
            },
            {
              title: 'CAM Simulation',
              description: 'Simulate and optimize toolpaths before manufacturing'
            },
            {
              title: 'Integrated Production',
              description: 'Direct integration with CNC machines and 3D printers'
            }
          ].map((feature, index) => (
            <div key={index} className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-4">
                <Check className="text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-gray-600 dark:text-gray-400">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* Main content */}
        <div className="prose max-w-none mx-auto dark:prose-invert mb-16">
          <h2 className="text-3xl font-bold text-center mb-6">Power and Simplicity</h2>
          <div className="flex flex-col md:flex-row gap-8">
            <div className="flex-1">
              <p className="text-gray-700 dark:text-gray-300">
                CADCAMFUN is a comprehensive CAD/CAM system designed for professionals and companies requiring 
                advanced solutions for designing and manufacturing 3D components. Our platform 
                combines powerful modeling tools with an intuitive interface, allowing you to optimize 
                the process from design to production.
              </p>
              <p className="text-gray-700 dark:text-gray-300 mt-4">
                With multi-device support and real-time collaboration, CADCAMFUN adapts perfectly 
                to modern digital workflows, increasing efficiency and reducing production times.
              </p>
            </div>
            <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-6">
              <div className="aspect-video bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
                <p className="text-gray-500 dark:text-gray-400">Software preview</p>
              </div>
            </div>
          </div>
        </div>

        {/* Waitlist (show only if enabled) */}
        {FEATURES.WAITLIST_ENABLED && (
          <div className="mt-12 bg-gray-50 dark:bg-gray-800 p-8 rounded-xl">
            <h2 className="text-2xl font-bold text-center mb-6">Join the waitlist</h2>
            <p className="text-center text-gray-600 dark:text-gray-400 mb-8">
              Were launching CADCAMFUN in beta. Sign up to be among the first to get access.
            </p>
            <SimpleWaitlist />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-gray-100 dark:bg-gray-900 py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-gray-600 dark:text-gray-400">
            © {new Date().getFullYear()} CADCAMFUN. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}