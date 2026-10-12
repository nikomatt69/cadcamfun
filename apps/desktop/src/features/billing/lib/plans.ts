/** The plan catalogue shared by the pricing page and the subscription card (ids as the sidecar serves them). */
export interface PlanLimits {
  readonly maxProjects: number
  readonly maxComponents: number
  readonly maxStorage: number
}

export interface PlanFeatures {
  readonly name: string
  readonly price: string
  readonly features: readonly string[]
  readonly limits: PlanLimits
}

/** `.reference/src/lib/stripe.ts` `PLAN_FEATURES`, keyed by the plan ids the sidecar serves. */
export const PLAN_FEATURES: Readonly<Record<string, PlanFeatures>> = {
  FREE: {
    name: "Free",
    price: "$0",
    features: ["Basic CAD functionality", "2 projects", "Limited components", "Community support"],
    limits: { maxProjects: 2, maxComponents: 10, maxStorage: 100 }
  },
  BASIC: {
    name: "Basic",
    price: "$9.99",
    features: ["Full CAD functionality", "10 projects", "Unlimited components", "Email support", "1GB storage"],
    limits: { maxProjects: 10, maxComponents: 100, maxStorage: 1024 }
  },
  PRO: {
    name: "Professional",
    price: "$49.99",
    features: ["Full CAD/CAM functionality", "Unlimited projects", "Advanced AI assistance", "Priority support", "10GB storage"],
    limits: { maxProjects: 50, maxComponents: 1000, maxStorage: 5120 }
  },
  ENTERPRISE: {
    name: "Enterprise",
    price: "$100.00",
    features: ["Full CAD/CAM functionality", "Unlimited projects", "Advanced AI assistance", "Priority support", "10GB storage"],
    limits: { maxProjects: 100, maxComponents: 5000, maxStorage: 10240 }
  }
}

const FREE = PLAN_FEATURES.FREE!

export const planFeatures = (plan: string): PlanFeatures => PLAN_FEATURES[plan] ?? FREE

/** Plans in upgrade order. */
export const PLAN_ORDER = ["FREE", "BASIC", "PRO", "ENTERPRISE"] as const
export type PlanId = (typeof PLAN_ORDER)[number]
