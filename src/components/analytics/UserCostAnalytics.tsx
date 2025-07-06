import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "@/src/lib/auth-client";

import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Activity,
  Cpu,
  Calendar,
  Download,
  RefreshCw,
  AlertCircle,
  Users,
  BarChart2
} from "react-feather";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";

interface UserCostAnalyticsProps {
  startDate?: Date;
  endDate?: Date;
  isAdmin?: boolean;
}

interface UserSummary {
  userId: string;
  totalTokens: number;
  totalCost: number;
  totalRequests: number;
  averageTokensPerRequest: number;
  mostUsedModel: string;
  costEfficiencyScore: number;
  dailyUsage: Array<{
    date: string;
    tokens: number;
    cost: number;
    requests: number;
  }>;
  modelUsage: Record<string, {
    tokens: number;
    cost: number;
    requests: number;
  }>;
}

interface UserBreakdown {
  userId: string;
  username?: string;
  email?: string;
  summary: UserSummary;
  trends: {
    tokensGrowth: number;
    costGrowth: number;
    requestsGrowth: number;
  };
  topExpensiveRequests: Array<{
    timestamp: Date;
    model: string;
    tokens: number;
    cost: number;
    requestType: string;
  }>;
}

interface SystemStats {
  totalUsers: number;
  totalTokens: number;
  totalCost: number;
  totalRequests: number;
  averageCostPerUser: number;
  topSpendingUsers: Array<{ userId: string; cost: number }>;
  modelDistribution: Record<string, number>;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export const UserCostAnalytics: React.FC<UserCostAnalyticsProps> = ({
  startDate,
  endDate,
  isAdmin = false
}) => {
  const { data: session } = useSession();

  const [loading, setLoading] = useState(true);
  const [userSummary, setUserSummary] = useState<UserSummary | null>(null);
  const [userBreakdown, setUserBreakdown] = useState<UserBreakdown | null>(null);
  const [allUsersData, setAllUsersData] = useState<Array<{ userId: string; summary: UserSummary }>>([]);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [activeTab, setActiveTab] = useState<"personal" | "system">(isAdmin ? "system" : "personal");
  const [error, setError] = useState<string | null>(null);

  // Crea dati di test per dimostrare la dashboard
  const createTestData = () => {
    if (!session?.user?.id) return;

    // Import del servizio per tracking manuale
    import('@/src/lib/ai/ai-new/userAnalytics').then(({ userAnalyticsService }) => {
      const models = ['claude-3-7-sonnet-20250219', 'claude-3-haiku-20240229', 'gpt-4o', 'gpt-4o-mini'];

      // Genera 10 richieste di test con dati casuali
      for (let i = 0; i < 10; i++) {
        const model = models[Math.floor(Math.random() * models.length)];
        const promptTokens = Math.floor(Math.random() * 2000) + 500;
        const completionTokens = Math.floor(Math.random() * 1500) + 200;

        userAnalyticsService.trackUserUsage(
          session.user.id,
          model as any,
          promptTokens,
          completionTokens,
          `test_request_${i}`,
          `session_${Date.now()}`
        );
      }

      // Ricarica i dati
      fetchUserData();
    });
  };

  // Fetch user analytics data
  const fetchUserData = async () => {
    if (!session?.user?.id) return;

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        userId: session.user.id,
      });

      if (startDate && endDate) {
        params.append("startDate", startDate.toISOString());
        params.append("endDate", endDate.toISOString());
      }

