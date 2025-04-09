// src/components/navigation/CollapsibleSidebar.tsx
import React, { useState } from 'react';
import { 
  Home, FileText, Grid, Tool, Package, 
  Users, Settings, HelpCircle, BookOpen, ChevronLeft, ChevronRight 
} from 'react-feather';
import Link from 'next/link';
import { useRouter } from 'next/router';

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  current?: boolean;
  hasSubmenu?: boolean;
}

const CollapsibleSidebar: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const router = useRouter();
  
  const navigation: NavItem[] = [
    { name: 'Dashboard', href: '/', icon: <Home size={20} />, current: router.pathname === '/' },
    { name: 'Progetti', href: '/projects', icon: <FileText size={20} />, hasSubmenu: true },
    { name: 'CAD Editor', href: '/cad', icon: <Grid size={20} />, current: router.pathname === '/cad' },
    { name: 'CAM Editor', href: '/cam', icon: <Tool size={20} />, current: router.pathname === '/cam' },
    { name: 'Risorse', href: '/resources', icon: <Package size={20} />, hasSubmenu: true },
    { name: 'Collaboratori', href: '/team', icon: <Users size={20} /> },
    { name: 'Impostazioni', href: '/settings', icon: <Settings size={20} />, hasSubmenu: true },
    { name: 'Terms', href: '/terms', icon: <HelpCircle size={20} /> },
    { name: 'Privacy', href: '/privacy', icon: <BookOpen size={20} /> },
  ];

  return (
    <div className={`transition-all duration-300 ease-in-out bg-gray-50 border-r border-gray-200 h-screen ${isCollapsed ? 'w-16' : 'w-64'}`}>
      <div className="p-4 flex justify-between items-center border-b border-gray-200">
        <h2 className={`text-lg font-medium text-gray-700 ${isCollapsed ? 'hidden' : 'block'}`}>
          Quick Navigation
        </h2>
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded-md hover:bg-gray-200 text-gray-500"
        >
          {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>
      
      <nav className="mt-2 px-2">
        <ul className="space-y-1">
          {navigation.map((item) => (
            <li key={item.name}>
              <Link 
                href={item.href}
                className={`flex items-center ${item.current 
                  ? 'bg-blue-50 text-blue-600' 
                  : 'text-gray-700 hover:bg-gray-100'} 
                  rounded-md px-3 py-2 text-sm font-medium`}
              >
                <span className="mr-3">{item.icon}</span>
                {!isCollapsed && (
                  <span className="flex-1">{item.name}</span>
                )}
                {!isCollapsed && item.hasSubmenu && (
                  <ChevronRight size={16} className="text-gray-400" />
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};

export default CollapsibleSidebar;