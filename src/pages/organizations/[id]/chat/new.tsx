// src/pages/organizations/[id]/chat/new.tsx
import { useState, useEffect } from "react";
import { useRouter } from "next/router";

import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, MessageCircle, Loader, Send } from "react-feather";
import Layout from "@/src/components/layout/Layout";
import Metatags from "@/src/components/layout/Metatags";
import ConversationList from "@/src/components/chat/ConversationList";
import NewConversation from "@/src/components/chat/NewConversation";
import MetaTags from "@/src/components/layout/Metatags";
import { Building } from "lucide-react";

const NewDirectMessagePage = () => {
  const router = useRouter();

  const { id: organizationId } = router.query;
  const [isMobileView, setIsMobileView] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  if (status === "loading") {
    return (
      <Layout>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex h-screen items-center justify-center bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800"
        >
          <div className="text-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="mx-auto mb-4"
            >
              <Loader className="h-8 w-8 text-purple-500" />
            </motion.div>
            <p className="text-gray-600 dark:text-gray-400 font-medium">Preparazione messaggio diretto...</p>
          </div>
        </motion.div>
      </Layout>
    );
  }

  if (status === "unauthenticated") {
    router.push("/waitlist");
    return null;
  }

  if (!organizationId || typeof organizationId !== "string") {
    return (
      <Layout>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-6"
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-gray-200 dark:border-gray-700">
            <div className="mb-6">
              <div className="mx-auto w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mb-4">
                <Building className="w-8 h-8 text-orange-600 dark:text-orange-400" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Organizzazione non trovata</h1>
              <p className="text-gray-600 dark:text-gray-400">
                L&apos;organizzazione che stai cercando non esiste o non hai accesso a essa.
              </p>
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => router.push("/organizations")}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-xl font-medium hover:from-purple-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-all duration-200 flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Torna alle organizzazioni
            </motion.button>
          </div>
        </motion.div>
      </Layout>
    );
  }

  const handleBack = () => {
    router.push(`/organizations/${organizationId}/chat`);
  };

  return (
    <Layout>
      <MetaTags ogImage="/og-image.png" title="Nuovo messaggio diretto" />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800 min-h-screen"
      >
        {/* Header with breadcrumb */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleBack}
                className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </motion.button>
              <div className="flex items-center gap-2">
                <Send className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Nuovo messaggio diretto</h1>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 h-[calc(100vh-140px)]">
          <div className="flex h-full gap-6 max-w-7xl mx-auto">
            {/* Conversation List - Hidden on mobile */}
            <AnimatePresence>
              {!isMobileView && (
                <motion.div
                  initial={{ x: -300, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="w-1/3 min-w-0"
                >
                  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 h-full overflow-hidden">
                    <ConversationList organizationId={organizationId} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* New Conversation Form */}
            <motion.div
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.3, ease: "easeOut", delay: 0.1 }}
              className={`${isMobileView ? "w-full" : "w-2/3"} min-w-0`}
            >
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 h-full overflow-hidden">
                <NewConversation organizationId={organizationId} isGroupChat={false} onBack={handleBack} />
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </Layout>
  );
};

export default NewDirectMessagePage;
