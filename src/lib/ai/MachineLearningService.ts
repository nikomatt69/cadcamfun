import { openAIService } from "./openaiService";
import { unifiedAIService } from "./unifiedAIService";
import { v4 as uuidv4 } from "uuid";
import { AIRequest } from "@/src/types/AITypes";
import { mlTrainingConfig } from "@/src/config/mlTrainingConfig";
import { Element } from "@/src/store/elementsStore";

// Define the expected structure for CAD analysis result
interface CADAnalysisResult {
  complexity: number;
  suggestions: string[];
  features: string[];
}

// Training dataset interfaces
interface TrainingExample {
  id: string;
  input: string;
  output: any;
  timestamp: number;
  source: "user" | "system" | "feedback";
  quality: number; // 0-1 score
  metadata: Record<string, any>;
}

interface TrainingDataset {
  documentClassification: TrainingExample[];
  cadModelAnalysis: TrainingExample[];
  lastUpdated: number;
  version: string;
}

export class MachineLearningService {
  private trainingData: TrainingDataset;
  private isCollectingData: boolean = true;
  private autoTrainingEnabled: boolean = true;
  private trainingThreshold: number = 100; // Examples needed before training
  private lastTrainingTimestamp: number = 0;
  private trainingInterval: number = 7 * 24 * 60 * 60 * 1000; // 1 week in ms

  constructor() {
    // Initialize training dataset
    this.trainingData = this.loadTrainingData();

    // Schedule auto-training check
    if (typeof window !== "undefined") {
      // Only set interval in browser environment
      setInterval(() => this.checkAndTriggerTraining(), 24 * 60 * 60 * 1000); // Daily check
    }
  }

