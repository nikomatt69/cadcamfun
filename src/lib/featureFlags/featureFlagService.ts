import { 
  FeatureFlag, 
  FeatureAccess, 
  FeatureFlagConfig, 
  SubscriptionFeatures, 
  FeatureCheckResult,
  AdminFeatureOverride 
} from '@/src/types/featureFlags';
import { SUBSCRIPTION_PLANS } from '@/src/lib/stripe';
import { isAdminUser } from './adminUtils';

const DEFAULT_FEATURE_ACCESS: FeatureAccess = { enabled: false };
const ENABLED_FEATURE_ACCESS: FeatureAccess = { enabled: true };
const LIMITED_FEATURE_ACCESS = (limit: number): FeatureAccess => ({ enabled: true, limit });

const FEATURE_FLAG_CONFIG: FeatureFlagConfig = {
  [SUBSCRIPTION_PLANS.FREE]: {
    // AI Features - Limited
    [FeatureFlag.AI_ASSISTANT]: LIMITED_FEATURE_ACCESS(10),
    [FeatureFlag.AI_VISION]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.AI_AUTONOMOUS]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.AI_CODE_INTERPRETER]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.AI_ADVANCED_PROMPTS]: DEFAULT_FEATURE_ACCESS,
    
    // CAD Features - Basic only
    [FeatureFlag.CAD_BASIC]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CAD_ADVANCED]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.CAD_3D_MODELING]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.CAD_ASSEMBLIES]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.CAD_PARAMETRIC]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.CAD_SIMULATION]: DEFAULT_FEATURE_ACCESS,
    
    // CAM Features - None
    [FeatureFlag.CAM_BASIC]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.CAM_ADVANCED]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.CAM_MULTIAXIS]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.CAM_TOOLPATH_OPTIMIZATION]: DEFAULT_FEATURE_ACCESS,
    
    // Export/Import Features - Basic only
    [FeatureFlag.EXPORT_STEP]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.EXPORT_IGES]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.EXPORT_STL]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.EXPORT_GCODE]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.EXPORT_PDF]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.IMPORT_ADVANCED]: DEFAULT_FEATURE_ACCESS,
    
    // Collaboration Features - None
    [FeatureFlag.REAL_TIME_COLLABORATION]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.TEAM_MANAGEMENT]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.PROJECT_SHARING]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.COMMENTS_ANNOTATIONS]: DEFAULT_FEATURE_ACCESS,
    
    // Storage & Limits - Basic
    [FeatureFlag.CLOUD_STORAGE]: LIMITED_FEATURE_ACCESS(100),
    [FeatureFlag.UNLIMITED_PROJECTS]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.LARGE_FILE_SUPPORT]: DEFAULT_FEATURE_ACCESS,
    
    // Marketplace & Plugins - None
    [FeatureFlag.MARKETPLACE_ACCESS]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.CUSTOM_PLUGINS]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.THIRD_PARTY_INTEGRATIONS]: DEFAULT_FEATURE_ACCESS,
    
    // Analytics & Reporting - None
    [FeatureFlag.ADVANCED_ANALYTICS]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.USAGE_REPORTS]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.PERFORMANCE_MONITORING]: DEFAULT_FEATURE_ACCESS,
    
    // Support & Priority - Community
    [FeatureFlag.PRIORITY_SUPPORT]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.DEDICATED_SUPPORT]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.TRAINING_RESOURCES]: DEFAULT_FEATURE_ACCESS,
    
    // API & Development - None
    [FeatureFlag.API_ACCESS]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.WEBHOOK_SUPPORT]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.CUSTOM_BRANDING]: DEFAULT_FEATURE_ACCESS,
    
    limits: {
      maxProjects: 2,
      maxComponents: 10,
      maxStorage: 100,
      maxTeamMembers: 1,
      maxApiCalls: 0,
      maxFilesPerProject: 5,
    },
  },

  [SUBSCRIPTION_PLANS.BASIC]: {
    // AI Features - Basic
    [FeatureFlag.AI_ASSISTANT]: LIMITED_FEATURE_ACCESS(100),
    [FeatureFlag.AI_VISION]: LIMITED_FEATURE_ACCESS(20),
    [FeatureFlag.AI_AUTONOMOUS]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.AI_CODE_INTERPRETER]: LIMITED_FEATURE_ACCESS(10),
    [FeatureFlag.AI_ADVANCED_PROMPTS]: DEFAULT_FEATURE_ACCESS,
    
    // CAD Features - Basic + Advanced
    [FeatureFlag.CAD_BASIC]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CAD_ADVANCED]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CAD_3D_MODELING]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CAD_ASSEMBLIES]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.CAD_PARAMETRIC]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CAD_SIMULATION]: DEFAULT_FEATURE_ACCESS,
    
    // CAM Features - Basic
    [FeatureFlag.CAM_BASIC]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CAM_ADVANCED]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.CAM_MULTIAXIS]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.CAM_TOOLPATH_OPTIMIZATION]: DEFAULT_FEATURE_ACCESS,
    
    // Export/Import Features - More formats
    [FeatureFlag.EXPORT_STEP]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.EXPORT_IGES]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.EXPORT_STL]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.EXPORT_GCODE]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.EXPORT_PDF]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.IMPORT_ADVANCED]: ENABLED_FEATURE_ACCESS,
    
    // Collaboration Features - Basic
    [FeatureFlag.REAL_TIME_COLLABORATION]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.TEAM_MANAGEMENT]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.PROJECT_SHARING]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.COMMENTS_ANNOTATIONS]: ENABLED_FEATURE_ACCESS,
    
    // Storage & Limits - Increased
    [FeatureFlag.CLOUD_STORAGE]: LIMITED_FEATURE_ACCESS(1024),
    [FeatureFlag.UNLIMITED_PROJECTS]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.LARGE_FILE_SUPPORT]: LIMITED_FEATURE_ACCESS(50),
    
    // Marketplace & Plugins - Basic
    [FeatureFlag.MARKETPLACE_ACCESS]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CUSTOM_PLUGINS]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.THIRD_PARTY_INTEGRATIONS]: DEFAULT_FEATURE_ACCESS,
    
    // Analytics & Reporting - Basic
    [FeatureFlag.ADVANCED_ANALYTICS]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.USAGE_REPORTS]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.PERFORMANCE_MONITORING]: DEFAULT_FEATURE_ACCESS,
    
    // Support & Priority - Email
    [FeatureFlag.PRIORITY_SUPPORT]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.DEDICATED_SUPPORT]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.TRAINING_RESOURCES]: ENABLED_FEATURE_ACCESS,
    
    // API & Development - Limited
    [FeatureFlag.API_ACCESS]: LIMITED_FEATURE_ACCESS(1000),
    [FeatureFlag.WEBHOOK_SUPPORT]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.CUSTOM_BRANDING]: DEFAULT_FEATURE_ACCESS,
    
    limits: {
      maxProjects: 10,
      maxComponents: 100,
      maxStorage: 1024,
      maxTeamMembers: 3,
      maxApiCalls: 1000,
      maxFilesPerProject: 20,
    },
  },

  [SUBSCRIPTION_PLANS.PRO]: {
    // AI Features - Full
    [FeatureFlag.AI_ASSISTANT]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.AI_VISION]: LIMITED_FEATURE_ACCESS(200),
    [FeatureFlag.AI_AUTONOMOUS]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.AI_CODE_INTERPRETER]: LIMITED_FEATURE_ACCESS(100),
    [FeatureFlag.AI_ADVANCED_PROMPTS]: ENABLED_FEATURE_ACCESS,
    
    // CAD Features - Full
    [FeatureFlag.CAD_BASIC]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CAD_ADVANCED]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CAD_3D_MODELING]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CAD_ASSEMBLIES]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CAD_PARAMETRIC]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CAD_SIMULATION]: ENABLED_FEATURE_ACCESS,
    
    // CAM Features - Advanced
    [FeatureFlag.CAM_BASIC]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CAM_ADVANCED]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CAM_MULTIAXIS]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CAM_TOOLPATH_OPTIMIZATION]: ENABLED_FEATURE_ACCESS,
    
    // Export/Import Features - All formats
    [FeatureFlag.EXPORT_STEP]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.EXPORT_IGES]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.EXPORT_STL]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.EXPORT_GCODE]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.EXPORT_PDF]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.IMPORT_ADVANCED]: ENABLED_FEATURE_ACCESS,
    
    // Collaboration Features - Full
    [FeatureFlag.REAL_TIME_COLLABORATION]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.TEAM_MANAGEMENT]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.PROJECT_SHARING]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.COMMENTS_ANNOTATIONS]: ENABLED_FEATURE_ACCESS,
    
    // Storage & Limits - High
    [FeatureFlag.CLOUD_STORAGE]: LIMITED_FEATURE_ACCESS(5120),
    [FeatureFlag.UNLIMITED_PROJECTS]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.LARGE_FILE_SUPPORT]: LIMITED_FEATURE_ACCESS(200),
    
    // Marketplace & Plugins - Full
    [FeatureFlag.MARKETPLACE_ACCESS]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CUSTOM_PLUGINS]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.THIRD_PARTY_INTEGRATIONS]: ENABLED_FEATURE_ACCESS,
    
    // Analytics & Reporting - Advanced
    [FeatureFlag.ADVANCED_ANALYTICS]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.USAGE_REPORTS]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.PERFORMANCE_MONITORING]: ENABLED_FEATURE_ACCESS,
    
    // Support & Priority - Priority
    [FeatureFlag.PRIORITY_SUPPORT]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.DEDICATED_SUPPORT]: DEFAULT_FEATURE_ACCESS,
    [FeatureFlag.TRAINING_RESOURCES]: ENABLED_FEATURE_ACCESS,
    
    // API & Development - High
    [FeatureFlag.API_ACCESS]: LIMITED_FEATURE_ACCESS(10000),
    [FeatureFlag.WEBHOOK_SUPPORT]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CUSTOM_BRANDING]: DEFAULT_FEATURE_ACCESS,
    
    limits: {
      maxProjects: 50,
      maxComponents: 1000,
      maxStorage: 5120,
      maxTeamMembers: 10,
      maxApiCalls: 10000,
      maxFilesPerProject: 100,
    },
  },

  [SUBSCRIPTION_PLANS.ENTERPRISE]: {
    // AI Features - Unlimited
    [FeatureFlag.AI_ASSISTANT]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.AI_VISION]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.AI_AUTONOMOUS]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.AI_CODE_INTERPRETER]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.AI_ADVANCED_PROMPTS]: ENABLED_FEATURE_ACCESS,
    
    // CAD Features - Full
    [FeatureFlag.CAD_BASIC]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CAD_ADVANCED]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CAD_3D_MODELING]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CAD_ASSEMBLIES]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CAD_PARAMETRIC]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CAD_SIMULATION]: ENABLED_FEATURE_ACCESS,
    
    // CAM Features - Full
    [FeatureFlag.CAM_BASIC]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CAM_ADVANCED]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CAM_MULTIAXIS]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CAM_TOOLPATH_OPTIMIZATION]: ENABLED_FEATURE_ACCESS,
    
    // Export/Import Features - All
    [FeatureFlag.EXPORT_STEP]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.EXPORT_IGES]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.EXPORT_STL]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.EXPORT_GCODE]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.EXPORT_PDF]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.IMPORT_ADVANCED]: ENABLED_FEATURE_ACCESS,
    
    // Collaboration Features - Full
    [FeatureFlag.REAL_TIME_COLLABORATION]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.TEAM_MANAGEMENT]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.PROJECT_SHARING]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.COMMENTS_ANNOTATIONS]: ENABLED_FEATURE_ACCESS,
    
    // Storage & Limits - Unlimited
    [FeatureFlag.CLOUD_STORAGE]: LIMITED_FEATURE_ACCESS(10240),
    [FeatureFlag.UNLIMITED_PROJECTS]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.LARGE_FILE_SUPPORT]: ENABLED_FEATURE_ACCESS,
    
    // Marketplace & Plugins - Full
    [FeatureFlag.MARKETPLACE_ACCESS]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CUSTOM_PLUGINS]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.THIRD_PARTY_INTEGRATIONS]: ENABLED_FEATURE_ACCESS,
    
    // Analytics & Reporting - Full
    [FeatureFlag.ADVANCED_ANALYTICS]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.USAGE_REPORTS]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.PERFORMANCE_MONITORING]: ENABLED_FEATURE_ACCESS,
    
    // Support & Priority - Dedicated
    [FeatureFlag.PRIORITY_SUPPORT]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.DEDICATED_SUPPORT]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.TRAINING_RESOURCES]: ENABLED_FEATURE_ACCESS,
    
    // API & Development - Unlimited
    [FeatureFlag.API_ACCESS]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.WEBHOOK_SUPPORT]: ENABLED_FEATURE_ACCESS,
    [FeatureFlag.CUSTOM_BRANDING]: ENABLED_FEATURE_ACCESS,
    
    limits: {
      maxProjects: 100,
      maxComponents: 5000,
      maxStorage: 10240,
      maxTeamMembers: 50,
      maxApiCalls: 100000,
      maxFilesPerProject: 500,
    },
  },
};

