// src/components/auth/WelcomeOnboarding.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, CheckCircle, User, Zap } from 'lucide-react';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRouter } from 'next/router';
import { Tool } from 'react-feather';

interface WelcomeOnboardingProps {
  isVisible: boolean;
  onComplete: () => void;
}

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  action?: {
    text: string;
    onClick: () => void;
  };
}

const WelcomeOnboarding: React.FC<WelcomeOnboardingProps> = ({
  isVisible,
  onComplete
}) => {
  const { user } = useAuth();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const steps: OnboardingStep[] = [
    {
      id: 'welcome',
      title: `Welcome${user?.name ? `, ${user.name}` : ''}!`,
      description: 'Welcome to CAD/CAM FUN - your complete design and manufacturing platform.',
      icon: User,
    },
    {
      id: 'explore',
      title: 'Explore Your Tools',
      description: 'Access CAD design tools, CAM toolpath generation, and project management all in one place.',
      icon: Tool,
      action: {
        text: 'Explore CAD Editor',
        onClick: () => router.push('/cad')
      }
    },
    {
      id: 'quickstart',
      title: 'Ready to Create?',
      description: 'Start with a new project or explore our component library to jumpstart your designs.',
      icon: Zap,
      action: {
        text: 'Create New Project',
        onClick: () => router.push('/projects/create')
      }
    }
  ];

  useEffect(() => {
    // Auto-advance dopo 3 secondi per il primo step
    if (currentStep === 0 && isVisible) {
      const timer = setTimeout(() => {
        handleNext();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [currentStep, isVisible]);

  const handleNext = () => {
    setCompletedSteps(prev => new Set(prev).add(currentStep));

    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const currentStepData = steps[currentStep];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-2xl w-full p-8 relative"
          >
            {/* Close Button */}
            <button
              onClick={handleSkip}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>

            {/* Progress Bar */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Step {currentStep + 1} of {steps.length}
                </span>
                <button
                  onClick={handleSkip}
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  Skip
                </button>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <motion.div
                  className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>

            {/* Content */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="text-center"
              >
                {/* Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, duration: 0.3 }}
                  className="mb-6"
                >
                  <div className="w-20 h-20 mx-auto bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-full flex items-center justify-center">
                    <currentStepData.icon className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                  </div>
                </motion.div>

                {/* Title */}
                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-3xl font-bold text-gray-900 dark:text-white mb-4"
                >
                  {currentStepData.title}
                </motion.h2>

                {/* Description */}
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-lg text-gray-600 dark:text-gray-400 mb-8 leading-relaxed"
                >
                  {currentStepData.description}
                </motion.p>

                {/* Actions */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="flex justify-center space-x-4"
                >
                  {currentStepData.action ? (
                    <>
                      <button
                        onClick={currentStepData.action.onClick}
                        className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-6 py-3 rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all duration-200 flex items-center space-x-2 font-medium"
                      >
                        <span>{currentStepData.action.text}</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleNext}
                        className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-6 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                      >
                        Continue Tour
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleNext}
                      className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-8 py-3 rounded-xl hover:from-blue-700 hover:to-cyan-700 transition-all duration-200 flex items-center space-x-2 font-medium"
                    >
                      <span>Continue</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </motion.div>
              </motion.div>
            </AnimatePresence>

            {/* Step Indicators */}
            <div className="flex justify-center space-x-2 mt-8">
              {steps.map((_, index) => (
                <motion.div
                  key={index}
                  className={`w-3 h-3 rounded-full transition-colors ${index <= currentStep
                      ? 'bg-blue-600'
                      : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  animate={{
                    scale: index === currentStep ? 1.2 : 1
                  }}
                >
                  {completedSteps.has(index) && (
                    <CheckCircle className="w-3 h-3 text-white -m-0.5" />
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WelcomeOnboarding;