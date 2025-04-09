import Link from 'next/link';
import { useRouter } from 'next/router';
import { Grid, Home, Tool, User, FileText, Menu } from 'react-feather';
import { useState, useEffect } from 'react';
import ResourcesBottomSheet from './ResourcesBottomSheet';

const BottomNavigation = () => {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollPosition, setLastScrollPosition] = useState(0);

  // Hide bottom navigation when scrolling down, show when scrolling up
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollPosition = window.scrollY;
      const mainElement = document.querySelector('main');
      const mainScrollPosition = mainElement ? mainElement.scrollTop : 0;
      
      // Use either window scroll or main element scroll, whichever is greater
      const effectiveScrollPosition = Math.max(currentScrollPosition, mainScrollPosition);
      
      // Determine if the user is scrolling up or down
      const isScrollingDown = effectiveScrollPosition > lastScrollPosition;
      
      // Only toggle visibility if we've scrolled a significant amount (10px)
      if (Math.abs(effectiveScrollPosition - lastScrollPosition) > 10) {
        setIsVisible(!isScrollingDown);
        setLastScrollPosition(effectiveScrollPosition);
      }
    };

    // Add scroll listeners
    window.addEventListener('scroll', handleScroll, { passive: true });
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
  }, [lastScrollPosition]);

  const isActivePath = (path: string) => router.pathname === path;

  return (
    <div className={`transition-transform duration-300 fixed rounded-t-xl inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-800 md:hidden ${
      isVisible ? 'translate-y-0' : 'translate-y-full'
    }`}>
      <div className="grid grid-cols-5 h-14">
        <Link href="/" className="flex flex-col items-center justify-center">
          <Home className={`h-5 w-5 ${isActivePath('/') ? 'text-blue-600' : 'text-gray-500'}`} />
          <span className={`mt-1 text-xs ${isActivePath('/') ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>
            Home
          </span>
        </Link>

        <Link href="/cad" className="flex flex-col items-center justify-center">
          <Grid className={`h-5 w-5 ${isActivePath('/cad') ? 'text-blue-600' : 'text-gray-500'}`} />
          <span className={`mt-1 text-xs ${isActivePath('/cad') ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>
            CAD
          </span>
        </Link>
        
        <ResourcesBottomSheet />
        
        
        
        <Link href="/cam" className="flex flex-col items-center justify-center">
          <Tool className={`h-5 w-5 ${isActivePath('/cam') ? 'text-blue-600' : 'text-gray-500'}`} />
          <span className={`mt-1 text-xs ${isActivePath('/cam') ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>
            CAM
          </span>
        </Link>
        
        <Link href="/profile" className="flex flex-col items-center justify-center">
          <User className={`h-5 w-5 ${isActivePath('/profile') ? 'text-blue-600' : 'text-gray-500'}`} />
          <span className={`mt-1 text-xs ${isActivePath('/profile') ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>
            Profile
          </span>
        </Link>
      </div>
      
      {/* Safe area padding for iOS devices */}
      <div className="h-safe-bottom bg-white dark:bg-gray-800"></div>
    </div>
  );
};

export default BottomNavigation;