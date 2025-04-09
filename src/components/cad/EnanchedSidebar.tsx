// src/components/cad/EnhancedSidebar.tsx
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { 
  Home, Grid, Tool, Package, Users, Settings, 
  FileText, Server, Database, HelpCircle, BookOpen,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  PlusSquare, Circle, Box, Sliders, Layers, Eye, EyeOff,
  DollarSign,
  User,
  BarChart2,
  Activity,
  Airplay,
  Globe
} from 'react-feather';
import { useCADStore } from 'src/store/cadStore';
import ToolPanel from './ToolPanel';
import LayerManager from './LayerManager';
import WorkpieceSetup from './WorkpieceSetup';
import MachineConfigManager from './MachineConfigManager';
import SettingsPanel from './SettingPanel';
import CAMWorkpieceSetup from '../cam/CamWorkpieceSetup';
import LibrarySection from '../ui/LibrarySection';
import OriginControls from './OriginControls';
import ToolBrowser from '../cam/ToolBroswer';
import MaterialBrowser from '../cam/MaterialBroswer';
import SnapSettings from './SnapSettings';
import { fetchOrganizationById } from '@/src/lib/api/organizations';
import LibraryMenu from './LibraryMenu';
import UnifiedLibraryBrowser from './UnifiedLibraryBrowser';
import UnifiedToolsBrowser, { ToolLibraryItem } from './UnifiedToolsBrowser';
import ToolMenus from '../cam/ToolMenus';

interface EnhancedSidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  activeSidebarTab: 'tools' | 'layers' | 'settings'|'machine';
  setActiveSidebarTab: (tab: 'tools' | 'layers' | 'settings'|'machine') => void;
  onSelectTool?: (tool: any) => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  current?: boolean;
  disable?: boolean
  children?: NavItem[];
}

