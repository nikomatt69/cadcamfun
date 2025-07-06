// src/pages/api/ai/code-interpreter/files/[id].ts
import { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "File ID required" });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OpenAI API key not configured" });
  }

  const openai = new OpenAI({ apiKey });

  try {
    // Get file info first
    const fileInfo = await openai.files.retrieve(id);

    // Download file content
    const fileContent = await openai.files.content(id);

    // Set appropriate headers
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${fileInfo.filename || "download"}"`);

    // Stream the file content
    const buffer = Buffer.from(await fileContent.arrayBuffer());
    res.status(200).send(buffer);
  } catch (error) {
    console.error("File download error:", error);
    return res.status(404).json({
      error: error instanceof Error ? error.message : "File not found"
    });
  }
}
