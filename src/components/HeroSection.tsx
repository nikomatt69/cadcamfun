import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/router";
import { ArrowRight, Play, Zap } from "react-feather";

// Technical drawing tools for background animation
const technicalTools = [
  { id: 1, type: 'ruler', size: 80, x: 150, y: 200, rotation: 15 },
  { id: 2, type: 'compass', size: 60, x: 400, y: 150, rotation: -30 },
  { id: 3, type: 'square', size: 70, x: 700, y: 300, rotation: 45 },
  { id: 4, type: 'protractor', size: 90, x: 250, y: 450, rotation: 0 },
  { id: 5, type: 'triangle', size: 65, x: 850, y: 200, rotation: 60 },
  { id: 6, type: 'caliper', size: 75, x: 600, y: 500, rotation: -15 },
  { id: 7, type: 'pencil', size: 50, x: 1000, y: 350, rotation: 90 },
  { id: 8, type: 'divider', size: 55, x: 100, y: 600, rotation: 30 },
];

// Animated background tool component
const AnimatedTool = ({ 
  tool, 
  mouseX, 
  mouseY, 
  windowSize 
}: {
  tool: { id: number; type: string; size: number; x: number; y: number; rotation: number; };
  mouseX: number;
  mouseY: number;
  windowSize: { width: number; height: number; };
}) => {
  const [position, setPosition] = useState({ x: tool.x, y: tool.y });
  const [velocity, setVelocity] = useState({ x: (Math.random() - 0.5) * 0.5, y: (Math.random() - 0.5) * 0.5 });
  const [rotation, setRotation] = useState(tool.rotation);

  useEffect(() => {
    if (!windowSize.width || !windowSize.height) return;

    const animate = () => {
      setPosition(prev => {
        let newX = prev.x + velocity.x;
        let newY = prev.y + velocity.y;
        let newVelX = velocity.x;
        let newVelY = velocity.y;

        // Bounce off walls
        if (newX <= 0 || newX >= windowSize.width - tool.size) {
          newVelX = -newVelX * 0.8;
          newX = Math.max(0, Math.min(windowSize.width - tool.size, newX));
        }
        if (newY <= 0 || newY >= windowSize.height - tool.size) {
          newVelY = -newVelY * 0.8;
          newY = Math.max(0, Math.min(windowSize.height - tool.size, newY));
        }

        // Mouse interaction
        const distance = Math.sqrt((mouseX - newX) ** 2 + (mouseY - newY) ** 2);
        if (distance < 120) {
          const force = (120 - distance) * 0.0001;
          const angle = Math.atan2(newY - mouseY, newX - mouseX);
          newVelX += Math.cos(angle) * force;
          newVelY += Math.sin(angle) * force;
        }

        // Apply friction
        newVelX *= 0.998;
        newVelY *= 0.998;

        setVelocity({ x: newVelX, y: newVelY });
        setRotation(prev => prev + Math.sqrt(newVelX ** 2 + newVelY ** 2) * 2);

        return { x: newX, y: newY };
      });
    };

    const interval = setInterval(animate, 16);
    return () => clearInterval(interval);
  }, [mouseX, mouseY, windowSize, tool.size, velocity]);

  const renderTool = () => {
    const opacity = "0.08";
    const strokeColor = "#3b82f6";
    const fillColor = "#dbeafe";

    switch (tool.type) {
      case 'ruler':
        return (
          <svg width={tool.size} height={tool.size * 0.3} viewBox="0 0 100 30">
            <rect width="100" height="30" rx="3" fill={fillColor} stroke={strokeColor} strokeWidth="1" opacity={opacity}/>
            {Array.from({ length: 21 }, (_, i) => (
              <line key={i} x1={i * 5} y1="0" x2={i * 5} y2={i % 5 === 0 ? "15" : "10"} stroke={strokeColor} strokeWidth="0.5" opacity={opacity}/>
            ))}
          </svg>
        );
      
      case 'compass':
        return (
          <svg width={tool.size} height={tool.size} viewBox="0 0 60 60">
            <circle cx="30" cy="30" r="25" fill="none" stroke={strokeColor} strokeWidth="1.5" opacity={opacity}/>
            <line x1="30" y1="5" x2="30" y2="55" stroke={strokeColor} strokeWidth="1" opacity={opacity}/>
            <line x1="30" y1="30" x2="50" y2="10" stroke={strokeColor} strokeWidth="1" opacity={opacity}/>
            <circle cx="30" cy="30" r="3" fill={strokeColor} opacity={opacity}/>
          </svg>
        );
      
      case 'square':
        return (
          <svg width={tool.size} height={tool.size} viewBox="0 0 50 50">
            <path d="M5 5 L45 5 L45 45 Z" fill="none" stroke={strokeColor} strokeWidth="1.5" opacity={opacity}/>
            <line x1="5" y1="5" x2="45" y2="45" stroke={strokeColor} strokeWidth="0.5" opacity={Number(opacity) * 0.5}/>
          </svg>
        );
      
      case 'protractor':
        return (
          <svg width={tool.size} height={tool.size * 0.6} viewBox="0 0 80 48">
            <path d="M10 40 A30 30 0 0 1 70 40" fill="none" stroke={strokeColor} strokeWidth="1.5" opacity={opacity}/>
            {Array.from({ length: 19 }, (_, i) => {
              const angle = (i * 10 - 90) * Math.PI / 180;
              const x1 = 40 + 28 * Math.cos(angle);
              const y1 = 40 + 28 * Math.sin(angle);
              const x2 = 40 + 25 * Math.cos(angle);
              const y2 = 40 + 25 * Math.sin(angle);
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={strokeColor} strokeWidth="0.5" opacity={opacity}/>;
            })}
          </svg>
        );
      
      case 'triangle':
        return (
          <svg width={tool.size} height={tool.size} viewBox="0 0 50 50">
            <polygon points="25,5 45,40 5,40" fill="none" stroke={strokeColor} strokeWidth="1.5" opacity={opacity}/>
            <line x1="25" y1="5" x2="25" y2="40" stroke={strokeColor} strokeWidth="0.5" opacity={Number(opacity) * 0.5}/> 
          </svg>
        );
      
      case 'caliper':
        return (
          <svg width={tool.size} height={tool.size} viewBox="0 0 50 50">
            <path d="M15 10 Q25 5 35 10 L35 40 Q25 45 15 40 Z" fill="none" stroke={strokeColor} strokeWidth="1.5" opacity={opacity}/>
            <line x1="20" y1="15" x2="30" y2="15" stroke={strokeColor} strokeWidth="1" opacity={opacity}/>
            <line x1="20" y1="35" x2="30" y2="35" stroke={strokeColor} strokeWidth="1" opacity={opacity}/>
          </svg>
        );
      
      case 'pencil':
        return (
          <svg width={tool.size} height={tool.size} viewBox="0 0 40 40">
            <line x1="8" y1="32" x2="32" y2="8" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" opacity={opacity}/>
            <polygon points="30,6 34,10 32,12 28,8" fill={strokeColor} opacity={opacity}/>
          </svg>
        );
      
      case 'divider':
        return (
          <svg width={tool.size} height={tool.size} viewBox="0 0 40 40">
            <line x1="20" y1="5" x2="15" y2="35" stroke={strokeColor} strokeWidth="1.5" opacity={opacity}/>
            <line x1="20" y1="5" x2="25" y2="35" stroke={strokeColor} strokeWidth="1.5" opacity={opacity}/>
            <circle cx="20" cy="8" r="2" fill={strokeColor} opacity={opacity}/>
          </svg>
        );
      
      default:
        return null;
    }
  };

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        left: position.x,
        top: position.y,
        transform: `rotate(${rotation}deg)`,
        zIndex: 1
      }}
    >
      {renderTool()}
    </motion.div>
  );
};

