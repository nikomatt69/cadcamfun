// src/pages/organizations/[id]/chat/[conversationId].tsx
import { useState, useEffect } from "react";
import { useRouter } from "next/router";

import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, MessageSquare, Users, Loader } from "react-feather";
import Layout from "@/src/components/layout/Layout";
import Metatags from "@/src/components/layout/Metatags";
import ConversationList from "src/components/chat/ConversationList";
import ConversationDetail from "src/components/chat/ConversationDetail";
import useChatStore from "@/src/store/chatStore";
import MetaTags from "@/src/components/layout/Metatags";

const ConversationPage = () => {
  const router = useRouter();

  const { id: organizationId, conversationId } = router.query;
  const [isMobileView, setIsMobileView] = useState(false);
  const [showConversationList, setShowConversationList] = useState(false);
  const { activeConversation } = useChatStore();

  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth < 768;
      setIsMobileView(isMobile);
      setShowConversationList(!isMobile);
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
          className="flex h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800"
        >
          <div className="text-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="mx-auto mb-4"
            >
              <Loader className="h-8 w-8 text-blue-500" />
            </motion.div>
            <p className="text-gray-600 dark:text-gray-400 font-medium">Caricamento conversazione...</p>
          </div>
        </motion.div>
      </Layout>
    );
  }

  if (status === "unauthenticated") {
    router.push("/waitlist");
    return null;
  }

  if (!organizationId || typeof organizationId !== "string" || !conversationId || typeof conversationId !== "string") {
    return (
      <Layout>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-6"
        >
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-gray-200 dark:border-gray-700">
            <div className="mb-6">
              <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Conversazione non trovata</h1>
              <p className="text-gray-600 dark:text-gray-400">La conversazione che stai cercando non esiste o non hai accesso a essa.</p>
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => router.push(`/organizations/${organizationId}/chat`)}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-xl font-medium hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Torna alla chat
            </motion.button>
          </div>
        </motion.div>
      </Layout>
    );
  }

  const handleBackToList = () => {
    if (isMobileView) {
      router.push(`/organizations/${organizationId}/chat`);
    } else {
      setShowConversationList(true);
    }
  };

  return (
    <Layout>
      <MetaTags
        ogImage="/og-image.png"
        title={activeConversation?.name || "Chat della conversazione"}
        description="Chat della conversazione"
      />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 min-h-screen"
      >
        <div className="p-4 h-[calc(100vh-84px)]">
          <div className="flex h-full gap-6 max-w-7xl mx-auto">
            {/* Conversation List - Hidden on mobile when viewing a conversation */}
            <AnimatePresence>
              {(!isMobileView || showConversationList) && (
                <motion.div
                  initial={{ x: -300, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -300, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className={`${isMobileView ? "w-full" : "w-1/3"} min-w-0`}
                >
                  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 h-full overflow-hidden">
                    <ConversationList organizationId={organizationId} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Conversation Detail */}
            <AnimatePresence>
              {(!isMobileView || !showConversationList) && (
                <motion.div
                  initial={{ x: 300, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 300, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className={`${isMobileView ? "w-full" : "w-2/3"} min-w-0`}
                >
                  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 h-full overflow-hidden">
                    <ConversationDetail
                      conversationId={conversationId}
                      organizationId={organizationId}
                      onBack={handleBackToList}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </Layout>
  );
};

export default ConversationPage;
