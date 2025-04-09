import Head from 'next/head';
import Image from 'next/image';
import { AlertTriangle } from 'react-feather';
import Link from 'next/link';
import MetaTags from '@/src/components/layout/Metatags';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';

export default function Offline() {
  const { data: session, status } = useSession();
  const router = useRouter(); 
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  } 
  return (
    <>
      <MetaTags title="You're Offline - CAM/CAM FUN" />
      
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-lg text-center">
          <div className="flex justify-center mb-6">
            <img src="/logo.png" alt="CAM/CAM FUN Logo" className="h-24" />
          </div>
          
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-yellow-100 p-3">
              <AlertTriangle className="w-8 h-8 text-yellow-600" />
            </div>
          </div>
          
          <h1 className="text-2xl font-bold text-gray-800 mb-2">You are Offline</h1>
          
          <p className="text-gray-600 mb-6">
            It looks like you ve lost your internet connection. Some features may be unavailable until you are back online.
          </p>
          
          <div className="space-y-3">
            <Link 
              href="/"
              className="block w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Try Again
            </Link>
            
            <button
              onClick={() => {
                // Try to reload cached content
                window.location.reload();
              }}
              className="block w-full py-2 px-4 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Reload Page
            </button>
          </div>
          
          <div className="mt-6 text-sm text-gray-500">
            <p>You can still access cached content while offline.</p>
          </div>
        </div>
      </div>
    </>
  );
}
