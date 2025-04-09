// src/components/ui/ResponsiveSidebar.tsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft, ChevronRight, X, 
  Menu, Grid, Tool, Package, Users, Settings, 
  FileText, Server, Database, HelpCircle, BookOpen,
  PlusSquare, Circle, Box, Sliders, Layers, Eye, EyeOff
} from 'react-feather';
import { useCADStore } from 'src/store/cadStore';
import { useElementsStore } from 'src/store/elementsStore';
import { useLayerStore } from 'src/store/layerStore';
import ToolPanel from '../cad/ToolPanel';
import LayerManager from '../cad/LayerManager';
import WorkpieceSetup from '../cad/WorkpieceSetup';
import MachineConfigManager from '../cad/MachineConfigManager';
import SettingsPanel from '../cad/SettingPanel';
import OriginControls from '../cad/OriginControls';

interface ResponsiveSidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  activeSidebarTab: 'tools' | 'layers' | 'settings' | 'machine';
  setActiveSidebarTab: (tab: 'tools' | 'layers' | 'settings' | 'machine') => void;
  position?: 'left' | 'right';
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  current?: boolean;
  children?: NavItem[];
}

const ResponsiveSidebar: React.FC<ResponsiveSidebarProps> = ({ 
  isOpen, 
  setIsOpen, 
  activeSidebarTab, 
  setActiveSidebarTab,
  position = 'left'
}) => {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { viewMode, setViewMode, gridVisible, toggleGrid, axisVisible, toggleAxis } = useCADStore();
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({
    projects: true,
    resources: false,
    settings: false
  });
  const [selectedLibraryTool, setSelectedLibraryTool] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [touchStartX, setTouchStartX] = useState(0);
  const [touchDirection, setTouchDirection] = useState<'none' | 'left' | 'right'>('none');

  // Check if we're on mobile and what orientation
  useEffect(() => {
    const checkDevice = () => {
      setIsMobile(window.innerWidth <= 768);
      setIsLandscape(window.innerWidth > window.innerHeight);
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);

    return () => {
      window.removeEventListener('resize', checkDevice);
    };
  }, []);

  // Handle swipe gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartX) return;
    
    const currentX = e.touches[0].clientX;
    const diff = touchStartX - currentX;
    
    // Determine swipe direction
    if (diff > 15) {
      setTouchDirection('left');
    } else if (diff < -15) {
      setTouchDirection('right');
    }
  };

  const handleTouchEnd = () => {
    if (touchDirection === 'left' && position === 'left' && isOpen) {
      setIsOpen(false);
    } else if (touchDirection === 'right' && position === 'left' && !isOpen) {
      setIsOpen(true);
    } else if (touchDirection === 'right' && position === 'right' && isOpen) {
      setIsOpen(false);
    } else if (touchDirection === 'left' && position === 'right' && !isOpen) {
      setIsOpen(true);
    }
    
    setTouchDirection('none');
    setTouchStartX(0);
  };

  // Generate navigation items with current route indicated
  const getNavigation = (): NavItem[] => {
    return [
      { 
        name: 'Dashboard', 
        href: '/', 
        icon: <Menu size={20} />, 
        current: false
      },
      {
        name: 'Progetti',
        href: '#',
        icon: <FileText size={20} />,
        current: false,
        children: [
          { 
            name: 'Tutti i progetti', 
            href: '/projects', 
            icon: <FileText size={16} />, 
            current: false
          },
          { 
            name: 'Nuovi Progetti', 
            href: '/projects/index', 
            icon: <PlusSquare size={16} />, 
            current: false
          }
        ]
      },
      { 
        name: 'CAD Editor', 
        href: '/cad', 
        icon: <Grid size={20} />, 
        current: true
      },
      { 
        name: 'CAM Editor', 
        href: '/cam', 
        icon: <Tool size={20} />, 
        current: false
      },
      {
        name: 'Risorse',
        href: '#',
        icon: <Package size={20} />,
        current: false,
        children: [
          { 
            name: 'Componenti', 
            href: '/components', 
            icon: <Package size={16} />, 
            current: false
          },
          { 
            name: 'Materiali', 
            href: '/materials', 
            icon: <Database size={16} />, 
            current: false
          },
          { 
            name: 'Configurazioni', 
            href: '/machine', 
            icon: <Server size={16} />, 
            current: false
          }
        ]
      },
      { 
        name: 'Collaboratori', 
        href: '/team', 
        icon: <Users size={20} />, 
        current: false
      },
      {
        name: 'Impostazioni',
        href: '#',
        icon: <Settings size={20} />,
        current: false,
        children: [
          { 
            name: 'Profilo', 
            href: '/settings/profile', 
            icon: <Settings size={16} />, 
            current: false
          },
          { 
            name: 'Account', 
            href: '/settings/account', 
            icon: <Settings size={16} />, 
            current: false
          },
          { 
            name: 'Preferenze', 
            href: '/settings', 
            icon: <Settings size={16} />, 
            current: false
          }
        ]
      },
      { 
        name: 'Terms', 
        href: '/terms', 
        icon: <HelpCircle size={20} />, 
        current: false
      },
      { 
        name: 'Privacy', 
        href: '/privacy', 
        icon: <BookOpen size={20} />, 
        current: false
      }
    ];
  };
  
  const navigation = getNavigation();
  
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
      ? 'bg-gray-100 dark:bg-blue-900/20' 
      : 'hover:bg-gray-100 dark:hover:bg-gray-800/60';
    
    return (
      <div key={item.name} className="mb-1">
        <div
          className={`group flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md cursor-pointer transition-colors ${textColor} ${bgColor}`}
          onClick={() => {
            if (hasChildren) {
              toggleExpanded(item.name.toLowerCase());
            } else {
              // Navigate to the page in a real app, for the demo we just close
              if (isMobile) setIsOpen(false);
            }
          }}
        >
          <div className="flex items-center">
            <span className={`${item.current ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'} mr-3`}>
              {item.icon}
            </span>
            {isOpen && <span className="whitespace-nowrap">{item.name}</span>}
          </div>
          {isOpen && hasChildren && (
            <div className="ml-2">
              {isExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </div>
          )}
        </div>
        
        {isOpen && hasChildren && isExpanded && (
          <div className="mt-1 ml-4 space-y-1">
            {item.children?.map(child => (
              <div
                key={child.name}
                className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md cursor-pointer ${
                  child.current
                  ? 'text-blue-700 dark:text-blue-400 bg-gray-100 dark:bg-blue-900/20'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/60'
              }`}
              onClick={() => {
                // Navigate to the page in a real app, for the demo we just close
                if (isMobile) setIsOpen(false);
              }}
            >
              <span className="mr-3 text-gray-500 dark:text-gray-400">{child.icon}</span>
              <span className="truncate">{child.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Sidebar tabs
const renderSidebarTabs = () => {
  return (
    <div className="flex justify-around border-b rounded-xl border-gray-200 bg-gray-50 mb-2">
      <button
        className={`py-3 px-3 flex-1 text-sm font-medium ${
          activeSidebarTab === 'tools' 
            ? 'text-blue-600 border-b-2 border-blue-600' 
            : 'text-gray-500 hover:text-gray-700'
        }`}
        onClick={() => setActiveSidebarTab('tools')}
      >
        <div className="flex items-center justify-center">
          <Tool size={16} className="mr-2" />
          {isOpen && <span>Tools</span>}
        </div>
      </button>
      <button
        className={`py-3 px-3 flex-1 text-sm font-medium ${
          activeSidebarTab === 'layers' 
            ? 'text-blue-600 border-b-2 border-blue-600' 
            : 'text-gray-500 hover:text-gray-700'
        }`}
        onClick={() => setActiveSidebarTab('layers')}
      >
        <div className="flex items-center justify-center">
          <Layers size={16} className="mr-2" />
          {isOpen && <span>Layers</span>}
        </div>
      </button>
      <button
        className={`py-3 px-3 flex-1 text-sm font-medium ${
          activeSidebarTab === 'settings' 
            ? 'text-blue-600 border-b-2 border-blue-600' 
            : 'text-gray-500 hover:text-gray-700'
        }`}
        onClick={() => setActiveSidebarTab('settings')}
      >
        <div className="flex items-center justify-center">
          <Sliders size={16} className="mr-2" />
          {isOpen && <span>Settings</span>}
        </div>
      </button>
      <button
        className={`py-3 px-3 flex-1 text-sm font-medium ${
          activeSidebarTab === 'machine' 
            ? 'text-blue-600 border-b-2 border-blue-600' 
            : 'text-gray-500 hover:text-gray-700'
        }`}
        onClick={() => setActiveSidebarTab('machine')}
      >
        <div className="flex items-center justify-center">
          <Database size={16} className="mr-2" />
          {isOpen && <span>Machine</span>}
        </div>
      </button>
    </div>
  );
};

// Content for sidebar based on active tab
const renderSidebarContent = () => {
  return (
    <div 
      ref={contentRef} 
      className="flex-1 overflow-y-auto hide-scrollbar px-2" 
      style={{ overscrollBehavior: 'contain' }}
    >
      {activeSidebarTab === 'tools' && (
        <ToolPanel />
      )}
      
      {activeSidebarTab === 'layers' && (
        <LayerManager />
      )}
      
      {activeSidebarTab === 'settings' && (
        <div className="space-y-4">
          <div>
            <h3 className="text-md font-medium text-gray-900 mb-3">View Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">View Mode</label>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setViewMode('2d')}
                    className={`px-3 py-2 rounded-md text-sm ${
                      viewMode === '2d' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    2D View
                  </button>
                  <button
                    onClick={() => setViewMode('3d')}
                    className={`px-3 py-2 rounded-md text-sm ${
                      viewMode === '3d' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    3D View
                  </button>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Display Options</label>
                <div className="space-y-2">
                  <button
                    onClick={toggleGrid}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm bg-gray-100 hover:bg-gray-200"
                  >
                    <span className="flex items-center">
                      <Grid size={16} className="mr-2" />
                      Show Grid
                    </span>
                    <span className={`h-4 w-8 rounded-full ${gridVisible ? 'bg-blue-600' : 'bg-gray-300'} relative transition-colors duration-200 ease-in-out`}>
                      <span className={`absolute top-0.5 left-0.5 inline-block h-3 w-3 rounded-full bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow transform ${gridVisible ? 'translate-x-4' : ''} transition-transform duration-200 ease-in-out`}></span>
                    </span>
                  </button>
                  <button
                    onClick={toggleAxis}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm bg-gray-100 hover:bg-gray-200"
                  >
                    <span className="flex items-center">
                      {axisVisible ? <Eye size={16} className="mr-2" /> : <EyeOff size={16} className="mr-2" />}
                      Show Axis
                    </span>
                    <span className={`h-4 w-8 rounded-full ${axisVisible ? 'bg-blue-600' : 'bg-gray-300'} relative transition-colors duration-200 ease-in-out`}>
                      <span className={`absolute top-0.5 left-0.5 inline-block h-3 w-3 rounded-full bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow transform ${axisVisible ? 'translate-x-4' : ''} transition-transform duration-200 ease-in-out`}></span>
                    </span>
                  </button>
                </div>
              </div>
              
              <WorkpieceSetup />
              <OriginControls />
            </div>
          </div>
        </div>
      )}
      
      {activeSidebarTab === 'machine' && (
        <MachineConfigManager />
      )}
      
      {/* Navigation only shown on mobile when sidebar is expanded */}
      {isMobile && isOpen && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h4 className="text-xs font-medium text-gray-500 mb-2 px-3">Quick Navigation</h4>
          {navigation.map(item => renderNavItem(item))}
        </div>
      )}
    </div>
  );
};

// Sidebar overlay for mobile
const renderMobileOverlay = () => {
  if (!isMobile || !isOpen) return null;
  
  return (
    <div 
      className="fixed inset-0 z-40 bg-black bg-opacity-50 md:hidden"
      onClick={() => setIsOpen(false)}
    />
  );
};

return (
  <>
    {/* Mobile backdrop */}
    {renderMobileOverlay()}
    
    {/* Sidebar */}
    <motion.div
      ref={sidebarRef}
      className={`flex-shrink-0 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white border-2 border-gray-300 rounded-xl transition-all duration-300 ease-in-out h-full flex flex-col ${
        position === 'left' ? 'border-r mr-0.5' : 'border-l ml-0.5'
      } ${isOpen ? 'w-80' : 'w-16'}`}
      style={{ 
        maxHeight: isMobile ? '100vh' : 'calc(100vh - 4rem)', 
        overflowY: 'hidden',
        overscrollBehavior: 'contain',
        touchAction: 'pan-y' 
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Sidebar tabs */}
      {renderSidebarTabs()}
      
      {/* Sidebar content */}
      {renderSidebarContent()}
      
      {/* Toggle sidebar button */}
      <div className="border-t border-gray-200 p-2 flex justify-center">
        <button
          className="p-2 rounded-md hover:bg-gray-100"
          onClick={() => setIsOpen(!isOpen)}
          title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isOpen ? 
            <ChevronLeft size={20} className="text-gray-600" /> : 
            <ChevronRight size={20} className="text-gray-600" />
          }
        </button>
      </div>
    </motion.div>
  </>
);
};

// Add global style to hide scrollbars but maintain functionality
const GlobalStyle = () => {
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .hide-scrollbar::-webkit-scrollbar {
        width: 4px;
        height: 4px;
      }
      .hide-scrollbar::-webkit-scrollbar-track {
        background: transparent;
      }
      .hide-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(0,0,0,0.1);
        border-radius: 2px;
      }
      .hide-scrollbar {
        scrollbar-width: thin;
        scrollbar-color: rgba(0,0,0,0.1) transparent;
      }
      @media (max-width: 768px) {
        .hide-scrollbar::-webkit-scrollbar {
          width: 2px;
          height: 2px;
        }
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);
  
  return null;
};

export { GlobalStyle };
export default ResponsiveSidebar;