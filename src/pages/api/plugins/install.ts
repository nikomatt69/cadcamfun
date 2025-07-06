import type { NextApiRequest, NextApiResponse } from "next";
import { PluginRegistry } from "@/src/plugins/core/registry";
import { withRegistry, ApiHandlerWithRegistry } from "@/src/server/middleware/withRegistry";
import formidable, { File as FormidableFile } from "formidable"; // Import File type
import fs from "fs/promises";
import path from "path";
import { PluginManifest } from "@/src/plugins/core/registry";
import { unzipPluginPackage } from "@/src/server/utils/pluginUnzipper"; // Assuming helper exists
import { tmpdir } from "os";

// Disable Next.js body parsing for this route to handle multipart/form-data
export const config = {
  api: {
    bodyParser: false
  }
};

// --- Formidable Promise Wrapper ---
// Corrected return type and formidable usage
async function parseForm(
  req: NextApiRequest
): Promise<{ files: formidable.Files<string>; fields: formidable.Fields<string> }> {
  const uploadDirPath = path.join(tmpdir(), "plugin-uploads"); // Store path in variable
  const form = formidable({
    uploadDir: uploadDirPath,
    keepExtensions: true,
    maxFileSize: 50 * 1024 * 1024, // Example: 50MB limit
    filter: ({ mimetype }) => {
      return mimetype === "application/zip" || mimetype === "application/x-zip-compressed";
    }
  });
  await fs.mkdir(uploadDirPath, { recursive: true });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(err);
      } else {
        // Ensure fields and files have the correct generic type
        resolve({ files: files as formidable.Files<string>, fields: fields as formidable.Fields<string> });
      }
    });
  });
}
// --------------------------------

const installHandler: ApiHandlerWithRegistry = async (req, res, registry) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let tempFilePath: string | null = null;
  let extractedDir: string | null = null;

  try {
    // 1. Parse the uploaded file
    console.log("[API Install] Parsing form data...");
    const { files, fields } = await parseForm(req);
    console.log("[API Install] Form parsing complete.");
    console.log("[API Install] Received Fields:", JSON.stringify(fields, null, 2));
    console.log("[API Install] Received Files Object:", JSON.stringify(files, null, 2));

    // Access the file correctly, assuming single file upload with name 'file'
    const uploadedFileArray = files.file;
    const uploadedFile = Array.isArray(uploadedFileArray) && uploadedFileArray.length > 0 ? uploadedFileArray[0] : null;

    if (!uploadedFile || !uploadedFile.filepath) {
      // Check existence and filepath
      return res.status(400).json({ error: "No valid plugin package file uploaded or filepath missing." });
    }
    tempFilePath = uploadedFile.filepath;
    console.log(`[API Install] Plugin package received: ${tempFilePath}`);

    // 2. Unzip the package to a temporary location
    extractedDir = path.join(tmpdir(), `plugin-extracted-${Date.now()}`);
    await fs.mkdir(extractedDir, { recursive: true });
    console.log(`[API Install] Extracting to: ${extractedDir}`);
    // unzipPluginPackage returns the manifest after successful extraction
    const manifest = await unzipPluginPackage(tempFilePath, extractedDir);
    console.log(`[API Install] Package extracted. Manifest found:`, manifest); // Manifest is already validated by unzipper

    // 3. Validate manifest (already done basic in unzipper, registry does full)
    // if (!manifest || !manifest.id) {
    //     throw new Error('Invalid plugin package: Missing or invalid manifest.json');
    // }

    // 4. Use the registry's install method
    console.log(`[API Install] Calling registry.installPlugin for ${manifest.id}...`);
    // Passing the extracted directory path along with the manifest
    const installedPlugin = await registry.installPlugin(manifest, extractedDir as string);
    console.log(`[API Install] Plugin ${manifest.id} installed successfully.`);

    res.status(201).json({
      message: `Plugin ${manifest.name} (v${manifest.version}) installed successfully.`,
      plugin: installedPlugin
    });
  } catch (error) {
    console.error("[API Install] Error installing plugin:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to install plugin";
    let statusCode = 500;
    if ((error as any).code === "PLUGIN_ALREADY_EXISTS") statusCode = 409;
    if (errorMessage.includes("Invalid plugin package") || errorMessage.includes("manifest.json")) statusCode = 400;

    res.status(statusCode).json({ error: errorMessage });
  } finally {
    // Clean up temporary files/directories
    try {
      if (tempFilePath)
        await fs.unlink(tempFilePath).catch(e => console.warn(`Failed to delete temp file ${tempFilePath}:`, e));
      if (extractedDir)
        await fs
          .rm(extractedDir, { recursive: true, force: true })
          .catch(e => console.warn(`Failed to delete extracted dir ${extractedDir}:`, e));
    } catch (cleanupError) {
      console.error("[API Install] Error during cleanup:", cleanupError);
    }
  }
};

export default withRegistry(installHandler);
