// src/pages/index.tsx
import Image from "next/image";
import { useEffect, useState, useRef } from "react";

import { useRouter } from "next/router";
import Link from "next/link";
import { Grid, Tool, File, Box, Layers, Settings, Clock, ChevronUp, BarChart2, Cpu, Activity, Zap, TrendingUp, Database, Monitor, Wifi } from "react-feather";
import Loading from "../components/ui/Loading";
import MetaTags from "../components/layout/Metatags";
import ActivityChart from "../components/analytics/ActivityChart";
import dynamic from "next/dynamic";
import { useAnalytics } from "../hooks/useAnalytics";
import { motion, AnimatePresence, useScroll, useTransform, useSpring } from "framer-motion";
import { useAuthRedirect } from "@/src/hooks/useAuthRedirect";
import { useTauri } from "../hooks/useTauri";

// Holographic Card Component
interface HolographicCardProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  [key: string]: any;
}

const HolographicCard: React.FC<HolographicCardProps> = ({ children, className = "", delay = 0, ...props }) => (
  <motion.div
    initial={{ opacity: 0, y: 20, scale: 0.95 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: 0.5, delay }}
    className={`relative overflow-hidden bg-gradient-to-br from-blue-50/80 via-purple-50/60 to-cyan-50/80 
                backdrop-blur-xl border-0 shadow-2xl hover:shadow-3xl 
                transition-all duration-300 hover:scale-[1.02] group rounded-3xl ${className}`}
    style={{
      background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
      backdropFilter: 'blur(20px)'
    }}
    {...props}
  >
    {/* Holographic overlay */}
    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent 
                    opacity-0 group-hover:opacity-100 transition-opacity duration-500
                    transform -skew-x-12 group-hover:animate-pulse rounded-3xl" />

    {children}
  </motion.div>
);

// Holographic Metric Card
interface MetricCardProps {
  icon: React.ComponentType<any>;
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative";
  delay?: number;
  gradient?: "blue" | "purple" | "green" | "orange" | "yellow";
}

