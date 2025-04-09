import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell } from 'react-feather';
import { registerServiceWorker, requestNotificationPermission, subscribeToPushNotifications } from '@/src/lib/notificationServiceWorker';
import { toast } from 'react-hot-toast';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

interface NotificationPermissionPromptProps {
  onClose: () => void;
}

const NotificationPermissionPrompt: React.FC<NotificationPermissionPromptProps> = ({ onClose }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    // Check if the browser supports notifications
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return;
    }

    // Update permission state
    setPermission(Notification.permission);
  }, []);

  const handleEnableNotifications = async () => {
    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      setPermission(permission);

      if (permission === 'granted') {
        // Register service worker
        const swRegistration = await registerServiceWorker();
        
        // Subscribe to push notifications
        await subscribeToPushNotifications(swRegistration);
        
        toast.success('Notifiche abilitate con successo');
      } else {
        toast.error('Permesso per le notifiche negato');
      }
    } catch (error) {
      console.error('Error enabling notifications:', error);
      toast.error('Errore durante l\'abilitazione delle notifiche');
    }
  };

  const handleDismiss = () => {
    // Salva la preferenza dell'utente anche se rifiuta
    localStorage.setItem('notificationsPromptDismissed', 'true');
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  const registerServiceWorker = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.register('/sw.js');
        return registration;
      }
      throw new Error('Service Worker not supported');
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      throw error;
    }
  };

  const subscribeToPushNotifications = async (swRegistration: ServiceWorkerRegistration) => {
    try {
      if (!VAPID_PUBLIC_KEY) {
        throw new Error('VAPID public key not configured');
      }

      const existingSubscription = await swRegistration.pushManager.getSubscription();
      if (existingSubscription) {
        return existingSubscription;
      }

      const subscription = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY!
      });

      // Here you would typically send the subscription to your server
      console.log('Push notification subscription:', subscription);
      
      return subscription;
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error);
      throw error;
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-4 right-4 max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <div className="p-2 bg-blue-100 dark:bg-blue-800/30 rounded-full">
                <Bell className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Abilita le notifiche
              </h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                Ricevi notifiche in tempo reale per nuovi messaggi, aggiornamenti dei progetti e altro ancora.
              </p>
              <div className="mt-4 flex space-x-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleEnableNotifications}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Abilita notifiche
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleDismiss}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Non ora
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NotificationPermissionPrompt; 