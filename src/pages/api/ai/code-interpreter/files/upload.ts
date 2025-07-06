// src/pages/api/ai/code-interpreter/files/upload.ts
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
    const form = formidable({
      maxFileSize: 512 * 1024 * 1024, // 512MB max file size
      maxFiles: 20
    });

    const [fields, files] = await form.parse(req);
    const containerId = Array.isArray(fields.containerId) ? fields.containerId[0] : fields.containerId;

    if (!containerId) {
      return res.status(400).json({ error: "Container ID required" });
    }

    const uploadedFiles: any[] = [];
    const errors: string[] = [];

    // Process each uploaded file
    for (const [fieldName, fileArray] of Object.entries(files)) {
      if (!Array.isArray(fileArray)) continue;

      for (const file of fileArray) {
        try {
          // Read file content
          const fileContent = await fs.promises.readFile(file.filepath);

          // Upload to OpenAI using the files API
          const uploadedFile = await openai.files.create({
            file: new File([fileContent], file.originalFilename || "uploaded_file", {
              type: file.mimetype || "application/octet-stream"
            }),
            purpose: "assistants"
          });

          // Add file to container (Note: This might need adjustment based on actual OpenAI API)
          // For now, we'll track the file upload success
          uploadedFiles.push({
            id: uploadedFile.id,
            filename: file.originalFilename || "uploaded_file",
            contentType: file.mimetype || "application/octet-stream",
            size: file.size,
            createdAt: new Date().toISOString()
          });

          // Clean up temporary file
          await fs.promises.unlink(file.filepath);
        } catch (error) {
          console.error(`Failed to upload file ${file.originalFilename}:`, error);
          errors.push(
            `Failed to upload ${file.originalFilename}: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        }
      }
    }

    return res.status(200).json({
      success: uploadedFiles.length > 0,
      uploadedFiles,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error("File upload error:", error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "File upload failed"
    });
  }
}
