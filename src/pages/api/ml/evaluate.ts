import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

// Ensure OpenAI API key is configured
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Type for individual evaluation examples (similar to training format)
type EvaluationExample = {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  expected_completion: string; // The ground truth completion
};

// Request body structure
type EvaluateRequest = {
  modelId: string; // ID of the fine-tuned model to evaluate (e.g., ft:gpt-3.5-turbo:...)
  evaluationData: EvaluationExample[]; // Array of evaluation examples
  maxTokens?: number; // Optional: Max tokens for completion generation
  temperature?: number; // Optional: Temperature for generation
};

// Response structure
type EvaluateResponse = {
  success: boolean;
  modelId?: string;
  metrics?: {
    totalExamples: number;
    correctPredictions: number;
    accuracy: number;
    // Add more metrics as needed (e.g., BLEU score, loss if available)
  };
  error?: string;
  message?: string;
  evaluationDetails?: {
    // Optional: Include per-example results
    exampleIndex: number;
    prompt: string;
    prediction: string;
    expected: string;
    isCorrect: boolean;
  }[];
};

/**
 * API endpoint to evaluate a fine-tuned model
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<EvaluateResponse>) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ success: false, error: "OpenAI API key not configured." });
  }

  try {
    const { modelId, evaluationData, maxTokens = 150, temperature = 0.2 } = req.body as EvaluateRequest;

    // Basic validation
    if (!modelId || !evaluationData || !Array.isArray(evaluationData) || evaluationData.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid request data: modelId and evaluationData are required." });
    }
    if (!modelId.startsWith("ft:")) {
      console.warn(`Provided model ID "${modelId}" might not be a fine-tuned model ID.`);
      // Potentially add stricter validation if needed
      // return res.status(400).json({ success: false, error: 'Invalid modelId format. Expected format like ft:...' });
    }

    console.log(`Evaluation request received for model ${modelId} with ${evaluationData.length} examples`);

    let correctPredictions = 0;
    const evaluationDetails = []; // Store details for optional response field

    // Process each evaluation example
    for (let i = 0; i < evaluationData.length; i++) {
      const example = evaluationData[i];
      const userPromptMessage = example.messages.find(m => m.role === "user");
      const promptText = userPromptMessage ? userPromptMessage.content : "[No User Prompt Found]"; // For logging/details

      try {
        // Get prediction from the fine-tuned model
        const completion = await openai.chat.completions.create({
          model: modelId,
          messages: example.messages.filter(m => m.role !== "assistant"), // Provide history up to user message
          max_tokens: maxTokens,
          temperature: temperature,
          stop: ["\\n"] // Optional: Define stop sequences if needed
        });

        const prediction = completion.choices[0]?.message?.content?.trim() || "";

        // Simple comparison (exact match - can be improved with fuzzy matching, etc.)
        const isCorrect = prediction.toLowerCase() === example.expected_completion.toLowerCase();
        if (isCorrect) {
          correctPredictions++;
        }

        // Store details for each example
        evaluationDetails.push({
          exampleIndex: i,
          prompt: promptText,
          prediction: prediction,
          expected: example.expected_completion,
          isCorrect: isCorrect
        });

        // Optional: Log progress
        // console.log(`Eval Example ${i + 1}: Correct: ${isCorrect}, Pred: "${prediction}", Exp: "${example.expected_completion}"`);
      } catch (predictionError) {
        console.error(`Error getting prediction for example ${i} using model ${modelId}:`, predictionError);
        // Decide how to handle prediction errors: skip example, count as incorrect, etc.
        // For now, we just log and continue, effectively counting it as incorrect for accuracy.
        evaluationDetails.push({
          exampleIndex: i,
          prompt: promptText,
          prediction: "[PREDICTION ERROR]",
          expected: example.expected_completion,
          isCorrect: false // Count as incorrect
        });
      }
      // Add a small delay to avoid hitting rate limits, especially for large datasets
      await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay
    }

    // Calculate final metrics
    const accuracy = evaluationData.length > 0 ? (correctPredictions / evaluationData.length) * 100 : 0;

    console.log(`Evaluation completed for model ${modelId}. Accuracy: ${accuracy.toFixed(2)}%`);

    return res.status(200).json({
      success: true,
      modelId: modelId,
      metrics: {
        totalExamples: evaluationData.length,
        correctPredictions: correctPredictions,
        accuracy: parseFloat(accuracy.toFixed(2)) // Return as number
      },
      message: `Evaluation for model ${modelId} completed.`,
      // Uncomment to include detailed results in the response
      evaluationDetails: evaluationDetails
    });
  } catch (error) {
    console.error("Model evaluation processing error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error during model evaluation."
    });
  }
}
