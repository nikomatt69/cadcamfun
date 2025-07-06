// src/components/notifications/NotificationDropdown.tsx
import { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { Check, Trash2, X, MessageCircle, Folder, Box, Bell } from "react-feather";
import useNotificationStore from "@/src/store/notificationStore";
import { formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";

// Animation variants
const dropdownVariants = {
  initial: {
    opacity: 0,
    scale: 0.95,
    y: -10,
    filter: "blur(8px)"
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.3,
      ease: "easeOut",
      staggerChildren: 0.05
    }
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: -10,
    filter: "blur(8px)",
    transition: {
      duration: 0.2,
      ease: "easeIn"
    }
  }
};

const headerVariants = {
  initial: { opacity: 0, y: -10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2 }
  }
};

const notificationItemVariants = {
  initial: { opacity: 0, x: -20 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.2 }
  },
  hover: {
    x: 4,
    scale: 1.01,
    backgroundColor: "rgba(59, 130, 246, 0.05)",
    transition: { duration: 0.15 }
  },
  tap: {
    scale: 0.98,
    transition: { duration: 0.1 }
  }
};

const buttonVariants = {
  initial: { scale: 1 },
  hover: {
    scale: 1.1,
    transition: { duration: 0.15 }
  },
  tap: {
    scale: 0.9,
    transition: { duration: 0.1 }
  }
};

const emptyStateVariants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: "easeOut"
    }
  }
};

const loadingVariants = {
  animate: {
    rotate: 360,
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: "linear"
    }
  }
};

const NotificationDropdown: React.FC = () => {
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const {
    notifications,
    isOpen,
    isLoading,
    unreadCount,
    setIsOpen,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    fetchNotifications
  } = useNotificationStore();

  useEffect(() => {
    // Fetch notifications when dropdown opens
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  useEffect(() => {
    // Close dropdown when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [setIsOpen]);

  const handleNotificationClick = (notification: any) => {
    // Mark as read
    if (!notification.isRead) {
      markAsRead(notification.id);
    }

    // Navigate to the link if provided
    if (notification.linkUrl) {
      router.push(notification.linkUrl);
      setIsOpen(false);
    }
  };

  const getNotificationIcon = (type: string) => {
    const iconClass = "h-5 w-5";
    switch (type) {
      case "NEW_MESSAGE":
        return <MessageCircle className={`${iconClass} text-blue-500`} />;
      case "PROJECT_CREATED":
        return <Folder className={`${iconClass} text-green-500`} />;
      case "COMPONENT_CREATED":
        return <Box className={`${iconClass} text-purple-500`} />;
      default:
        return <Bell className={`${iconClass} text-gray-500`} />;
    }
  };

  const formatTime = (date: string) => {
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true, locale: enUS });
    } catch (error) {
      return "unknown date";
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        ref={dropdownRef}
        className="absolute right-0 mt-2 w-80 backdrop-blur-md bg-white/95 dark:bg-gray-800/95 rounded-2xl shadow-2xl border border-white/50 dark:border-gray-600/50 overflow-hidden z-[58]"
        style={{ top: "100%" }}
        variants={dropdownVariants as Variants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {/* Header */}
        <motion.div
          className="p-4 border-b border-gray-200/50 dark:border-gray-700/50 bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-blue-900/30 dark:to-purple-900/30"
          variants={headerVariants}
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <motion.div
                whileHover={{ scale: 1.1, rotate: 10 }}
                transition={{ duration: 0.2 }}
              >
                <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400 mr-2" />
              </motion.div>
              <h3 className="text-sm font-semibold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <motion.span
                  className="ml-2 px-2 py-0.5 text-xs bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-full shadow-md"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  {unreadCount} new
                </motion.span>
              )}
            </div>

            {unreadCount > 0 && (
              <motion.button
                onClick={markAllAsRead}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium px-2 py-1 rounded-lg hover:bg-blue-50/50 dark:hover:bg-blue-900/30 transition-all duration-200"
                aria-label="Mark all as read"
                variants={buttonVariants}
                whileHover="hover"
                whileTap="tap"
              >
                Mark all read
              </motion.button>
            )}
          </div>
        </motion.div>

        {/* Content */}
        <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
          {isLoading ? (
            <motion.div
              className="p-6 flex justify-center"
              variants={emptyStateVariants as Variants}
            >
              <motion.div
                className="rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"
                variants={loadingVariants as Variants}
                animate="animate"
              />
            </motion.div>
          ) : notifications.length === 0 ? (
            <motion.div
              className="p-6 text-center text-gray-500 dark:text-gray-400"
              variants={emptyStateVariants as Variants}
            >
              <motion.div
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ duration: 0.2 }}
              >
                <Bell className="h-12 w-12 mx-auto mb-3 opacity-50" />
              </motion.div>
              <p className="font-medium">No notifications</p>
              <p className="text-xs mt-1 opacity-75">You&apos;re all caught up!</p>
            </motion.div>
          ) : (
            <motion.ul className="divide-y divide-gray-200/50 dark:divide-gray-700/50">
              {notifications.map((notification, index) => (
                <motion.li
                  key={notification.id}
                  className={`relative ${!notification.isRead
                      ? "bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-blue-900/20 dark:to-purple-900/20"
                      : ""
                    }`}
                  variants={notificationItemVariants}
                  custom={index}
                  whileHover="hover"
                  whileTap="tap"
                >
                  <motion.button
                    className="w-full text-left p-4 pr-16"
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex items-start">
                      <motion.div
                        className="flex-shrink-0 mt-0.5"
                        whileHover={{ scale: 1.1 }}
                        transition={{ duration: 0.15 }}
                      >
                        {getNotificationIcon(notification.type)}
                      </motion.div>
                      <div className="ml-3 flex-1">
                        <p
                          className={`text-sm font-medium mb-1 ${!notification.isRead
                              ? "text-gray-900 dark:text-white"
                              : "text-gray-700 dark:text-gray-300"
                            }`}
                        >
                          {notification.title}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                          {notification.content}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500">
                          {formatTime(notification.createdAt)}
                        </p>
                      </div>
                    </div>
                  </motion.button>

                  {/* Action buttons */}
                  <div className="absolute top-4 right-4 flex space-x-1">
                    {!notification.isRead && (
                      <motion.button
                        onClick={() => markAsRead(notification.id)}
                        className="p-1.5 rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-all duration-200"
                        aria-label="Mark as read"
                        variants={buttonVariants}
                        whileHover="hover"
                        whileTap="tap"
                      >
                        <Check className="h-4 w-4" />
                      </motion.button>
                    )}
                    <motion.button
                      onClick={() => deleteNotification(notification.id)}
                      className="p-1.5 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-100/50 dark:hover:bg-red-900/30 transition-all duration-200"
                      aria-label="Delete notification"
                      variants={buttonVariants}
                      whileHover="hover"
                      whileTap="tap"
                    >
                      <Trash2 className="h-4 w-4" />
                    </motion.button>
                  </div>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </div>

        {/* Footer */}
        <motion.div
          className="p-3 border-t border-gray-200/50 dark:border-gray-700/50 text-center bg-gradient-to-r from-gray-50/50 to-gray-100/50 dark:from-gray-800/50 dark:to-gray-900/50"
          variants={headerVariants}
        >
          <motion.button
            onClick={() => setIsOpen(false)}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium px-3 py-1 rounded-lg hover:bg-white/50 dark:hover:bg-gray-700/50 transition-all duration-200"
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
          >
            Close
          </motion.button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default NotificationDropdown;
