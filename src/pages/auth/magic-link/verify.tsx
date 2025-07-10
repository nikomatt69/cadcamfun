// src/pages/auth/magic-link/verify.tsx
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { motion } from "framer-motion";
import Link from "next/link";
import MetaTags from "@/src/components/layout/Metatags";
import Navbar from "@/src/components/layout/Navbar";
import Footer from "@/src/components/ui/Footer";
import { useAuth } from "@/src/contexts/AuthContext";
import { useTauri } from "@/src/hooks/useTauri";

export default function MagicLinkVerify() {
  const router = useRouter();
  const { refreshSession } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'expired'>('loading');
  const [message, setMessage] = useState('');
  const { httpFetch } = useTauri();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);
  useEffect(() => {
    const verifyToken = async () => {
      const { token, email } = router.query;

      if (!token || !email) {
        setStatus('error');
        setMessage('Invalid magic link');
        return;
      }

      try {
        const response = await httpFetch(`${process.env.NEXTAUTH_URL}/api/auth/magic-link/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, email }),
          credentials: 'include'
        });

        const result = await response.json();

        if (response.ok && result.success) {
          setStatus('success');
          setMessage('Successfully signed in!');

          // Refresh session and redirect
          await refreshSession();
          setTimeout(() => {
            router.push('/');
          }, 2000);
        } else {
          if (result.error?.includes('expired')) {
            setStatus('expired');
            setMessage('Magic link has expired');
          } else {
            setStatus('error');
            setMessage(result.error || 'Invalid magic link');
          }
        }
      } catch (error) {
        console.error('Magic link verification error:', error);
        setStatus('error');
        setMessage('Failed to verify magic link');
      }
    };

    if (isClient && router.isReady) {
      verifyToken();
    }
  }, [isClient, router.isReady, router.query, refreshSession, router, httpFetch]);

  return (
    <>
      <MetaTags
        title="Magic Link Verification - CAD/CAM FUN"
        description="Verifying your secure sign-in link"
      />
      <Navbar />

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-indigo-900 flex items-center justify-center py-12 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full"
        >
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 p-8 text-center">

            {status === 'loading' && (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"
                />
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  Verifying Magic Link
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Please wait while we sign you in...
                </p>
              </>
            )}

            {status === 'success' && (
              <>
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  Welcome Back!
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  {message}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Redirecting you to your dashboard...
                </p>
              </>
            )}

            {status === 'expired' && (
              <>
                <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  Link Expired
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  This magic link has expired. Please request a new one.
                </p>
                <Link
                  href="/auth/signin"
                  className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Get New Magic Link
                </Link>
              </>
            )}

            {status === 'error' && (
              <>
                <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  Invalid Link
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  {message}
                </p>
                <Link
                  href="/auth/signin"
                  className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Try Again
                </Link>
              </>
            )}
          </div>
        </motion.div>
      </div>

      <Footer />
    </>
  );
}