export class FeatureFlagService {
  private adminOverrides: Map<string, AdminFeatureOverride[]> = new Map();

  constructor() {
    // Initialize with any stored admin overrides
    this.loadAdminOverrides();
  }

  private loadAdminOverrides(): void {
    // This would typically load from a database or cache
    // For now, we'll keep it in memory
  }

  public hasFeatureAccess(
    userPlan: string,
    featureFlag: FeatureFlag,
    userId?: string,
    subscriptionStatus?: string,
    userEmail?: string
  ): FeatureCheckResult {
    // Check if user is admin first - admins have access to everything
    if (isAdminUser(userEmail)) {
      return {
        hasAccess: true,
        metadata: { 
          adminAccess: true, 
          userEmail,
          note: 'Admin user has full access to all features' 
        },
      };
    }

    // Check for admin overrides
    if (userId && this.hasAdminOverride(userId, featureFlag)) {
      const override = this.getAdminOverride(userId, featureFlag);
      if (override && (!override.expiresAt || override.expiresAt > new Date())) {
        return {
          hasAccess: override.enabled,
          metadata: { adminOverride: true, reason: override.reason },
        };
      }
    }

    // Handle trial status - if user is on trial, treat as their trial plan
    let effectivePlan = userPlan;
    if (subscriptionStatus === 'trialing') {
      // User is on trial, use their trial plan (which should be PRO from signup)
      effectivePlan = userPlan;
    } else if (subscriptionStatus === 'expired') {
      // Trial expired, force to FREE plan regardless of stored plan
      effectivePlan = SUBSCRIPTION_PLANS.FREE;
    }

    // Get feature configuration for user's effective plan
    const planFeatures = FEATURE_FLAG_CONFIG[effectivePlan];
    if (!planFeatures) {
      return {
        hasAccess: false,
        upgradeRequired: true,
        suggestedPlan: 'basic',
      };
    }

    const featureAccess = planFeatures[featureFlag];
    if (!featureAccess || !featureAccess.enabled) {
      // Suggest the lowest plan that has this feature
      const suggestedPlan = this.findLowestPlanWithFeature(featureFlag);
      return {
        hasAccess: false,
        upgradeRequired: true,
        suggestedPlan,
        metadata: { 
          currentPlan: effectivePlan,
          trialStatus: subscriptionStatus === 'trialing' ? 'active' : subscriptionStatus 
        },
      };
    }

    return {
      hasAccess: true,
      limit: featureAccess.limit,
      metadata: { 
        ...featureAccess.metadata,
        currentPlan: effectivePlan,
        trialStatus: subscriptionStatus === 'trialing' ? 'active' : subscriptionStatus 
      },
    };
  }

