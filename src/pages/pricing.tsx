import React from "react";
import { motion, Transition, Variants } from "framer-motion";

import { useSubscription } from "src/contexts/SubscriptionContext";
import PricingPlans from "src/components/subscription/PricingPlans";
import Footer from "src/components/ui/Footer";
import DynamicLayout from "../components/layout/Layout";
import MetaTags from "../components/layout/Metatags";
import { Clock } from "react-feather";
import { useSession } from "@/src/lib/auth-client";

// Animation variants
const pageVariants: Variants = {
  initial: { opacity: 0, y: 20 },
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: -20 }
};

const pageTransition: Transition = {
  type: "tween",
  ease: "anticipate",
  duration: 0.5
};

const buttonVariants = {
  initial: { scale: 1 },
  hover: { scale: 1.05 },
  tap: { scale: 0.95 }
};

// Inner component that has access to subscription context
function PricingPageContent() {
  const { isOnTrial, trialDaysLeft, plan, features } = useSubscription();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <MetaTags ogImage="/og-image.png" title="Pricing Plans" />

      <motion.main
        className="flex-grow"
        initial="initial"
        animate="in"
        exit="out"
        variants={pageVariants}
        transition={pageTransition}
      >
        {/* Header Section */}
        <div className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <motion.div
              className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl shadow-lg rounded-2xl border border-gray-200/50 dark:border-gray-700/50 p-8 mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="text-center">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent sm:text-5xl sm:tracking-tight lg:text-6xl mb-6">
                  Simple, Transparent Pricing
                </h1>
                <p className="max-w-xl mx-auto text-xl text-gray-600 dark:text-gray-300">
                  Choose the plan that&apos;s right for you and get started with CAD/CAM FUN today.
                </p>

                {/* Trial Status Banner */}
                {isOnTrial && trialDaysLeft !== null && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 }}
                    className="mt-8 inline-flex items-center px-6 py-3 rounded-full bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg"
                  >
                    <Clock className="w-5 h-5 mr-2" />
                    <span className="font-semibold">
                      You&apos;re on a {features?.name} trial - {trialDaysLeft} days remaining
                    </span>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <PricingPlans />
        </motion.div>

        {/* FAQ Section */}
        <motion.div
          className="py-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl shadow-lg rounded-2xl border border-gray-200/50 dark:border-gray-700/50 p-8">
              <div className="lg:text-center">
                <h2 className="text-base text-blue-600 dark:text-blue-400 font-semibold tracking-wide uppercase">
                  Frequently Asked Questions
                </h2>
                <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent sm:text-4xl">
                  Common Questions About Our Plans
                </p>
              </div>

              <div className="mt-10">
                <dl className="space-y-10 md:space-y-0 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-10">
                  <div>
                    <dt className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                      Can I switch plans?
                    </dt>
                    <dd className="mt-2 text-base text-gray-600 dark:text-gray-300">
                      Yes, you can upgrade or downgrade your plan at any time. If you upgrade, you will be charged the
                      prorated amount for the remainder of your billing cycle. If you downgrade, the change will take
                      effect at the end of your current billing cycle.
                    </dd>
                  </div>

                  <div>
                    <dt className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                      How do project and component limits work?
                    </dt>
                    <dd className="mt-2 text-base text-gray-600 dark:text-gray-300">
                      Each plan has a limit on the number of projects and components you can create. Once you reach
                      the limit, you all need to upgrade your plan or delete existing projects/components to create new
                      ones.
                    </dd>
                  </div>

                  <div>
                    <dt className="text-lg leading-6 font-medium text-gray-900 dark:text-white">Is there a free trial?</dt>
                    <dd className="mt-2 text-base text-gray-600 dark:text-gray-300">
                      We offer a 7-day free trial of the Pro plan for all new users. After the trial period, you can
                      choose to subscribe to a paid plan or continue with the free plan.
                    </dd>
                  </div>

                  <div>
                    <dt className="text-lg leading-6 font-medium text-gray-900 dark:text-white">How can I cancel my subscription?</dt>
                    <dd className="mt-2 text-base text-gray-600 dark:text-gray-300">
                      You can cancel your subscription at any time from your account settings. If you cancel, you&apos;ll
                      continue to have access to your paid features until the end of your current billing cycle, after
                      which you&apos;ll be downgraded to the free plan.
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.main>

      <Footer />
    </div>
  );
}

export default function PricingPage() {
  const { isPending } = useSession();

  // Show loading while checking auth status
  if (isPending) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <DynamicLayout>
      <PricingPageContent />
    </DynamicLayout>
  );
}
