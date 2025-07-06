export enum FeatureFlag {
  // AI Features
  AI_ASSISTANT = 'ai_assistant',
  AI_VISION = 'ai_vision',
  AI_AUTONOMOUS = 'ai_autonomous',
  AI_CODE_INTERPRETER = 'ai_code_interpreter',
  AI_ADVANCED_PROMPTS = 'ai_advanced_prompts',
  
  // CAD Features
  CAD_BASIC = 'cad_basic',
  CAD_ADVANCED = 'cad_advanced',
  CAD_3D_MODELING = 'cad_3d_modeling',
  CAD_ASSEMBLIES = 'cad_assemblies',
  CAD_PARAMETRIC = 'cad_parametric',
  CAD_SIMULATION = 'cad_simulation',
  
  // CAM Features
  CAM_BASIC = 'cam_basic',
  CAM_ADVANCED = 'cam_advanced',
  CAM_MULTIAXIS = 'cam_multiaxis',
  CAM_TOOLPATH_OPTIMIZATION = 'cam_toolpath_optimization',
  
  // Export/Import Features
  EXPORT_STEP = 'export_step',
  EXPORT_IGES = 'export_iges',
  EXPORT_STL = 'export_stl',
  EXPORT_GCODE = 'export_gcode',
  EXPORT_PDF = 'export_pdf',
  IMPORT_ADVANCED = 'import_advanced',
  
  // Collaboration Features
  REAL_TIME_COLLABORATION = 'real_time_collaboration',
  TEAM_MANAGEMENT = 'team_management',
  PROJECT_SHARING = 'project_sharing',
  COMMENTS_ANNOTATIONS = 'comments_annotations',
  
  // Storage & Limits
  CLOUD_STORAGE = 'cloud_storage',
  UNLIMITED_PROJECTS = 'unlimited_projects',
  LARGE_FILE_SUPPORT = 'large_file_support',
  
  // Marketplace & Plugins
  MARKETPLACE_ACCESS = 'marketplace_access',
  CUSTOM_PLUGINS = 'custom_plugins',
  THIRD_PARTY_INTEGRATIONS = 'third_party_integrations',
  
  // Analytics & Reporting
  ADVANCED_ANALYTICS = 'advanced_analytics',
  USAGE_REPORTS = 'usage_reports',
  PERFORMANCE_MONITORING = 'performance_monitoring',
  
  // Support & Priority
  PRIORITY_SUPPORT = 'priority_support',
  DEDICATED_SUPPORT = 'dedicated_support',
  TRAINING_RESOURCES = 'training_resources',
  
  // API & Development
  API_ACCESS = 'api_access',
  WEBHOOK_SUPPORT = 'webhook_support',
  CUSTOM_BRANDING = 'custom_branding',
}

export interface FeatureAccess {
  enabled: boolean;
  limit?: number;
  metadata?: Record<string, any>;
}

export interface FeatureLimits {
  maxProjects: number;
  maxComponents: number;
  maxStorage: number; // in MB
  maxTeamMembers: number;
  maxApiCalls: number;
  maxFilesPerProject: number;
}

export interface SubscriptionFeatures {
  [FeatureFlag.AI_ASSISTANT]: FeatureAccess;
  [FeatureFlag.AI_VISION]: FeatureAccess;
  [FeatureFlag.AI_AUTONOMOUS]: FeatureAccess;
  [FeatureFlag.AI_CODE_INTERPRETER]: FeatureAccess;
  [FeatureFlag.AI_ADVANCED_PROMPTS]: FeatureAccess;
  [FeatureFlag.CAD_BASIC]: FeatureAccess;
  [FeatureFlag.CAD_ADVANCED]: FeatureAccess;
  [FeatureFlag.CAD_3D_MODELING]: FeatureAccess;
  [FeatureFlag.CAD_ASSEMBLIES]: FeatureAccess;
  [FeatureFlag.CAD_PARAMETRIC]: FeatureAccess;
  [FeatureFlag.CAD_SIMULATION]: FeatureAccess;
  [FeatureFlag.CAM_BASIC]: FeatureAccess;
  [FeatureFlag.CAM_ADVANCED]: FeatureAccess;
  [FeatureFlag.CAM_MULTIAXIS]: FeatureAccess;
  [FeatureFlag.CAM_TOOLPATH_OPTIMIZATION]: FeatureAccess;
  [FeatureFlag.EXPORT_STEP]: FeatureAccess;
  [FeatureFlag.EXPORT_IGES]: FeatureAccess;
  [FeatureFlag.EXPORT_STL]: FeatureAccess;
  [FeatureFlag.EXPORT_GCODE]: FeatureAccess;
  [FeatureFlag.EXPORT_PDF]: FeatureAccess;
  [FeatureFlag.IMPORT_ADVANCED]: FeatureAccess;
  [FeatureFlag.REAL_TIME_COLLABORATION]: FeatureAccess;
  [FeatureFlag.TEAM_MANAGEMENT]: FeatureAccess;
  [FeatureFlag.PROJECT_SHARING]: FeatureAccess;
  [FeatureFlag.COMMENTS_ANNOTATIONS]: FeatureAccess;
  [FeatureFlag.CLOUD_STORAGE]: FeatureAccess;
  [FeatureFlag.UNLIMITED_PROJECTS]: FeatureAccess;
  [FeatureFlag.LARGE_FILE_SUPPORT]: FeatureAccess;
  [FeatureFlag.MARKETPLACE_ACCESS]: FeatureAccess;
  [FeatureFlag.CUSTOM_PLUGINS]: FeatureAccess;
  [FeatureFlag.THIRD_PARTY_INTEGRATIONS]: FeatureAccess;
  [FeatureFlag.ADVANCED_ANALYTICS]: FeatureAccess;
  [FeatureFlag.USAGE_REPORTS]: FeatureAccess;
  [FeatureFlag.PERFORMANCE_MONITORING]: FeatureAccess;
  [FeatureFlag.PRIORITY_SUPPORT]: FeatureAccess;
  [FeatureFlag.DEDICATED_SUPPORT]: FeatureAccess;
  [FeatureFlag.TRAINING_RESOURCES]: FeatureAccess;
  [FeatureFlag.API_ACCESS]: FeatureAccess;
  [FeatureFlag.WEBHOOK_SUPPORT]: FeatureAccess;
  [FeatureFlag.CUSTOM_BRANDING]: FeatureAccess;
  limits: FeatureLimits;
}

export interface FeatureFlagConfig {
  [key: string]: SubscriptionFeatures;
}

export interface FeatureCheckResult {
  hasAccess: boolean;
  limit?: number;
  used?: number;
  metadata?: Record<string, any>;
  upgradeRequired?: boolean;
  suggestedPlan?: string;
}

export interface AdminFeatureOverride {
  userId: string;
  featureFlag: FeatureFlag;
  enabled: boolean;
  expiresAt?: Date;
  reason?: string;
}