  /**
   * Classify document using the trained model or fallback to rule-based approach
   */
  async classifyDocument(text: string): Promise<{
    category: string;
    confidence: number;
    keywords: string[];
  }> {
    try {
      // Attempt to use fine-tuned model if available
      if (this.hasTrainedModel("document-classifier")) {
        // Use fine-tuned model through OpenAI API
        const response = await openAIService.sendMessage(
          [{ id: uuidv4(), role: "user", content: `Classify this document: ${text}`, timestamp: Date.now() }],
          "You are a document classifier for CAD/CAM systems. Classify the document into one of these categories: design_document, manufacturing_document, material_specification, generic_document. Return a JSON object with category, confidence, and keywords.",
          ["documentClassification"],
          "concise",
          "moderate"
        );

        if (response && response.content) {
          try {
            // Extract JSON from response
            const jsonMatch =
              response.content.match(/```json\n([\s\S]*?)\n```/) || response.content.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
              const result = JSON.parse(jsonMatch[0] || jsonMatch[1]);

              // Collect this example for future training
              this.collectTrainingExample("documentClassification", text, result, 0.8);

              return result;
            }
          } catch (error) {
            console.error("Failed to parse classification result:", error);
          }
        }
      }

      // Fallback to rule-based classification
      let result = this.fallbackClassify(text);

      // Still collect this for training
      this.collectTrainingExample("documentClassification", text, result, 0.6);

      return result;
    } catch (error) {
      console.error("Document classification error:", error);
      return this.fallbackClassify(text);
    }
  }

  /**
   * Analyze CAD model using trained model or fallback approach
   */
  async analyzeCADModel(elements: any[]): Promise<CADAnalysisResult> {
    try {
      // Skip if no elements
      if (elements.length === 0) {
        return {
          complexity: 0,
          suggestions: [],
          features: []
        };
      }

      // Use fine-tuned model if available
      if (this.hasTrainedModel("cad-analyzer")) {
        const elementString = JSON.stringify(elements);

        // Use a specialized prompt for the fine-tuned model
        const response = await unifiedAIService.processRequest<CADAnalysisResult>({
          prompt: `Analyze this CAD model: ${elementString}`,
          systemPrompt:
            "You are a CAD model analyzer. Analyze the provided CAD model and return a JSON object with complexity (0-10), suggestions array, and features array.",
          parseResponse: async (text): Promise<CADAnalysisResult | null> => {
            try {
              const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);

              if (jsonMatch) {
                const json = jsonMatch[1] || jsonMatch[0];
                const parsedData = JSON.parse(json);
                if (
                  typeof parsedData.complexity === "number" &&
                  Array.isArray(parsedData.suggestions) &&
                  Array.isArray(parsedData.features)
                ) {
                  return parsedData as CADAnalysisResult;
                }
                throw new Error("Parsed JSON does not match expected structure");
              }
              throw new Error("No valid JSON found in response");
            } catch (error) {
              console.error("Failed to parse CAD analysis response:", error);
              return null;
            }
          }
        });

        if (response.success && response.data) {
          // Collect for future training
          this.collectTrainingExample("cadModelAnalysis", elements, response.data, 0.85);
          // Now response.data should be correctly typed as CADAnalysisResult or null
          // If processRequest isn't generic, assert the type here:
          return response.data as CADAnalysisResult;
        }
      }

      // Fallback to rule-based analysis
      const result = this.fallbackAnalyzeCAD(elements);

      // Collect this for training
      this.collectTrainingExample("cadModelAnalysis", elements, result, 0.7);

      return result;
    } catch (error) {
      console.error("CAD model analysis error:", error);
      return this.fallbackAnalyzeCAD(elements);
    }
  }

  /**
   * Collect training examples from user interactions
   */
  collectTrainingExample(
    type: keyof Omit<TrainingDataset, "lastUpdated" | "version">,
    input: any,
    output: any,
    quality: number,
    source: "user" | "system" | "feedback" = "system",
    metadata: Record<string, any> = {}
  ): void {
    if (!this.isCollectingData) return;

    const example: TrainingExample = {
      id: uuidv4(),
      input: typeof input === "string" ? input : JSON.stringify(input),
      output: output,
      timestamp: Date.now(),
      source,
      quality,
      metadata
    };

    this.trainingData[type].push(example);

    // Save to disk periodically (every 10 new examples)
    if (this.trainingData[type].length % 10 === 0) {
      this.saveTrainingData();
    }

    // Check if we should trigger training
    this.checkAndTriggerTraining();
  }

  /**
   * Record user feedback for a prediction
   */
  async recordFeedback(exampleId: string, isCorrect: boolean, correctedOutput?: any): Promise<void> {
    // Find the example across all datasets
    for (const key of ["documentClassification", "cadModelAnalysis"] as const) {
      const index = this.trainingData[key].findIndex(ex => ex.id === exampleId);

      if (index !== -1) {
        // Update quality based on feedback
        this.trainingData[key][index].quality = isCorrect ? 1.0 : 0.2;
        this.trainingData[key][index].metadata.feedbackProvided = true;

        // If user provided correction, add as a new high-quality example
        if (!isCorrect && correctedOutput) {
          this.collectTrainingExample(
            key,
            this.trainingData[key][index].input,
            correctedOutput,
            1.0, // Highest quality since it's corrected by user
            "feedback",
            { correctedFrom: exampleId }
          );
        }

        this.saveTrainingData();
        break;
      }
    }
  }

  /**
   * Check if conditions are met to trigger a training job
   */
  checkAndTriggerTraining(): boolean {
    if (!this.autoTrainingEnabled) return false;

    const now = Date.now();
    const timeSinceLastTraining = now - this.lastTrainingTimestamp;

    // Check if enough time has passed since last training
    if (timeSinceLastTraining < this.trainingInterval) return false;

    // Check if we have enough new examples
    const hasEnoughDocExamples = this.trainingData.documentClassification.length >= this.trainingThreshold;
    const hasEnoughCADExamples = this.trainingData.cadModelAnalysis.length >= this.trainingThreshold;

    let trainingTriggered = false;

    if (hasEnoughDocExamples) {
      this.triggerTraining("documentClassification")
        .then(() => console.log("Document classification model training completed"))
        .catch(err => console.error("Document classification training failed:", err));
      trainingTriggered = true;
    }

    if (hasEnoughCADExamples) {
      this.triggerTraining("cadModelAnalysis")
        .then(() => console.log("CAD model analysis training completed"))
        .catch(err => console.error("CAD model analysis training failed:", err));
      trainingTriggered = true;
    }

    return trainingTriggered;
  }

  /**
   * Trigger model training for a specific dataset by calling the API route.
   */
  private async triggerTraining(type: keyof Omit<TrainingDataset, "lastUpdated" | "version">): Promise<void> {
    console.log(`Attempting to trigger training for ${type}...`);
    this.lastTrainingTimestamp = Date.now(); // Update timestamp even on attempt

    // Prepare the training data in the format expected by the API route
    const trainingExamples = this.trainingData[type]
      .filter(ex => ex.quality > mlTrainingConfig.training.qualityThreshold) // Use config value
      .map(ex => ({
        // The API route expects the original {prompt, completion} format
        prompt: ex.input, // Assuming ex.input is the prompt string
        completion: typeof ex.output === "string" ? ex.output : JSON.stringify(ex.output) // Ensure completion is a string
      }));

    // Use the correct config property name
    if (trainingExamples.length < mlTrainingConfig.training.minExamplesRequired) {
      console.log(
        `Not enough high-quality examples for ${type} (${trainingExamples.length}/${mlTrainingConfig.training.minExamplesRequired} needed). Training skipped.`
      );
      return;
    }

    // Map the type to the specific model config key if necessary, or pass general config
    // For now, let's pass the general models config and let the API decide the base model
    const apiConfig = {
      baseModel:
        type === "documentClassification"
          ? mlTrainingConfig.models.baseModels.documentClassifier
          : mlTrainingConfig.models.baseModels.cadAnalyzer,
      // Include other relevant general config if needed by the API
      maxTrainingCost: mlTrainingConfig.models.maxTrainingCost
    };

    // Call the local API endpoint to handle the actual training job submission
    try {
      // Use the configured endpoint path
      const response = await fetch(mlTrainingConfig.endpoints.training, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          modelType: type,
          examples: trainingExamples,
          config: apiConfig // Pass the mapped or general config
        })
      });

      const result = await response.json();

      if (!response.ok) {
        // Log specific error from the API if available
        console.error(
          `Training API request failed for ${type} with status ${response.status}:`,
          result.error || "Unknown API error"
        );
        throw new Error(
          `Training API responded with ${response.status}: ${result.error || "Failed to initiate training"}`
        );
      }

      console.log(
        `Training job successfully initiated for ${type}. Job ID: ${result.jobId}, File ID: ${result.fileId}`
      );
      // Optionally: Store the job ID locally for tracking
      localStorage.setItem(`ml_training_job_${type}`, result.jobId);
    } catch (error) {
      console.error(`Error submitting training request for ${type}:`, error);
      // Don't re-throw here unless you want to halt further execution
      // The error is logged, and the training attempt failed.
    }
  }

  /**
   * Check if we have a trained model available
   */
  private hasTrainedModel(modelType: string): boolean {
    try {
      // In a browser environment, we check localStorage for model metadata
      if (typeof window !== "undefined") {
        const metadataKey = `ml_model_${modelType}_metadata`;
        const metadataStr = localStorage.getItem(metadataKey);

        if (metadataStr) {
          const metadata = JSON.parse(metadataStr);
          // Check if model is less than 30 days old
          const age = Date.now() - metadata.trainedAt;
          return age < 30 * 24 * 60 * 60 * 1000; // 30 days in ms
        }
      }

      return false;
    } catch (error) {
      console.error("Error checking for trained model:", error);
      return false;
    }
  }

  /**
   * Load saved training data or initialize empty dataset
   */
  private loadTrainingData(): TrainingDataset {
    try {
      if (typeof window !== "undefined") {
        const storedData = localStorage.getItem("ml_training_data");
        if (storedData) {
          return JSON.parse(storedData);
        }
      }
    } catch (error) {
      console.error("Error loading training data:", error);
    }

    // Return empty dataset if loading fails
    return {
      documentClassification: [],
      cadModelAnalysis: [],
      lastUpdated: Date.now(),
      version: "1.0.0"
    };
  }

  /**
   * Save training data to local storage
   */
  private saveTrainingData(): void {
    try {
      if (typeof window !== "undefined") {
        this.trainingData.lastUpdated = Date.now();
        localStorage.setItem("ml_training_data", JSON.stringify(this.trainingData));
      }
    } catch (error) {
      console.error("Error saving training data:", error);
    }
  }

  /**
   * Fallback document classification logic
   */
  private fallbackClassify(text: string) {
    if (
      text.toLowerCase().includes("cad") ||
      text.toLowerCase().includes("model") ||
      text.toLowerCase().includes("design")
    ) {
      return {
        category: "design_document",
        confidence: 0.85,
        keywords: ["CAD", "design", "model"]
      };
    } else if (
      text.toLowerCase().includes("cnc") ||
      text.toLowerCase().includes("machine") ||
      text.toLowerCase().includes("toolpath")
    ) {
      return {
        category: "manufacturing_document",
        confidence: 0.82,
        keywords: ["CNC", "machining", "toolpath"]
      };
    } else if (
      text.toLowerCase().includes("material") ||
      text.toLowerCase().includes("property") ||
      text.toLowerCase().includes("strength")
    ) {
      return {
        category: "material_specification",
        confidence: 0.78,
        keywords: ["material", "property", "specification"]
      };
    } else {
      return {
        category: "generic_document",
        confidence: 0.6,
        keywords: []
      };
    }
  }

  /**
   * Fallback CAD model analysis logic
   */
  private fallbackAnalyzeCAD(elements: any[]): CADAnalysisResult {
    if (elements.length === 0) {
      return {
        complexity: 0,
        suggestions: [],
        features: []
      };
    }

    // Calculate complexity based on element types
    const complexityFactors: Record<string, number> = {
      "cube": 1,
      "sphere": 1,
      "cylinder": 1.2,
      "cone": 1.5,
      "torus": 2,
      "line": 0.5,
      "spline": 2.5,
      "boolean-union": 3,
      "boolean-subtract": 3.5
    };

    let totalComplexity = 0;
    const typeCounts: Record<string, number> = {};

    elements.forEach(el => {
      typeCounts[el.type] = (typeCounts[el.type] || 0) + 1;
      totalComplexity += complexityFactors[el.type] || 1;
    });

    // Normalize complexity
    const normalizedComplexity = Math.min(10, totalComplexity / 10);

    // Generate suggestions and identify features
    const suggestions: string[] = [];
    const features: string[] = [];

    // Identify model characteristics
    if (elements.some(el => el.type === "boolean-union" || el.type === "boolean-subtract")) {
      features.push("boolean_operations");
    }

    if (elements.some(el => el.type === "spline")) {
      features.push("curved_surfaces");
    }

    if (Object.keys(typeCounts).length < 3 && elements.length > 5) {
      suggestions.push("Consider using more varied geometry types for better design");
    }

    if (normalizedComplexity > 7) {
      suggestions.push("High model complexity detected. Consider optimizing for performance");
    }

    return {
      complexity: normalizedComplexity,
      suggestions,
      features
    };
  }
}

export const mlService = new MachineLearningService();
