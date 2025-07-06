import React, { useState } from 'react';
import { Settings, Shield, Users, Check, X } from 'react-feather';
import { useAdmin } from '@/src/hooks/useAdmin';
import { useFeatureFlags } from '@/src/hooks/useFeatureFlags';
import { FeatureFlag } from '@/src/types/featureFlags';
import { featureFlagService } from '@/src/lib/featureFlags/featureFlagService';

export const AdminFeatureFlagsPanel: React.FC = () => {
  const { isAdmin } = useAdmin();
  const { planFeatures } = useFeatureFlags();
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [showPanel, setShowPanel] = useState(false);

  if (!isAdmin) {
    return null;
  }

  const allFeatures = featureFlagService.getAllFeatureFlags();

  const addUserOverride = (userId: string, feature: FeatureFlag, enabled: boolean) => {
    featureFlagService.addAdminOverride({
      userId,
      featureFlag: feature,
      enabled,
      reason: `Admin override - ${enabled ? 'enabled' : 'disabled'} by admin`,
    });
  };

  const removeUserOverride = (userId: string, feature: FeatureFlag) => {
    featureFlagService.removeAdminOverride(userId, feature);
  };

  return (
    <>
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="fixed bottom-4 right-4 bg-red-600 hover:bg-red-700 text-white p-3 rounded-full shadow-lg z-50 transition-colors"
        title="Admin Feature Flags"
      >
        <Shield className="w-6 h-6" />
      </button>

      {showPanel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-3">
                <Shield className="w-6 h-6 text-red-600" />
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Admin Feature Flags
                </h2>
              </div>
              <button
                onClick={() => setShowPanel(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Current Admin Status */}
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-3">
                    <Check className="w-5 h-5 text-green-600" />
                    <h3 className="font-medium text-green-800 dark:text-green-200">
                      Admin Access Active
                    </h3>
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    You have full access to all features regardless of subscription plan.
                  </p>
                  <div className="mt-2 text-xs text-green-600 dark:text-green-400">
                    Admin emails: nicom.19@icloud.com, nicola.mattioli.95@gmail.com
                  </div>
                </div>

                {/* Feature Overview */}
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-3">
                    <Settings className="w-5 h-5 text-blue-600" />
                    <h3 className="font-medium text-blue-800 dark:text-blue-200">
                      Feature Overview
                    </h3>
                  </div>
                  <div className="text-sm text-blue-700 dark:text-blue-300">
                    <div>Total Features: {allFeatures.length}</div>
                    <div>AI Features: {allFeatures.filter(f => f.startsWith('ai_')).length}</div>
                    <div>CAD Features: {allFeatures.filter(f => f.startsWith('cad_')).length}</div>
                    <div>CAM Features: {allFeatures.filter(f => f.startsWith('cam_')).length}</div>
                  </div>
                </div>
              </div>

              {/* User Override Management */}
              <div className="mt-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  User Feature Overrides
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      User ID for Override
                    </label>
                    <input
                      type="text"
                      value={selectedUser}
                      onChange={(e) => setSelectedUser(e.target.value)}
                      placeholder="Enter user ID"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  {selectedUser && (
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                        Available Features
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                        {allFeatures.map((feature) => (
                          <div key={feature} className="flex items-center justify-between bg-white dark:bg-gray-600 rounded p-2">
                            <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
                              {feature.replace(/_/g, ' ')}
                            </span>
                            <div className="flex space-x-1">
                              <button
                                onClick={() => addUserOverride(selectedUser, feature, true)}
                                className="bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded text-xs"
                              >
                                ✓
                              </button>
                              <button
                                onClick={() => addUserOverride(selectedUser, feature, false)}
                                className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs"
                              >
                                ✗
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Feature Flags Documentation */}
              <div className="mt-6 bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                  Feature Categories
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <h4 className="font-medium text-gray-800 dark:text-gray-200">AI Features</h4>
                    <ul className="text-gray-600 dark:text-gray-400 space-y-1">
                      <li>• AI Assistant</li>
                      <li>• AI Vision Analysis</li>
                      <li>• Autonomous Agent</li>
                      <li>• Code Interpreter</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-800 dark:text-gray-200">CAD/CAM Features</h4>
                    <ul className="text-gray-600 dark:text-gray-400 space-y-1">
                      <li>• Advanced CAD Tools</li>
                      <li>• 3D Modeling</li>
                      <li>• CAM Operations</li>
                      <li>• Export Formats</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};