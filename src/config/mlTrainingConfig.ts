/**
 * Configuration for machine learning training and data collection
 */
export const mlTrainingConfig = {
  // Data collection settings
  collection: {
    enabled: true,
    userOptIn: true, // Whether users need to opt in
    anonymize: true, // Whether to anonymize personal data
    samplingRate: 1.0, // Collect all examples (1.0) or sample (e.g., 0.5)
    maxExamplesPerUser: 100, // Maximum examples to collect from a single user
    storageQuota: 10 * 1024 * 1024 // 10MB storage quota for training data in localStorage
  },

  // Training settings
  training: {
    autoTrigger: true, // Automatically trigger training
    minExamplesRequired: 100, // Minimum examples needed
    minTimeBetweenTrainings: 7 * 24 * 60 * 60 * 1000, // 1 week
    qualityThreshold: 0.7, // Minimum quality score for examples
    minFeedbackSamples: 20 // Minimum number of feedback samples needed
  },

  // Model settings
  models: {
    baseModels: {
      documentClassifier: "gpt-4",
      cadAnalyzer: "gpt-4"
    },
    deploymentStrategy: "gradual", // 'immediate' or 'gradual'
    evaluationRequired: true, // Whether to require evaluation before deployment
    maxTrainingCost: 10 // Maximum training cost in dollars
  },

  // API endpoint configuration
  endpoints: {
    training: "/api/ml/train",
    evaluation: "/api/ml/evaluate",
    feedback: "/api/ml/feedback"
  },

  // Persistence settings
  persistence: {
    localStorageKeys: {
      trainingData: "ml_training_data",
      modelMetadata: "ml_model_metadata",
      userConsent: "ml_user_consent"
    },
    syncToServer: true, // Whether to sync training data to server
    syncInterval: 60 * 60 * 1000 // 1 hour
  }
};
