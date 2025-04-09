import React, { useState } from 'react';
import { Database, Tool, Box, Settings, Layers, BookOpen, Globe, Users, Cpu } from 'react-feather';
import BottomSheet from '../layout/BottomSheet';
import Link from 'next/link';

const ResourcesBottomSheet = () => {
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    {
      icon: <Tool className="w-5 h-5" />,
      label: 'Toolpaths',
      description: 'Manage and create toolpaths',
      href: '/toolpaths',
      color: 'text-blue-500 bg-blue-100 dark:bg-blue-900/30'
    },
    {
      icon: <Box className="w-5 h-5" />,
      label: 'Components',
      description: 'Browse component library',
      href: '/components',
      color: 'text-purple-500 bg-purple-100 dark:bg-purple-900/30'
    },
    {
      icon: <Layers className="w-5 h-5" />,
      label: 'Materials',
      description: 'Material database and settings',
      href: '/materials',
      color: 'text-green-500 bg-green-100 dark:bg-green-900/30'
    },
    {
      icon: <Tool className="w-5 h-5" />,
      label: 'Tools',
      description: 'Tool library and configurations',
      href: '/tools',
      color: 'text-orange-500 bg-orange-100 dark:bg-orange-900/30'
    },
    {
      icon: <Settings className="w-5 h-5" />,
      label: 'Machine Configs',
      description: 'Machine settings and profiles',
      href: '/machine-configs',
      color: 'text-gray-500 bg-gray-100 dark:bg-gray-900/30'
    },
    {
      icon: <BookOpen className="w-5 h-5" />,
      label: 'Documentation',
      description: 'Documentation and tutorials',
      href: 'https://docs.cadcamfun.xyz',
      color: 'text-indigo-500 bg-indigo-100 dark:bg-indigo-900/30'
    },
    {
      icon: <Globe className="w-5 h-5" />,
      label: 'Website',
      description: 'Website and resources',
      href: 'https://site.cadcamfun.xyz',
      color: 'text-teal-500 bg-teal-100 dark:bg-teal-900/30'
    },
    {
      icon: <Users className="w-5 h-5" />,
      label: 'Organizations',
      description: 'Organizations and teams',
      href: '/organizations',
      color: 'text-pink-500 bg-pink-100 dark:bg-pink-900/30'
    },
    {
      icon: <Cpu className="w-5 h-5" />,
      label: 'AI',
      description: 'AI and machine learning',
      href: '/ai',
      color: 'text-red-500 bg-red-100 dark:bg-red-900/30'
    }
  ];

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex flex-col items-center justify-center p-2 rounded-lg transition-colors"
      >
        <Database className="w-5 h-5 text-gray-500 dark:text-gray-300" />
        <span className="text-xs mt-1 text-gray-500 dark:text-gray-300">Resources</span>
      </button>

      <BottomSheet 
        isOpen={isOpen} 
        onClose={() => setIsOpen(false)}
        height="62vh"
        className="bg-white border-2 border-gray-200 dark:bg-gray-900"
      >
        <div className="flex flex-col-2 flex-col h-full">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Resources</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Access CAD/CAM resources and configurations</p>
          </div>
          
          <div className="flex-1 overflow-y-auto py-2">
            {menuItems.map((item, index) => (
              <Link
                key={index}
                href={item.href}
                className="flex items-center px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${item.color}`}>
                  {React.cloneElement(item.icon, {
                    className: 'text-current'
                  })}
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.label}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{item.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </BottomSheet>
    </>
  );
};

export default ResourcesBottomSheet; 