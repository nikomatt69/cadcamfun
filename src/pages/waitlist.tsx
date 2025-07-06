import React from "react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import SimpleWaitlist from "@/src/components/components/SimpleWaitlist";
import { FEATURES } from "@/src/config/features";
import { 
  ArrowRight, 
  Check, 
  Zap, 
  Users, 
  Cpu, 
  Globe, 
  Sparkles,
  Rocket,
  Shield,
  Clock,
  Target,
  Brain,
  Award,
  Star,
  Play,
  ChevronDown
} from "lucide-react";
import Layout from "src/components/layout/Layout";
import Image from "next/image";

const FadeInWhenVisible = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
};

const CounterAnimation = ({ end, suffix = "" }: { end: number; suffix?: string }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  
  return (
    <motion.span
      ref={ref}
      initial={{ opacity: 0 }}
      animate={isInView ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: 1 }}
      className="text-4xl font-bold text-blue-600 dark:text-blue-400"
    >
      {isInView && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {end}{suffix}
        </motion.span>
      )}
    </motion.span>
  );
};

export default function WaitlistPage() {
  const heroRef = useRef(null);
  const isHeroInView = useInView(heroRef, { once: true });

  const features = [
    {
      icon: <Brain className="w-8 h-8" />,
      title: "AI-Powered Design",
      description: "Advanced AI assistants help you design faster with intelligent suggestions and automated optimizations",
      highlight: "10x Faster Design"
    },
    {
      icon: <Zap className="w-8 h-8" />,
      title: "Real-time Collaboration",
      description: "Work together with your team in real-time, from anywhere in the world with live sync",
      highlight: "Team Productivity"
    },
    {
      icon: <Rocket className="w-8 h-8" />,
      title: "Advanced CAM Simulation",
      description: "Simulate toolpaths with photorealistic rendering and collision detection before manufacturing",
      highlight: "Zero Waste"
    },
    {
      icon: <Globe className="w-8 h-8" />,
      title: "Cloud-Native",
      description: "Access your projects from any device, with automatic backups and version control",
      highlight: "Always Available"
    },
    {
      icon: <Shield className="w-8 h-8" />,
      title: "Enterprise Security",
      description: "Bank-level encryption and security standards to protect your valuable IP and designs",
      highlight: "100% Secure"
    },
    {
      icon: <Target className="w-8 h-8" />,
      title: "Precision Engineering",
      description: "Sub-micron precision tools for the most demanding engineering applications",
      highlight: "0.001mm Precision"
    }
  ];

     const stats = [
     { number: 2024, suffix: "", label: "Launch Year" },
     { number: 3, suffix: "D", label: "Design & CAM" },
     { number: 100, suffix: "%", label: "Web-Based" },
     { number: 0, suffix: "", label: "Installation Required" }
   ];

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 overflow-hidden">
        
        {/* Floating Background Elements */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <motion.div
            animate={{
              x: [0, 100, 0],
              y: [0, -100, 0],
              rotate: [0, 180, 360],
            }}
            transition={{
              duration: 20,
              repeat: Infinity,
              ease: "linear"
            }}
            className="absolute top-20 left-20 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl"
          />
          <motion.div
            animate={{
              x: [0, -120, 0],
              y: [0, 80, 0],
              rotate: [0, -180, -360],
            }}
            transition={{
              duration: 25,
              repeat: Infinity,
              ease: "linear"
            }}
            className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl"
          />
        </div>

        <div className="container mx-auto px-4 relative z-10">
          
          {/* Hero Section */}
          <motion.div 
            ref={heroRef}
            className="flex flex-col items-center justify-center min-h-screen text-center relative"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={isHeroInView ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="mb-8"
            >
              <div className="relative">
                <motion.img 
                  src="/logo.png" 
                  className="h-32 sm:h-40 mx-auto" 
                  alt="CADCAMFUN Logo"
                  whileHover={{ scale: 1.05 }}
                  transition={{ duration: 0.3 }}
                />
                <motion.div
                  className="absolute -inset-8 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20 rounded-full blur-2xl"
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.3, 0.6, 0.3]
                  }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                />
            </div>
            </motion.div>

            <motion.h1
              initial={{ y: 50, opacity: 0 }}
              animate={isHeroInView ? { y: 0, opacity: 1 } : { y: 50, opacity: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-5xl sm:text-7xl font-bold mb-6"
            >
              <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 bg-clip-text text-transparent bg-300% animate-gradient">
                The Future of
              </span>
              <br />
              <span className="text-gray-900 dark:text-white">CAD/CAM Design</span>
            </motion.h1>

            <motion.p
              initial={{ y: 30, opacity: 0 }}
              animate={isHeroInView ? { y: 0, opacity: 1 } : { y: 30, opacity: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="text-xl sm:text-2xl text-gray-600 dark:text-gray-300 max-w-4xl mb-8 leading-relaxed"
            >
              Revolutionary AI-powered CAD/CAM platform that transforms how engineers design, collaborate, and manufacture. 
              <span className="font-semibold text-blue-600 dark:text-blue-400"> Join the innovation.</span>
            </motion.p>

            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={isHeroInView ? { y: 0, opacity: 1 } : { y: 30, opacity: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="flex flex-col sm:flex-row gap-4 mb-12"
            >
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: "0 20px 40px rgba(59, 130, 246, 0.3)" }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-2xl flex items-center gap-3 transition-all duration-300 shadow-xl"
                onClick={() => document.getElementById('waitlist-section')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <Sparkles className="w-5 h-5" />
                Join Early Access
                <ArrowRight className="w-5 h-5" />
              </motion.button>
              
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 bg-white/80 hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800 backdrop-blur-sm border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-semibold rounded-2xl flex items-center gap-3 transition-all duration-300 shadow-lg"
              >
                <Play className="w-5 h-5" />
                Watch Demo
              </motion.button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={isHeroInView ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 1, delay: 1 }}
              className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center mb-16"
            >
              {stats.map((stat, index) => (
                <motion.div
                  key={index}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={isHeroInView ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.5, delay: 1 + index * 0.1 }}
                  className="p-4"
                >
                  <CounterAnimation end={stat.number} suffix={stat.suffix} />
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{stat.label}</p>
                </motion.div>
              ))}
            </motion.div>

            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute bottom-8"
            >
              <ChevronDown className="w-8 h-8 text-gray-400" />
            </motion.div>
          </motion.div>

          {/* Features Section */}
          <section className="py-20">
            <FadeInWhenVisible>
              <div className="text-center mb-16">
                <motion.div
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  transition={{ duration: 0.5 }}
                  className="inline-flex items-center gap-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-4 py-2 rounded-full text-sm font-medium mb-4"
                >
                  <Zap className="w-4 h-4" />
                  Powered by AI
                </motion.div>
                <h2 className="text-4xl sm:text-5xl font-bold mb-6">
                  <span className="text-gray-900 dark:text-white">Why Engineers</span>
                  <br />
                  <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Choose CADCAMFUN</span>
                </h2>
                <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
                  Experience the next generation of design tools that combine cutting-edge AI with professional-grade precision
                </p>
              </div>
            </FadeInWhenVisible>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
              {features.map((feature, index) => (
                <FadeInWhenVisible key={index} delay={index * 0.1}>
                  <motion.div
                    whileHover={{ y: -10, boxShadow: "0 25px 50px rgba(0,0,0,0.1)" }}
                    className="group p-8 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-200/50 dark:border-gray-700/50 relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-full blur-2xl transform translate-x-16 -translate-y-16 group-hover:scale-150 transition-transform duration-500" />
                    
                    <div className="relative z-10">
                      <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center text-white mb-6 group-hover:scale-110 transition-transform duration-300">
                        {feature.icon}
                      </div>
                      
                      <div className="mb-4">
                        <span className="inline-block bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-3 py-1 rounded-full text-xs font-semibold mb-3">
                          {feature.highlight}
                        </span>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">{feature.title}</h3>
                      </div>
                      
                      <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{feature.description}</p>
                    </div>
                  </motion.div>
                </FadeInWhenVisible>
            ))}
          </div>
          </section>

          {/* Demo Section */}
          <FadeInWhenVisible>
            <section className="py-20 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-gray-800/50 dark:to-gray-900/50 rounded-3xl mb-20">
              <div className="text-center mb-12">
                <h2 className="text-4xl font-bold mb-6">
                  <span className="text-gray-900 dark:text-white">See CADCAMFUN</span>
                  <br />
                  <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">In Action</span>
                </h2>
                <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
                  Experience the power of AI-assisted design with our interactive preview
                </p>
              </div>
              
                             <div className="relative max-w-5xl mx-auto">
                 <motion.div
                   whileHover={{ scale: 1.02 }}
                   className="relative p-6 bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-blue-500/10 rounded-3xl shadow-2xl"
                 >
                   {/* Gradient border frame */}
                   <div className="relative p-1 bg-gradient-to-br from-blue-500 via-purple-500 to-blue-500 rounded-2xl">
                     <div className="relative bg-black rounded-xl overflow-hidden">
                       <video 
                         className="w-full h-full object-contain bg-gray-50"
                         controls
                         poster="/logo.png"
                         preload="metadata"
                       >
                         <source src="/CADCAMFUN_Video.mov" type="video/mp4" />
                         <source src="/CADCAMFUN_Video.mov" type="video/quicktime" />
                         Your browser does not support the video tag.
                       </video>
                     </div>
                   </div>
                   
                   {/* Decorative corner elements */}
                   <div className="absolute top-2 left-2 w-4 h-4 border-l-2 border-t-2 border-blue-400 rounded-tl-lg"></div>
                   <div className="absolute top-2 right-2 w-4 h-4 border-r-2 border-t-2 border-purple-400 rounded-tr-lg"></div>
                   <div className="absolute bottom-2 left-2 w-4 h-4 border-l-2 border-b-2 border-purple-400 rounded-bl-lg"></div>
                   <div className="absolute bottom-2 right-2 w-4 h-4 border-r-2 border-b-2 border-blue-400 rounded-br-lg"></div>
                 </motion.div>
               </div>
            </section>
          </FadeInWhenVisible>

                     {/* Technology Stack */}
           <section className="py-20">
             <FadeInWhenVisible>
               <div className="text-center mb-16">
                 <h2 className="text-4xl font-bold mb-6">
                   <span className="text-gray-900 dark:text-white">Built with</span>
                   <br />
                   <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Modern Technology</span>
                 </h2>
                 <p className="text-xl text-gray-600 dark:text-gray-300">
                   Cutting-edge web technologies for the next generation of CAD/CAM design
                 </p>
               </div>
             </FadeInWhenVisible>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
               <FadeInWhenVisible delay={0}>
                 <motion.div
                   whileHover={{ y: -5 }}
                   className="p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300"
                 >
                   <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center text-white mb-6">
                     <Brain className="w-8 h-8" />
                   </div>
                   <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">AI Integration</h4>
                   <p className="text-gray-600 dark:text-gray-300">
                     Advanced machine learning algorithms that assist in design optimization, feature recognition, and automated toolpath generation.
                   </p>
                 </motion.div>
               </FadeInWhenVisible>

               <FadeInWhenVisible delay={0.2}>
                 <motion.div
                   whileHover={{ y: -5 }}
                   className="p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300"
                 >
                   <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-teal-500 rounded-2xl flex items-center justify-center text-white mb-6">
                     <Globe className="w-8 h-8" />
                   </div>
                   <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">WebGL/WebAssembly</h4>
                   <p className="text-gray-600 dark:text-gray-300">
                     High-performance 3D graphics rendering and computation directly in your browser using WebGL and optimized WebAssembly modules.
                   </p>
                 </motion.div>
               </FadeInWhenVisible>

               <FadeInWhenVisible delay={0.4}>
                 <motion.div
                   whileHover={{ y: -5 }}
                   className="p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300"
                 >
                   <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center text-white mb-6">
                     <Rocket className="w-8 h-8" />
                   </div>
                   <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Real-time Sync</h4>
                   <p className="text-gray-600 dark:text-gray-300">
                     Live collaboration features powered by modern web technologies, enabling teams to work together seamlessly from anywhere.
                   </p>
                 </motion.div>
               </FadeInWhenVisible>
             </div>
           </section>

          {/* Waitlist Section */}
          {FEATURES.WAITLIST_ENABLED && (
            <section id="waitlist-section" className="py-20">
              <FadeInWhenVisible>
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl p-12 text-center text-white relative overflow-hidden">
                  <div className="absolute inset-0 bg-black/10 backdrop-blur-sm" />
                  
                  <motion.div
                    className="absolute top-0 left-0 w-full h-full opacity-20"
                    animate={{
                      backgroundPosition: ["0% 0%", "100% 100%"],
                    }}
                    transition={{
                      duration: 20,
                      repeat: Infinity,
                      ease: "linear"
                    }}
                    style={{
                      backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
                      backgroundSize: "50px 50px"
                    }}
                  />
                  
                  <div className="relative z-10">
                                         <motion.div
                       initial={{ scale: 0.8, opacity: 0 }}
                       whileInView={{ scale: 1, opacity: 1 }}
                       transition={{ duration: 0.5 }}
                       className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full text-sm font-medium mb-6"
                     >
                       <Rocket className="w-4 h-4" />
                       Coming Soon
                     </motion.div>
                    
                    <h2 className="text-4xl sm:text-5xl font-bold mb-6">
                      Ready to Transform Your Design Process?
                    </h2>
                    
                                         <p className="text-xl opacity-90 max-w-2xl mx-auto mb-8">
                       Be among the first to experience the next generation of web-based CAD/CAM design. 
                       Join our waitlist to get notified when CADCAMFUN launches.
                     </p>
                    
                    <div className="max-w-2xl mx-auto">
                      <SimpleWaitlist />
                    </div>
                    
                                         <div className="flex flex-wrap justify-center gap-8 mt-8 text-sm opacity-75">
                       <div className="flex items-center gap-2">
                         <Check className="w-4 h-4" />
                         No commitment required
                       </div>
                       <div className="flex items-center gap-2">
                         <Check className="w-4 h-4" />
                         Launch notifications
                       </div>
                       <div className="flex items-center gap-2">
                         <Check className="w-4 h-4" />
                         Product updates
                       </div>
                       <div className="flex items-center gap-2">
                         <Check className="w-4 h-4" />
                         Unsubscribe anytime
                </div>
              </div>
            </div>
          </div>
              </FadeInWhenVisible>
            </section>
          )}

          {/* Final CTA */}
          <FadeInWhenVisible>
            <section className="py-20 text-center">
              <h3 className="text-3xl font-bold mb-4">
                <span className="text-gray-900 dark:text-white">Don't Miss Out on the</span>
                <br />
                <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Engineering Revolution</span>
              </h3>
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
                CADCAMFUN is launching soon. Secure your spot and shape the future of design.
              </p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => document.getElementById('waitlist-section')?.scrollIntoView({ behavior: 'smooth' })}
                className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300"
              >
                Join the Waitlist Now
              </motion.button>
            </section>
          </FadeInWhenVisible>
        </div>
      </div>
    </Layout>
  );
}
