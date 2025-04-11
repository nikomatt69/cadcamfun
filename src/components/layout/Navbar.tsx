import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession, signOut } from 'next-auth/react';
import { Sun, Moon, Bell, Settings, User, LogOut, Menu, X, Users, Globe, BookOpen, ToggleLeft } from 'react-feather';
import useUserProfileStore from 'src/store/userProfileStore';
import NotificationCenter from '../notifications/NotificationCenter';
import OrganizationChatPage from '@/src/pages/organizations/[id]/chat';

const Navbar = () => {
  const router = useRouter();
  const { data: session } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const { profileImage } = useUserProfileStore(); // Get image from global store
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Close any open dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        profileDropdownOpen && 
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        event.target instanceof HTMLElement &&
        !event.target.closest('#user-menu')
      ) {
        setProfileDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [profileDropdownOpen]);
  
  // Check the stored theme preference on component mount
  
  
  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    // Implement dark/light theme
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    }
  };

  // Handle profile dropdown clicks without bubbling to document
  const handleProfileClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setProfileDropdownOpen(!profileDropdownOpen);
  };

  return (
    <header className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white border-0 dark:bg-gray-800 rounded-b-xl shadow-sm">
      <div className="px-3 sm:px-6 lg:px-8 rounded-b-xl border-2 border-gray-200">
        <div className="flex rounded-b-xl items-center  justify-between h-14 sm:h-16">
          {/* Left section */}
          <div className="flex items-center">
            <button 
              className="mr-2 inline-flex items-center justify-center p-1 sm:p-2 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white focus:outline-none"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
            >
              <span className="sr-only">{mobileMenuOpen ? 'Close main menu' : 'Open main menu'}</span>
              <Menu className="h-6 w-6" />
            </button>
            <Link href="/" className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <img
                  className="h-10 sm:h-14 w-auto"
                  src="/logo.png"
                  alt="CAD/CAM FUN"
                />
              </div>
            </Link>
          </div>

          {/* Right section - Actions */}
          <div className="flex items-center b space-x-1 sm:space-x-4">
            {/* Dark/Light Theme toggle */}
            <button
              onClick={toggleDarkMode}
              className="inline-flex items-center justify-center p-1 sm:p-2 rounded-md text-yellow-500 dark:text-yellow-400 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none"
              aria-label="Toggle dark mode"
            >
              {isDarkMode ? <Sun className="h-5 w-5 sm:h-6 sm:w-6" /> : <Moon className="h-5 w-5 sm:h-6 sm:w-6" />}
            </button>
            <button
            onClick={() => setSidebarOpen(sidebarOpen)}
            className="flex items-center px-4 py-2  text-emerald-400  transition-colors"
          >
            
            <ToggleLeft size={18} className="ml-1" />
          </button>
            {/* Notifications - hide on smallest screens */}
            <button
              className=" sm:inline-flex items-center justify-center p-1 sm:p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none"
              aria-label="View notifications"
            >
               <NotificationCenter />
            </button>

            {/* Settings - hide on smallest screens */}
            <Link 
              href="/settings" 
              className="hidden sm:inline-flex items-center justify-center p-1 sm:p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none"
              aria-label="Settings"
            >
              <Settings className="h-5 w-5 sm:h-6 sm:w-6" />
            </Link>

            {/* User Avatar with Dropdown */}
            <div className="relative">
              <button
                onClick={handleProfileClick}
                className="flex text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                id="user-menu"
                aria-expanded={profileDropdownOpen}
                aria-haspopup="true"
              >
                <span className="sr-only">Open user menu</span>
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-900">
                  {profileImage || session?.user?.image ? (
                    <img
                      src={profileImage || session?.user?.image || ''}
                      alt="Profile"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-blue-100 dark:bg-blue-900">
                      <span className="text-blue-800 dark:text-blue-300 font-medium text-lg">
                        {session?.user?.name?.charAt(0) || 'U'}
                      </span>
                    </div>
                  )}
                </div>
              </button>

              {/* Dropdown menu */}
              {profileDropdownOpen && (
                <div
                  ref={dropdownRef}
                  className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-50"
                  role="menu"
                  aria-orientation="vertical"
                  aria-labelledby="user-menu"
                >
                  <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{session?.user?.name || 'User'}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{session?.user?.email || 'user@example.com'}</p>
                  </div>
                  
                  <Link
                    href="/profile"
                    className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                    role="menuitem"
                  >
                    <User size={16} className="mr-2" />
                    My Profile
                  </Link>
                  
                  <Link
                    href="/settings"
                    className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                    role="menuitem"
                  >
                    <Settings size={16} className="mr-2" />
                    Settings
                  </Link>

                  <Link
                    href="/organizations"
                    className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                    role="menuitem"
                  >
                    <Users size={16} className="mr-2" />
                    Organizations
                  </Link>
                  <Link
                    href="https://site.cadcamfun.xyz"
                    className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                    role="menuitem"
                  >
                    <Globe size={16} className="mr-2" />
                   Website
                  </Link>
                  <Link
                    href="https://docs.cadcamfun.xyz"
                    className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                    role="menuitem"
                  >
                    <BookOpen size={16} className="mr-2" />
                   Documentation
                  </Link>

                  <button
                    onClick={() => signOut()}
                    className="w-full text-left block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                    role="menuitem"
                  >
                    <LogOut size={16} className="mr-2" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Mobile menu, show/hide based on menu state */}
      {mobileMenuOpen && (
        <div className="sm:hidden" id="mobile-menu">
          <div className="px-2 pt-2 pb-3 border-2 border-gray-200 space-y-1">
            <Link
              href="/"
              className={`block px-3 py-2 rounded-md text-base font-medium ${
                router.pathname === '/' 
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300' 
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              Dashboard
            </Link>
            <Link
              href="/projects"
              className={`block px-3 py-2 rounded-md text-base font-medium ${
                router.pathname.startsWith('/projects') 
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300' 
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              Projects
            </Link>
            <Link
              href="/cad"
              className={`block px-3 py-2 rounded-md text-base font-medium ${
                router.pathname === '/cad' 
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300' 
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              CAD Editor
            </Link>
            <Link
              href="/cam"
              className={`block px-3 py-2 rounded-md text-base font-medium ${
                router.pathname === '/cam' 
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300' 
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              CAM Editor
            </Link>
            <Link
              href="/components"
              className={`block px-3 py-2 rounded-md text-base font-medium ${
                router.pathname.startsWith('/components') 
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300' 
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              Components
            </Link>
            <Link
              href="/settings"
              className={`block px-3 py-2 rounded-md text-base font-medium ${
                router.pathname === '/settings' 
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300' 
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              Settings
            </Link>
            <Link
              href="/organizations"
              className={`block px-3 py-2 rounded-md text-base font-medium ${
                router.pathname === '/organizations' 
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300' 
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              Organizations
            </Link>
            <Link
              href={`/organizations/${OrganizationChatPage}`}
              className={`block px-3 py-2 rounded-md text-base font-medium ${
                router.pathname === '/chat' 
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300' 
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              Chat
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;