// src/pages/organizations/[id]/chat/index.tsx
import { useState, useEffect } from "react";
import { useRouter } from "next/router";

import { motion, AnimatePresence, Variants } from "framer-motion";
import { DynamicLayout } from "src/components/dynamic-imports";
import Metatags from "@/src/components/layout/Metatags";
import ConversationList from "@/src/components/chat/ConversationList";
import ConversationDetail from "@/src/components/chat/ConversationDetail";
import useChatStore from "@/src/store/chatStore";
import MetaTags from "@/src/components/layout/Metatags";

// Animation variants
const pageVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.1, 0.25, 1.0],
      staggerChildren: 0.1
    }
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.3,
      ease: [0.25, 0.1, 0.25, 1.0]
    }
  }
};

const OrganizationChatPage = () => {
  const router = useRouter();

  const { id: organizationId } = router.query;
  const [isMobileView, setIsMobileView] = useState(false);
  const [showConversationList, setShowConversationList] = useState(true);
  const { clearActiveConversation } = useChatStore();

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

  useEffect(() => {
    // Clear active conversation when navigating away
    return () => {
      clearActiveConversation();
    };
  }, [clearActiveConversation]);

  if (status === "loading") {
    return (
      <DynamicLayout>
        <motion.div
          className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </motion.div>
      </DynamicLayout>
    );
  }

  if (status === "unauthenticated") {
    router.push("/waitlist");
    return null;
  }

  if (!organizationId || typeof organizationId !== "string") {
    return (
      <DynamicLayout>
        <motion.div
          className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="text-center">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
              Organizzazione non trovata
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              L&apos;organizzazione che stai cercando non esiste o non hai accesso a essa.
            </p>
            <motion.button
              onClick={() => router.push("/organizations")}
              className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg shadow-blue-500/25 transition-all"
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              Torna alle organizzazioni
            </motion.button>
          </div>
        </motion.div>
      </DynamicLayout>
    );
  }

  return (
    <DynamicLayout>
      <MetaTags ogImage="/og-image.png" title="Chat dell'organizzazione" />

      <motion.div
        className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={pageVariants}
      >
        <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
          <motion.div
            className="flex items-center mb-6"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="mr-4 h-12 w-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
              <MessageCircle className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Chat dell&apos;organizzazione
            </h1>
          </motion.div>

          <motion.div
            className="flex h-[calc(100vh-200px)] gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {/* Conversation List */}
            {(!isMobileView || showConversationList) && (
              <motion.div
                className={`${isMobileView ? "w-full" : "w-1/3"} bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl shadow-lg rounded-2xl border border-gray-200/50 dark:border-gray-700/50 p-4`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <ConversationList organizationId={organizationId} />
              </motion.div>
            )}

            {/* Conversation Detail */}
            {(!isMobileView || !showConversationList) && (
              <motion.div
                className={`${isMobileView ? "w-full" : "w-2/3"} bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl shadow-lg rounded-2xl border border-gray-200/50 dark:border-gray-700/50`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                <div className="h-full flex items-center justify-center p-8">
                  <div className="text-center text-gray-500 dark:text-gray-400">
                    <div className="mb-4 h-16 w-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center mx-auto shadow-lg">
                      <MessageCircle className="h-8 w-8 text-white" />
                    </div>
                    <h2 className="text-xl font-medium mb-2 text-gray-900 dark:text-white">Seleziona una conversazione</h2>
                    <p className="text-sm">Scegli una chat dall&apos;elenco o inizia una nuova conversazione</p>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </motion.div>
    </DynamicLayout>
  );
};

export default OrganizationChatPage;

// Add missing icon
const MessageCircle = (props: any) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);