  public getPlanFeatures(userPlan: string): SubscriptionFeatures | null {
    return FEATURE_FLAG_CONFIG[userPlan] || null;
  }

  public getPlanLimits(userPlan: string) {
    const planFeatures = FEATURE_FLAG_CONFIG[userPlan];
    return planFeatures?.limits || FEATURE_FLAG_CONFIG[SUBSCRIPTION_PLANS.FREE].limits;
  }

  public getAllFeatureFlags(): FeatureFlag[] {
    return Object.values(FeatureFlag);
  }

  public findLowestPlanWithFeature(featureFlag: FeatureFlag): string {
    const plans = [SUBSCRIPTION_PLANS.BASIC, SUBSCRIPTION_PLANS.PRO, SUBSCRIPTION_PLANS.ENTERPRISE];
    
    for (const plan of plans) {
      const planFeatures = FEATURE_FLAG_CONFIG[plan];
      if (planFeatures && planFeatures[featureFlag]?.enabled) {
        return 'basic'; // Return normalized plan name
      }
    }
    
    return 'pro'; // Default suggestion
  }

  // Admin override methods
  public addAdminOverride(override: AdminFeatureOverride): void {
    const userOverrides = this.adminOverrides.get(override.userId) || [];
    const existingIndex = userOverrides.findIndex(
      o => o.featureFlag === override.featureFlag
    );
    
    if (existingIndex >= 0) {
      userOverrides[existingIndex] = override;
    } else {
      userOverrides.push(override);
    }
    
    this.adminOverrides.set(override.userId, userOverrides);
    this.saveAdminOverrides();
  }

