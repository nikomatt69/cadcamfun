import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { KeyIcon, EyeIcon, EyeOffIcon, CheckCircleIcon } from "lucide-react";
import MetaTags from "@/src/components/layout/Metatags";
import Navbar from "@/src/components/layout/Navbar";
import Footer from "@/src/components/ui/Footer";
import { useTauri } from "@/src/hooks/useTauri";

export default function ResetPassword() {
  const router = useRouter();
  const { token } = router.query;
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<"form" | "success" | "error">("form");
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const { httpFetch } = useTauri();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isClient && !token) {
      setStatus("error");
      setError("Invalid or missing reset token");
    }
  }, [isClient, token]);

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!password) {
      errors.password = "Password is required";
    } else if (password.length < 8) {
      errors.password = "Password must be at least 8 characters";
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {

      const response = await httpFetch(`${process.env.NEXTAUTH_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          token: token as string,
          password
        })
      });

      const data = await response.json();

      if (response.ok) {
        setStatus("success");
        // Redirect to signin after 3 seconds
        setTimeout(() => {
          router.push(`${process.env.NEXTAUTH_URL}/auth/signin`);
        }, 3000);
      } else {
        setError(data.message || "Failed to reset password");
      }
    } catch (error) {
      setError("An unexpected error occurred");
      console.error("Reset password error:", error);
    } finally {
      setIsLoading(false);
    }
  };

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

  if (status === "error" && !token) {
    return (
      <>
        <MetaTags
          ogImage="/og-image.png"
          title="Reset Password - CAD/CAM FUN"
          description="Reset your password to regain access to your account."
        />
        <Navbar />

        <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-red-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full text-center">
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 p-8">
              <div className="text-red-500 mb-4">
                <KeyIcon className="h-16 w-16 mx-auto" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Invalid Reset Link
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                This password reset link is invalid or has expired.
              </p>
              <button
                onClick={() => router.push("/auth/forgot-password")}
                className="w-full bg-gradient-to-r from-red-600 to-pink-600 text-white py-3 px-4 rounded-xl hover:from-red-700 hover:to-pink-700 transition-all duration-200"
              >
                Request New Reset Link
              </button>
            </div>
          </div>
        </div>

        <Footer />
      </>
    );
  }

  return (
    <>
      <MetaTags
        ogImage="/og-image.png"
        title="Reset Password - CAD/CAM FUN"
        description="Set a new password for your account."
      />
      <Navbar />

      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-green-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="max-w-md w-full space-y-8"
        >
          <motion.div
            variants={itemVariants}
            className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 p-8 sm:p-10"
          >

            <AnimatePresence mode="wait">
              {status === "form" && (
                <motion.div
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {/* Header */}
                  <motion.div variants={itemVariants} className="text-center mb-8">
                    <motion.div
                      className="flex justify-center mb-6"
                      whileHover={{ scale: 1.05 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="p-4 bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-full">
                        <KeyIcon className="h-12 w-12 text-green-600 dark:text-green-400" />
                      </div>
                    </motion.div>

                    <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent mb-2">
                      Reset Password
                    </h2>

                    <p className="text-gray-600 dark:text-gray-400">
                      Enter your new password below.
                    </p>
                  </motion.div>

                  {/* Error Message */}
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl"
                      >
                        <span className="block text-sm">{error}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Form */}
                  <motion.form variants={itemVariants} onSubmit={handleSubmit} className="space-y-6">
                    {/* Password Field */}
                    <motion.div variants={itemVariants}>
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        New Password
                      </label>
                      <div className="relative">
                        <motion.input
                          whileFocus={{ scale: 1.02 }}
                          transition={{ duration: 0.2 }}
                          id="password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          required
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          className={`w-full px-4 py-3 pr-12 border ${validationErrors.password ? "border-red-300 dark:border-red-600" : "border-gray-300 dark:border-gray-600"
                            } rounded-xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent transition-all duration-200`}
                          placeholder="Enter your new password"
                        />
                        <button
                          type="button"
                          className="absolute inset-y-0 right-0 pr-4 flex items-center"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                            {showPassword ? (
                              <EyeOffIcon className="h-5 w-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                            ) : (
                              <EyeIcon className="h-5 w-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                            )}
                          </motion.div>
                        </button>
                      </div>
                      <AnimatePresence>
                        {validationErrors.password && (
                          <motion.p
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="mt-1 text-sm text-red-600 dark:text-red-400"
                          >
                            {validationErrors.password}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </motion.div>

                    {/* Confirm Password Field */}
                    <motion.div variants={itemVariants}>
                      <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Confirm New Password
                      </label>
                      <div className="relative">
                        <motion.input
                          whileFocus={{ scale: 1.02 }}
                          transition={{ duration: 0.2 }}
                          id="confirmPassword"
                          name="confirmPassword"
                          type={showConfirmPassword ? "text" : "password"}
                          autoComplete="new-password"
                          required
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          className={`w-full px-4 py-3 pr-12 border ${validationErrors.confirmPassword ? "border-red-300 dark:border-red-600" : "border-gray-300 dark:border-gray-600"
                            } rounded-xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent transition-all duration-200`}
                          placeholder="Confirm your new password"
                        />
                        <button
                          type="button"
                          className="absolute inset-y-0 right-0 pr-4 flex items-center"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        >
                          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                            {showConfirmPassword ? (
                              <EyeOffIcon className="h-5 w-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                            ) : (
                              <EyeIcon className="h-5 w-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                            )}
                          </motion.div>
                        </button>
                      </div>
                      <AnimatePresence>
                        {validationErrors.confirmPassword && (
                          <motion.p
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="mt-1 text-sm text-red-600 dark:text-red-400"
                          >
                            {validationErrors.confirmPassword}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </motion.div>

                    <motion.div variants={itemVariants}>
                      <motion.button
                        type="submit"
                        disabled={isLoading}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-xl text-white bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
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
                              Updating Password...
                            </motion.div>
                          ) : (
                            <motion.span
                              key="reset"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                            >
                              Update Password
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </motion.button>
                    </motion.div>
                  </motion.form>
                </motion.div>
              )}

              {status === "success" && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="text-center space-y-6"
                >
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ duration: 0.8, type: "spring", stiffness: 150 }}
                    className="p-4 bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-full mx-auto w-fit"
                  >
                    <CheckCircleIcon className="h-12 w-12 text-green-500" />
                  </motion.div>

                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                      Password Updated!
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      Your password has been successfully updated. You can now sign in with your new password.
                    </p>
                    <motion.div
                      animate={{ opacity: [1, 0.5, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="text-sm text-green-600 dark:text-green-400"
                    >
                      Redirecting to sign in...
                    </motion.div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </motion.div>
        </motion.div>
      </div>

      <Footer />
    </>
  );
} 