export default function HeroSection() {
  const router = useRouter();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });

  // Mouse tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <section className="relative min-h-screen bg-white dark:bg-gray-900 overflow-hidden">
      {/* Animated Background Tools */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {technicalTools.map(tool => (
          <AnimatedTool
            key={tool.id}
            tool={tool}
            mouseX={mousePosition.x}
            mouseY={mousePosition.y}
            windowSize={windowSize}
          />
        ))}
      </div>

      {/* Subtle Grid Pattern */}
      <div 
        className="fixed inset-0 opacity-[0.02] dark:opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(59, 130, 246, 0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59, 130, 246, 0.3) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px'
        }}
      />

      {/* Hero Content */}
      <div className="relative z-10 px-6 lg:px-8 py-20 lg:py-32">
        <div className="max-w-7xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            className="inline-flex items-center bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-full text-sm font-medium mb-8"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Zap className="w-4 h-4 mr-2" />
            AI-Powered Design Platform
          </motion.div>

          {/* Main Headline */}
          <motion.h1 
            className="text-4xl md:text-6xl lg:text-7xl font-bold text-gray-900 dark:text-white mb-6 leading-tight"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
          >
            Your favorite{' '}
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              CAD/CAM platform
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p 
            className="text-xl lg:text-2xl text-gray-600 dark:text-gray-300 mb-12 max-w-3xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            A modern platform for 2D/3D design, parametric modeling,
            and CNC machine control with AI-powered automation
          </motion.p>

          {/* CTA Buttons */}
          <motion.div 
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
          >
            <motion.button
              onClick={() => router.push("/cad")}
              className="group relative px-8 py-4 bg-blue-600 text-white rounded-2xl font-semibold text-lg shadow-xl hover:shadow-2xl hover:bg-blue-700 transition-all duration-300"
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="flex items-center">
                <Play className="w-5 h-5 mr-3" />
                Start Creating
                <ArrowRight className="w-5 h-5 ml-3 group-hover:translate-x-1 transition-transform" />
              </span>
            </motion.button>

            <motion.button
              onClick={() => router.push("/projects")}
              className="px-8 py-4 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-2xl font-semibold text-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              Browse Projects
            </motion.button>
          </motion.div>
        </div>
      </div>
    </section>
  );
} 