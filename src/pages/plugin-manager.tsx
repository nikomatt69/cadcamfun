// src/pages/plugin-manager.tsx
import React, { useState } from 'react';
import { usePluginRegistry } from '../hooks/usePluginRegistry';
import Layout from '../components/layout/Layout';
import PluginManagerView from '../components/plugins/PluginManagerView';
import PluginSidebar from '../components/plugins/PluginSidebar';
import { ChevronRight } from 'react-feather';

const PluginManagerPage: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  return (
    <Layout>
      <div className="container mx-auto py-6 px-4">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Plugin Manager</h1>
          
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <span>Open Plugin Sidebar</span>
            <ChevronRight size={18} className="ml-1" />
          </button>
        </div>
        
        <PluginManagerView />
      </div>
      
      <PluginSidebar 
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
    </Layout>
  );
};

export default PluginManagerPage;