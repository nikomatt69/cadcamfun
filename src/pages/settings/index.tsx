import React, { useState } from "react";
import { motion, Transition, Variants } from "framer-motion";
import { useRouter } from "next/router";
import { useSession } from "../../lib/auth-client";
import { signOut } from "../../lib/auth-client";
import Image from "next/image";
import toast from "react-hot-toast";
import { User, Shield, Bell, Globe, Monitor, Key, Tag, HelpCircle, Cpu, Lock } from "react-feather";
import DynamicLayout from "src/components/layout/Layout";
import MetaTags from "src/components/layout/Metatags";
import { useLanguage, SUPPORTED_LANGUAGES } from "../../contexts/LanguageContext";
import { LanguageSelector } from "../../components/LanguageSelector";
import { AISettingsPanel } from "@/src/components/ai/ai-new";
import SubscriptionSettings from "@/src/components/subscription/SubscriptionSettings";
import SubscriptionSettingsPage from "./subscription";
import ProfileSettingsPage from "../profile/settings";
import { SubscriptionProvider } from "@/src/contexts/SubscriptionContext";
import PasskeySettings from "@/src/components/settings/PasskeySettings";
import ProfileSettings from "@/src/components/settings/ProfileSettings";
import SessionManagement from "@/src/components/settings/SessionManagement";

// Animation variants
const pageVariants: Variants = {
  initial: { opacity: 0, y: 20 },
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: -20 }
};

const pageTransition = {
  type: "tween",
  ease: "anticipate",
  duration: 0.5
};

const buttonVariants: Variants = {
  initial: { scale: 1 },
  hover: { scale: 1.05 },
  tap: { scale: 0.95 }
};

