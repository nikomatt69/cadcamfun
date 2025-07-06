import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai"; // Import the OpenAI SDK
import { FineTuningJob } from "openai/resources/fine-tuning"; // Import necessary types
import fs from "fs/promises"; // For file system operations
import os from "os"; // For temporary directory
import path from "path"; // For path manipulation
import { v4 as uuidv4 } from "uuid"; // For unique file names

// Ensure OpenAI API key is configured (best practice: use environment variables)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

type TrainingExample = {
  prompt: string;
  completion: string;
};

// Updated format for OpenAI fine-tuning (messages format)
type TrainingMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type TrainingFileEntry = {
  messages: TrainingMessage[];
};

type TrainingRequest = {
  modelType: string; // Used to determine system prompt and potentially model
  examples: TrainingExample[]; // Original examples from MachineLearningService
  config: any; // Training configuration (might include base model)
};

type TrainingResponse = {
  success: boolean;
  jobId?: string;
  fileId?: string; // ID of the uploaded training file
  error?: string;
  message?: string;
};

/**
 * API endpoint to initiate model fine-tuning with OpenAI
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<TrainingResponse>) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ success: false, error: "OpenAI API key not configured." });
  }

  try {
    const { modelType, examples, config } = req.body as TrainingRequest;

    if (!modelType || !examples || !Array.isArray(examples) || examples.length === 0) {
      return res.status(400).json({ success: false, error: "Invalid request data" });
    }

    console.log(`Training request received for ${modelType} with ${examples.length} examples`);

    // 1. Prepare training data in OpenAI's required JSONL format
    const trainingFilePath = await prepareTrainingFile(modelType, examples);
    if (!trainingFilePath) {
      return res.status(500).json({ success: false, error: "Failed to prepare training file." });
    }

    // 2. Upload the training file to OpenAI
    let uploadedFile;
    try {
      const fileStream = await fs.readFile(trainingFilePath);
      uploadedFile = await openai.files.create({
        file: {
          // OpenAI SDK expects a fetch-compatible File object or ReadStream
          // Providing the buffer directly might work in some environments
          // but creating a pseudo-File is safer for Node.js
          [Symbol.toStringTag]: "File",
          name: path.basename(trainingFilePath),
          type: "application/jsonl", // Correct MIME type for JSONL
          // Convert Buffer to ArrayBuffer for compatibility if needed
          arrayBuffer: () =>
            Promise.resolve(
              fileStream.buffer.slice(fileStream.byteOffset, fileStream.byteOffset + fileStream.byteLength)
            )
        } as any, // Use 'as any' to bypass strict type checking if needed for the File object structure
        purpose: "fine-tune"
      });
      console.log(`Training file uploaded successfully. File ID: ${uploadedFile.id}`);
    } catch (uploadError) {
      console.error("Error uploading training file to OpenAI:", uploadError);
      await fs.unlink(trainingFilePath); // Clean up temp file on error
      return res.status(500).json({
        success: false,
        error: `OpenAI file upload failed: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`
      });
    } finally {
      // Ensure temporary file is deleted even if upload succeeds but job creation fails
      try {
        await fs.unlink(trainingFilePath);
        console.log(`Temporary training file deleted: ${trainingFilePath}`);
      } catch (cleanupError) {
        console.error(`Error deleting temporary training file ${trainingFilePath}:`, cleanupError);
      }
    }

    // 3. Create the Fine-tuning job
    try {
      // Determine the base model (e.g., gpt-3.5-turbo) - should come from config or be based on modelType
      const baseModel = config?.baseModel || "gpt-3.5-turbo-0125"; // Default or get from config
      if (!["gpt-3.5-turbo-0125", "gpt-4-turbo", "gpt-4o"].includes(baseModel)) {
        // Add supported models as needed
        console.warn(`Requested base model '${baseModel}' might not be supported for fine-tuning. Using default.`);
        // baseModel = 'gpt-3.5-turbo-0125'; // Or handle error
      }

      const fineTuneJob: FineTuningJob = await openai.fineTuning.jobs.create({
        training_file: uploadedFile.id,
        model: baseModel,
        // suffix: `cad-${modelType}-${uuidv4().substring(0, 6)}`, // Optional custom suffix
        hyperparameters: {
          // Optional: Adjust hyperparameters
          // n_epochs: 'auto', // Or specify a number e.g., 3
          // batch_size: 'auto',
          // learning_rate_multiplier: 'auto'
        }
      });

      console.log(`Fine-tuning job created successfully. Job ID: ${fineTuneJob.id}`);

      // 4. Respond immediately (don't wait for job completion)
      return res.status(200).json({
        success: true,
        jobId: fineTuneJob.id,
        fileId: uploadedFile.id,
        message: `Fine-tuning job for ${modelType} initiated successfully.`
      });
    } catch (jobError) {
      console.error("Error creating fine-tuning job:", jobError);
      // Attempt to delete the uploaded file if job creation failed
      try {
        await openai.files.del(uploadedFile.id);
        console.log(`Cleaned up uploaded file ${uploadedFile.id} after job creation failure.`);
      } catch (delError) {
        console.error(`Failed to clean up uploaded file ${uploadedFile.id}:`, delError);
      }
      return res.status(500).json({
        success: false,
        error: `OpenAI job creation failed: ${jobError instanceof Error ? jobError.message : String(jobError)}`
      });
    }
  } catch (error) {
    console.error("Training request processing error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error during training request processing."
    });
  }
}

/**
 * Prepares the training data into a temporary JSONL file.
 * Returns the path to the temporary file or null on failure.
 */
async function prepareTrainingFile(modelType: string, examples: TrainingExample[]): Promise<string | null> {
  try {
    const trainingEntries: TrainingFileEntry[] = examples.map(ex => {
      // Define a default system prompt or select based on modelType
      let systemPrompt = "You are a helpful assistant.";
      if (modelType === "documentClassification") {
        systemPrompt =
          "You are a document classifier for CAD/CAM systems. Classify the document into one of these categories: design_document, manufacturing_document, material_specification, generic_document. Return a JSON object with category, confidence, and keywords.";
      } else if (modelType === "cadModelAnalysis") {
        systemPrompt =
          "You are a CAD model analyzer. Analyze the provided CAD model and return a JSON object with complexity (0-10), suggestions array, and features array.";
      }
      // Add more modelType specific system prompts as needed

      return {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: ex.prompt }, // Assuming ex.prompt holds the user's input
          { role: "assistant", content: ex.completion } // Assuming ex.completion holds the desired AI output
        ]
      };
    });

    // Create JSONL content
    const jsonlContent = trainingEntries.map(entry => JSON.stringify(entry)).join("\\n");

    // Create a temporary file
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `openai-training-${modelType}-${uuidv4()}.jsonl`);

    // Write the JSONL content to the temporary file
    await fs.writeFile(tempFilePath, jsonlContent);
    console.log(`Temporary training file created: ${tempFilePath}`);

    return tempFilePath;
  } catch (error) {
    console.error("Error preparing training file:", error);
    return null;
  }
}

// Remove or comment out the old mock queueTrainingJob function
// async function queueTrainingJob(...) { ... }
