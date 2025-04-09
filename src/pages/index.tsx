// src/pages/index.tsx
import Image from 'next/image';
import { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Link from 'next/link';

import { 
  Grid, 
  Tool, 
  File, 
  Box, 
  Layers, 
  Settings, 
  Users, 
  Clock, 
  AlertTriangle,
  ChevronUp,
  BarChart2
} from 'react-feather';
import Loading from '../components/ui/Loading';
import MetaTags from '../components/layout/Metatags';
import { UserHistory } from '@/src/components/analytics/UserHistory';
import { AnalyticsOverview } from '../components/analytics/AnalyticsOverview';
import ActivityChart from '../components/analytics/ActivityChart';
import dynamic from 'next/dynamic';

interface DashboardStats {
  totalProjects: number;
  totalDrawings: number;
  totalComponents: number;
  totalTools: number;
  recentActivities: Activity[];
}

interface Activity {
  id: string;
  type: 'project' | 'drawing' | 'component' | 'tool' | 'gcode';
  action: 'created' | 'updated' | 'deleted' | 'exported';
  itemName: string;
  timestamp: string;
  userId: string;
  userName: string;
}

const Layout = dynamic(
  () => import('@/src/components/layout/Layout'),
  { ssr: false }
);

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  
  // Handle scroll to show/hide "back to top" button
  useEffect(() => {
    const handleScroll = () => {
      // If scrolling inside the Layout, access its container
      const scrollContainer = document.querySelector('main') || window;
      
      if (scrollContainer) {
        const scrollTop = 'scrollTop' in scrollContainer 
          ? scrollContainer.scrollTop 
          : window.pageYOffset;
        
        setShowScrollTop(scrollTop > 300);
      }
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    // Also capture scroll events inside the layout
    const mainElement = document.querySelector('main');
    if (mainElement) {
      mainElement.addEventListener('scroll', handleScroll, { passive: true });
    }

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (mainElement) {
        mainElement.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  // Function to scroll back to top
  const scrollToTop = () => {
    const mainElement = document.querySelector('main');
    if (mainElement) {
      mainElement.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    } else {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  };

  const fetchDashboardData = async () => {
    try {
      const response = await fetch('/api/dashboard');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const [dateRange, setDateRange] = useState<{
    startDate?: Date;
    endDate?: Date;
  }>({
    startDate: new Date(new Date().setDate(new Date().getDate() - 30)), // Last 30 days
    endDate: new Date()
  });

  const isAdmin = false;

  // Use mock data if API isn't implemented yet
  useEffect(() => {
    if (!stats && !isLoading && status === 'authenticated') {
      const mockStats: DashboardStats = {
        totalProjects: 12,
        totalDrawings: 45,
        totalComponents: 27,
        totalTools: 18,
        recentActivities: [
          {
            id: '1',
            type: 'project',
            action: 'updated',
            itemName: 'CNC Fixture',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            userId: '1',
            userName: session?.user?.name || 'User'
          },
          {
            id: '2',
            type: 'drawing',
            action: 'created',
            itemName: 'Front Panel',
            timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            userId: '1',
            userName: session?.user?.name || 'User'
          },
          {
            id: '3',
            type: 'gcode',
            action: 'exported',
            itemName: 'Pocket Operation',
            timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            userId: '1',
            userName: session?.user?.name || 'User'
          },
          {
            id: '4',
            type: 'component',
            action: 'created',
            itemName: 'Mounting Bracket',
            timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
            userId: '1',
            userName: session?.user?.name || 'User'
          },
          {
            id: '5',
            type: 'tool',
            action: 'updated',
            itemName: '1/4" End Mill',
            timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
            userId: '1',
            userName: session?.user?.name || 'User'
          }
        ]
      };
      setStats(mockStats);
    }
  }, [stats, isLoading, status, session]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);
  const toggleChartType = () => {
    setChartType(prev => prev === 'line' ? 'bar' : 'line');
  };
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffDays > 0) {
      return diffDays === 1 ? 'Yesterday' : `${diffDays} days ago`;
    } else if (diffHours > 0) {
      return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
    } else {
      return 'Just now';
    }
  };

  const getActivityIcon = (activity: Activity) => {
    switch (activity.type) {
      case 'project':
        return <File size={20} className="text-purple-500" />;
      case 'drawing':
        return <Grid size={20} className="text-blue-500" />;
      case 'component':
        return <Box size={20} className="text-green-500" />;
      case 'tool':
        return <Tool size={20} className="text-orange-500" />;
      case 'gcode':
        return <Code size={20} className="text-red-500" />;
      default:
        return <Clock size={20} className="text-gray-500" />;
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loading/>
      </div>
    );
  }

  return (
    <>
      <MetaTags />
      <Layout>
        <div className="p-4 sm:p-6" ref={contentRef}>
          {/* Welcome section with system overview */}
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl flex items-center px-2 sm:px-5 font-bold text-gray-900">
              <img src='/logo.png' className='h-12 sm:h-28 mr-2' alt="Logo"/>
            </h1>
            <p className="mt-2 text-base sm:text-lg text-gray-600 px-2 sm:px-0">
              A modern platform for 2D/3D design, parametric modeling, and CNC machine control with AI.
            </p>
          </div>

          {/* Main application modules - Fixed grid for mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
            {/* CAD Card */}
            <div className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow-md rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
              <div className="h-3 bg-blue-600"></div>
              <div className="p-4 sm:p-6">
                <div className="flex items-center mb-4">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-blue-100 flex items-center justify-center mr-3 sm:mr-4">
                    <Grid className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-semibold text-gray-900">CAD Editor</h2>
                    <p className="text-xs sm:text-sm text-gray-500">Create and edit designs</p>
                  </div>
                </div>
                <p className="text-sm sm:text-base text-gray-600 mb-4">
                  Design 2D/3D models with our powerful modeling tools and parametric features.
                </p>
                <button
                  onClick={() => router.push('/cad')}
                  className="bg-blue-600 text-white w-full px-3 sm:px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 text-sm sm:text-base"
                >
                  Open CAD Editor
                </button>
              </div>
            </div>

            {/* CAM Card */}
            <div className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow-md rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
              <div className="h-3 bg-green-600"></div>
              <div className="p-4 sm:p-6">
                <div className="flex items-center mb-4">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-green-100 flex items-center justify-center mr-3 sm:mr-4">
                    <Tool className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-semibold text-gray-900">CAM Editor</h2>
                    <p className="text-xs sm:text-sm text-gray-500">Generate toolpaths</p>
                  </div>
                </div>
                <p className="text-sm sm:text-base text-gray-600 mb-4">
                  Create toolpaths and generate G-code for CNC machining with precision.
                </p>
                <button
                  onClick={() => router.push('/cam')}
                  className="bg-green-600 text-white w-full px-3 sm:px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 text-sm sm:text-base"
                >
                  Open CAM Editor
                </button>
              </div>
            </div>

            {/* Projects Card */}
            <div className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow-md rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
              <div className="h-3 bg-purple-600"></div>
              <div className="p-4 sm:p-6">
                <div className="flex items-center mb-4">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-purple-100 flex items-center justify-center mr-3 sm:mr-4">
                    <File className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Projects</h2>
                    <p className="text-xs sm:text-sm text-gray-500">Manage your work</p>
                  </div>
                </div>
                <p className="text-sm sm:text-base text-gray-600 mb-4">
                  Organize and manage your designs, components, and machining operations.
                </p>
                <button
                  onClick={() => router.push('/projects')}
                  className="bg-purple-600 text-white w-full px-3 sm:px-4 py-2 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 text-sm sm:text-base"
                >
                  Browse Projects
                </button>
              </div>
            </div>
          </div>

          {/* Resources and Tools section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
            {/* Resources section - Full width on mobile, 2/3 width on large screens */}
            <div className="lg:col-span-2">
              <div className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow-md rounded-lg overflow-hidden">
                
                <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {/* Materials */}
                  <Link href="/materials" className="flex items-center p-3 sm:p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-yellow-100 flex items-center justify-center mr-3 sm:mr-4">
                      <Layers className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-600" />
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-md font-medium text-gray-900">Materials</h3>
                      <p className="text-xs sm:text-sm text-gray-500">
                        {stats ? `${stats.totalComponents} materials` : 'Manage materials'}
                      </p>
                    </div>
                  </Link>
                  
                  {/* Components */}
                  <Link href="/components" className="flex items-center p-3 sm:p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-green-100 flex items-center justify-center mr-3 sm:mr-4">
                      <Box className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-md font-medium text-gray-900">Components</h3>
                      <p className="text-xs sm:text-sm text-gray-500">
                        {stats ? `${stats.totalComponents} components` : 'Reusable parts library'}
                      </p>
                    </div>
                  </Link>
                  
                  {/* Machine Configurations */}
                  <Link href="/machine" className="flex items-center p-3 sm:p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-blue-100 flex items-center justify-center mr-3 sm:mr-4">
                      <Settings className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-md font-medium text-gray-900">Machine Configs</h3>
                      <p className="text-xs sm:text-sm text-gray-500">CNC machine settings</p>
                    </div>
                  </Link>
                  
                  {/* Drawing Instruments */}
                  <Link href="/drawing-instruments" className="flex items-center p-3 sm:p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-purple-100 flex items-center justify-center mr-3 sm:mr-4">
                      <Pen className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-md font-medium text-gray-900">Drawing Instruments</h3>
                      <p className="text-xs sm:text-sm text-gray-500">Configure drawing tools</p>
                    </div>
                  </Link>
                </div>
              </div>
            </div>
            
            {/* Tools section - Full width on mobile, 1/3 width on large screens */}
            <div>
              <div className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow-md rounded-lg overflow-hidden">
                <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 flex justify-between items-center">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900">Tools</h2>
                  <Link href={`/tools`} className="text-xs sm:text-sm text-blue-600 hover:text-blue-800">
                    View all
                  </Link>
                </div>
                <div className="p-4 sm:p-6">
                  {stats && stats.totalTools > 0 ? (
                    <div className="text-center py-3 sm:py-4">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-2 sm:mb-3">
                        <Tool className="h-8 w-8 sm:h-10 sm:w-10 text-orange-600" />
                      </div>
                      <h3 className="text-xl sm:text-2xl font-bold text-gray-900">{stats.totalTools}</h3>
                      <p className="text-sm sm:text-base text-gray-500">Cutting tools ready for use</p>
                      <Link href="/tools/index" className="mt-3 sm:mt-4 inline-block text-xs sm:text-sm text-blue-600 hover:text-blue-800">
                        Add a new tool
                      </Link>
                    </div>
                  ) : (
                    <div className="text-center py-4 sm:py-6">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                        <Tool className="h-6 w-6 sm:h-8 sm:w-8 text-gray-400" />
                      </div>
                      <h3 className="text-sm sm:text-base text-gray-900 font-medium mb-2">No Tools Yet</h3>
                      <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4">
                        Add your cutting tools to use in CAM operations
                      </p>
                      <Link 
                        href="/tools"
                        className="inline-flex items-center px-2 sm:px-3 py-1 sm:py-2 border border-transparent text-xs sm:text-sm leading-4 font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                      >
                        <Plus className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                        Add First Tool
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow-md rounded-lg flex flex-col overflow-hidden">
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">Recent Activity</h2>
            </div>
            <div className="divide-y divide-gray-200 max-h-72 sm:max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
              <div className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white shadow rounded-lg p-4 sm:p-6">
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mb-4 sm:mb-6">
                  This page shows all your activity across the platform. 
                </p>
                
                <div className="mt-6">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Activity Trends</h2>
              <button
                onClick={toggleChartType}
                className="flex items-center text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              >
                <BarChart2 className="h-4 w-4 mr-1" />
                {chartType === 'line' ? 'Show Bar Chart' : 'Show Line Chart'}
              </button>
            </div>
            <ActivityChart 
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              chartType={chartType}
            />
          </div>
              </div>
            </div>
          </div>
          
          {/* Space at the end to ensure scrolling */}
          <div className="h-4 sm:h-6"></div>
        </div>
        
        {/* Back to Top button */}
        {showScrollTop && (
          <button
            onClick={scrollToTop}
            className="fixed bottom-16 sm:bottom-6 right-4 sm:right-6 p-2 sm:p-3 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 focus:outline-none transition-all duration-300 z-40"
            aria-label="Back to top"
          >
            <ChevronUp size={16} className="sm:size-20" />
          </button>
        )}
      </Layout>
    </>
  );
}

// Missing components
const Plus = ({ className = "", ...props }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={`feather feather-plus ${className}`}
    {...props}
  >
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

const Pen = ({ className = "", ...props }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={`feather feather-pen ${className}`}
    {...props}
  >
    <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
    <path d="M2 2l7.586 7.586"></path>
    <circle cx="11" cy="11" r="2"></circle>
  </svg>
);

const Code = ({ className = "", ...props }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={`feather feather-code ${className}`}
    {...props}
  >
    <polyline points="16 18 22 12 16 6"></polyline>
    <polyline points="8 6 2 12 8 18"></polyline>
  </svg>
);