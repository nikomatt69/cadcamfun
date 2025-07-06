// src/pages/api/plugins/serve.ts
import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
import { PassThrough } from "stream"; // Per pipe dello stream
// Importa le funzioni necessarie dal storageService
import { downloadStreamFromBucket, listObjectKeysByPrefix } from "@/src/lib/storageService";

// Rimuovi dipendenze fs e crypto se non più usate

// Rimuovi PLUGINS_REGISTRY_DIR

// Mappa MIME types rimane utile
const MIME_TYPES: Record<string, string> = {
  ".js": "application/javascript",
  ".mjs": "application/javascript", // Support module JS
  ".json": "application/json",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".html": "text/html",
  ".txt": "text/plain",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".7z": "application/x-7z-compressed",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".bz2": "application/x-bzip2",
  ".rar": "application/x-rar-compressed",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".wmv": "video/x-ms-wmv",
  ".flv": "video/x-flv",
  ".webm": "video/webm",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/opus",
  ".m4v": "video/mp4",
  ".mkv": "video/x-matroska"

  // Aggiungi altri tipi se necessario
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { id, file } = req.query;

  if (!id || Array.isArray(id) || !file || Array.isArray(file)) {
    return res.status(400).json({ error: "Invalid request: id and file parameters are required." });
  }

  let bucketKey: string | null = null; // Initialize bucketKey

  try {
    const sanitizedRelativePath = path.normalize(file).replace(/^(\.\.(\/|\\|\$))+/, "");
    if (sanitizedRelativePath.includes("..")) {
      return res.status(400).json({ error: "Invalid file path." });
    }

    // --- BEGIN DYNAMIC SUBFOLDER LOGIC ---
    const pluginBasePrefix = `plugins/${id}/`;
    console.log(`[Serve API] Finding subfolder for prefix: ${pluginBasePrefix}`);

    let subFolderName: string | null = null;
    try {
      const allKeys = await listObjectKeysByPrefix(pluginBasePrefix);
      console.log(`[Serve API] Keys found under ${pluginBasePrefix}:`, allKeys);

      // Logic to find the relevant subfolder name
      // We expect keys like:
      // - plugins/<id>/<subfolder>/main.js
      // - plugins/<id>/<subfolder>/assets/icon.svg
      // - plugins/<id>/manifest.json (maybe)
      const potentialFolders = new Set<string>();
      for (const key of allKeys) {
        if (!key.startsWith(pluginBasePrefix)) continue; // Safety check
        const remainingPath = key.substring(pluginBasePrefix.length);
        const parts = remainingPath.split("/");
        if (parts.length > 1 && parts[0]) {
          // If there is at least one segment after the base prefix
          potentialFolders.add(parts[0]);
        }
      }

      // Filter out potential system folders or known files if needed
      // Convert Set to Array before filtering/iterating to avoid downlevelIteration issues
      const potentialFoldersArray = Array.from(potentialFolders);
      const relevantFolders = potentialFoldersArray.filter(
        folder => folder !== "__MACOSX" && !folder.endsWith(".json")
      );
      console.log(`[Serve API] Potential subfolders found:`, potentialFoldersArray); // Log the array
      console.log(`[Serve API] Relevant subfolders found (heuristic):`, relevantFolders);

      if (relevantFolders.length === 1) {
        subFolderName = relevantFolders[0];
        console.log(`[Serve API] Identified subfolder: ${subFolderName}`);
        bucketKey = `${pluginBasePrefix}${subFolderName}/${sanitizedRelativePath}`;
      } else if (relevantFolders.length > 1) {
        console.warn(
          `[Serve API] Multiple potential subfolders found for ${pluginBasePrefix}. Using the first one found: ${relevantFolders[0]}. This might be unreliable.`
        );
        subFolderName = relevantFolders[0]; // Risky assumption
        bucketKey = `${pluginBasePrefix}${subFolderName}/${sanitizedRelativePath}`;
      } else {
        // No subfolder found, assume files are directly under plugins/<id>/
        // This handles the case where packaging was fixed.
        console.warn(`[Serve API] No distinct subfolder found under ${pluginBasePrefix}. Assuming files are at root.`);
        bucketKey = `${pluginBasePrefix}${sanitizedRelativePath}`;
      }
    } catch (listError) {
      console.error(`[Serve API] Error listing bucket contents for prefix ${pluginBasePrefix}:`, listError);
      // Fallback: Try the direct path assumption as a last resort
      console.warn(
        `[Serve API] Falling back to direct path due to list error: ${pluginBasePrefix}${sanitizedRelativePath}`
      );
      bucketKey = `${pluginBasePrefix}${sanitizedRelativePath}`;
    }
    // --- END DYNAMIC SUBFOLDER LOGIC ---

    console.log(`[Serve API] Attempting to download from bucket with key: "${bucketKey}"`);

    const fileStream = await downloadStreamFromBucket(bucketKey);

    if (!fileStream) {
      console.warn(`[Serve API] File not found: ${bucketKey}`);
      return res.status(404).json({ error: "File not found" });
    }

    const ext = path.extname(sanitizedRelativePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || "application/octet-stream";

    res.setHeader("Content-Type", mimeType);
    if ([".js", ".mjs", ".css"].includes(ext)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      res.setHeader("Cache-Control", "public, max-age=3600");
    }

    const passThrough = new PassThrough();
    passThrough.on("error", err => {
      console.error(`[Serve API] Error piping stream for ${bucketKey}:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to stream file" });
      } else {
        res.end();
      }
    });

    if (typeof (fileStream as any).pipe === "function") {
      (fileStream as any).pipe(passThrough).pipe(res);
    } else {
      console.error("[Serve API] Stream type from storage is not a Node.js Readable stream.");
      return res.status(500).json({ error: "Internal server error handling stream" });
    }
  } catch (error) {
    console.error(`[Serve API] Error processing request for ${id}/${file}:`, error);
    // Determine the bucket key again for logging if it was determined
    const logKey = bucketKey || `plugins/${id}/${file as string}`; // Best effort log key
    console.error(`[Serve API] Failed processing for bucket key (approximate): ${logKey}`);
    return res.status(500).json({ error: "Internal server error" });
  }
}