  public removeAdminOverride(userId: string, featureFlag: FeatureFlag): void {
    const userOverrides = this.adminOverrides.get(userId) || [];
    const filteredOverrides = userOverrides.filter(o => o.featureFlag !== featureFlag);
    
    if (filteredOverrides.length === 0) {
      this.adminOverrides.delete(userId);
    } else {
      this.adminOverrides.set(userId, filteredOverrides);
    }
    
    this.saveAdminOverrides();
  }

  private hasAdminOverride(userId: string, featureFlag: FeatureFlag): boolean {
    const userOverrides = this.adminOverrides.get(userId) || [];
    return userOverrides.some(o => o.featureFlag === featureFlag);
  }

  private getAdminOverride(userId: string, featureFlag: FeatureFlag): AdminFeatureOverride | null {
    const userOverrides = this.adminOverrides.get(userId) || [];
    return userOverrides.find(o => o.featureFlag === featureFlag) || null;
  }

  private saveAdminOverrides(): void {
    // This would typically save to a database
    // For now, we'll keep it in memory
  }

  // Utility method for checking multiple features at once
  public checkMultipleFeatures(
    userPlan: string,
    featureFlags: FeatureFlag[],
    userId?: string,
    subscriptionStatus?: string,
    userEmail?: string
  ): Record<FeatureFlag, FeatureCheckResult> {
    const results: Record<string, FeatureCheckResult> = {};
    
    for (const flag of featureFlags) {
      results[flag] = this.hasFeatureAccess(userPlan, flag, userId, subscriptionStatus, userEmail);
    }
    
    return results as Record<FeatureFlag, FeatureCheckResult>;
  }
}

// Singleton instance
export const featureFlagService = new FeatureFlagService();