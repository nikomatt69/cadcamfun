import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FingerprintIcon, 
  PlusIcon, 
  TrashIcon, 
  ShieldCheckIcon,
  LucidePhone,
  ComputerIcon,
  AlertTriangleIcon,
    
} from 'lucide-react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useAuthPasskeys, useAuthUI } from '@/src/store/authStore';

interface Passkey {
  id: string;
  credentialID: string;
  transports: string[];
  counter: number;
  lastUsed?: string;
}

export default function PasskeySettings() {
  const { user, registerPasskey } = useAuth();
  
  // Use auth store for passkey management
  const {
    passkeys,
    passkeySupported: isPasskeySupported,
    passkeyLoading: loading,
    passkeyError,
    loadPasskeys,
    removePasskey: removePasskeyFromStore,
    checkPasskeySupport
  } = useAuthPasskeys();
  
  const {
    passkeyError: storeError,
    setPasskeyError
  } = useAuthUI();
  
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load passkeys when component mounts or user changes
  useEffect(() => {
    if (user) {
      loadPasskeys();
    }
  }, [user, loadPasskeys]);

  // Sync store errors with local state
  useEffect(() => {
    if (passkeyError || storeError) {
      setError(passkeyError || storeError);
    }
  }, [passkeyError, storeError]);

  // Remove duplicate loadPasskeys function - using the one from store

  const handleRegisterPasskey = async () => {
    setRegistering(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await registerPasskey();
      if (result.success) {
        setSuccess(result.message);
        await loadPasskeys(); // Refresh the list
      } else {
        setError(result.message);
      }
    } catch (error: any) {
      setError(error.message || 'Failed to register passkey');
    } finally {
      setRegistering(false);
    }
  };

  const handleDeletePasskey = async (passkeyId: string) => {
    if (!confirm('Are you sure you want to remove this passkey?')) return;

    try {
      await removePasskeyFromStore(passkeyId);
      setSuccess('Passkey removed successfully');
    } catch (error) {
      setError('Failed to remove passkey');
    }
  };

  const getDeviceIcon = (transports: string[]) => {
    if (transports.includes('usb') || transports.includes('nfc')) {
      return <ShieldCheckIcon className="h-5 w-5 text-blue-500" />;
    }
    if (transports.includes('internal')) {
      return <LucidePhone className="h-5 w-5 text-green-500" />;
    }
    return <ComputerIcon className="h-5 w-5 text-gray-500" />;
  };

  const getDeviceType = (transports: string[]) => {
    if (transports.includes('internal')) return 'Built-in authenticator';
    if (transports.includes('usb')) return 'USB Security Key';
    if (transports.includes('nfc')) return 'NFC Security Key';
    if (transports.includes('ble')) return 'Bluetooth Security Key';
    return 'Security Key';
  };

  if (!isPasskeySupported) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6"
      >
        <div className="flex items-start space-x-3">
          <AlertTriangleIcon className="h-6 w-6 text-amber-500 flex-shrink-0 mt-1" />
          <div>
            <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-200 mb-2">
              Passkeys Not Supported
            </h3>
            <p className="text-amber-700 dark:text-amber-300 mb-4">
              Your browser or device doesn&apos;t support passkeys. To use passkeys, you need:
            </p>
            <ul className="list-disc list-inside text-amber-700 dark:text-amber-300 space-y-1 text-sm">
              <li>A modern browser (Chrome 67+, Safari 14+, Firefox 60+)</li>
              <li>A device with biometric authentication (TouchID, FaceID, Windows Hello)</li>
              <li>Or a security key (YubiKey, etc.)</li>
            </ul>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
            <FingerprintIcon className="h-7 w-7 mr-3 text-blue-500" />
            Passkeys
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Secure passwordless authentication using your device&apos;s biometrics or security keys
          </p>
        </div>
        
        <motion.button
          onClick={handleRegisterPasskey}
          disabled={registering}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {registering ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"
              />
              Adding...
            </>
          ) : (
            <>
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Passkey
            </>
          )}
        </motion.button>
      </div>

      {/* Messages */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg"
          >
            {error}
          </motion.div>
        )}
        
        {success && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg"
          >
            {success}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Passkeys List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        {loading ? (
          <div className="p-8 text-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"
            />
            <p className="text-gray-500 dark:text-gray-400">Loading passkeys...</p>
          </div>
        ) : passkeys.length === 0 ? (
          <div className="p-8 text-center">
            <FingerprintIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No passkeys configured
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Add a passkey to enable secure, passwordless authentication
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {passkeys.map((passkey, index) => (
              <motion.div
                key={passkey.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  {getDeviceIcon(passkey.transports || [])} 
                  
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      {getDeviceType(passkey.transports || [])} 
                    </h4>
                    <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                      {passkey.lastUsed && (
                        <p>Last used {new Date(passkey.lastUsed).toLocaleDateString()}</p>
                      )}
                      <p className="text-xs font-mono text-gray-400">
                        ID: {passkey.credentialID.slice(0, 8)}...
                      </p>
                    </div>
                  </div>
                </div>

                <motion.button
                  onClick={() => handleDeletePasskey(passkey.id)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Remove passkey"
                >
                  <TrashIcon className="h-4 w-4" />
                </motion.button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
        <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-3">
          About Passkeys
        </h3>
        <ul className="text-blue-800 dark:text-blue-300 text-sm space-y-2">
          <li>• Passkeys are more secure than passwords - they can&apos;t be phished or stolen</li>
          <li>• You can add multiple passkeys for different devices</li>
          <li>• Passkeys work with TouchID, FaceID, Windows Hello, or security keys</li>
          <li>• You can still use your email and password if needed</li>
        </ul>
      </div>
    </motion.div>
  );
} 