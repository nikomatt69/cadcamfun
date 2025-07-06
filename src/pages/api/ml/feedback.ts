import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs/promises"; // Import file system promises
import path from "path"; // Import path utilities

type FeedbackRequest = {
  exampleId: string;
  isCorrect: boolean;
  correctedOutput?: any;
  modelType: string;
  userId?: string; // Optional: track user providing feedback
  timestamp: number; // Add timestamp to feedback data
};

type FeedbackResponse = {
  success: boolean;
  error?: string;
  message?: string;
};

// Define the path for the feedback log file
const FEEDBACK_LOG_DIR = path.resolve(process.cwd(), "data"); // Store in a 'data' directory at project root
const FEEDBACK_LOG_FILE = path.join(FEEDBACK_LOG_DIR, "feedback_log.jsonl");

/**
 * Ensures the data directory exists.
 */
async function ensureDataDirectoryExists() {
  try {
    await fs.mkdir(FEEDBACK_LOG_DIR, { recursive: true });
  } catch (error) {
    // Ignore error if directory already exists
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}

/**
 * API endpoint to collect and store user feedback for ML training
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<FeedbackResponse>) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    // Add timestamp to the feedback data when received
    const feedbackData: FeedbackRequest = { ...req.body, timestamp: Date.now() };
    const { exampleId, isCorrect, correctedOutput, modelType, userId } = feedbackData;

    if (!exampleId || typeof isCorrect !== "boolean" || !modelType) {
      return res.status(400).json({ success: false, error: "Invalid request data" });
    }

    console.log(`Feedback received for ${modelType}, example ${exampleId}: ${isCorrect ? "correct" : "incorrect"}`);

    // 1. Ensure the data directory exists
    await ensureDataDirectoryExists();

    // 2. Prepare feedback entry as a JSON string
    const feedbackEntry = JSON.stringify(feedbackData) + "\\n"; // Append newline for JSONL format

    // 3. Append feedback to the log file
    await fs.appendFile(FEEDBACK_LOG_FILE, feedbackEntry);
    console.log(`Feedback for example ${exampleId} appended to ${FEEDBACK_LOG_FILE}`);

    // In a real application, you would likely integrate this with the MachineLearningService
    // or a database to update the quality scores and potentially add new training examples.
    // This file-based approach is simplified for demonstration.

    return res.status(200).json({
      success: true,
      message: "Feedback recorded successfully"
    });
  } catch (error) {
    console.error("Feedback processing error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error processing feedback"
    });
  }
}