export default function Settings() {

  const router = useRouter();
  const [activeTab, setActiveTab] = useState("profile");

  // Deletion State
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Account Deletion Handler
  const handleDeleteAccount = async () => {
    setDeleteError(null);

    // Confirmation dialog
    if (
      !window.confirm(
        "Are you sure you want to delete your account? This action is irreversible and all your data will be lost."
      )
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch("/api/user/delete-account", {
        method: "DELETE"
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (jsonError) {
          // Handle cases where the response is not valid JSON
          throw new Error(response.statusText || "Failed to delete account. Server returned an invalid response.");
        }
        throw new Error(errorData.message || "Failed to delete account");
      }

      // Account deleted successfully
      toast.success("Account deleted successfully.");

      // Sign out and redirect
      await signOut();
      router.push("/"); // Redirect to home page
    } catch (error) {
      console.error("Account deletion error:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during deletion.";
      setDeleteError(`Account Deletion Error: ${errorMessage}`);
      toast.error(`Account Deletion Error: ${errorMessage}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Se l'utente non è autenticato, viene reindirizzato alla pagina di login
  if (status === "loading") {
    return (
      <DynamicLayout>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
          <div className="flex items-center justify-center h-96">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        </div>
      </DynamicLayout>
    );
  }

  if (status === "unauthenticated") {
    router.push("/auth/signup");
    return null;
  }

  const tabs = [
    { id: "profile", name: "Profile", icon: <User size={18} /> },
    { id: "account", name: "Account", icon: <Shield size={18} /> },
    { id: "security", name: "Security", icon: <Lock size={18} /> },
    { id: "billing", name: "Subscription", icon: <Tag size={18} /> },
    { id: "notifications", name: "Notifications", icon: <Bell size={18} /> },
    { id: "ai", name: "AI", icon: <Cpu size={18} /> },
    { id: "language", name: "Language", icon: <Globe size={18} /> }
  ];

  return (
    <DynamicLayout>
      <motion.div
        className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"
        initial="initial"
        animate="in"
        exit="out"
        variants={pageVariants}
        transition={pageTransition as Transition}
      >
        <MetaTags ogImage="/og-image.png" title="Settings" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <motion.div
            className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl shadow-lg rounded-2xl border border-gray-200/50 dark:border-gray-700/50 p-6 mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Settings
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-300">
              Manage your profile, account, and preferences
            </p>
          </motion.div>

          {/* Main Content */}
          <motion.div
            className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl shadow-lg rounded-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {/* Tabs - Desktop */}
            <div className="hidden sm:block bg-gray-50/70 dark:bg-gray-900/70 border-b border-gray-200/50 dark:border-gray-700/50">
              <div className="px-4 sm:px-6 lg:px-8">
                <nav className="-mb-px flex justify-between w-full">
                  {tabs.map(tab => (
                    <motion.button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      variants={buttonVariants}
                      initial="initial"
                      whileHover="hover"
                      whileTap="tap"
                      className={`
                        flex-1 py-4 px-2 border-b-2 font-medium text-sm transition-all duration-200 whitespace-nowrap
                        ${activeTab === tab.id
                          ? "border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/20 rounded-t-lg"
                          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 hover:bg-gray-100/30 dark:hover:bg-gray-700/20 rounded-t-lg"
                        }
                      `}
                    >
                      <div className="flex items-center justify-center">
                        <span className="mr-1 lg:mr-2 flex-shrink-0">{tab.icon}</span>
                        <span className="hidden md:inline-block lg:inline-block truncate">{tab.name}</span>
                      </div>
                    </motion.button>
                  ))}
                </nav>
              </div>
            </div>

            {/* Tabs - Mobile */}
            <div className="sm:hidden bg-gray-50/70 dark:bg-gray-900/70 border-b border-gray-200/50 dark:border-gray-700/50">
              <div className="px-1">
                <div className="flex justify-between w-full py-1">
                  {tabs.map(tab => (
                    <motion.button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      variants={buttonVariants}
                      initial="initial"
                      whileHover="hover"
                      whileTap="tap"
                      className={`
                        flex-1 flex flex-col items-center py-2 px-1 text-xs font-medium transition-all duration-200
                        ${activeTab === tab.id
                          ? "text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/20 rounded-lg"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100/50 dark:hover:bg-gray-700/30 rounded-lg"
                        }
                      `}
                    >
                      <span className="mb-1 text-base">{tab.icon}</span>
                      <span className="text-xs leading-tight text-center max-w-full truncate">{tab.name}</span>
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>

            {/* Tab Content */}
            <motion.div
              className="p-4 sm:p-6"
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
            >
              {activeTab === "profile" && <ProfileSettings />}

              {activeTab === "account" && (
                <div className="space-y-8">
                  <div>
                    <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">Account</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Gestisci le impostazioni del tuo account e le sessioni attive.
                    </p>
                  </div>

                  {/* Session Management Section */}
                  <div>
                    <SessionManagement />
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                    <h4 className="text-base font-medium text-gray-900 dark:text-white">Account Deletion</h4>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Once you delete your account, you cannot go back. All your data will be permanently removed. Please
                        be certain.
                      </p>
                    </div>
                    <div className="mt-4">
                      <motion.button
                        type="button"
                        onClick={handleDeleteAccount}
                        disabled={isDeleting}
                        variants={buttonVariants}
                        initial="initial"
                        whileHover="hover"
                        whileTap="tap"
                        className="inline-flex items-center justify-center px-4 py-2 border border-transparent font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 dark:text-red-100 dark:bg-red-900/40 dark:hover:bg-red-900/60 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                      >
                        {isDeleting ? "Deleting..." : "Delete account"}
                      </motion.button>
                      {deleteError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{deleteError}</p>}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "language" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">Language Settings</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Select your preferred interface language
                    </p>
                  </div>

                  <div className="max-w-xl">
                    <div className="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                      <div className="sm:col-span-4">
                        <label htmlFor="language" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Language
                        </label>
                        <div className="mt-1">
                          <LanguageSelector />
                        </div>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                          The currently selected language is: {SUPPORTED_LANGUAGES["en"]}
                        </p>
                      </div>
                    </div>

                    <div className="mt-8">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-white">Available Languages</h4>
                      <div className="mt-4 space-y-4">
                        {Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => (
                          <div key={code} className="flex items-center">
                            <div className="flex-shrink-0">
                              {code === "en" && <span className="inline-block h-2 w-2 rounded-full bg-blue-600"></span>}
                            </div>
                            <div className="ml-3">
                              <p className="text-sm text-gray-700 dark:text-gray-300">{name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {code === "en" ? "Current language" : ""}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-8 bg-gray-50 dark:bg-gray-800 p-4 rounded-md">
                      <div className="flex items-start">
                        <div className="flex-shrink-0">
                          <Globe className="h-5 w-5 text-gray-400" aria-hidden="true" />
                        </div>
                        <div className="ml-3">
                          <h4 className="text-sm font-medium text-gray-900 dark:text-white">Translation Information</h4>
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Translations are loaded automatically when you change language. If you encounter any issues with
                            translations, please contact support.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Contenuto per le altre tab */}
              {activeTab === "notifications" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">
                      Notification Preferences
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Decide how and when you receive updates.
                    </p>
                  </div>

                  {/* Notifiche email */}
                  <div className="mt-6">
                    <fieldset>
                      <legend className="text-base font-medium text-gray-900 dark:text-white">Email</legend>
                      <div className="mt-4 space-y-4">
                        <div className="flex items-start">
                          <div className="flex items-center h-5">
                            <input
                              id="comments"
                              name="comments"
                              type="checkbox"
                              defaultChecked
                              className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded bg-gray-100 dark:bg-gray-700"
                            />
                          </div>
                          <div className="ml-3 text-sm">
                            <label htmlFor="comments" className="font-medium text-gray-700 dark:text-gray-300">
                              Comments
                            </label>
                            <p className="text-gray-500 dark:text-gray-400">
                              Get notified when someone comments on your posts.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start">
                          <div className="flex items-center h-5">
                            <input
                              id="mentions"
                              name="mentions"
                              type="checkbox"
                              defaultChecked
                              className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded bg-gray-100 dark:bg-gray-700"
                            />
                          </div>
                          <div className="ml-3 text-sm">
                            <label htmlFor="mentions" className="font-medium text-gray-700 dark:text-gray-300">
                              Mentions
                            </label>
                            <p className="text-gray-500 dark:text-gray-400">Get notified when someone mentions you.</p>
                          </div>
                        </div>
                      </div>
                    </fieldset>
                  </div>

                  {/* Notifiche push */}
                  <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <fieldset>
                      <legend className="text-base font-medium text-gray-900 dark:text-white">Push Notifications</legend>
                      <div className="mt-4 space-y-4">
                        <div className="flex items-start">
                          <div className="flex items-center h-5">
                            <input
                              id="push-everything"
                              name="push-notifications"
                              type="radio"
                              defaultChecked
                              className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700"
                            />
                          </div>
                          <div className="ml-3 text-sm">
                            <label htmlFor="push-everything" className="font-medium text-gray-700 dark:text-gray-300">
                              All notifications
                            </label>
                            <p className="text-gray-500 dark:text-gray-400">Receive all push notifications.</p>
                          </div>
                        </div>
                        <div className="flex items-start">
                          <div className="flex items-center h-5">
                            <input
                              id="push-email"
                              name="push-notifications"
                              type="radio"
                              className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700"
                            />
                          </div>
                          <div className="ml-3 text-sm">
                            <label htmlFor="push-email" className="font-medium text-gray-700 dark:text-gray-300">
                              Only email
                            </label>
                            <p className="text-gray-500 dark:text-gray-400">Only receive notifications via email.</p>
                          </div>
                        </div>
                        <div className="flex items-start">
                          <div className="flex items-center h-5">
                            <input
                              id="push-nothing"
                              name="push-notifications"
                              type="radio"
                              className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700"
                            />
                          </div>
                          <div className="ml-3 text-sm">
                            <label htmlFor="push-nothing" className="font-medium text-gray-700 dark:text-gray-300">
                              No notifications
                            </label>
                            <p className="text-gray-500 dark:text-gray-400">Do not receive push notifications.</p>
                          </div>
                        </div>
                      </div>
                    </fieldset>
                  </div>
                </div>
              )}
              {activeTab === "ai" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">AI</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Configure the AI settings.</p>
                  </div>

                  {/* Notifiche email */}
                  <div className="mt-6">
                    <fieldset>
                      <div className="mt-4 space-y-4">
                        <AISettingsPanel />
                      </div>
                    </fieldset>
                  </div>
                </div>
              )}
              {activeTab === "billing" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">Billing</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Configure billing settings.</p>
                  </div>

                  {/* Notifiche email */}
                  <div className="mt-6">
                    <fieldset>
                      <legend className="text-base font-medium text-gray-900 dark:text-white">Billing</legend>
                      <div className="mt-4 space-y-4">
                        <SubscriptionProvider>
                          <SubscriptionSettings />
                        </SubscriptionProvider>
                      </div>
                    </fieldset>
                  </div>
                </div>
              )}

              {activeTab === "security" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">Security</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Manage your account security and authentication methods.
                    </p>
                  </div>

                  <div className="mt-6">
                    <PasskeySettings />
                  </div>
                </div>
              )}

              {/* Tab placeholder per le altre sezioni */}
            </motion.div>
          </motion.div>
        </div>
      </motion.div>
    </DynamicLayout>
  );
}