const MetricCard: React.FC<MetricCardProps> = ({
  icon: Icon,
  title,
  value,
  change,
  changeType = "positive",
  delay = 0,
  gradient = "blue"
}) => {
  const gradients: Record<string, string> = {
    blue: "from-blue-500 to-cyan-500",
    purple: "from-purple-500 to-pink-500",
    green: "from-green-500 to-emerald-500",
    orange: "from-orange-500 to-red-500",
    yellow: "from-yellow-500 to-orange-500"
  };

  const selectedGradient = gradients[gradient];

  return (
    <HolographicCard delay={delay} className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-full bg-gradient-to-r ${selectedGradient} bg-opacity-20`}>
          <Icon className={`h-6 w-6 text-transparent bg-clip-text bg-gradient-to-r ${selectedGradient}`} />
        </div>
        {change && (
          <motion.div
            className={`flex items-center text-sm ${changeType === 'positive' ? 'text-green-600' : 'text-red-600'}`}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: delay + 0.2 }}
          >
            <TrendingUp className="h-4 w-4 mr-1" />
            {change}
          </motion.div>
        )}
      </div>
      <motion.h3
        className="text-2xl font-bold text-gray-900 dark:text-white mb-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: delay + 0.3 }}
      >
        {value}
      </motion.h3>
      <p className="text-sm text-gray-600 dark:text-gray-300">{title}</p>
    </HolographicCard>
  );
};

interface DashboardStats {
  totalProjects: number;
  totalDrawings: number;
  totalComponents: number;
  totalTools: number;
  recentActivities: Activity[];
}

interface Activity {
  id: string;
  type: "project" | "drawing" | "component" | "tool" | "gcode";
  action: "created" | "updated" | "deleted" | "exported";
  itemName: string;
  timestamp: string;
  userId: string;
  userName: string;
}

interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  storageUsed: number;
  networkLatency: number;
  activeConnections: number;
  cacheHitRatio: number;
  errorRate: number;
  responseTime: number;
}

interface AnalyticsData {
  components: {
    total: number;
    trend: number;
    recentActivity: number;
  };
  projects: {
    total: number;
    trend: number;
    activeProjects: number;
  };
  tools: {
    total: number;
    trend: number;
    mostUsed: string;
  };
  materials: {
    total: number;
    trend: number;
    lowStock: number;
  };
}

const Layout = dynamic(() => import("@/src/components/layout/Layout"), { ssr: false });

export default function Home() {

  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  // Use enhanced auth redirect system
  const { isLoading: authLoading, canAccess, user } = useAuthRedirect({ requireAuth: true });
  const { httpFetch, isDesktop } = useTauri();

  // In desktop environment, we simplify the interface by hiding analytics

  // Framer Motion scroll and spring animations
  const { scrollYProgress } = useScroll();
  const yHero = useTransform(scrollYProgress, [0, 0.3], [0, -50]);
  const scaleHero = useTransform(scrollYProgress, [0, 0.3], [1, 0.95]);
  const opacityHero = useTransform(scrollYProgress, [0, 0.3], [1, 0.8]);
  const springConfig = { stiffness: 100, damping: 30, restDelta: 0.001 };
  const ySpring = useSpring(yHero, springConfig);
  const scaleSpring = useSpring(scaleHero, springConfig);
  const opacitySpring = useSpring(opacityHero, springConfig);

  // Handle scroll to show/hide "back to top" button
  useEffect(() => {
    const handleScroll = () => {
      // If scrolling inside the Layout, access its container
      const scrollContainer = document.querySelector("main") || window;

      if (scrollContainer) {
        const scrollTop = "scrollTop" in scrollContainer ? scrollContainer.scrollTop : window.pageYOffset;

        setShowScrollTop(scrollTop > 300);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    // Also capture scroll events inside the layout
    const mainElement = document.querySelector("main");
    if (mainElement) {
      mainElement.addEventListener("scroll", handleScroll, { passive: true });
    }

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (mainElement) {
        mainElement.removeEventListener("scroll", handleScroll);
      }
    };
  }, []);

  // Function to scroll back to top
  const scrollToTop = () => {
    const mainElement = document.querySelector("main");
    if (mainElement) {
      mainElement.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    } else {
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }
  };

  const fetchDashboardData = async () => {
    try {
      const response = await httpFetch("/api/dashboard");
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const [dateRange, setDateRange] = useState<{
    startDate?: Date;
    endDate?: Date;
  }>({
    startDate: new Date(new Date().setDate(new Date().getDate() - 30)), // Last 30 days
    endDate: new Date()
  });

  const isAdmin = false;

  // L'auth redirect viene gestito dal hook useAuthRedirect automaticamente
  const toggleChartType = () => {
    setChartType(prev => (prev === "line" ? "bar" : "line"));
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 0) {
      return diffDays === 1 ? "Yesterday" : `${diffDays} days ago`;
    } else if (diffHours > 0) {
      return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes} ${diffMinutes === 1 ? "minute" : "minutes"} ago`;
    } else {
      return "Just now";
    }
  };

  const getActivityIcon = (activity: Activity) => {
    switch (activity.type) {
      case "project":
        return <File size={20} className="text-purple-500" />;
      case "drawing":
        return <Grid size={20} className="text-blue-500" />;
      case "component":
        return <Box size={20} className="text-green-500" />;
      case "tool":
        return <Tool size={20} className="text-orange-500" />;
      case "gcode":
        return <Code size={20} className="text-red-500" />;
      default:
        return <Clock size={20} className="text-gray-500" />;
    }
  };
  interface UserMetricsSummary {
    totalAiRequests: number;
    totalCadDrawings: number;
    totalStorageUsage: number; // e.g., in MB
    totalProjects: number;
    totalComponents: number;
    totalToolpaths: number;
    totalActivityCount?: number; // Include if added in API
  }

  const {
    data: generalAnalyticsData,
    isLoading: isGeneralLoading,
    error: generalError
  } = useAnalytics({
    groupBy: "day"
  }, { enablePolling: false }); // Disabilita polling per evitare conflitti, gestito manualmente
  // Interface for the API response structure (only summary needed here now)
  interface UserMetricsApiResponse {
    summary: UserMetricsSummary;
  }
  const [userMetrics, setUserMetrics] = useState<UserMetricsSummary | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // New analytics and system metrics state
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [lastActivity, setLastActivity] = useState<Activity | null>(null);
  const [loadingSystemMetrics, setLoadingSystemMetrics] = useState<boolean>(true);

  // Effect to fetch user metrics summary data con throttling
  useEffect(() => {
    const fetchMetricsSummary = async () => {
      if (!user?.id) return;
      try {
        const response = await httpFetch(`/api/user/${user.id}/metrics-summary`);
        if (!response.ok) {
          throw new Error("Failed to fetch user metrics summary");
        }
        const data: UserMetricsApiResponse = await response.json();
        setUserMetrics(data.summary);
      } catch (err) {
        console.error("Error fetching metrics summary:", err);
        setError("Failed to load user metrics.");
      } finally {
        setLoadingMetrics(false);
      }
    };

    fetchMetricsSummary();
  }, [user?.id, httpFetch]);

  // Effect to fetch system metrics and analytics data
  useEffect(() => {
    const fetchSystemData = async () => {
      if (!isAdmin) return;
      setLoadingSystemMetrics(true);
      try {
        const response = await httpFetch("/api/system/metrics");
        if (!response.ok) {
          throw new Error(`Failed to fetch system metrics: ${response.statusText}`);
        }
        const data: SystemMetrics = await response.json();
        setSystemMetrics(data);
      } catch (err) {
        console.error("Error fetching system data:", err);
        setError("Failed to load system metrics.");
      } finally {
        setLoadingSystemMetrics(false);
      }
    };
    fetchSystemData();
  }, [isAdmin, httpFetch]);

  // Real-time updates for system metrics - ridotto polling
  useEffect(() => {
    if (!systemMetrics) return;

    const interval = setInterval(async () => {
      try {
        const response = await httpFetch("/api/system/metrics");
        if (response.ok) {
          const data = await response.json();
          setSystemMetrics(data);
        }
      } catch (error) {
        console.error("Error updating system metrics:", error);
      }
    }, 5 * 60 * 1000); // Update ogni 5 minuti coordinato con altri analytics

    return () => clearInterval(interval);
  }, [systemMetrics, httpFetch]);

  if (authLoading || !canAccess) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loading />
      </div>
    );
  }
  return (
    <>
      <MetaTags
        title="CAD/CAM FUN"
        description="A modern platform for 2D/3D design, parametric modeling, and CNC machine control with AI."
        ogImage="/og-image.png"
      />

      <Layout>
        <div className="p-4 sm:p-6" ref={contentRef}>
          {/* Welcome section with system overview - Enhanced Holographic Hero */}
          <motion.div
            className="mb-8 sm:mb-12 text-center relative"
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{
              y: ySpring,
              scale: scaleSpring,
              opacity: opacitySpring
            }}
          >

            {/* Background holographic effects */}


            {/* Main hero container with holographic card effect */}
            <HolographicCard className="mx-auto max-w-4xl p-8 border-0 sm:p-12 relative overflow-hidden" delay={0.2}>
              {/* Animated background patterns */}
              <div className="absolute inset-0 opacity-5">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-500 via-purple-500 to-cyan-500 opacity-10"></div>
                <motion.div
                  className="absolute top-4 right-4 w-32 h-32 border border-blue-300/20 rounded-full"
                  animate={{ rotate: 360, scale: [1, 1.1, 1] }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                />
                <motion.div
                  className="absolute bottom-4 left-4 w-24 h-24 border border-purple-300/20 rounded-full"
                  animate={{ rotate: -360, scale: [1, 0.9, 1] }}
                  transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                />
              </div>

              {/* Logo and title section */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                <h1 className="text-3xl sm:text-4xl lg:text-5xl flex items-center justify-center px-2 sm:px-5 font-bold text-gray-900 dark:text-white relative z-10">
                  <motion.div
                    className="relative"
                    whileHover={{ scale: 1.05 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    {/* Glow effect for logo */}
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-cyan-500/20 blur-xl rounded-2xl"></div>
                    <Image
                      src="/logo.png"
                      className="mr-4 relative z-10 drop-shadow-2xl"
                      width={500}
                      height={180}
                      alt="CAD/CAM FUN Logo"
                    />
                  </motion.div>
                </h1>
              </motion.div>

              {/* Enhanced description section */}
              <motion.div
                className="mt-6 space-y-4 relative z-10"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
              >
                <p className="text-lg sm:text-xl lg:text-2xl text-transparent bg-clip-text bg-gradient-to-r from-gray-700 via-gray-800 to-gray-700 dark:from-gray-200 dark:via-white dark:to-gray-200 px-2 sm:px-0 font-medium leading-relaxed">
                  The <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent font-bold">modern platform</span> for 2D/3D design, parametric modeling, and CNC machine control with artificial intelligence
                </p>

                <motion.div
                  className="flex flex-wrap justify-center gap-3 mt-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                >
                  {[
                    { icon: "🎯", text: "Engineering Precision" },
                    { icon: "🤖", text: "Integrated AI" },
                    { icon: "⚡", text: "Optimal Performance" },
                    { icon: "🛠️", text: "CNC Control" }
                  ].map((feature, index) => (
                    <motion.div
                      key={feature.text}
                      className="flex items-center space-x-2 bg-white/20 dark:bg-gray-800/20 backdrop-blur-sm px-4 py-2 rounded-full border border-white/10 dark:border-gray-700/10"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.9 + index * 0.1 }}
                      whileHover={{ scale: 1.05, backgroundColor: "rgba(255,255,255,0.3)" }}
                    >
                      <span className="text-lg">{feature.icon}</span>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{feature.text}</span>
                    </motion.div>
                  ))}
                </motion.div>

                <motion.p
                  className="text-base sm:text-lg text-gray-600 dark:text-gray-400 px-2 sm:px-0 max-w-3xl mx-auto leading-relaxed mt-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.2 }}
                >
                  Transform your ideas into reality with professional design tools,
                  advanced simulation capabilities, and automated toolpath generation.
                  <span className="text-blue-600 dark:text-blue-400 font-medium"> Where innovation meets manufacturing tradition.</span>
                </motion.p>
              </motion.div>

              {/* Floating elements for decoration */}
              <motion.div
                className="absolute top-8 left-8 w-2 h-2 bg-blue-400/60 rounded-full"
                animate={{
                  y: [0, -10, 0],
                  opacity: [0.6, 1, 0.6]
                }}
                transition={{ duration: 3, repeat: Infinity }}
              />
              <motion.div
                className="absolute top-16 right-12 w-1 h-1 bg-purple-400/60 rounded-full"
                animate={{
                  y: [0, -8, 0],
                  opacity: [0.4, 0.8, 0.4]
                }}
                transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
              />
              <motion.div
                className="absolute bottom-12 left-16 w-1.5 h-1.5 bg-cyan-400/60 rounded-full"
                animate={{
                  y: [0, -6, 0],
                  opacity: [0.5, 0.9, 0.5]
                }}
                transition={{ duration: 2.8, repeat: Infinity, delay: 1 }}
              />
            </HolographicCard>

            {/* Subtle bottom glow */}
            <motion.div
              className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-64 h-4 bg-gradient-to-r from-transparent via-blue-400/20 to-transparent blur-xl"
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 4, repeat: Infinity }}
            />
          </motion.div>

          {/* Holographic Analytics Grid - Hidden in Desktop */}
          {!isDesktop && (
            <motion.div
              className="grid grid-cols-1 rounded-2xl md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, staggerChildren: 0.1 }}
            >
              {analyticsData && (
                <>
                  <MetricCard
                    icon={Box}
                    title="Components"
                    value={analyticsData.components.total}
                    change={`+${analyticsData.components.trend}%`}
                    gradient="blue"
                    delay={0}
                  />
                  <MetricCard
                    icon={File}
                    title="Projects"
                    value={analyticsData.projects.total}
                    change={`+${analyticsData.projects.trend}%`}
                    gradient="purple"
                    delay={0.1}
                  />
                  <MetricCard
                    icon={Tool}
                    title="Toolpaths"
                    value={analyticsData.tools.total}
                    change={`+${analyticsData.tools.trend}%`}
                    gradient="green"
                    delay={0.2}
                  />
                  <MetricCard
                    icon={Layers}
                    title="Materials"
                    value={analyticsData.materials.total}
                    change={`+${analyticsData.materials.trend}%`}
                    gradient="orange"
                    delay={0.3}
                  />
                </>
              )}
            </motion.div>
          )}

          {/* Main application modules - Holographic Style */}
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3  gap-6 mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, staggerChildren: 0.1 }}
            whileInView={{
              transition: { staggerChildren: 0.1 }
            }}
            viewport={{ once: true, amount: 0.3 }}
          >
            {/* CAD Card */}
            <Link href="/cad">
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                whileHover={{
                  y: -8,
                  transition: { type: "spring", stiffness: 300, damping: 20 }
                }}
                whileTap={{ scale: 0.95 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.1 }}

              >
                <HolographicCard className="overflow-hidden border-hidden rounded-b-2xl border-none" delay={0}>
                  <div className="h-1 bg-gradient-to-r from-blue-500 to-cyan-500"></div>
                  <div className="p-6">
                    <div className="flex items-center mb-4">
                      <div className="h-12 w-12 rounded-2xl bg-gradient-to-r from-blue-500/20 to-cyan-500/20 flex items-center justify-center mr-4">
                        <Grid className="h-6 w-6 text-blue-600" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">CAD Editor</h2>
                        <p className="text-sm text-gray-600 dark:text-gray-300">Create and edit designs</p>
                      </div>
                    </div>
                    <p className="text-gray-600 dark:text-gray-300 mb-6">
                      Design 2D/3D models with our powerful modeling tools and parametric features.
                    </p>

                    <motion.button
                      onClick={() => router.push("/cad")}
                      className="bg-gradient-to-r from-blue-600 cursor-pointer to-cyan-600 text-white w-full py-3 rounded-2xl hover:from-blue-700 hover:to-cyan-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-all duration-300"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Open CAD Editor
                    </motion.button>

                  </div>
                </HolographicCard>
              </motion.div>
            </Link>
            {/* CAM Card */}
            <Link href="/cam" className="z-40">
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                whileHover={{
                  y: -8,
                  transition: { type: "spring", stiffness: 300, damping: 20 }
                }}
                whileTap={{ scale: 0.95 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}

              >
                <HolographicCard className="overflow-hidden" delay={0.1}>
                  <div className="h-1 bg-gradient-to-r from-green-500 to-emerald-500"></div>
                  <div className="p-6">
                    <div className="flex items-center mb-4">
                      <div className="h-12 w-12 rounded-xl bg-gradient-to-r from-green-500/20 to-emerald-500/20 flex items-center justify-center mr-4">
                        <Tool className="h-6 w-6 text-green-600" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">CAM Editor</h2>
                        <p className="text-sm text-gray-600 dark:text-gray-300">Generate toolpaths</p>
                      </div>
                    </div>
                    <p className="text-gray-600 dark:text-gray-300 mb-6">
                      Create toolpaths and generate G-code for CNC machining with precision.
                    </p>
                    <Link href="/cam" className="z-40">
                      <motion.button
                        onClick={() => router.push("/cam")}
                        className="bg-gradient-to-r cursor-pointer from-green-600 to-emerald-600 text-white w-full py-3 rounded-2xl hover:from-green-700 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 transition-all duration-300"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        Open CAM Editor
                      </motion.button>
                    </Link>
                  </div>
                </HolographicCard>
              </motion.div>
            </Link>
            {/* Projects Card */}
            <Link href="/projects" className="z-40">
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                whileHover={{
                  y: -8,
                  transition: { type: "spring", stiffness: 300, damping: 20 }
                }}
                whileTap={{ scale: 0.95 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <HolographicCard className="overflow-hidden" delay={0.2}>
                  <div className="h-1 bg-gradient-to-r from-purple-500 to-pink-500"></div>
                  <div className="p-6">
                    <div className="flex items-center mb-4">
                      <div className="h-12 w-12 rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 flex items-center justify-center mr-4">
                        <File className="h-6 w-6 text-purple-600" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Projects</h2>
                        <p className="text-sm text-gray-600 dark:text-gray-300">Manage your work</p>
                      </div>
                    </div>
                    <p className="text-gray-600 dark:text-gray-300 mb-6">
                      Organize and manage your designs, components, and machining operations.
                    </p>
                    <Link href="/projects" className="z-40">
                      <motion.button
                        onClick={() => router.push("/projects")}
                        className="bg-gradient-to-r from-purple-600 to-pink-600 text-white w-full py-3 rounded-2xl hover:from-purple-700 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 transition-all duration-300"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        Browse Projects
                      </motion.button>
                    </Link>
                  </div>
                </HolographicCard>
              </motion.div>
            </Link>
          </motion.div>

          {/* System Performance Metrics - Hidden in Desktop */}
          {!isDesktop && (
            <motion.div
              className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              {/* System Performance Card */}
              <HolographicCard className="" delay={0.4}>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center">
                      <div className="h-10 w-10 rounded-2xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 flex items-center justify-center mr-3">
                        <Monitor className="h-5 w-5 text-cyan-600" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">System Performance</h3>
                    </div>
                    <motion.div
                      className="flex items-center text-green-600"
                      animate={{ rotate: [0, 360] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    >
                      <Activity className="h-4 w-4" />
                    </motion.div>
                  </div>

                  {systemMetrics && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-3">
                        {/* CPU Usage */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm text-gray-600 dark:text-gray-300">CPU</span>
                            <span className="text-sm font-medium text-gray-900 dark:text-white">{systemMetrics.cpuUsage}%</span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <motion.div
                              className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${systemMetrics.cpuUsage}%` }}
                              transition={{ duration: 1, delay: 0.5 }}
                            />
                          </div>
                        </div>

                        {/* Memory Usage */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm text-gray-600 dark:text-gray-300">Memory</span>
                            <span className="text-sm font-medium text-gray-900 dark:text-white">{systemMetrics.memoryUsage}%</span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <motion.div
                              className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${systemMetrics.memoryUsage}%` }}
                              transition={{ duration: 1, delay: 0.6 }}
                            />
                          </div>
                        </div>

                        {/* Storage */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm text-gray-600 dark:text-gray-300">Storage</span>
                            <span className="text-sm font-medium text-gray-900 dark:text-white">{systemMetrics.storageUsed}%</span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <motion.div
                              className="bg-gradient-to-r from-orange-500 to-red-500 h-2 rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${systemMetrics.storageUsed}%` }}
                              transition={{ duration: 1, delay: 0.7 }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {/* Network Latency */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600 dark:text-gray-300">Latency</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{systemMetrics.networkLatency}ms</span>
                        </div>

                        {/* Active Connections */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600 dark:text-gray-300">Connections</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{systemMetrics.activeConnections}</span>
                        </div>

                        {/* Cache Hit Ratio */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600 dark:text-gray-300">Cache Hit</span>
                          <span className="text-sm font-medium text-green-600">{systemMetrics.cacheHitRatio}%</span>
                        </div>

                        {/* Error Rate */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600 dark:text-gray-300">Error Rate</span>
                          <span className="text-sm font-medium text-red-600">{systemMetrics.errorRate}%</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </HolographicCard>

              {/* Last Activity Card */}
              <HolographicCard className="" delay={0.5}>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center">
                      <div className="h-10 w-10 rounded-2xl bg-gradient-to-r from-green-500/20 to-emerald-500/20 flex items-center justify-center mr-3">
                        <Clock className="h-5 w-5 text-green-600" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">Last Activity</h3>
                    </div>
                    <motion.div
                      className="h-3 w-3 bg-green-500 rounded-full"
                      animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  </div>

                  {lastActivity && (
                    <div className="space-y-4">
                      <div className="flex items-start space-x-4">
                        <div className="flex-shrink-0">
                          {getActivityIcon(lastActivity)}
                        </div>
                        <div className="flex-1">
                          <motion.p
                            className="text-sm font-medium text-gray-900 dark:text-white"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.6 }}
                          >
                            {lastActivity.action.charAt(0).toUpperCase() + lastActivity.action.slice(1)} {lastActivity.itemName}
                          </motion.p>
                          <motion.p
                            className="text-xs text-gray-500 dark:text-gray-400"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.7 }}
                          >
                            {formatDate(lastActivity.timestamp)}
                          </motion.p>
                        </div>
                      </div>

                      {analyticsData && (
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Active Projects</p>
                            <p className="text-lg font-bold text-gray-900 dark:text-white">{analyticsData.projects.activeProjects}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Recent Components</p>
                            <p className="text-lg font-bold text-gray-900 dark:text-white">{analyticsData.components.recentActivity}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </HolographicCard>
            </motion.div>
          )}

          {/* Resources and Quick Actions - Holographic Style */}
          <motion.div
            className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            {/* Resources section */}
            <div className="lg:col-span-2">
              <HolographicCard className="rounded-xl " delay={0.6}>
                <div className="p-6">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Quick Access</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Materials */}
                    <motion.div className="z-60 cursor-pointer" whileHover={{ scale: 1.02 }}>
                      <Link
                        href="/materials"
                        className="flex items-center p-4 border-0 rounded-2xl hover:bg-gradient-to-r hover:from-yellow-50/50 hover:to-orange-50/50 transition-all duration-300 z-40 group"
                      >
                        <div className="h-10 w-10 rounded-2xl bg-gradient-to-r from-yellow-500/20 to-orange-500/20 flex items-center justify-center mr-4 group-hover:from-yellow-500/30 group-hover:to-orange-500/30">
                          <Layers className="h-5 w-5 text-yellow-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900 dark:text-white">Materials</h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {analyticsData?.materials.total || 0} available
                          </p>
                        </div>
                      </Link>
                    </motion.div>

                    {/* Components */}
                    <motion.div className="z-60 cursor-pointer" whileHover={{ scale: 1.02 }}>
                      <Link
                        href="/components"
                        className="flex items-center p-4 border-0 rounded-2xl hover:bg-gradient-to-r hover:from-green-50/50 hover:to-emerald-50/50 transition-all z-40 duration-300 group"
                      >
                        <div className="h-10 w-10 rounded-2xl bg-gradient-to-r from-green-500/20 to-emerald-500/20 flex items-center justify-center mr-4 group-hover:from-green-500/30 group-hover:to-emerald-500/30">
                          <Box className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900 dark:text-white">Components</h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {analyticsData?.components.total || 0} in library
                          </p>
                        </div>
                      </Link>
                    </motion.div>

                    {/* Drawings */}
                    <motion.div className="z-60 cursor-pointer" whileHover={{ scale: 1.02 }}>
                      <Link
                        href="/drawings"
                        className="flex items-center p-4 border-0 rounded-2xl hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-cyan-50/50 transition-all z-40 duration-300 group"
                      >
                        <div className="h-10 w-10 rounded-2xl bg-gradient-to-r from-blue-500/20 to-cyan-500/20 flex items-center justify-center mr-4 group-hover:from-blue-500/30 group-hover:to-cyan-500/30">
                          <Settings className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900 dark:text-white">Drawings</h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {userMetrics?.totalCadDrawings || 0} CAD drawings
                          </p>
                        </div>
                      </Link>
                    </motion.div>

                    {/* Toolpaths */}
                    <motion.div className="z-60 cursor-pointer" whileHover={{ scale: 1.02 }}>
                      <Link
                        href="/toolpaths"
                        className="flex items-center p-4 border-0 rounded-2xl hover:bg-gradient-to-r hover:from-purple-50/50 hover:to-pink-50/50 transition-all z-40 duration-300 group"
                      >
                        <div className="h-10 w-10 rounded-2xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 flex items-center justify-center mr-4 group-hover:from-purple-500/30 group-hover:to-pink-500/30">
                          <Pen className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900 dark:text-white">Toolpaths</h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {analyticsData?.tools?.total || 0} generated
                          </p>
                        </div>
                      </Link>
                    </motion.div>
                  </div>
                </div>
              </HolographicCard>
            </div>

            {/* Tools Analytics */}
            <div className="mb-8">
              <HolographicCard className="rounded-xl" delay={0.7}>
                <div className="p-6">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Toolpaths Analytics</h3>
                    <Link href="/toolpaths" className="text-sm text-blue-600 hover:text-blue-800 z-40">
                      View all
                    </Link>
                  </div>

                  {analyticsData ? (
                    <div className="space-y-6">
                      <div className="text-center">
                        <motion.div
                          className="w-20 h-20 rounded-full bg-gradient-to-r from-orange-500/20 to-red-500/20 flex items-center justify-center mx-auto mb-3"
                          whileHover={{ scale: 1.1, rotate: 5 }}
                        >
                          <Tool className="h-10 w-10 text-orange-600" />
                        </motion.div>
                        <motion.h4
                          className="text-2xl font-bold text-gray-900 dark:text-white"
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.8 }}
                        >
                          {analyticsData.tools.total}
                        </motion.h4>
                        <p className="text-sm text-gray-600 dark:text-gray-300">Total Toolpaths Available</p>
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600 dark:text-gray-300">Most Used</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{analyticsData.tools.mostUsed}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600 dark:text-gray-300">Growth</span>
                          <span className="text-sm font-medium text-green-600">+{analyticsData.tools.trend}%</span>
                        </div>
                        {analyticsData.materials.lowStock > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600 dark:text-gray-300">Low Stock</span>
                            <span className="text-sm font-medium text-red-600">{analyticsData.materials.lowStock} items</span>
                          </div>
                        )}
                      </div>

                      <motion.div className="z-60" whileHover={{ scale: 1.02 }}>
                        <Link
                          href="/toolpaths"
                          className="block  w-full text-center px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-2xl hover:from-orange-700 hover:to-red-700 z-40 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-opacity-50 transition-all z-40 duration-300"
                        >
                          Generate New Toolpath
                        </Link>
                      </motion.div>
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-4">
                        <Tool className="h-8 w-8 text-gray-400" />
                      </div>
                      <h4 className="text-gray-900 dark:text-white font-medium mb-2">No Analytics Yet</h4>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Start using tools to see analytics</p>
                      <Link
                        href="/toolpaths"
                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 z-40"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add First Tool
                      </Link>
                    </div>
                  )}
                </div>
              </HolographicCard>
            </div>

          </motion.div>


          {/* Analytics Dashboard - Enhanced - Hidden in Desktop */}
          {!isDesktop && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
            >
              <HolographicCard className="rounded-xl flex flex-col overflow-auto z-30" delay={0.8}>
                <div className="p-6 border-b border-gray-200/50 dark:border-gray-700/50">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center">
                      <div className="h-10 w-10 rounded-2xl bg-gradient-to-r from-indigo-500/20 to-purple-500/20 flex items-center justify-center mr-3">
                        <BarChart2 className="h-5 w-5 text-indigo-600" />
                      </div>
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Analytics Dashboard</h2>
                    </div>
                    <motion.button
                      onClick={toggleChartType}
                      className="flex items-center cursor-pointer z-60 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-white/50 dark:bg-gray-800/50 px-3 py-2 rounded-2xl border-0 transition-all duration-300"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      tabIndex={0}
                    >
                      {chartType === "line" ? <BarChart2 className="h-4 w-4 mr-2" /> : <TrendingUp className="h-4 w-4 mr-2" />}
                      {chartType === "line" ? "Bar Chart" : "Line Chart"}
                    </motion.button>
                  </div>
                </div>

                <div className="p-6 bg-gradient-to-br from-blue-50/30 via-purple-50/20 to-cyan-50/30 dark:from-gray-800/30 dark:via-gray-900/20 dark:to-gray-800/30">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    {/* Activity Overview */}
                    <div className="lg:col-span-2">
                      <motion.div
                        className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-xl p-6 border-0"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.9 }}
                      >
                        <div className="flex justify-between items-center mb-6">
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Activity Trends</h3>
                          <motion.div
                            className="flex items-center text-green-600"
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                          >
                            <Wifi className="h-4 w-4 mr-1" />
                            <span className="text-sm">Live</span>
                          </motion.div>
                        </div>
                        <ActivityChart startDate={dateRange.startDate} endDate={dateRange.endDate} chartType={chartType} />
                      </motion.div>
                    </div>

                    {/* Real-time Stats */}
                    <motion.div
                      className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-xl p-6 border-0"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 1.0 }}
                    >
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Real-time Metrics</h3>

                      {systemMetrics && analyticsData && (
                        <div className="space-y-4">
                          <motion.div
                            className="p-4 bg-gradient-to-r from-blue-50/50 to-cyan-50/50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-2xl"
                            whileHover={{ scale: 1.02 }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-gray-600 dark:text-gray-300">System Health</span>
                              <motion.div
                                className="h-2 w-2 bg-green-500 rounded-full"
                                animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                                transition={{ duration: 2, repeat: Infinity }}
                              />
                            </div>
                            <div className="text-xl font-bold text-gray-900 dark:text-white">
                              {100 - Math.round((systemMetrics.cpuUsage + systemMetrics.memoryUsage) / 2)}%
                            </div>
                            <div className="text-xs text-gray-500">Optimal Performance</div>
                          </motion.div>

                          <motion.div
                            className="p-4 bg-gradient-to-r from-green-50/50 to-emerald-50/50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl"
                            whileHover={{ scale: 1.02 }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-gray-600 dark:text-gray-300">Active Projects</span>
                              <Zap className="h-4 w-4 text-green-600" />
                            </div>
                            <div className="text-xl font-bold text-gray-900 dark:text-white">
                              {analyticsData.projects.activeProjects}
                            </div>
                            <div className="text-xs text-gray-500">Currently in progress</div>
                          </motion.div>

                          <motion.div
                            className="p-4 bg-gradient-to-r from-purple-50/50 to-pink-50/50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-2xl"
                            whileHover={{ scale: 1.02 }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-gray-600 dark:text-gray-300">Cache Efficiency</span>
                              <Database className="h-4 w-4 text-purple-600" />
                            </div>
                            <div className="text-xl font-bold text-gray-900 dark:text-white">
                              {systemMetrics.cacheHitRatio}%
                            </div>
                            <div className="text-xs text-gray-500">Hit ratio</div>
                          </motion.div>
                        </div>
                      )}
                    </motion.div>
                  </div>

                  {/* Performance Summary */}
                  <motion.div
                    className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-xl p-6 border-0"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.1 }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">Performance Summary</h3>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        Last updated: {new Date().toLocaleTimeString()}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: "Response Time", value: `${systemMetrics?.responseTime || 0}ms`, color: "blue" },
                        { label: "Uptime", value: "99.9%", color: "green" },
                        { label: "Active Users", value: systemMetrics?.activeConnections || 0, color: "purple" },
                        { label: "Data Processed", value: "2.4GB", color: "orange" }
                      ].map((metric, index) => (
                        <motion.div
                          key={metric.label}
                          className="text-center p-3 bg-gray-50/50 dark:bg-gray-700/50 rounded-2xl"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 1.2 + index * 0.1 }}
                        >
                          <div className={`text-lg font-bold text-${metric.color}-600`}>{metric.value}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{metric.label}</div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                </div>
              </HolographicCard>
            </motion.div>
          )}

          {/* Space at the end to ensure scrolling */}
          <div className="h-4 sm:h-6"></div>
        </div>

        {/* Back to Top button */}
        {showScrollTop && (
          <button
            onClick={scrollToTop}
            className="fixed bottom-16 sm:bottom-6 right-4 sm:right-6 p-2 sm:p-3 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 focus:outline-none transition-all duration-300 z-40"
            aria-label="Back to top"
          >
            <ChevronUp size={16} className="sm:size-20" />
          </button>
        )}
      </Layout>
    </>
  );
}

// Missing components
const Plus = ({ className = "", ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`feather feather-plus ${className}`}
    {...props}
  >
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

const Pen = ({ className = "", ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`feather feather-pen ${className}`}
    {...props}
  >
    <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
    <path d="M2 2l7.586 7.586"></path>
    <circle cx="11" cy="11" r="2"></circle>
  </svg>
);

const Code = ({ className = "", ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`feather feather-code ${className}`}
    {...props}
  >
    <polyline points="16 18 22 12 16 6"></polyline>
    <polyline points="8 6 2 12 8 18"></polyline>
  </svg>
);
