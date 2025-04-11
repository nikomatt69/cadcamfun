import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { 
  Home, Grid, Tool, Package, Users, Settings, 
  FileText, Server, Database, HelpCircle, BookOpen,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  PlusSquare, DollarSign, User, BarChart2, Activity, Airplay, X,
  Globe
} from 'react-feather';
import { fetchOrganizationById } from '@/src/lib/api/organizations';
import Image from 'next/image';
import useUserProfileStore from '@/src/store/userProfileStore';

interface EnhancedSidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  disable?: boolean
  current?: boolean;
  children?: NavItem[];
}

const EnhancedSidebar: React.FC<EnhancedSidebarProps> = ({ isOpen, setIsOpen }) => {
  const router = useRouter();
  const { data: session } = useSession();
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({
    projects: false,
    resources: false,
    settings: false,
    analytics: false
  });
  const { profileImage } = useUserProfileStore(); // Get image from global store
  
  // Determine if we're on mobile
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  

  const PluginIcon = () => (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 20 20" 
      fill="none" 
      stroke="currentColor" 
      stroke-width="2" 
  stroke-linecap="round" 
  stroke-linejoin="round"
  width="20" 
  height="20"
>
  <path d="M 4 4 L 10 4 C 10 2 14 2 14 4 L 20 4 L 20 10 C 22 10 22 14 20 14 L 20 20 L 4 20 Z" />
</svg>
  )
  // Generate navigation items with current route indicated
  const getNavigation = (): NavItem[] => {
    return [
      { 
        name: 'Dashboard', 
        href: '/', 
        icon: <Home size={20} />, 
        current: router.pathname === '/' 
      },
      {
        name: 'Projects',
        href: '#',
        icon: <FileText size={20} />,
        current: router.pathname.startsWith('/projects'),
        children: [
          { 
            name: 'All Projects', 
            href: '/projects', 
            icon: <FileText size={16} />, 
            current: router.pathname === '/projects' 
          },
          { 
            name: 'New Project', 
            href: '/projects', 
            icon: <PlusSquare size={16} />, 
            current: router.pathname === '/projects' 
          }
        ]
      },
      { 
        name: 'CAD Editor', 
        href: '/cad', 
        icon: <Grid size={20} />, 
        current: router.pathname === '/cad' 
      },
      { 
        name: 'CAM Editor', 
        href: '/cam', 
        icon: <Tool size={20} />, 
        current: router.pathname === '/cam' 
      },
      {
        name: 'Resources',
        href: '#',
        icon: <Package size={20} />,
        current: ['/components', '/materials', '/machine','/tools','/drawing-instruments','/library'].some(path => 
          router.pathname.startsWith(path)
        ),
        children: [
          { 
            name: 'Library', 
            href: '/library', 
            icon: <BookOpen size={16} />, 
            current: router.pathname.startsWith('/library') 
          },
          { 
            name: 'Toolpaths', 
            href: '/toolpaths', 
            icon: <Tool size={16} />, 
            current: router.pathname.startsWith('/toolpaths') 
          },
          { 
            name: 'Components', 
            href: '/components', 
            icon: <Package size={16} />, 
            current: router.pathname.startsWith('/components')
          },
          { 
            name: 'Materials', 
            href: '/materials', 
            icon: <Database size={16} />, 
            current: router.pathname.startsWith('/materials') 
          },
          { 
            name: 'Configurations', 
            href: '/machine', 
            icon: <Server size={16} />, 
            current: router.pathname.startsWith('/machine') 
          },
          { 
            name: 'Tools', 
            href: '/tools', 
            icon: <Tool size={16} />, 
            current: router.pathname.startsWith('/tools') 
          }
        ]
      },
      { 
        name: 'Organization', 
        href: '/organizations', 
        icon: <Users size={20} />, 
        current: router.pathname.startsWith('/organizations')
      },
      { 
        name: 'Plugins', 
        href: '/plugins', 
        icon: <PluginIcon />, 
        current: router.pathname.startsWith('/plugins')
      },
      { 
        name: 'Website', 
        href: 'https://site.cadcamfun.xyz', 
        icon: <Globe  size={20} />, 
        current: router.pathname.startsWith('https://site.cadcamfun.xyz')
      },
      { 
        name: 'AI', 
        href: '/ai', 
        icon: <Airplay size={20} />, 
        current: router.pathname.startsWith('/ai')
      },
      {
        name: 'Analytics',
        href: '#',
        icon: <BarChart2 size={20} />,
        current: router.pathname.startsWith('/analytics'),
        children: [
          { 
            name: 'Dashboard', 
            href: '/analytics', 
            icon: <BarChart2 size={16} />, 
            current: router.pathname === '/analytics' 
          },
          { 
            name: 'Activity History', 
            href: '/analytics/history', 
            icon: <Activity size={16} />, 
            current: router.pathname === '/analytics/history' 
          }
        ]
      },
      { 
        name: 'Docs', 
        href: 'https://docs.cadcamfun.xyz', 
        icon: <BookOpen size={20} />, 
        current: router.pathname.startsWith('https://docs.cadcamfun.xyz') 
      },
      {
        name: 'Settings',
        href: '#',
        icon: <Settings size={20} />,
        current: router.pathname.startsWith('/settings') || router.pathname === '/profile',
        children: [
          { 
            name: 'Profile', 
            href: '/profile', 
            icon: <User size={16} />, 
            current: router.pathname === '/profile'
          },
          { 
            name: 'Preferences', 
            href: '/settings', 
            icon: <Settings size={16} />, 
            current: router.pathname === '/settings'
          }
        ]
      }
    ];
  };
  
  
  const navigation = getNavigation();
  
  // Auto-expand items based on current route
  useEffect(() => {
    const currentPath = router.pathname;
    
    // Check which sections should be expanded based on the current path
    const newExpandedItems = { ...expandedItems };
    
    if (currentPath.startsWith('/projects')) {
      newExpandedItems.projects = true;
    }
    
    if (
      currentPath.startsWith('/components') ||
      currentPath.startsWith('/materials') ||
      currentPath.startsWith('/machine') ||
      currentPath.startsWith('/tools') ||
      currentPath.startsWith('/drawing-instruments') ||
      currentPath.startsWith('/library')
    ) {
      newExpandedItems.resources = true;
    }
    
    if (currentPath.startsWith('/analytics')) {
      newExpandedItems.analytics = true;
    }
    
    if (currentPath === '/profile' || currentPath === '/settings') {
      newExpandedItems.settings = true;
    }
    
    setExpandedItems(newExpandedItems);
  }, [router.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Toggle expanded items
  const toggleExpanded = (key: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };
  
  // Render a nav item with potential children
  const renderNavItem = (item: NavItem, depth: number = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = hasChildren && expandedItems[item.name.toLowerCase()];
    const textColor = item.current 
      ? 'text-blue-700 dark:text-blue-400' 
      : 'text-gray-700 dark:text-gray-300';
    const bgColor = item.current 
      ? 'bg-blue-50 dark:bg-blue-900/20' 
      : 'hover:bg-gray-100 dark:hover:bg-gray-800/60';
    const disabled = item.disable ? 'opacity-50 cursor-not-allowed' : '';
    
    return (
      <div key={item.name} className="px-2">
        <div
          className={`group flex items-center justify-between py-2 px-3 text-sm font-medium rounded-md cursor-pointer transition-colors ${textColor} ${bgColor} ${disabled}`}
          onClick={() => {
            if (hasChildren) {
              toggleExpanded(item.name.toLowerCase());
            } else if (item.href !== '#') {
              router.push(item.href);
              // On mobile, close the sidebar after navigation
              if (isMobile) {
                setIsOpen(false);
              }
            }
          }}
        >
          <div className="flex items-center">
            <span className={`${item.current ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'} mr-3 flex-shrink-0`}>
              {item.icon}
            </span>
            {isOpen && <span className="truncate">{item.name}</span>}
          </div>
          {isOpen && hasChildren && (
            <div className="ml-2">
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          )}
        </div>
        
        {isOpen && hasChildren && isExpanded && (
          <div className="mt-1 ml-4 space-y-1">
            {item.children?.map(child => (
              <Link
                key={child.name}
                href={child.href}
                className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                  child.current
                    ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/60'
                }`}
                onClick={() => {
                  // On mobile, close the sidebar after navigation
                  if (isMobile) {
                    setIsOpen(false);
                  }
                }}
              >
                <span className="mr-3 text-gray-500 dark:text-gray-400 flex-shrink-0">{child.icon}</span>
                <span className="truncate">{child.name}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile sidebar backdrop - only show when sidebar is open on mobile */}
      {isOpen && isMobile && (
        <div 
          className="fixed inset-0 z-20 bg-black bg-opacity-50 md:hidden" 
          onClick={() => setIsOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-30 w-64 rounded-r-xl m-1 h-[calc(100%-8px)] bg-[#F8FBFF] dark:bg-gray-800 dark:text-white transition-transform duration-300 ease-in-out transform border-r border-gray-200 dark:border-gray-700 flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-16'
        }`}
      >
        {/* Sidebar header with close button on mobile */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
          {isOpen ? (
            <>
              <div className="flex items-center">
                <div className="flex-shrink-0 w-10 h-10 relative">
                  <img src='/icon.png' className='h-10 w-10' alt="Logo"/>
                </div>
                <span className="ml-3 text-xl font-bold text-gray-900 dark:text-white">
                  MENU
                </span>
              </div>
              {isMobile && (
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-md text-gray-500 hover:bg-gray-100"
                  aria-label="Close sidebar"
                >
                  <X size={20} />
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center w-full">
              <div className="flex-shrink-0 w-10 h-10 relative">
                <img src='/icon.png' className='h-10 w-10' alt="Logo"/>
              </div>
            </div>
          )}
        </div>
        
        {/* Toggle button for desktop - positioned outside the sidebar */}
        {!isMobile && (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="absolute -right-2.5 top-20 bg-[#F8FBFF] dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full h-5 w-5 flex items-center justify-center text-gray-500 shadow-sm transform translate-x-0"
            aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {isOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
        
        {/* Sidebar content - scrollable */}
        <div className="flex-grow overflow-y-auto pt-2 pb-4">
          <nav className="space-y-1">
            {navigation.map(item => renderNavItem(item))}
          </nav>
        </div>
        
        {/* User info at bottom */}
        {isOpen && session && (
          <div className="px-3 py-3 mt-auto border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
              {profileImage || session?.user?.image ? (
                    <img
                      src={profileImage || session?.user?.image || ''}
                      alt="Profile"
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex rounded-full items-center justify-center bg-blue-100 dark:bg-blue-900">
                      <span className="text-blue-800 dark:text-blue-300 font-medium text-lg">
                        {session?.user?.name?.charAt(0) || 'U'}
                      </span>
                    </div>
                  )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {session.user?.name}
                </p>
                
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default EnhancedSidebar;