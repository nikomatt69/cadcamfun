import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MonitorIcon,
  ShieldIcon,
  ClockIcon,
  MapPinIcon,
  SmartphoneIcon,
  LaptopIcon,
  TabletIcon,
  TrashIcon,
  RefreshCwIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  KeyIcon,
  DatabaseIcon,
  WifiIcon,
  GlobeIcon
} from 'lucide-react';
import { useAuthSession, useAuthSecurity } from '@/src/store/authStore';
import { useSession } from '@/src/lib/auth-client';

interface AuthSession {
  id: string;
  userId: string;
  deviceInfo: {
    browser: string;
    os: string;
    isMobile: boolean;
    userAgent: string;
  };
  location?: {
    ip: string;
    city?: string;
    country?: string;
  };
  createdAt: string;
  lastActivity: string;
  expiresAt: string;
  isCurrent: boolean;
}

interface McpSession {
  id: string;
  serverName: string;
  status: 'connected' | 'disconnected' | 'error';
  connectedAt: string;
  lastActivity: string;
  messageCount: number;
  capabilities: string[];
}

interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  permissions: string[];
  createdAt: string;
  lastUsed?: string;
  expiresAt?: string;
  isActive: boolean;
}

export default function SessionManagement() {
  const { data: session } = useSession();
  const { session: authStoreSession } = useAuthSession();
  const { deviceTrusted, lastLoginMethod } = useAuthSecurity();

  const [authSessions, setAuthSessions] = useState<AuthSession[]>([]);
  const [mcpSessions, setMcpSessions] = useState<McpSession[]>([]);
  const [apiTokens, setApiTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load all session data
  useEffect(() => {
    loadAllSessions();
  }, []);

  const loadAllSessions = async () => {
    setLoading(true);
    setError(null);

    try {
      // Load auth sessions
      const authResponse = await fetch('/api/auth/sessions');
      if (authResponse.ok) {
        const authData = await authResponse.json();
        setAuthSessions(authData.sessions || []);
      }

      // Load MCP sessions
      const mcpResponse = await fetch('/api/mcp/sessions');
      if (mcpResponse.ok) {
        const mcpData = await mcpResponse.json();
        setMcpSessions(mcpData.sessions || []);
      }

      // Load API tokens
      const tokensResponse = await fetch('/api/user/tokens');
      if (tokensResponse.ok) {
        const tokensData = await tokensResponse.json();
        setApiTokens(tokensData.tokens || []);
      }
    } catch (error) {
      setError('Failed to load session data');
      console.error('Session loading error:', error);
    } finally {
      setLoading(false);
    }
  };

  const revokeAuthSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to revoke this session?')) return;
    setSuccess('Session revoked successfully');
    await loadAllSessions();
  };

  const disconnectMcpSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to disconnect this MCP session?')) return;
    setSuccess('MCP session disconnected');
    await loadAllSessions();
  };

  const revokeApiToken = async (tokenId: string) => {
    if (!confirm('Are you sure you want to revoke this API token?')) return;
    setSuccess('API token revoked successfully');
    await loadAllSessions();
  };

  const getDeviceIcon = (deviceInfo: any) => {
    if (deviceInfo.isMobile) {
      return <SmartphoneIcon className="h-5 w-5 text-green-500" />;
    }
    if (deviceInfo.os?.includes('iPad')) {
      return <TabletIcon className="h-5 w-5 text-blue-500" />;
    }
    return <LaptopIcon className="h-5 w-5 text-gray-500" />;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'text-green-500';
      case 'disconnected': return 'text-gray-500';
      case 'error': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"
        />
        <p className="text-gray-500 dark:text-gray-400">Loading sessions...</p>
      </div>
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
            <MonitorIcon className="h-7 w-7 mr-3 text-blue-500" />
            Active Sessions
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage your authentication sessions, MCP connections, and API tokens
          </p>
        </div>

        <motion.button
          onClick={loadAllSessions}
          disabled={loading}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCwIcon className="h-4 w-4 mr-2" />
          Refresh
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

      {/* Current Session Info */}
      {authStoreSession && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
          <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-4 flex items-center">
            <CheckCircleIcon className="h-5 w-5 mr-2" />
            Current Session
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-blue-700 dark:text-blue-300 font-medium">Device:</span>
              <p className="text-blue-600 dark:text-blue-400">
                {authStoreSession.deviceInfo.browser} on {authStoreSession.deviceInfo.os}
              </p>
            </div>
            <div>
              <span className="text-blue-700 dark:text-blue-300 font-medium">Login Method:</span>
              <p className="text-blue-600 dark:text-blue-400 capitalize">
                {lastLoginMethod || 'Unknown'}
              </p>
            </div>
            <div>
              <span className="text-blue-700 dark:text-blue-300 font-medium">Expires:</span>
              <p className={`font-medium text-blue-600 dark:text-blue-400`}>
                {authStoreSession.expiresAt ? formatTimeAgo(authStoreSession.expiresAt.toISOString()) : 'Never'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Auth Sessions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
            <ShieldIcon className="h-5 w-5 mr-2 text-green-500" />
            Authentication Sessions ({authSessions.length})
          </h3>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {authSessions.map((session, index) => (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center space-x-4">
                {getDeviceIcon(session.deviceInfo)}

                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white flex items-center">
                    {session.deviceInfo.browser} on {session.deviceInfo.os}
                    {session.isCurrent && (
                      <span className="ml-2 px-2 py-1 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs rounded-full">
                        Current
                      </span>
                    )}
                  </h4>
                  <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                    <p className="flex items-center">
                      <ClockIcon className="h-3 w-3 mr-1" />
                      Last active: {formatTimeAgo(session.lastActivity)}
                    </p>
                    {session.location && (
                      <p className="flex items-center">
                        <MapPinIcon className="h-3 w-3 mr-1" />
                        {session.location.city}, {session.location.country} ({session.location.ip})
                      </p>
                    )}
                    <p className="text-xs font-mono text-gray-400">
                      Session ID: {session.id.slice(0, 8)}...
                    </p>
                  </div>
                </div>
              </div>

              {!session.isCurrent && (
                <motion.button
                  onClick={() => revokeAuthSession(session.id)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Revoke session"
                >
                  <TrashIcon className="h-4 w-4" />
                </motion.button>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* MCP Sessions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
            <DatabaseIcon className="h-5 w-5 mr-2 text-purple-500" />
            MCP Connections ({mcpSessions.length})
          </h3>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {mcpSessions.map((session, index) => (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center space-x-4">
                <WifiIcon className={`h-5 w-5 ${getStatusColor(session.status)}`} />

                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    {session.serverName}
                  </h4>
                  <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                    <p className="flex items-center">
                      Status: <span className={`ml-1 font-medium ${getStatusColor(session.status)}`}>
                        {session.status}
                      </span>
                    </p>
                    <p>Connected: {formatTimeAgo(session.connectedAt)}</p>
                    <p>Messages: {session.messageCount}</p>
                    <p className="text-xs">
                      Capabilities: {session.capabilities.join(', ')}
                    </p>
                  </div>
                </div>
              </div>

              <motion.button
                onClick={() => disconnectMcpSession(session.id)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                title="Disconnect MCP session"
              >
                <XCircleIcon className="h-4 w-4" />
              </motion.button>
            </motion.div>
          ))}
        </div>
      </div>

      {/* API Tokens */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
            <KeyIcon className="h-5 w-5 mr-2 text-yellow-500" />
            API Tokens ({apiTokens.length})
          </h3>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {apiTokens.map((token, index) => (
            <motion.div
              key={token.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="p-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-center space-x-4">
                <KeyIcon className={`h-5 w-5 ${token.isActive ? 'text-green-500' : 'text-gray-400'}`} />

                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white flex items-center">
                    {token.name}
                    {!token.isActive && (
                      <span className="ml-2 px-2 py-1 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs rounded-full">
                        Inactive
                      </span>
                    )}
                  </h4>
                  <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                    <p className="font-mono">{token.prefix}...</p>
                    <p>Created: {formatTimeAgo(token.createdAt)}</p>
                    {token.lastUsed && (
                      <p>Last used: {formatTimeAgo(token.lastUsed)}</p>
                    )}
                    {token.expiresAt && (
                      <p>Expires: {formatTimeAgo(token.expiresAt)}</p>
                    )}
                    <p className="text-xs">
                      Permissions: {token.permissions.join(', ')}
                    </p>
                  </div>
                </div>
              </div>

              <motion.button
                onClick={() => revokeApiToken(token.id)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                title="Revoke API token"
              >
                <TrashIcon className="h-4 w-4" />
              </motion.button>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Security Tips */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6">
        <h3 className="font-semibold text-amber-900 dark:text-amber-200 mb-3 flex items-center">
          <AlertTriangleIcon className="h-5 w-5 mr-2" />
          Security Tips
        </h3>
        <ul className="text-amber-800 dark:text-amber-300 text-sm space-y-2">
          <li>• Regularly review and revoke unused sessions and tokens</li>
          <li>• Sign out of sessions on shared or public devices</li>
          <li>• Use API tokens with minimal required permissions</li>
          <li>• Monitor for suspicious activity from unknown locations</li>
          <li>• Set appropriate expiration dates for API tokens</li>
        </ul>
      </div>
    </motion.div>
  );
} 