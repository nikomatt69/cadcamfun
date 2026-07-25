import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { signUp, signIn, sendMagicLink, addPasskey } from '@/src/lib/auth-client';
import MetaTags from '@/src/components/layout/Metatags';
import Navbar from '@/src/components/layout/Navbar';
import Footer from '@/src/components/ui/Footer';

export default function SignUp() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkEmail, setMagicLinkEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setLoadingType('email');
    setError(null);

    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      const result = await signUp.email({ name, email, password });
      if (result instanceof Error) {
        setError(result.message || 'Sign up failed');
      } else {
        router.push('/');
      }
    } catch (error: any) {
      setError(error.message || 'Sign up failed');
    } finally {
      setIsLoading(false);
      setLoadingType(null);
    }
  };

  const handleGitHubSignUp = async () => {
    setIsLoading(true);
    setLoadingType('github');
    setError(null);

    try {
      await signIn.social({
        provider: 'github',
        callbackURL: '/',
      });
    } catch (error: any) {
      setError(error.message || 'GitHub sign up failed');
    } finally {
      setIsLoading(false);
      setLoadingType(null);
    }
  };

  const handleGoogleSignUp = async () => {
    setIsLoading(true);
    setLoadingType('google');
    setError(null);

    try {
      await signIn.social({
        provider: 'google',
        callbackURL: '/',
      });
    } catch (error: any) {
      setError(error.message || 'Google sign up failed');
    } finally {
      setIsLoading(false);
      setLoadingType(null);
    }
  };

  const handlePasskeySignUp = async () => {
    setIsLoading(true);
    setLoadingType('passkey');
    setError(null);

    try {
      // Per signup con passkey, l'utente deve prima avere un account
      // Mostra un messaggio educativo
      setError('Please create an account first, then add a passkey from your profile settings.');
    } catch (error: any) {
      setError(error.message || 'Passkey setup failed');
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
        title="Sign Up - CAD/CAM FUN"
        description="Create your CAD/CAM workspace account"
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
                Sign Up
              </h2>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Join CAD/CAM FUN today
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl mb-6">
                {error}
              </div>
            )}

            {/* Social Sign Up Buttons */}
            <div className="space-y-3 mb-6">
              <button
                type="button"
                onClick={handleGitHubSignUp}
                disabled={isLoading && loadingType === 'github'}
                className="w-full bg-gray-800 text-white py-3 px-4 rounded-xl hover:bg-gray-900 disabled:opacity-50 flex items-center justify-center font-medium transition-colors"
              >
                {isLoading && loadingType === 'github' ? 'Connecting...' : 'Sign up with GitHub'}
              </button>

              <button
                type="button"
                onClick={handleGoogleSignUp}
                disabled={isLoading && loadingType === 'google'}
                className="w-full bg-red-600 text-white py-3 px-4 rounded-xl hover:bg-red-700 disabled:opacity-50 flex items-center justify-center font-medium transition-colors"
              >
                {isLoading && loadingType === 'google' ? 'Connecting...' : 'Sign up with Google'}
              </button>
            </div>

            {/* Passkey Info */}
            <div className="mb-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 px-4 py-3 rounded-xl text-sm">
                💡 <strong>Passkey:</strong> Create your account first, then add biometric authentication from your profile settings.
              </div>
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
            <form className="space-y-6 mb-6" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/50 dark:bg-gray-700/50 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Enter your name"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email
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
                  minLength={8}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Password must be at least 8 characters long
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading && loadingType === 'email'}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white py-3 px-4 rounded-xl font-medium disabled:opacity-50 transition-all shadow-lg hover:shadow-xl"
              >
                {isLoading && loadingType === 'email' ? 'Creating account...' : 'Sign Up'}
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

            {/* Sign In Link */}
            <div className="text-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Already have an account?{' '}
                <Link href="/auth/signin" className="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors">
                  Sign in
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
