// src/pages/api/ai/code-interpreter/files/index.ts
import { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";
import formidable from "formidable";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false
  }
};

interface FileUploadResponse {
  success: boolean;
  uploadedFiles?: any[];
  errors?: string[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FileUploadResponse | { error: string }>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OpenAI API key not configured" });
  }

  const openai = new OpenAI({ apiKey });

  try {
    return await handleFileUpload(req, openai, res);
  } catch (error) {
    console.error("File upload API error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error"
    });
  }
}

async function handleFileUpload(
  req: NextApiRequest,
  openai: OpenAI,
  res: NextApiResponse<FileUploadResponse | { error: string }>
) {
  const form = formidable({
    maxFiles: 10,
    maxFileSize: 10 * 1024 * 1024 // 10MB
  });

  try {
    const [fields, files] = await form.parse(req);
    const containerId = Array.isArray(fields.containerId) ? fields.containerId[0] : fields.containerId;

    if (!containerId) {
      return res.status(400).json({ error: "Container ID required" });
    }

    const uploadedFiles: any[] = [];
    const errors: string[] = [];

    // Process uploaded files
    for (const [fieldName, fileArray] of Object.entries(files)) {
      if (!Array.isArray(fileArray)) continue;

      for (const file of fileArray) {
        try {
          // Read file content
          const fileBuffer = fs.readFileSync(file.filepath);

          // Upload to OpenAI
          const uploadedFile = await openai.files.create({
            file: new File([fileBuffer], file.originalFilename || "unnamed"),
            purpose: "assistants"
          });

          uploadedFiles.push({
            id: uploadedFile.id,
            filename: file.originalFilename || "unnamed",
            contentType: file.mimetype || "application/octet-stream",
            size: file.size,
            createdAt: new Date().toISOString()
          });
        } catch (error) {
          errors.push(
            `Failed to upload ${file.originalFilename}: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        } finally {
          // Clean up temp file
          try {
            fs.unlinkSync(file.filepath);
          } catch (cleanupError) {
            console.warn("Failed to cleanup temp file:", cleanupError);
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      uploadedFiles,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error("File upload error:", error);
    return res.status(500).json({
      success: false,
      errors: [error instanceof Error ? error.message : "File upload failed"]
    });
  }
}
