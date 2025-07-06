import { mlTrainingConfig } from "../config/mlTrainingConfig";

export class MachineLearningService {
  static async addTrainingExample(
    type: string,
    example: {
      input: string;
      output: any;
      quality: number;
      source: string;
      metadata?: any;
    }
  ) {
    const res = await fetch(mlTrainingConfig.endpoints.training, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelType: type, ...example })
    });
    if (!res.ok) throw new Error("Failed to add training example");
    return res.json();
  }

  static async train(modelType: string) {
    const res = await fetch(mlTrainingConfig.endpoints.training, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelType })
    });
    if (!res.ok) throw new Error("Failed to start training");
    return res.json();
  }

  static async evaluate(jobId: string, examples: any[]) {
    const res = await fetch(mlTrainingConfig.endpoints.evaluation, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, examples })
    });
    if (!res.ok) throw new Error("Failed to evaluate examples");
    return res.json();
  }

  static async submitFeedback(exampleId: string, modelType: string, isCorrect: boolean, correctedOutput?: any) {
    const res = await fetch(mlTrainingConfig.endpoints.feedback, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exampleId, modelType, isCorrect, correctedOutput })
    });
    if (!res.ok) throw new Error("Failed to submit feedback");
    return res.json();
  }

  static async getStats() {
    const res = await fetch(mlTrainingConfig.endpoints.evaluation.replace("evaluate", "stats"), {
      method: "GET"
    });
    if (!res.ok) throw new Error("Failed to fetch stats");
    return res.json();
  }
}
