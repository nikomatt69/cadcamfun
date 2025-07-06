import { useContext, useMemo } from "react";
import { useSession } from "@/src/lib/auth-client";
import { useSubscription } from "@/src/contexts/SubscriptionContext";
import {
  FeatureFlag,
  FeatureCheckResult,
  SubscriptionFeatures,
} from "@/src/types/featureFlags";
import { featureFlagService } from "@/src/lib/featureFlags/featureFlagService";

export interface UseFeatureFlagsResult {
  hasFeature: (flag: FeatureFlag) => boolean;
  checkFeature: (flag: FeatureFlag) => FeatureCheckResult;
  checkMultipleFeatures: (
    flags: FeatureFlag[]
  ) => Record<FeatureFlag, FeatureCheckResult>;
  planFeatures: SubscriptionFeatures | null;
  planLimits: any;
  isLoading: boolean;
  error: string | null;
}

export function useFeatureFlags(): UseFeatureFlagsResult {
  const { data: session } = useSession();
  const { plan, status, isLoading, error } = useSubscription();

  const planFeatures = useMemo(() => {
    if (!plan) return null;
    return featureFlagService.getPlanFeatures(plan);
  }, [plan]);

  const planLimits = useMemo(() => {
    if (!plan) return null;
    return featureFlagService.getPlanLimits(plan);
  }, [plan]);

  const hasFeature = (flag: FeatureFlag): boolean => {
    if (!plan) return false;
    const result = featureFlagService.hasFeatureAccess(
      plan,
      flag,
      session?.user?.id,
      status,
      session?.user?.email || ""
    );
    return result.hasAccess;
  };

  const checkFeature = (flag: FeatureFlag): FeatureCheckResult => {
    if (!plan) {
      return {
        hasAccess: false,
        upgradeRequired: true,
        suggestedPlan: "basic",
      };
    }
    return featureFlagService.hasFeatureAccess(
      plan,
      flag,
      session?.user?.id,
      status,
      session?.user?.email || ""
    );
  };

  const checkMultipleFeatures = (
    flags: FeatureFlag[]
  ): Record<FeatureFlag, FeatureCheckResult> => {
    if (!plan) {
      const result: Record<string, FeatureCheckResult> = {};
      flags.forEach((flag) => {
        result[flag] = {
          hasAccess: false,
          upgradeRequired: true,
          suggestedPlan: "basic",
        };
      });
      return result as Record<FeatureFlag, FeatureCheckResult>;
    }
    return featureFlagService.checkMultipleFeatures(
      plan,
      flags,
      session?.user?.id,
      status,
      session?.user?.email || ""
    );
  };

  return {
    hasFeature,
    checkFeature,
    checkMultipleFeatures,
    planFeatures,
    planLimits,
    isLoading,
    error,
  };
}

// Utility hook for specific feature categories
export function useAIFeatures() {
  const { hasFeature, checkFeature } = useFeatureFlags();

  return {
    hasAIAssistant: hasFeature(FeatureFlag.AI_ASSISTANT),
    hasAIVision: hasFeature(FeatureFlag.AI_VISION),
    hasAIAutonomous: hasFeature(FeatureFlag.AI_AUTONOMOUS),
    hasCodeInterpreter: hasFeature(FeatureFlag.AI_CODE_INTERPRETER),
    hasAdvancedPrompts: hasFeature(FeatureFlag.AI_ADVANCED_PROMPTS),
    checkAIAssistant: () => checkFeature(FeatureFlag.AI_ASSISTANT),
    checkAIVision: () => checkFeature(FeatureFlag.AI_VISION),
    checkAIAutonomous: () => checkFeature(FeatureFlag.AI_AUTONOMOUS),
    checkCodeInterpreter: () => checkFeature(FeatureFlag.AI_CODE_INTERPRETER),
    checkAdvancedPrompts: () => checkFeature(FeatureFlag.AI_ADVANCED_PROMPTS),
  };
}

export function useCADFeatures() {
  const { hasFeature, checkFeature } = useFeatureFlags();

  return {
    hasCADBasic: hasFeature(FeatureFlag.CAD_BASIC),
    hasCADAdvanced: hasFeature(FeatureFlag.CAD_ADVANCED),
    has3DModeling: hasFeature(FeatureFlag.CAD_3D_MODELING),
    hasAssemblies: hasFeature(FeatureFlag.CAD_ASSEMBLIES),
    hasParametric: hasFeature(FeatureFlag.CAD_PARAMETRIC),
    hasSimulation: hasFeature(FeatureFlag.CAD_SIMULATION),
    checkCADBasic: () => checkFeature(FeatureFlag.CAD_BASIC),
    checkCADAdvanced: () => checkFeature(FeatureFlag.CAD_ADVANCED),
    check3DModeling: () => checkFeature(FeatureFlag.CAD_3D_MODELING),
    checkAssemblies: () => checkFeature(FeatureFlag.CAD_ASSEMBLIES),
    checkParametric: () => checkFeature(FeatureFlag.CAD_PARAMETRIC),
    checkSimulation: () => checkFeature(FeatureFlag.CAD_SIMULATION),
  };
}

export function useCAMFeatures() {
  const { hasFeature, checkFeature } = useFeatureFlags();

  return {
    hasCAMBasic: hasFeature(FeatureFlag.CAM_BASIC),
    hasCAMAdvanced: hasFeature(FeatureFlag.CAM_ADVANCED),
    hasMultiaxis: hasFeature(FeatureFlag.CAM_MULTIAXIS),
    hasToolpathOptimization: hasFeature(FeatureFlag.CAM_TOOLPATH_OPTIMIZATION),
    checkCAMBasic: () => checkFeature(FeatureFlag.CAM_BASIC),
    checkCAMAdvanced: () => checkFeature(FeatureFlag.CAM_ADVANCED),
    checkMultiaxis: () => checkFeature(FeatureFlag.CAM_MULTIAXIS),
    checkToolpathOptimization: () =>
      checkFeature(FeatureFlag.CAM_TOOLPATH_OPTIMIZATION),
  };
}

export function useExportFeatures() {
  const { hasFeature, checkFeature } = useFeatureFlags();

  return {
    hasExportSTEP: hasFeature(FeatureFlag.EXPORT_STEP),
    hasExportIGES: hasFeature(FeatureFlag.EXPORT_IGES),
    hasExportSTL: hasFeature(FeatureFlag.EXPORT_STL),
    hasExportGCode: hasFeature(FeatureFlag.EXPORT_GCODE),
    hasExportPDF: hasFeature(FeatureFlag.EXPORT_PDF),
    hasImportAdvanced: hasFeature(FeatureFlag.IMPORT_ADVANCED),
    checkExportSTEP: () => checkFeature(FeatureFlag.EXPORT_STEP),
    checkExportIGES: () => checkFeature(FeatureFlag.EXPORT_IGES),
    checkExportSTL: () => checkFeature(FeatureFlag.EXPORT_STL),
    checkExportGCode: () => checkFeature(FeatureFlag.EXPORT_GCODE),
    checkExportPDF: () => checkFeature(FeatureFlag.EXPORT_PDF),
    checkImportAdvanced: () => checkFeature(FeatureFlag.IMPORT_ADVANCED),
  };
}
