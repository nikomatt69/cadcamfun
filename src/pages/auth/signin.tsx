import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { authClient, signIn, sendMagicLink, signInWithPasskey } from '@/src/lib/auth-client';
import PasskeyAuth from '@/src/components/auth/PasskeyAuth';
import MetaTags from '@/src/components/layout/Metatags';
import Navbar from '@/src/components/layout/Navbar';
import Footer from '@/src/components/ui/Footer';

export default function SignIn() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkEmail, setMagicLinkEmail] = useState('');

  const handleEmailSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setLoadingType('email');
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      const result = await signIn.email({
        email,
        password,
      });

      if (result instanceof Error) {
        setError(result.message || 'Authentication failed');
      } else {
        router.push('/');
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred');
    } finally {
      setIsLoading(false);
      setLoadingType(null);
    }
  };

  const handleGitHubSignIn = async () => {
    setIsLoading(true);
    setLoadingType('github');
    setError(null);

    try {
      await authClient.signIn.social({
        provider: 'github',
        callbackURL: 'https://cadcamfun.xyz/api/auth/callback/github',
      });

    } catch (error: any) {
      setError(error.message || 'GitHub sign in failed');
    } finally {
      setIsLoading(false);
      setLoadingType(null);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setLoadingType('google');
    setError(null);

    try {
      await signIn.social({
        provider: 'google',
        callbackURL: '/',
      });
    } catch (error: any) {
      setError(error.message || 'Google sign in failed');
    } finally {
      setIsLoading(false);
      setLoadingType(null);
    }
  };

  const handlePasskeySignIn = async () => {
    setIsLoading(true);
    setLoadingType('passkey');
    setError(null);

    try {
      await signInWithPasskey();
      router.push('/');
    } catch (error: any) {
      setError(error.message || 'Passkey authentication failed');
    } finally {
      setIsLoading(false);
      setLoadingType(null);
    }
  };

  const handleMagicLink = async () => {
    if (!magicLinkEmail || !magicLinkEmail.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    setLoadingType('magic-link');
    setError(null);

    try {
      const result = await sendMagicLink(magicLinkEmail, '/');
      if (result.success || result.message) {
        setMagicLinkSent(true);
      } else {
        setError('Failed to send magic link');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to send magic link');
    } finally {
      setIsLoading(false);
      setLoadingType(null);
    }
  };

  return (
    <>
      <MetaTags
        ogImage="/og-image.png"
        title="Sign In - CAD/CAM FUN"
        description="Sign in to access your CAD/CAM workspace"
      />
      <Navbar />

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          {/* Glass Card */}
          <div className="backdrop-blur-md bg-white/80 dark:bg-gray-900/80 rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/30 p-8">

            {/* Header */}
            <div className="text-center mb-8">
              <img src="/logo.png" alt="CAD/CAM FUN" className="h-16 w-auto mx-auto mb-4" />
              <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Sign In
              </h2>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Welcome back to CAD/CAM FUN
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl mb-6">
                {error}
              </div>
            )}

            {/* Social Sign In Buttons */}
            <div className="space-y-3 mb-6">
              <button
                type="button"
                onClick={handleGitHubSignIn}
                disabled={isLoading && loadingType === 'github'}
                className="w-full bg-gray-800 text-white py-3 px-4 rounded-xl hover:bg-gray-900 disabled:opacity-50 flex items-center justify-center font-medium transition-colors"
              >
                {isLoading && loadingType === 'github' ? 'Signing in...' : 'Continue with GitHub'}
              </button>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading && loadingType === 'google'}
                className="w-full bg-red-600 text-white py-3 px-4 rounded-xl hover:bg-red-700 disabled:opacity-50 flex items-center justify-center font-medium transition-colors"
              >
                {isLoading && loadingType === 'google' ? 'Signing in...' : 'Continue with Google'}
              </button>
            </div>

            {/* Passkey Authentication */}
            <div className="mb-6">
              <button
                type="button"
                onClick={handlePasskeySignIn}
                disabled={isLoading && loadingType === 'passkey'}
                className="w-full bg-indigo-600 text-white py-3 px-4 rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center font-medium transition-colors"
              >
                {isLoading && loadingType === 'passkey' ? 'Authenticating...' : '🔐 Sign in with Passkey'}
              </button>
            </div>

            {/* Divider */}
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-600" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white/80 dark:bg-gray-900/80 text-gray-500 dark:text-gray-400">
                  Or continue with email
                </span>
              </div>
            </div>

            {/* Email/Password Form */}
            <form className="space-y-6 mb-6" onSubmit={handleEmailSignIn}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/50 dark:bg-gray-700/50 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Enter your email"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/50 dark:bg-gray-700/50 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Enter your password"
                />
              </div>

              <div className="flex items-center justify-between">
                <Link
                  href="/auth/forgot-password"
                  className="text-sm text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={isLoading && loadingType === 'email'}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white py-3 px-4 rounded-xl font-medium disabled:opacity-50 transition-all shadow-lg hover:shadow-xl"
              >
                {isLoading && loadingType === 'email' ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            {/* Magic Link Section */}
            {!magicLinkSent ? (
              <div className="space-y-3 mb-6">
                <div>
                  <label htmlFor="magic-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email for Magic Link
                  </label>
                  <input
                    id="magic-email"
                    name="magic-email"
                    type="email"
                    value={magicLinkEmail}
                    onChange={(e) => setMagicLinkEmail(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/50 dark:bg-gray-700/50 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    placeholder="Enter your email"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleMagicLink}
                  disabled={isLoading && loadingType === 'magic-link'}
                  className="w-full bg-purple-600 text-white py-3 px-4 rounded-xl hover:bg-purple-700 disabled:opacity-50 font-medium transition-colors"
                >
                  {isLoading && loadingType === 'magic-link' ? 'Sending...' : '✨ Send Magic Link'}
                </button>
              </div>
            ) : (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 px-4 py-3 rounded-xl mb-6">
                Magic link sent! Check your email (and browser console for demo).
              </div>
            )}

            {/* Sign Up Link */}
            <div className="text-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Don't have an account?{' '}
                <Link href="/auth/signup" className="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors">
                  Sign up
                </Link>
              </span>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}