      const response = await fetch(`/api/analytics/user-usage?${params}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch user data: ${response.statusText}`);
      }

      const data = await response.json();
      setUserSummary(data.summary);
      setUserBreakdown(data.breakdown);
    } catch (err) {
      console.error("Error fetching user data:", err);
      setError(err instanceof Error ? err.message : "Failed to load user data");
    } finally {
      setLoading(false);
    }
  };

  // Fetch system analytics data (admin only)
  const fetchSystemData = async () => {
    if (!isAdmin) return;

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();

      if (startDate && endDate) {
        params.append("startDate", startDate.toISOString());
        params.append("endDate", endDate.toISOString());
      }

      const response = await fetch(`/api/analytics/user-usage?${params}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch system data: ${response.statusText}`);
      }

      const data = await response.json();
      setAllUsersData(data.users || []);
      setSystemStats(data.systemStats);
    } catch (err) {
      console.error("Error fetching system data:", err);
      setError(err instanceof Error ? err.message : "Failed to load system data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (activeTab === "personal") {
        await fetchUserData();
      } else if (activeTab === "system" && isAdmin) {
        await fetchSystemData();
      }
    };

    // Initial fetch
    fetchData();

    // Set up 5-minute polling interval - only if not already polling via useAnalytics
    const interval = setInterval(() => {
      fetchData();
    }, 5 * 60 * 1000); // 5 minutes in milliseconds

    // Cleanup interval on unmount or when dependencies change
    return () => {
      clearInterval(interval);
    };
  }, [session?.user?.id, startDate?.toISOString(), endDate?.toISOString(), activeTab, isAdmin]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 4
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num);
  };

  const getTrendIcon = (growth: number) => {
    if (growth > 0) return <TrendingUp className="h-4 w-4 text-red-500" />;
    if (growth < 0) return <TrendingDown className="h-4 w-4 text-green-500" />;
    return <Activity className="h-4 w-4 text-gray-500" />;
  };

  const getTrendColor = (growth: number) => {
    if (growth > 0) return "text-red-500";
    if (growth < 0) return "text-green-500";
    return "text-gray-500";
  };

  if (loading) {
    return (
      <motion.div
        className="flex items-center justify-center h-64"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <RefreshCw className="h-6 w-6 animate-spin text-blue-500 mr-2" />
        <span className="text-gray-600 dark:text-gray-400">Loading user analytics...</span>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        className="flex items-center justify-center h-64 text-red-500"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <AlertCircle className="h-6 w-6 mr-2" />
        <span>{error}</span>
      </motion.div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Navigation Tabs */}
      {isAdmin && (
        <motion.div
          className="flex space-x-2 backdrop-blur-sm bg-white/60 dark:bg-gray-700/60 p-2 rounded-2xl shadow-lg border border-white/30 dark:border-gray-600/30"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === "personal"
              ? "bg-blue-500 text-white shadow-md"
              : "text-gray-600 dark:text-gray-300 hover:bg-white/40 dark:hover:bg-gray-700/40"
              }`}
            onClick={() => setActiveTab("personal")}
          >
            <div className="flex items-center">
              <DollarSign size={16} className="mr-2" />
              My Usage
            </div>
          </button>
          <button
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === "system"
              ? "bg-blue-500 text-white shadow-md"
              : "text-gray-600 dark:text-gray-300 hover:bg-white/40 dark:hover:bg-gray-700/40"
              }`}
            onClick={() => setActiveTab("system")}
          >
            <div className="flex items-center">
              <Users size={16} className="mr-2" />
              System Overview
            </div>
          </button>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {activeTab === "personal" && (
          <motion.div
            key="personal"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {userSummary ? (
              <>
                {/* Personal Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <motion.div
                    className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 rounded-2xl p-6 shadow-xl border border-white/30 dark:border-gray-600/30"
                    whileHover={{ scale: 1.02 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Cost</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {formatCurrency(userSummary.totalCost)}
                        </p>
                        {userBreakdown && (
                          <div className={`flex items-center text-sm ${getTrendColor(userBreakdown.trends.costGrowth)}`}>
                            {getTrendIcon(userBreakdown.trends.costGrowth)}
                            <span className="ml-1">{Math.abs(userBreakdown.trends.costGrowth).toFixed(1)}%</span>
                          </div>
                        )}
                      </div>
                      <DollarSign className="h-8 w-8 text-blue-500" />
                    </div>
                  </motion.div>

                  <motion.div
                    className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 rounded-2xl p-6 shadow-xl border border-white/30 dark:border-gray-600/30"
                    whileHover={{ scale: 1.02 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Tokens</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {formatNumber(userSummary.totalTokens)}
                        </p>
                        {userBreakdown && (
                          <div className={`flex items-center text-sm ${getTrendColor(userBreakdown.trends.tokensGrowth)}`}>
                            {getTrendIcon(userBreakdown.trends.tokensGrowth)}
                            <span className="ml-1">{Math.abs(userBreakdown.trends.tokensGrowth).toFixed(1)}%</span>
                          </div>
                        )}
                      </div>
                      <Activity className="h-8 w-8 text-green-500" />
                    </div>
                  </motion.div>

                  <motion.div
                    className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 rounded-2xl p-6 shadow-xl border border-white/30 dark:border-gray-600/30"
                    whileHover={{ scale: 1.02 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Requests</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {formatNumber(userSummary.totalRequests)}
                        </p>
                        {userBreakdown && (
                          <div className={`flex items-center text-sm ${getTrendColor(userBreakdown.trends.requestsGrowth)}`}>
                            {getTrendIcon(userBreakdown.trends.requestsGrowth)}
                            <span className="ml-1">{Math.abs(userBreakdown.trends.requestsGrowth).toFixed(1)}%</span>
                          </div>
                        )}
                      </div>
                      <Cpu className="h-8 w-8 text-purple-500" />
                    </div>
                  </motion.div>

                  <motion.div
                    className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 rounded-2xl p-6 shadow-xl border border-white/30 dark:border-gray-600/30"
                    whileHover={{ scale: 1.02 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Efficiency Score</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {userSummary.costEfficiencyScore.toFixed(1)}
                        </p>
                        <p className="text-sm text-gray-500">Cost efficiency</p>
                      </div>
                      <TrendingUp className="h-8 w-8 text-orange-500" />
                    </div>
                  </motion.div>
                </div>

                {/* Daily Usage Chart */}
                <motion.div
                  className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 rounded-2xl p-6 shadow-xl border border-white/30 dark:border-gray-600/30"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Daily Usage Trends</h3>
                  {userSummary.dailyUsage.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={userSummary.dailyUsage}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.3} />
                        <XAxis
                          dataKey="date"
                          stroke="#6B7280"
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis stroke="#6B7280" tick={{ fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1F2937',
                            border: 'none',
                            borderRadius: '12px',
                            color: '#F9FAFB'
                          }}
                          formatter={(value, name) => [
                            name === 'cost' ? formatCurrency(value as number) : formatNumber(value as number),
                            name === 'cost' ? 'Cost' : name === 'tokens' ? 'Tokens' : 'Requests'
                          ]}
                        />
                        <Line
                          type="monotone"
                          dataKey="cost"
                          stroke="#3B82F6"
                          strokeWidth={2}
                          dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="tokens"
                          stroke="#10B981"
                          strokeWidth={2}
                          dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      No usage data available for the selected period
                    </div>
                  )}
                </motion.div>

                {/* Model Usage Distribution */}
                <motion.div
                  className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 rounded-2xl p-6 shadow-xl border border-white/30 dark:border-gray-600/30"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Model Usage Distribution</h3>
                  {Object.keys(userSummary.modelUsage).length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={Object.entries(userSummary.modelUsage).map(([model, usage]) => ({
                              name: model,
                              value: usage.cost,
                              tokens: usage.tokens
                            }))}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${name.split('-')[0]} ${(percent * 100).toFixed(0)}%`}
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {Object.entries(userSummary.modelUsage).map((_, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value) => [formatCurrency(value as number), 'Cost']}
                            contentStyle={{
                              backgroundColor: '#1F2937',
                              border: 'none',
                              borderRadius: '12px',
                              color: '#F9FAFB'
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>

                      <div className="space-y-3">
                        {Object.entries(userSummary.modelUsage).map(([model, usage], index) => (
                          <div key={model} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                            <div className="flex items-center">
                              <div
                                className="w-4 h-4 rounded-full mr-3"
                                style={{ backgroundColor: COLORS[index % COLORS.length] }}
                              />
                              <span className="font-medium text-gray-900 dark:text-white">
                                {model.split('-')[0]}
                              </span>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-gray-900 dark:text-white">
                                {formatCurrency(usage.cost)}
                              </div>
                              <div className="text-sm text-gray-500">
                                {formatNumber(usage.tokens)} tokens
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      No model usage data available
                    </div>
                  )}
                </motion.div>
              </>
            ) : (
              <motion.div
                className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 rounded-2xl p-12 shadow-xl border border-white/30 dark:border-gray-600/30 text-center"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex flex-col items-center space-y-4">
                  <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-full">
                    <BarChart2 className="h-12 w-12 text-gray-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      No AI Usage Data
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 max-w-md">
                      You haven&apos;t used any AI features yet. Start creating CAD models, generating G-code, or using AI assistants to see your usage analytics here.
                    </p>
                  </div>
                  <motion.button
                    className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors duration-200"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={createTestData}
                  >
                    Generate Test Data
                  </motion.button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {activeTab === "system" && isAdmin && (
          <motion.div
            key="system"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {systemStats ? (
              <>
                {/* System Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <motion.div
                    className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 rounded-2xl p-6 shadow-xl border border-white/30 dark:border-gray-600/30"
                    whileHover={{ scale: 1.02 }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Users</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {formatNumber(systemStats.totalUsers)}
                        </p>
                      </div>
                      <Users className="h-8 w-8 text-blue-500" />
                    </div>
                  </motion.div>

                  <motion.div
                    className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 rounded-2xl p-6 shadow-xl border border-white/30 dark:border-gray-600/30"
                    whileHover={{ scale: 1.02 }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Cost</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {formatCurrency(systemStats.totalCost)}
                        </p>
                      </div>
                      <DollarSign className="h-8 w-8 text-green-500" />
                    </div>
                  </motion.div>

                  <motion.div
                    className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 rounded-2xl p-6 shadow-xl border border-white/30 dark:border-gray-600/30"
                    whileHover={{ scale: 1.02 }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Avg Cost/User</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {formatCurrency(systemStats.averageCostPerUser)}
                        </p>
                      </div>
                      <Activity className="h-8 w-8 text-purple-500" />
                    </div>
                  </motion.div>

                  <motion.div
                    className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 rounded-2xl p-6 shadow-xl border border-white/30 dark:border-gray-600/30"
                    whileHover={{ scale: 1.02 }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Tokens</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {formatNumber(systemStats.totalTokens)}
                        </p>
                      </div>
                      <Cpu className="h-8 w-8 text-orange-500" />
                    </div>
                  </motion.div>
                </div>

                {/* Top Spending Users */}
                <motion.div
                  className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 rounded-2xl p-6 shadow-xl border border-white/30 dark:border-gray-600/30"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Top Spending Users</h3>
                  {systemStats.topSpendingUsers.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={systemStats.topSpendingUsers}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.3} />
                        <XAxis
                          dataKey="userId"
                          stroke="#6B7280"
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis stroke="#6B7280" tick={{ fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1F2937',
                            border: 'none',
                            borderRadius: '12px',
                            color: '#F9FAFB'
                          }}
                          formatter={(value) => [formatCurrency(value as number), 'Cost']}
                        />
                        <Bar dataKey="cost" fill="#3B82F6" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      No user data available
                    </div>
                  )}
                </motion.div>
              </>
            ) : (
              <motion.div
                className="backdrop-blur-md bg-white/80 dark:bg-gray-800/80 rounded-2xl p-12 shadow-xl border border-white/30 dark:border-gray-600/30 text-center"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex flex-col items-center space-y-4">
                  <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-full">
                    <Users className="h-12 w-12 text-gray-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      No System Usage Data
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 max-w-md">
                      No users have used AI features yet. System analytics will appear here once users start interacting with AI assistants.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}; 