const EnhancedSidebar: React.FC<EnhancedSidebarProps> = ({ 
  isOpen, 
  setIsOpen, 
  activeSidebarTab, 
  setActiveSidebarTab, 
  onSelectTool
}) => {
  const router = useRouter();
  const { data: session } = useSession();
  const { viewMode, setViewMode, gridVisible, toggleGrid, axisVisible, toggleAxis } = useCADStore();
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({
    projects: true,
    resources: false,
    settings: false
  });
  const [selectedLibraryComponent, setSelectedLibraryComponent] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [selectedLibraryTool, setSelectedLibraryTool] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
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
    const disabled = item.disable ? 'opacity-50 cursor-not-allowed' : '';
    
    return (
      <div key={item.name} className="mb-1">
        <div
          className={`group flex items-center justify-between px-1 py-1 text-sm font-medium rounded-md cursor-pointer transition-colors ${textColor} ${bgColor} ${disabled}`}
          onClick={() => {
            if (hasChildren) {
              toggleExpanded(item.name.toLowerCase());
            } else if (item.href !== '#') {
              router.push(item.href);
            }
          }}
        >
          <div className="flex items-center">
            <span className={`${item.current ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'} mr-3`}>
              {item.icon}
            </span>
            {isOpen && <span>{item.name}</span>}
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
              <div
                key={child.name}
                className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md cursor-pointer ${
                  child.current
                  ? 'text-blue-700 dark:text-blue-400 bg-gray-100 dark:bg-blue-900/20'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/60'
              }`}
              onClick={() => router.push(child.href)}
            >
              <span className="mr-3 text-gray-500 dark:text-gray-400">{child.icon}</span>
              <span>{child.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Content for sidebar based on active tab
const renderSidebarContent = () => {
  if (!isOpen) {
    return (
      <div className="py-4 px-2 flex flex-col items-center">
        {activeSidebarTab === 'machine' && (
          
           <>
    <ToolBrowser/>
    <MaterialBrowser/>
    
    <div className="mt-6 pt-4 border-t border-gray-200">
      <LibrarySection 
        mode="cam" 
        onSelectTool={(tool) => setSelectedLibraryTool(tool.name)}
      />
    </div>
  </>
        )}
        
        {activeSidebarTab === 'tools' && (
          <div className="text-center text-xs text-gray-500 mt-4">
            <Tool size={16} className="mr-2" />
            Tools
          </div>
        )}
        
        {activeSidebarTab === 'settings' && (
          <div className="space-y-4 p-1">
            <button onClick={toggleGrid} className="p-2 rounded-md hover:bg-gray-100" title="Toggle Grid">
              <Grid size={20} className={gridVisible ? "text-blue-600" : "text-gray-600"} />
            </button>
            <button onClick={toggleAxis} className="p-2 rounded-md hover:bg-gray-100" title="Toggle Axis">
              {axisVisible ? <Eye size={20} className="text-blue-600" /> : <EyeOff size={20} className="text-gray-600" />}
            </button>
            <button onClick={() => setViewMode(viewMode === '2d' ? '3d' : '2d')} className="p-2 rounded-md hover:bg-gray-100" title="Toggle View Mode">
              <Box size={20} className={viewMode === '3d' ? "text-blue-600" : "text-gray-600"} />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {activeSidebarTab === 'tools' && <> <ToolMenus onSelectTool={(tool) => {
            setSelectedLibraryTool(tool);
            // Se la prop onSelectTool esiste, chiamala
            if (onSelectTool) {
              onSelectTool(tool);
            }
          }} />
        </>}
      {activeSidebarTab === 'machine' && (
        <>
        
        <OriginControls/>
          <WorkpieceSetup />
          
          
          <div className="mt-6 pt-4 border-t border-gray-200">
            
          </div>
        </>
      )}
      {activeSidebarTab === 'settings' && (
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4">View Settings</h3>
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
            
            <SnapSettings/>
           
          </div>
        </div>
      )}
    </div>
  );
};

return (
  <>
    {/* Mobile sidebar backdrop */}
   
    
    {/* Sidebar */}
    <div
      className={`flex-shrink-0 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white border-2 mr-0.5 rounded-xl border-r transition-all duration-300 ease-in-out h-full flex flex-col  ${
        isOpen ? 'w-80' : 'w-20'
      }`}
    >
      {/* Sidebar tabs */}
      <div className="w-full border-b rounded-xl border-gray-200 bg-gray-50">
        {isOpen ? (
          <>
            
            <button
              className={`flex-1 py-3 px-3 text-sm font-medium ${
                activeSidebarTab === 'tools' 
                  ? 'text-blue-600  border-blue-600' 
                  : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              onClick={() => setActiveSidebarTab('tools')}
            >
              <div className="flex items-center justify-center">
              <Tool size={16} className="mr-2" />
                Tools
              </div>
            </button>
            <button
              className={`flex-1 py-3 px-3 items-center text-sm font-medium ${
                activeSidebarTab === 'settings' 
                  ? 'text-blue-600  border-blue-600' 
                  : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              onClick={() => setActiveSidebarTab('settings')}
            >
              <div className="flex items-center justify-center">
                <Sliders size={16} className="mr-2" />
                Settings
              </div>
            </button>
            <button
              className={`flex-1 py-3 px-3 items-center text-sm font-medium ${
                activeSidebarTab === 'machine' 
                  ? 'text-blue-600  border-blue-600' 
                  : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              onClick={() => setActiveSidebarTab('machine')}
            >
              <div className="flex items-center justify-center">
                <Database size={16} className="mr-2" />
                Macchina
              </div>
            </button>
          </>
        ) : (
          <>
            
            <button
              className={`w-full py-4 flex flex-col items-center justify-center ${
                activeSidebarTab === 'layers' 
                  ? 'text-blue-600 border-b-2 border-blue-600' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveSidebarTab('layers')}
              title="Layers"
            >
              <Layers size={20} />
            </button>
            <button
              className={`w-full py-4 flex flex-col items-center justify-center ${
                activeSidebarTab === 'settings' 
                  ? 'text-blue-600 border-b-2 border-blue-600' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveSidebarTab('settings')}
              title="Settings"
            >
              <Sliders size={20} />
            </button>
            <button
              className={`w-full py-4 flex flex-col items-center justify-center ${
                activeSidebarTab === 'machine' 
                  ? 'text-blue-600 border-b-2 border-blue-600' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveSidebarTab('machine')}
              title="Machine"
            >
              <Database size={20} />
            </button>
          </>
        )}
      </div>
      
      {/* Sidebar content */}
      <div className="flex-1 flex-col  rounded-xl overflow-y-auto">
        {renderSidebarContent()}
      </div>
      
      {/* Navigation from the original sidebar */}
      <div className="mt-2 p-2 overflow-y-auto  rounded-xl border-t  border-gray-200">
        <button 
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-left rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <span className="text-xs text-gray-500">
            {isOpen ? "Quick Navigation" : ""}
          </span>
          <svg 
            className={`w-4 h-4 text-gray-500 transition-transform ${isDropdownOpen ? 'transform rotate-180' : ''}`} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {isDropdownOpen && (
          <div className="space-y-1 scrollbar overflow-y-auto mt-2">
            {navigation.slice(0, isOpen ? undefined : 0).map(item => renderNavItem(item))}
          </div>
        )}
      </div>
      
      {/* Toggle sidebar button */}
      <div className="border-t border-gray-200 p-2 flex justify-center">
        <button
          className="p-2 rounded-md hover:bg-gray-100"
          onClick={() => setIsOpen(!isOpen)}
          title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isOpen ? <ChevronLeft size={20} className="text-gray-600" /> : <ChevronRight size={20} className="text-gray-600" />}
        </button>
      </div>
    </div>
    
    {/* Toggle sidebar button outside for mobile */}
   
  </>
);
};

export default EnhancedSidebar;