import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { CheckCircleIcon, XCircleIcon } from "lucide-react";
import MetaTags from "@/src/components/layout/Metatags";
import Navbar from "@/src/components/layout/Navbar";
import Footer from "@/src/components/ui/Footer";
import { useTauri } from "@/src/hooks/useTauri";
export default function VerifyEmail() {
  const router = useRouter();
  const { token } = router.query;
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const { httpFetch } = useTauri();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isClient && token && typeof token === "string") {
      verifyEmail(token);
    }
  }, [isClient, token]);

  const verifyEmail = async (emailToken: string) => {
    try {
      const response = await httpFetch(`${process.env.NEXTAUTH_URL}/api/auth/verify-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ token: emailToken })
      });

      const data = await response.json();

      if (response.ok) {
        setStatus("success");
        setMessage("Email verified successfully! You can now sign in to your account.");

        // Redirect to signin after 3 seconds
        setTimeout(() => {
          router.push(`${process.env.NEXTAUTH_URL}/auth/signin`);
        }, 3000);
      } else {
        setStatus("error");
        setMessage(data.message || "Failed to verify email");
      }
    } catch (error) {
      setStatus("error");
      setMessage("An unexpected error occurred");
      console.error("Verification error:", error);
    }
  };

  const containerVariants: Variants = {
    hidden: { opacity: 0, y: 50 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: "easeOut"
      }
    }
  };

  const iconVariants: Variants = {
    hidden: { scale: 0, rotate: -180 },
    visible: {
      scale: 1,
      rotate: 0,
      transition: {
        duration: 0.8,
        type: "spring",
        stiffness: 150
      }
    }
  };

  return (
    <>
      <MetaTags
        ogImage="/og-image.png"
        title="Email Verification - CAD/CAM FUN"
        description="Verify your email address to complete your account setup."
      />
      <Navbar />

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-indigo-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="max-w-md w-full"
        >
          <motion.div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 p-8 sm:p-10 text-center">

            <AnimatePresence mode="wait">
              {status === "loading" && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"
                  />
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                      Verifying Email
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                      Please wait while we verify your email address...
                    </p>
                  </div>
                </motion.div>
              )}

              {status === "success" && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="space-y-6"
                >
                  <motion.div variants={iconVariants}>
                    <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto" />
                  </motion.div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                      Email Verified!
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      {message}
                    </p>
                    <motion.div
                      animate={{ opacity: [1, 0.5, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="text-sm text-blue-600 dark:text-blue-400"
                    >
                      Redirecting to sign in...
                    </motion.div>
                  </div>
                </motion.div>
              )}

              {status === "error" && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="space-y-6"
                >
                  <motion.div variants={iconVariants}>
                    <XCircleIcon className="w-16 h-16 text-red-500 mx-auto" />
                  </motion.div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                      Verification Failed
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                      {message}
                    </p>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => router.push("/auth/signin")}
                      className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-xl text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
                    >
                      Go to Sign In
                    </motion.button>
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