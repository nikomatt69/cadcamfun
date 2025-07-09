import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, Easing } from 'framer-motion';
import { ChevronRight, Zap, Cog, Share2, Sparkles } from 'lucide-react';
import { useRouter } from 'next/router';

interface InitialOnboardingProps {
    isVisible: boolean;
    onComplete: () => void;
}

interface OnboardingSlide {
    id: string;
    title: string;
    subtitle: string;
    description: string;
    icon: React.ComponentType<any>;
    gradient: string;
    bgPattern?: string;
}

const InitialOnboarding: React.FC<InitialOnboardingProps> = ({
    isVisible,
    onComplete
}) => {
    const router = useRouter();
    const [currentSlide, setCurrentSlide] = useState(0);
    const [isAutoAdvancing, setIsAutoAdvancing] = useState(true);

    const slides: OnboardingSlide[] = [
        {
            id: 'welcome',
            title: 'CAD/CAM FUN',
            subtitle: 'Design. Create. Manufacture.',
            description: 'The complete platform for turning your ideas into reality with professional CAD design and CAM manufacturing tools.',
            icon: Sparkles,
            gradient: 'from-purple-600 via-blue-600 to-cyan-500',
            bgPattern: 'radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.3) 0%, transparent 50%)'
        },
        {
            id: 'design',
            title: 'Professional CAD',
            subtitle: 'Design with precision',
            description: 'Create complex 3D models, technical drawings, and assemblies with our intuitive CAD interface. Perfect for beginners and professionals.',
            icon: Cog,
            gradient: 'from-emerald-600 via-teal-600 to-cyan-500',
            bgPattern: 'radial-gradient(circle at 30% 70%, rgba(16, 185, 129, 0.3) 0%, transparent 50%), radial-gradient(circle at 70% 30%, rgba(6, 182, 212, 0.3) 0%, transparent 50%)'
        },
        {
            id: 'manufacture',
            title: 'Smart CAM',
            subtitle: 'From design to production',
            description: 'Generate optimized toolpaths, simulate machining processes, and export G-code ready for your CNC machines and 3D printers.',
            icon: Zap,
            gradient: 'from-orange-600 via-red-600 to-pink-500',
            bgPattern: 'radial-gradient(circle at 40% 60%, rgba(251, 146, 60, 0.3) 0%, transparent 50%), radial-gradient(circle at 60% 40%, rgba(239, 68, 68, 0.3) 0%, transparent 50%)'
        },
        {
            id: 'collaborate',
            title: 'Collaborate & Share',
            subtitle: 'Work together seamlessly',
            description: 'Share projects, collaborate in real-time, and access your designs from anywhere. Join the CAD/CAM FUN community.',
            icon: Share2,
            gradient: 'from-violet-600 via-purple-600 to-fuchsia-500',
            bgPattern: 'radial-gradient(circle at 25% 75%, rgba(139, 92, 246, 0.3) 0%, transparent 50%), radial-gradient(circle at 75% 25%, rgba(217, 70, 239, 0.3) 0%, transparent 50%)'
        }
    ];

    // Auto-advance slides
    useEffect(() => {
        if (!isAutoAdvancing || !isVisible) return;

        const timer = setTimeout(() => {
            if (currentSlide < slides.length - 1) {
                setCurrentSlide(currentSlide + 1);
            } else {
                setIsAutoAdvancing(false);
            }
        }, 4000); // 4 seconds per slide

        return () => clearTimeout(timer);
    }, [currentSlide, isAutoAdvancing, isVisible, slides.length]);

    const handleGetStarted = () => {
        onComplete();
    };

    const handleNext = () => {
        setIsAutoAdvancing(false);
        if (currentSlide < slides.length - 1) {
            setCurrentSlide(currentSlide + 1);
        } else {
            handleGetStarted();
        }
    };

    const handleSkip = () => {
        setIsAutoAdvancing(false);
        handleGetStarted();
    };

    const currentSlideData = slides[currentSlide];

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 overflow-hidden"
                >
                    {/* Animated Background */}
                    <motion.div
                        key={currentSlide}
                        initial={{ opacity: 0, scale: 1.1 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 1 }}
                        className={`absolute inset-0 bg-gradient-to-br ${currentSlideData.gradient}`}
                        style={{
                            backgroundImage: currentSlideData.bgPattern,
                        }}
                    />

                    {/* Floating particles */}
                    <div className="absolute inset-0 overflow-hidden">
                        {[...Array(20)].map((_, i) => (
                            <motion.div
                                key={i}
                                className="absolute w-2 h-2 bg-white/20 rounded-full"
                                animate={{
                                    y: [0, -100, 0],
                                    x: [0, Math.random() * 100 - 50, 0],
                                    opacity: [0, 1, 0],
                                }}
                                transition={{
                                    duration: 6 + Math.random() * 4,
                                    repeat: Infinity,
                                    delay: Math.random() * 4,
                                }}
                                style={{
                                    left: `${Math.random() * 100}%`,
                                    top: `${100 + Math.random() * 100}%`,
                                }}
                            />
                        ))}
                    </div>

                    {/* Content */}
                    <div className="relative z-10 flex items-center justify-center min-h-screen p-8">
                        <div className="w-full max-w-4xl mx-auto text-center text-white">

                            {/* Skip Button */}
                            <motion.button
                                initial={{ opacity: 0, y: -20 }}
                                animate={{ opacity: 1, y: 0 }}
                                onClick={handleSkip}
                                className="absolute top-8 right-8 px-4 py-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200"
                            >
                                Skip
                            </motion.button>

                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={currentSlide}
                                    initial={{ opacity: 0, y: 50, scale: 0.9 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -50, scale: 1.1 }}
                                    transition={{ duration: 0.8, ease: "easeOutCubic" as Easing }}
                                >
                                    {/* Icon */}
                                    <motion.div
                                        initial={{ scale: 0, rotate: -180 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        transition={{ delay: 0.3, duration: 0.8, ease: "easeOutBack" as Easing }}
                                        className="mb-8"
                                    >
                                        <div className="w-24 h-24 mx-auto bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                                            <currentSlideData.icon className="w-12 h-12 text-white" />
                                        </div>
                                    </motion.div>

                                    {/* Title */}
                                    <motion.h1
                                        initial={{ opacity: 0, y: 30 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.5, duration: 0.6 }}
                                        className="text-5xl md:text-7xl font-bold mb-4"
                                    >
                                        {currentSlideData.title}
                                    </motion.h1>

                                    {/* Subtitle */}
                                    <motion.h2
                                        initial={{ opacity: 0, y: 30 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.7, duration: 0.6 }}
                                        className="text-2xl md:text-3xl font-light mb-6 text-white/90"
                                    >
                                        {currentSlideData.subtitle}
                                    </motion.h2>

                                    {/* Description */}
                                    <motion.p
                                        initial={{ opacity: 0, y: 30 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.9, duration: 0.6 }}
                                        className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto leading-relaxed"
                                    >
                                        {currentSlideData.description}
                                    </motion.p>
                                </motion.div>
                            </AnimatePresence>

                            {/* Navigation */}
                            <motion.div
                                initial={{ opacity: 0, y: 50 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 1.1, duration: 0.6 }}
                                className="mt-12 flex flex-col items-center space-y-8"
                            >
                                {/* Progress Dots */}
                                <div className="flex space-x-3">
                                    {slides.map((_, index) => (
                                        <motion.button
                                            key={index}
                                            onClick={() => {
                                                setIsAutoAdvancing(false);
                                                setCurrentSlide(index);
                                            }}
                                            className={`w-3 h-3 rounded-full transition-all duration-300 ${index <= currentSlide
                                                ? 'bg-white scale-110'
                                                : 'bg-white/40 hover:bg-white/60'
                                                }`}
                                            whileHover={{ scale: 1.2 }}
                                            whileTap={{ scale: 0.9 }}
                                        />
                                    ))}
                                </div>

                                {/* Action Button */}
                                {currentSlide === slides.length - 1 ? (
                                    <motion.button
                                        onClick={handleGetStarted}
                                        className="bg-white text-gray-900 px-8 py-4 rounded-2xl text-lg font-semibold hover:bg-white/90 transition-all duration-200 flex items-center space-x-2 shadow-2xl"
                                        whileHover={{ scale: 1.05, y: -2 }}
                                        whileTap={{ scale: 0.95 }}
                                    >
                                        <span>Get Started</span>
                                        <ChevronRight className="w-5 h-5" />
                                    </motion.button>
                                ) : (
                                    <motion.button
                                        onClick={handleNext}
                                        className="bg-white/20 backdrop-blur-sm text-white px-6 py-3 rounded-xl hover:bg-white/30 transition-all duration-200 flex items-center space-x-2"
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                    >
                                        <span>Next</span>
                                        <ChevronRight className="w-4 h-4" />
                                    </motion.button>
                                )}
                            </motion.div>

                            {/* Auto-advance progress bar */}
                            {isAutoAdvancing && currentSlide < slides.length - 1 && (
                                <motion.div
                                    initial={{ width: "0%" }}
                                    animate={{ width: "100%" }}
                                    transition={{ duration: 4, ease: "linear" }}
                                    className="fixed bottom-0 left-0 h-1 bg-white/50"
                                />
                            )}
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default InitialOnboarding; 