import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { EyeIcon, EyeOffIcon, KeyIcon, FingerprintIcon, Mail, Github } from "lucide-react";
import Link from "next/link";
import MetaTags from "@/src/components/layout/Metatags";
import Navbar from "@/src/components/layout/Navbar";
import Footer from "@/src/components/ui/Footer";
import { useAuth } from "@/src/contexts/AuthContext";
import { useAuthRedirect } from "@/src/hooks/useAuthRedirect";

export default function SignIn() {
  const router = useRouter();
  const { signIn, signInWithPasskey, signInWithGitHub, sendMagicLink, authError, clearAuthError, isAuthenticated } = useAuth();

  // Use redirect hook per gestire auth redirects intelligentemente
  const { isRedirecting } = useAuthRedirect();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isPasskeySupported, setIsPasskeySupported] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  // Check passkey support on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.PublicKeyCredential) {
      setIsPasskeySupported(true);
    }
  }, []);

  // Clear errors quando user inizia a digitare
  useEffect(() => {
    if (localError || authError) {
      clearAuthError();
      setLocalError("");
    }
  }, [email, password, clearAuthError, localError, authError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLocalError("");
    clearAuthError();

    try {
      const result = await signIn({ email, password });

      if (result?.error) {
        setLocalError(typeof result.error === 'string' ? result.error : 'Authentication failed');
      }
      // Il redirect viene gestito automaticamente dal AuthContext
    } catch (error) {
      setLocalError("An unexpected error occurred");
      console.error("Sign in error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasskeySignIn = async () => {
    setPasskeyLoading(true);
    setLocalError("");
    clearAuthError();

    try {
      await signInWithPasskey();
      // Il redirect viene gestito automaticamente dal AuthContext
    } catch (error: any) {
      console.error("Passkey sign in error:", error);
      setLocalError(error.message || "Failed to sign in with passkey. Please try again or use email and password.");
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email || !email.includes('@')) {
      setLocalError("Please enter a valid email address");
      return;
    }

    setMagicLinkLoading(true);
    setLocalError("");
    clearAuthError();

    try {
      const result = await sendMagicLink(email);

      if (result.success) {
        setMagicLinkSent(true);
        if (result && (result as any).showConsoleHint) {
          // Show additional instruction for console check
          console.log("🔗 Magic link generated! Look for the link above in the console.");
        }
      } else {
        setLocalError(result.message || "Failed to send magic link");
      }
    } catch (error: any) {
      console.error("Magic link error:", error);
      setLocalError("Failed to send magic link. Please try again.");
    } finally {
      setMagicLinkLoading(false);
    }
  };

  const handleGitHubSignIn = async () => {
    setGithubLoading(true);
    setLocalError("");
    clearAuthError();

    try {
      await signInWithGitHub("/");
      // The redirect will be handled by the OAuth flow
    } catch (error: any) {
      console.error("GitHub sign in error:", error);
      setLocalError(error.message || "Failed to sign in with GitHub. Please try again.");
    } finally {
      setGithubLoading(false);
    }
  };

  // Display error (prioritize localError over authError)
  const displayError = localError || authError;

  const containerVariants: Variants = {
    hidden: { opacity: 0, y: 50 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: "easeOut",
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: "easeOut" }
    }
  };

  const logoVariants: Variants = {
    hidden: { scale: 0.8, opacity: 0, rotate: -10 },
    visible: {
      scale: 1,
      opacity: 1,
      rotate: 0,
      transition: {
        duration: 0.8,
        ease: "easeOut",
        type: "spring",
        stiffness: 100
      }
    }
  };

  return (
    <>
      <MetaTags
        ogImage="/og-image.png"
        title="Sign In - CAD/CAM FUN"
        description="Sign in to access your CAD/CAM workspace with advanced 2D/3D design and AI capabilities."
      />
      <Navbar />

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-indigo-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="max-w-md w-full space-y-8"
        >
          {/* Card Container */}
          <motion.div
            variants={itemVariants}
            className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 p-8 sm:p-10"
          >
            {/* Logo and Header */}
            <motion.div variants={itemVariants} className="text-center">
              <motion.div
                variants={logoVariants}
                className="flex justify-center mb-8"
              >
                <div className="relative">
                  <motion.img
                    src="/logo.png"
                    alt="CAD/CAM FUN"
                    className="h-24 w-auto"
                    whileHover={{ scale: 1.05 }}
                    transition={{ duration: 0.2 }}
                  />
                  <motion.div
                    className="absolute -inset-4 bg-gradient-to-r from-blue-500/20 to-indigo-500/20 rounded-full blur-xl"
                    animate={{
                      scale: [1, 1.1, 1],
                      opacity: [0.5, 0.8, 0.5]
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  />
                </div>
              </motion.div>

              <motion.h2
                variants={itemVariants}
                className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent mb-2"
              >
                Welcome Back
              </motion.h2>

              <motion.p
                variants={itemVariants}
                className="text-gray-600 dark:text-gray-400 mb-8"
              >
                Sign in to continue your design journey
              </motion.p>
            </motion.div>

            {/* GitHub Sign In Button */}
            <motion.div variants={itemVariants} className="mb-6">
              <motion.button
                type="button"
                onClick={handleGitHubSignIn}
                disabled={githubLoading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="group relative w-full flex justify-center py-3 px-4 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-xl text-white bg-gradient-to-r from-gray-800 to-gray-900 hover:from-gray-900 hover:to-black focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                <AnimatePresence mode="wait">
                  {githubLoading ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center"
                    >
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2"
                      />
                      Signing in with GitHub...
                    </motion.div>
                  ) : (
                    <motion.div
                      key="github"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center"
                    >
                      <Github className="h-5 w-5 mr-2" />
                      Continue with GitHub
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            </motion.div>

            {/* Passkey Sign In Button */}
            {isPasskeySupported && (
              <motion.div variants={itemVariants} className="mb-6">
                <motion.button
                  type="button"
                  onClick={handlePasskeySignIn}
                  disabled={passkeyLoading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="group relative w-full flex justify-center py-3 px-4 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-xl text-gray-700 dark:text-gray-300 bg-white/50 dark:bg-gray-700/50 hover:bg-white/70 dark:hover:bg-gray-700/70 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  <AnimatePresence mode="wait">
                    {passkeyLoading ? (
                      <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center"
                      >
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="w-5 h-5 border-2 border-current border-t-transparent rounded-full mr-2"
                        />
                        Authenticating...
                      </motion.div>
                    ) : (
                      <motion.div
                        key="passkey"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center"
                      >
                        <FingerprintIcon className="h-5 w-5 mr-2" />
                        Sign in with Passkey
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              </motion.div>
            )}

            {/* Divider */}
            <motion.div variants={itemVariants} className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-600" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white/80 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400">
                  Or continue with email
                </span>
              </div>
            </motion.div>

            {/* Error Message */}
            <AnimatePresence>
              {displayError && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl"
                >
                  <span className="block text-sm">{displayError}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Form */}
            <motion.form variants={itemVariants} onSubmit={handleSubmit} className="space-y-6">
              {/* Email Field */}
              <motion.div variants={itemVariants}>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email Address
                </label>
                <motion.input
                  whileFocus={{ scale: 1.02 }}
                  transition={{ duration: 0.2 }}
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-all duration-200"
                  placeholder="Enter your email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </motion.div>

              {/* Password Field */}
              <motion.div variants={itemVariants}>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Password
                </label>
                <div className="relative">
                  <motion.input
                    whileFocus={{ scale: 1.02 }}
                    transition={{ duration: 0.2 }}
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-all duration-200"
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-4 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    <motion.div
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      {showPassword ? (
                        <EyeOffIcon className="h-5 w-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                      ) : (
                        <EyeIcon className="h-5 w-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                      )}
                    </motion.div>
                  </button>
                </div>
              </motion.div>

              {/* Remember Me & Forgot Password */}
              <motion.div variants={itemVariants} className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                    Remember me
                  </label>
                </div>

                <div className="text-sm">
                  <Link
                    href="/auth/forgot-password"
                    className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 transition-colors duration-200"
                  >
                    <motion.span whileHover={{ scale: 1.05 }}>
                      Forgot password?
                    </motion.span>
                  </Link>
                </div>
              </motion.div>

              {/* Submit Button */}
              <motion.div variants={itemVariants}>
                <motion.button
                  type="submit"
                  disabled={isLoading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-xl text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  <AnimatePresence mode="wait">
                    {isLoading ? (
                      <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center"
                      >
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2"
                        />
                        Signing in...
                      </motion.div>
                    ) : (
                      <motion.span
                        key="signin"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        Sign In
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </motion.div>
            </motion.form>

            {/* Magic Link Section */}
            {!magicLinkSent ? (
              <motion.div variants={itemVariants} className="mt-6">
                <motion.button
                  type="button"
                  onClick={handleMagicLink}
                  disabled={magicLinkLoading || !email}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="group relative w-full flex justify-center py-3 px-4 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-xl text-gray-700 dark:text-gray-300 bg-white/50 dark:bg-gray-700/50 hover:bg-white/70 dark:hover:bg-gray-700/70 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  <AnimatePresence mode="wait">
                    {magicLinkLoading ? (
                      <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center"
                      >
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="w-5 h-5 border-2 border-current border-t-transparent rounded-full mr-2"
                        />
                        Sending Magic Link...
                      </motion.div>
                    ) : (
                      <motion.div
                        key="magic-link"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center"
                      >
                        <Mail className="h-5 w-5 mr-2" />
                        Send Magic Link
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
                  Generate a secure sign-in link (appears in console)
                </p>
              </motion.div>
            ) : (
              <motion.div
                variants={itemVariants}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 px-4 py-3 rounded-xl text-center"
              >
                <div className="flex items-center justify-center mb-2">
                  <Mail className="h-5 w-5 mr-2" />
                  <span className="font-medium">Magic Link Generated!</span>
                </div>
                <p className="text-sm mb-2">
                  Check the browser console (F12) for your magic link.
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-300">
                  💡 Open Developer Tools → Console tab to see the link
                </p>
              </motion.div>
            )}

            {/* Waitlist Link */}
            <motion.div variants={itemVariants} className="mt-8 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Don&apos;t have an account?{" "}
                <Link
                  href="/waitlist"
                  className="font-semibold text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 transition-colors duration-200"
                >
                  <motion.span whileHover={{ scale: 1.05 }}>
                    Join the Waitlist
                  </motion.span>
                </Link>
              </p>
            </motion.div>
          </motion.div>

          {/* Floating Elements */}
          <motion.div
            className="absolute top-10 left-10 w-20 h-20 bg-blue-500/10 rounded-full blur-xl"
            animate={{
              y: [0, -20, 0],
              x: [0, 10, 0],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          <motion.div
            className="absolute bottom-10 right-10 w-32 h-32 bg-indigo-500/10 rounded-full blur-xl"
            animate={{
              y: [0, 20, 0],
              x: [0, -10, 0],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        </motion.div>
      </div>

      <Footer />
    </>
  );
}
