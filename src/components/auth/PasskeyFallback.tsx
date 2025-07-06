import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
    AlertTriangleIcon, 
    LucidePhone,
    ComputerIcon,
  KeyIcon,
  CheckCircleIcon
} from 'lucide-react';

interface PasskeyFallbackProps {
  onContinueWithPassword: () => void;
  onLearnMore?: () => void;
}

export default function PasskeyFallback({ onContinueWithPassword, onLearnMore }: PasskeyFallbackProps) {
  const [browserInfo, setBrowserInfo] = useState<{
    name: string;
    version: string;
    supported: boolean;
  }>({ name: 'Unknown', version: '', supported: false });

  useEffect(() => {
    const detectBrowser = () => {
      const userAgent = navigator.userAgent;
      let name = 'Unknown';
      let version = '';
      let supported = false;

      if (userAgent.includes('Chrome')) {
        const match = userAgent.match(/Chrome\/(\d+)/);
        name = 'Chrome';
        version = match ? match[1] : '';
        supported = parseInt(version) >= 67;
      } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
        const match = userAgent.match(/Version\/(\d+)/);
        name = 'Safari';
        version = match ? match[1] : '';
        supported = parseInt(version) >= 14;
      } else if (userAgent.includes('Firefox')) {
        const match = userAgent.match(/Firefox\/(\d+)/);
        name = 'Firefox';
        version = match ? match[1] : '';
        supported = parseInt(version) >= 60;
      } else if (userAgent.includes('Edge')) {
        const match = userAgent.match(/Edge\/(\d+)/);
        name = 'Edge';
        version = match ? match[1] : '';
        supported = parseInt(version) >= 18;
      }

      setBrowserInfo({ name, version, supported });
    };

    detectBrowser();
  }, []);

  const supportedBrowsers = [
    { name: 'Chrome', minVersion: '67+', icon: ComputerIcon }, 
    { name: 'Safari', minVersion: '14+', icon: ComputerIcon },
    { name: 'Firefox', minVersion: '60+', icon: ComputerIcon },
    { name: 'Edge', minVersion: '18+', icon: ComputerIcon },
  ];

  const supportedDevices = [
    'iPhone with TouchID or FaceID',
    'Android with fingerprint or biometric unlock',
    'Windows PC with Windows Hello',
    'Mac with TouchID',
    'Hardware security keys (YubiKey, etc.)'
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8"
    >
      {/* Header */}
      <div className="text-center mb-6">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring" }}
          className="w-16 h-16 bg-amber-100 dark:bg-amber-900/20 rounded-full flex items-center justify-center mx-auto mb-4"
        >
          <AlertTriangleIcon className="h-8 w-8 text-amber-600 dark:text-amber-400" />
        </motion.div>
        
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Passkeys Not Available
        </h2>
        
        <p className="text-gray-600 dark:text-gray-400">
          Your current setup doesn&apos;t support passkeys yet 
        </p>
      </div>

      {/* Browser Info */}
      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Current Browser:
          </span>
          <span className="text-sm text-gray-900 dark:text-white font-mono">
            {browserInfo.name} {browserInfo.version}
          </span>
        </div>
        
        <div className="flex items-center">
          {browserInfo.supported ? (
            <CheckCircleIcon className="h-4 w-4 text-green-500 mr-2" />
          ) : (
            <AlertTriangleIcon className="h-4 w-4 text-amber-500 mr-2" />
          )}
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {browserInfo.supported ? 'Browser supports passkeys' : 'Browser version too old'}
          </span>
        </div>
      </div>

      {/* Continue with Password */}
      <motion.button
        onClick={onContinueWithPassword}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors mb-6 flex items-center justify-center"
      >
        <KeyIcon className="h-5 w-5 mr-2" />
        Continue with Email & Password
      </motion.button>

      {/* Learn More Section */}
      <div className="border-t border-gray-200 dark:border-gray-600 pt-6">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
          To use passkeys, you need:
        </h3>
        
        {/* Supported Browsers */}
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Supported Browsers:
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {supportedBrowsers.map((browser) => (
              <div key={browser.name} className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                <browser.icon className="h-3 w-3 mr-1" />
                {browser.name} {browser.minVersion}
              </div>
            ))}
          </div>
        </div>

        {/* Supported Devices */}
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Compatible Devices:
          </h4>
          <ul className="space-y-1">
            {supportedDevices.map((device, index) => (
              <li key={index} className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                <LucidePhone className="h-3 w-3 mr-2 flex-shrink-0" />
                {device}
              </li>
            ))}
          </ul>
        </div>

        {onLearnMore && (
          <motion.button
            onClick={onLearnMore}
            whileHover={{ scale: 1.02 }}
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
          >
            Learn more about passkeys →
          </motion.button>
        )}
      </div>
    </motion.div>
  );
} 